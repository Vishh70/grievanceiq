#!/usr/bin/env node
// scripts/train_relationship_model.js
// Phase 3: Train the Relationship Classification Random Forest
//
// Usage:
//   node --experimental-vm-modules scripts/train_relationship_model.js
//
// Reads:  data/relationship_pairs.csv
// Writes: models/relationship/model.json
//         models/relationship/metadata.json

const path = require('path');
const fs = require('fs');

// Ensure Windows native dependencies are accessible
if (process.platform === 'win32') {
  const win64Dir = path.resolve(__dirname, '../node_modules/onnxruntime-node/bin/napi-v3/win32/x64');
  if (fs.existsSync(win64Dir)) {
    process.env.PATH = win64Dir + ';' + (process.env.PATH || '');
  }
}

const Papa = require('papaparse');
const { RandomForestClassifier } = require('ml-random-forest');
const { generateEmbedding, cosineSimilarity } = require('../src/services/embeddingService');
const {
  haversineDistance,
  normalizeLocationScore,
  normalizeTemporalScore,
  DUPLICATE_CONFIG,
  scoreCandidate,
} = require('../src/services/duplicateDetectionService');
const {
  RELATIONSHIP_LABELS,
  CATEGORIES,
  oneHotCategory,
  getFeatureNames,
  MODEL_DIR,
  MODEL_PATH,
  METADATA_PATH,
} = require('../src/services/relationshipService');

// ── Configuration ───────────────────────────────────────────────────────────

const CSV_PATH = path.resolve(__dirname, '../data/relationship_pairs.csv');
const TEST_SPLIT = 0.2;    // 20% held out for test
const N_ESTIMATORS = 100;   // Number of trees in Random Forest
const MAX_FEATURES = 0.8;   // Proportion of features per tree split
const SEED = 42;

// ── Helpers ─────────────────────────────────────────────────────────────────

function labelToIndex(label) {
  const idx = RELATIONSHIP_LABELS.indexOf(label);
  return idx >= 0 ? idx : 3; // Default to 'Independent'
}

/**
 * Shuffles an array in-place using Fisher-Yates with a seeded PRNG.
 */
function seededShuffle(arr, seed) {
  let s = seed;
  const random = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Computes confusion matrix, accuracy, per-class precision/recall/F1.
 */
function evaluate(yTrue, yPred, numClasses) {
  const confMatrix = Array.from({ length: numClasses }, () => new Array(numClasses).fill(0));
  for (let i = 0; i < yTrue.length; i++) {
    confMatrix[yTrue[i]][yPred[i]]++;
  }

  let correct = 0;
  for (let i = 0; i < numClasses; i++) correct += confMatrix[i][i];
  const accuracy = yTrue.length > 0 ? correct / yTrue.length : 0;

  const perClass = [];
  for (let c = 0; c < numClasses; c++) {
    const tp = confMatrix[c][c];
    let fp = 0, fn = 0;
    for (let i = 0; i < numClasses; i++) {
      if (i !== c) {
        fp += confMatrix[i][c]; // Other classes predicted as c
        fn += confMatrix[c][i]; // c predicted as other classes
      }
    }
    const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
    const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    perClass.push({
      label: RELATIONSHIP_LABELS[c],
      precision: Number(precision.toFixed(4)),
      recall: Number(recall.toFixed(4)),
      f1: Number(f1.toFixed(4)),
      support: tp + fn,
    });
  }

  return { accuracy: Number(accuracy.toFixed(4)), confMatrix, perClass };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Phase 3: Relationship Model Training');
  console.log('═══════════════════════════════════════════════════════════\n');

  // 1. Read CSV
  console.log('Step 1/6: Loading dataset from', CSV_PATH);
  if (!fs.existsSync(CSV_PATH)) {
    console.error('ERROR: Dataset not found at', CSV_PATH);
    process.exit(1);
  }

  const csvContent = fs.readFileSync(CSV_PATH, 'utf8');
  const { data: rows, errors } = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
  });

  if (errors.length > 0) {
    console.warn('CSV parse warnings:', errors);
  }

  console.log(`  Loaded ${rows.length} labelled pairs`);

  // Show label distribution
  const dist = {};
  rows.forEach(r => { dist[r.label] = (dist[r.label] || 0) + 1; });
  console.log('  Label distribution:', dist);
  console.log();

  // 2. Generate embeddings for all unique texts
  console.log('Step 2/6: Generating embeddings for all complaint texts...');
  const uniqueTexts = new Set();
  rows.forEach(r => {
    uniqueTexts.add(r.text_a);
    uniqueTexts.add(r.text_b);
  });
  console.log(`  ${uniqueTexts.size} unique texts to embed`);

  const embeddingCache = {};
  let embCount = 0;
  for (const text of uniqueTexts) {
    try {
      embeddingCache[text] = await generateEmbedding(text);
    } catch (err) {
      console.warn(`  Warning: failed to embed "${text.substring(0, 40)}...": ${err.message}`);
      embeddingCache[text] = [];
    }
    embCount++;
    if (embCount % 20 === 0) {
      console.log(`  Embedded ${embCount}/${uniqueTexts.size} texts...`);
    }
  }
  console.log(`  All ${embCount} embeddings generated.`);
  console.log();

  // 3. Build feature matrix
  console.log('Step 3/6: Building feature vectors...');

  const X = [];
  const y = [];
  const featureNames = getFeatureNames();

  for (const row of rows) {
    const embA = embeddingCache[row.text_a] || [];
    const embB = embeddingCache[row.text_b] || [];

    // Semantic similarity
    let semanticSimilarity = 0;
    if (embA.length > 0 && embB.length > 0) {
      semanticSimilarity = cosineSimilarity(embA, embB);
    }

    // Location score
    let locationScore = 0;
    if (row.lat_a != null && row.lng_a != null && row.lat_b != null && row.lng_b != null) {
      const dist = haversineDistance(
        Number(row.lat_a), Number(row.lng_a),
        Number(row.lat_b), Number(row.lng_b)
      );
      locationScore = normalizeLocationScore(dist);
    }

    // Temporal score
    let temporalScore = 0;
    if (row.time_diff_hours != null && Number.isFinite(Number(row.time_diff_hours))) {
      temporalScore = normalizeTemporalScore(Number(row.time_diff_hours));
    }

    // Phase 2 duplicate score
    let duplicateScore = 0;
    let duplicateFlag = 0;
    try {
      const refDate = new Date('2026-01-01T00:00:00Z');
      const pseudoNew = {
        embedding_vector: embA,
        location_lat: row.lat_a,
        location_lng: row.lng_a,
        created_at: refDate.toISOString(),
      };
      const pseudoCand = {
        id: 'train-pair',
        embedding_vector: embB,
        location_lat: row.lat_b,
        location_lng: row.lng_b,
        created_at: new Date(refDate.getTime() + Number(row.time_diff_hours) * 3600 * 1000).toISOString(),
        similar_group_id: null,
      };
      const phase2Result = scoreCandidate(pseudoNew, pseudoCand);
      duplicateScore = phase2Result.duplicateScore;
      duplicateFlag = phase2Result.isDuplicate ? 1 : 0;
    } catch (_) {}

    // Category features
    const catA = row.category_a || 'Other';
    const catB = row.category_b || 'Other';
    const sameCategory = catA === catB ? 1 : 0;
    const catAVec = oneHotCategory(catA);
    const catBVec = oneHotCategory(catB);

    const featureVec = [
      semanticSimilarity,
      locationScore,
      temporalScore,
      duplicateScore,
      duplicateFlag,
      sameCategory,
      ...catAVec,
      ...catBVec,
    ];

    X.push(featureVec);
    y.push(labelToIndex(row.label));
  }

  console.log(`  Feature matrix: ${X.length} samples × ${featureNames.length} features`);
  console.log(`  Features: ${featureNames.join(', ')}`);
  console.log();

  // 4. Train/test split
  console.log('Step 4/6: Splitting data...');

  const indices = Array.from({ length: X.length }, (_, i) => i);
  seededShuffle(indices, SEED);

  const splitIdx = Math.floor(X.length * (1 - TEST_SPLIT));
  const trainIndices = indices.slice(0, splitIdx);
  const testIndices = indices.slice(splitIdx);

  const XTrain = trainIndices.map(i => X[i]);
  const yTrain = trainIndices.map(i => y[i]);
  const XTest = testIndices.map(i => X[i]);
  const yTest = testIndices.map(i => y[i]);

  console.log(`  Training set: ${XTrain.length} samples`);
  console.log(`  Test set:     ${XTest.length} samples`);

  // Show per-class distribution
  const trainDist = {};
  yTrain.forEach(l => { trainDist[RELATIONSHIP_LABELS[l]] = (trainDist[RELATIONSHIP_LABELS[l]] || 0) + 1; });
  console.log(`  Training distribution: ${JSON.stringify(trainDist)}`);
  const testDist = {};
  yTest.forEach(l => { testDist[RELATIONSHIP_LABELS[l]] = (testDist[RELATIONSHIP_LABELS[l]] || 0) + 1; });
  console.log(`  Test distribution:     ${JSON.stringify(testDist)}`);
  console.log();

  // 5. Train Random Forest
  console.log('Step 5/6: Training Random Forest...');
  console.log(`  Trees: ${N_ESTIMATORS}, Max features: ${MAX_FEATURES}, Seed: ${SEED}`);

  const classifier = new RandomForestClassifier({
    nEstimators: N_ESTIMATORS,
    maxFeatures: MAX_FEATURES,
    replacement: true,
    seed: SEED,
    useSampleBagging: true,
  });

  const t0 = Date.now();
  classifier.train(XTrain, yTrain);
  const trainTime = ((Date.now() - t0) / 1000).toFixed(2);
  console.log(`  Training complete in ${trainTime}s`);
  console.log();

  // 6. Evaluate
  console.log('Step 6/6: Evaluating model...\n');

  // Train set evaluation
  const yTrainPred = classifier.predict(XTrain);
  const trainMetrics = evaluate(yTrain, yTrainPred, RELATIONSHIP_LABELS.length);

  // Test set evaluation
  const yTestPred = classifier.predict(XTest);
  const testMetrics = evaluate(yTest, yTestPred, RELATIONSHIP_LABELS.length);

  console.log('───────────────────────────────────────────────────────────');
  console.log('  TRAINING SET RESULTS');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`  Accuracy: ${trainMetrics.accuracy}`);
  console.log();
  console.log('  Per-class:');
  console.log('  ' + 'Label'.padEnd(15) + 'Precision'.padEnd(12) + 'Recall'.padEnd(10) + 'F1'.padEnd(10) + 'Support');
  trainMetrics.perClass.forEach(c => {
    console.log('  ' + c.label.padEnd(15) + String(c.precision).padEnd(12) + String(c.recall).padEnd(10) + String(c.f1).padEnd(10) + c.support);
  });

  console.log();
  console.log('───────────────────────────────────────────────────────────');
  console.log('  TEST SET RESULTS');
  console.log('───────────────────────────────────────────────────────────');
  console.log(`  Accuracy: ${testMetrics.accuracy}`);
  console.log();
  console.log('  Per-class:');
  console.log('  ' + 'Label'.padEnd(15) + 'Precision'.padEnd(12) + 'Recall'.padEnd(10) + 'F1'.padEnd(10) + 'Support');
  testMetrics.perClass.forEach(c => {
    console.log('  ' + c.label.padEnd(15) + String(c.precision).padEnd(12) + String(c.recall).padEnd(10) + String(c.f1).padEnd(10) + c.support);
  });
  console.log();

  if (X.length < 200) {
    console.log('  ⚠️  NOTICE: Evaluation is preliminary because the current');
    console.log('     labelled dataset is small (' + X.length + ' pairs). Metrics may not');
    console.log('     generalize. Add more labelled pairs to improve reliability.');
    console.log();
  }

  // Confusion matrix
  console.log('  Confusion Matrix (rows=actual, cols=predicted):');
  console.log('  ' + ''.padEnd(15) + RELATIONSHIP_LABELS.map(l => l.substring(0, 6).padEnd(8)).join(''));
  testMetrics.confMatrix.forEach((row, i) => {
    console.log('  ' + RELATIONSHIP_LABELS[i].padEnd(15) + row.map(v => String(v).padEnd(8)).join(''));
  });
  console.log();

  // 7. Save model
  console.log('Saving model...');
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }

  const modelJson = classifier.toJSON();
  fs.writeFileSync(MODEL_PATH, JSON.stringify(modelJson), 'utf8');
  const modelSize = (fs.statSync(MODEL_PATH).size / 1024).toFixed(1);
  console.log(`  Model saved to ${MODEL_PATH} (${modelSize} KB)`);

  // Save metadata
  const metadata = {
    version: '1.0.0',
    phase: 3,
    trainingDate: new Date().toISOString(),
    datasetPath: CSV_PATH,
    datasetSize: X.length,
    trainSize: XTrain.length,
    testSize: XTest.length,
    features: featureNames,
    featureCount: featureNames.length,
    labels: RELATIONSHIP_LABELS,
    hyperparameters: {
      nEstimators: N_ESTIMATORS,
      maxFeatures: MAX_FEATURES,
      seed: SEED,
      testSplit: TEST_SPLIT,
    },
    trainMetrics: {
      accuracy: trainMetrics.accuracy,
      perClass: trainMetrics.perClass,
    },
    testMetrics: {
      accuracy: testMetrics.accuracy,
      perClass: testMetrics.perClass,
    },
    notes: X.length < 200
      ? 'Seed dataset — metrics are preliminary. Add more labelled pairs for reliable evaluation.'
      : 'Dataset is reasonable size but continuous improvement through more labels is recommended.',
  };

  fs.writeFileSync(METADATA_PATH, JSON.stringify(metadata, null, 2), 'utf8');
  console.log(`  Metadata saved to ${METADATA_PATH}`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Phase 3 Training Complete');
  console.log('═══════════════════════════════════════════════════════════\n');

  // Print example predictions
  console.log('Example predictions on test set:');
  const exampleCount = Math.min(5, XTest.length);
  for (let i = 0; i < exampleCount; i++) {
    const realIdx = testIndices[i];
    const row = rows[realIdx];
    const pred = RELATIONSHIP_LABELS[yTestPred[i]];
    const actual = row.label;
    const match = pred === actual ? '✓' : '✗';
    console.log(`  ${match} Predicted: ${pred.padEnd(12)} Actual: ${actual.padEnd(12)} | "${row.text_a.substring(0, 35)}..." ↔ "${row.text_b.substring(0, 35)}..."`);
  }
  console.log();

  console.log('To retrain after adding more labelled pairs:');
  console.log('  node --experimental-vm-modules scripts/train_relationship_model.js');
  console.log();
}

main().catch(err => {
  console.error('Training failed:', err);
  process.exit(1);
});
