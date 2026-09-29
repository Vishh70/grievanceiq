// src/services/relationshipService.js
// Phase 3: Relationship Classification — Inference Service
//
// Classifies a pair of complaints into one of:
//   Duplicate | Similar | Related | Independent
//
// Uses a trained Random Forest model on features from Phase 1 (embeddings)
// and Phase 2 (duplicate scoring).

const path = require('path');
const fs = require('fs');
const { generateEmbedding, cosineSimilarity } = require('./embeddingService');
const {
  haversineDistance,
  normalizeLocationScore,
  normalizeTemporalScore,
  timeDifferenceHours,
  scoreCandidate,
  DUPLICATE_CONFIG,
} = require('./duplicateDetectionService');

// ── Constants ───────────────────────────────────────────────────────────────

const RELATIONSHIP_LABELS = ['Duplicate', 'Similar', 'Related', 'Independent'];

const CATEGORIES = [
  'Roads',
  'Water Supply',
  'Electricity',
  'Drainage',
  'Waste Management',
  'Public Infrastructure',
  'Other',
];

const MODEL_DIR = path.resolve(__dirname, '../../models/relationship');
const MODEL_PATH = path.join(MODEL_DIR, 'model.json');
const METADATA_PATH = path.join(MODEL_DIR, 'metadata.json');

// ── Category Encoding ───────────────────────────────────────────────────────

/**
 * One-hot encodes a category string into a binary array.
 * Unknown categories are mapped to the 'Other' slot.
 *
 * @param {string} category
 * @returns {number[]} Array of 0s and 1s (length = CATEGORIES.length)
 */
function oneHotCategory(category) {
  const vec = new Array(CATEGORIES.length).fill(0);
  let idx = CATEGORIES.indexOf(category);
  if (idx === -1) idx = CATEGORIES.indexOf('Other');
  vec[idx] = 1;
  return vec;
}

// ── Feature Extraction ──────────────────────────────────────────────────────

/**
 * Extracts a numerical feature vector for a pair of complaints.
 *
 * The feature vector contains:
 * [0]     semantic_similarity  (cosine similarity of embeddings)
 * [1]     location_score       (Haversine-based, normalized 0-1)
 * [2]     temporal_score       (time-diff-based, normalized 0-1)
 * [3]     duplicate_score      (Phase 2 weighted score)
 * [4]     duplicate_flag       (0 or 1)
 * [5]     same_category        (0 or 1)
 * [6-12]  category_a one-hot   (7 features)
 * [13-19] category_b one-hot   (7 features)
 *
 * Total: 20 features
 *
 * @param {object} complaintA - { embedding_vector, location_lat, location_lng, created_at, category }
 * @param {object} complaintB - Same shape
 * @returns {number[]} Feature vector of length 20
 */
function extractRelationshipFeatures(complaintA, complaintB) {
  // 1. Semantic similarity
  let semanticSimilarity = 0;
  const embA = complaintA.embedding_vector;
  const embB = complaintB.embedding_vector;
  if (Array.isArray(embA) && embA.length > 0 && Array.isArray(embB) && embB.length > 0) {
    semanticSimilarity = cosineSimilarity(embA, embB);
  }

  // 2. Location score (reuse Phase 2 normalization)
  let locationScore = 0;
  const latA = complaintA.location_lat;
  const lngA = complaintA.location_lng;
  const latB = complaintB.location_lat;
  const lngB = complaintB.location_lng;
  if (latA != null && lngA != null && latB != null && lngB != null) {
    const dist = haversineDistance(Number(latA), Number(lngA), Number(latB), Number(lngB));
    locationScore = normalizeLocationScore(dist);
  }

  // 3. Temporal score
  let temporalScore = 0;
  if (complaintA.created_at && complaintB.created_at) {
    const diffHours = timeDifferenceHours(complaintA.created_at, complaintB.created_at);
    temporalScore = normalizeTemporalScore(diffHours);
  }

  // 4. Phase 2 duplicate score and flag
  let duplicateScore = 0;
  let duplicateFlag = 0;
  try {
    const pseudoNew = {
      embedding_vector: embA || [],
      location_lat: latA,
      location_lng: lngA,
      created_at: complaintA.created_at || new Date().toISOString(),
    };
    const pseudoCand = {
      id: 'phase2-pseudo',
      embedding_vector: embB || [],
      location_lat: latB,
      location_lng: lngB,
      created_at: complaintB.created_at || new Date().toISOString(),
      similar_group_id: null,
    };
    const phase2Result = scoreCandidate(pseudoNew, pseudoCand);
    duplicateScore = phase2Result.duplicateScore;
    duplicateFlag = phase2Result.isDuplicate ? 1 : 0;
  } catch (_) {
    // Graceful degradation — duplicate features stay at 0
  }

  // 5. Same category
  const catA = complaintA.category || 'Other';
  const catB = complaintB.category || 'Other';
  const sameCategory = catA === catB ? 1 : 0;

  // 6. One-hot encoded categories
  const catAVec = oneHotCategory(catA);
  const catBVec = oneHotCategory(catB);

  // Build feature vector (total: 20 features)
  return [
    semanticSimilarity,
    locationScore,
    temporalScore,
    duplicateScore,
    duplicateFlag,
    sameCategory,
    ...catAVec,
    ...catBVec,
  ];
}

// ── Feature Names (for metadata / debugging) ────────────────────────────────

function getFeatureNames() {
  const catFeaturesA = CATEGORIES.map(c => `category_a_${c.replace(/\s+/g, '_')}`);
  const catFeaturesB = CATEGORIES.map(c => `category_b_${c.replace(/\s+/g, '_')}`);
  return [
    'semantic_similarity',
    'location_score',
    'temporal_score',
    'duplicate_score',
    'duplicate_flag',
    'same_category',
    ...catFeaturesA,
    ...catFeaturesB,
  ];
}

// ── Model Loading ───────────────────────────────────────────────────────────

let cachedClassifier = null;

/**
 * Loads the trained Random Forest model from disk.
 * Caches it in memory for subsequent calls.
 *
 * @returns {object|null} The RandomForestClassifier instance, or null if no model exists
 */
function loadModel() {
  if (cachedClassifier) return cachedClassifier;

  if (!fs.existsSync(MODEL_PATH)) {
    console.warn('⚠️ Phase 3 model not found at', MODEL_PATH);
    console.warn('   Run: node scripts/train_relationship_model.js');
    return null;
  }

  try {
    const { RandomForestClassifier } = require('ml-random-forest');
    const modelJson = JSON.parse(fs.readFileSync(MODEL_PATH, 'utf8'));
    cachedClassifier = RandomForestClassifier.load(modelJson);
    console.log('✅ Phase 3 relationship model loaded from', MODEL_PATH);
    return cachedClassifier;
  } catch (err) {
    console.error('Failed to load Phase 3 model:', err.message);
    return null;
  }
}

/**
 * Clears the cached model (useful after retraining).
 */
function clearModelCache() {
  cachedClassifier = null;
}

// ── Prediction with Confidence ──────────────────────────────────────────────

/**
 * Predicts the relationship label with per-tree vote-based confidence.
 *
 * @param {object} classifier - A loaded RandomForestClassifier instance
 * @param {number[]} features - Feature vector (length 20)
 * @returns {{ relationship: string, confidence: number, probabilities: object }}
 */
function predictWithConfidence(classifier, features) {
  // Get majority-vote prediction
  const prediction = classifier.predict([features])[0];

  // Compute per-tree votes for confidence estimation
  let confidence = 1.0;
  const probabilities = {};
  RELATIONSHIP_LABELS.forEach((_, i) => { probabilities[RELATIONSHIP_LABELS[i]] = 0; });

  try {
    if (classifier.estimators && classifier.estimators.length > 0) {
      const totalTrees = classifier.estimators.length;
      const votes = {};

      classifier.estimators.forEach(tree => {
        const treePred = tree.predict([features]);
        const label = Array.isArray(treePred) ? treePred[0] : treePred;
        votes[label] = (votes[label] || 0) + 1;
      });

      // Convert votes to probabilities
      for (const [labelIdx, count] of Object.entries(votes)) {
        const idx = parseInt(labelIdx);
        if (idx >= 0 && idx < RELATIONSHIP_LABELS.length) {
          probabilities[RELATIONSHIP_LABELS[idx]] = Number((count / totalTrees).toFixed(4));
        }
      }

      confidence = (votes[prediction] || 0) / totalTrees;
      confidence = Number(confidence.toFixed(4));
    }
  } catch (_) {
    // If tree-level prediction fails, use majority vote with 1.0 confidence
  }

  return {
    relationship: RELATIONSHIP_LABELS[prediction] || 'Independent',
    confidence,
    probabilities,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Predicts the relationship between two complaints.
 *
 * Accepts either:
 *   - Full complaint objects (with embedding_vector already computed)
 *   - Text-only objects (will generate embeddings on-the-fly)
 *
 * @param {object} complaintA - { text, category, location_lat, location_lng, created_at, [embedding_vector] }
 * @param {object} complaintB - Same shape
 * @returns {Promise<{ relationship: string, confidence: number, probabilities: object, features: object }>}
 */
async function predictRelationship(complaintA, complaintB) {
  const classifier = loadModel();
  if (!classifier) {
    return {
      relationship: 'Unknown',
      confidence: 0,
      probabilities: {},
      error: 'Model not trained yet. Run: node scripts/train_relationship_model.js',
    };
  }

  // Generate embeddings if not already present
  const a = { ...complaintA };
  const b = { ...complaintB };

  if ((!a.embedding_vector || a.embedding_vector.length === 0) && a.text) {
    try {
      a.embedding_vector = await generateEmbedding(a.text);
    } catch (_) {
      a.embedding_vector = [];
    }
  }

  if ((!b.embedding_vector || b.embedding_vector.length === 0) && b.text) {
    try {
      b.embedding_vector = await generateEmbedding(b.text);
    } catch (_) {
      b.embedding_vector = [];
    }
  }

  const features = extractRelationshipFeatures(a, b);
  const result = predictWithConfidence(classifier, features);

  // Include feature summary for transparency (not raw vectors)
  const featureNames = getFeatureNames();
  const featureSummary = {};
  featureNames.forEach((name, i) => {
    featureSummary[name] = Number(features[i].toFixed(4));
  });

  return {
    relationship: result.relationship,
    confidence: result.confidence,
    probabilities: result.probabilities,
    features: featureSummary,
  };
}

module.exports = {
  // Constants
  RELATIONSHIP_LABELS,
  CATEGORIES,
  MODEL_DIR,
  MODEL_PATH,
  METADATA_PATH,

  // Functions
  oneHotCategory,
  extractRelationshipFeatures,
  getFeatureNames,
  loadModel,
  clearModelCache,
  predictWithConfidence,
  predictRelationship,
};
