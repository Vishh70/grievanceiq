const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { generateEmbedding } = require('../src/services/embeddingService');
const { scoreCandidate, DUPLICATE_CONFIG } = require('../src/services/duplicateDetectionService');
const { predictRelationship } = require('../src/services/relationshipService');
const { ComplaintGraphService } = require('../src/services/complaintGraphService');
const { loadRules, mapIssueTypesToDepartments } = require('../src/services/routingService');
const { buildGraph, kahnTopologicalSort } = require('../src/services/taskDependencyService');
const { LABEL_TO_ISSUE_TYPE, LABEL_TO_DEPARTMENT } = require('../src/services/mlService');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://127.0.0.1:5001';

const CASES = [
  {
    id: 'STG-001',
    description: 'A deep hazardous pothole on Fictional Avenue near Milestone 4 requires urgent road resurfacing.',
    address: 'Fictional Avenue Milestone 4',
    lat: 18.5204,
    lng: 73.8567,
    expectedCategory: 'Road Damage',
    target: 'Road classification and department routing'
  },
  {
    id: 'STG-002',
    description: 'Overflowing municipal waste bin with uncollected garbage creating foul odor at Fictional Market square.',
    address: 'Fictional Market Square',
    lat: 18.5300,
    lng: 73.8500,
    expectedCategory: 'Garbage',
    target: 'Sanitation category and priority handling'
  },
  {
    id: 'STG-003',
    description: 'Streetlight fixture is broken and completely dark at Fictional Crossroad junction.',
    address: 'Fictional Crossroad Junction',
    lat: 18.5400,
    lng: 73.8600,
    expectedCategory: 'Streetlight',
    target: 'Category classification and routing'
  },
  {
    id: 'STG-004',
    description: 'High-pressure clean drinking water pipeline burst gushing water onto pavement on Fictional Sector 9.',
    address: 'Fictional Sector 9',
    lat: 18.5150,
    lng: 73.8450,
    expectedCategory: 'Water Leakage',
    target: 'Water-services classification'
  },
  {
    id: 'STG-005',
    description: 'Stormwater drainage clogged with silt causing severe roadside flooding along Fictional Ring Road.',
    address: 'Fictional Ring Road',
    lat: 18.5250,
    lng: 73.8700,
    expectedCategory: 'Roadside Flooding',
    target: 'Drainage category and severity'
  },
  {
    id: 'STG-006',
    description: 'Traffic signal lights malfunctioned and stuck on blinking amber at Fictional Central intersection.',
    address: 'Fictional Central Intersection',
    lat: 18.5350,
    lng: 73.8550,
    expectedCategory: 'Traffic Signal',
    target: 'Traffic-related classification and routing'
  },
  {
    id: 'STG-007',
    description: 'Damaged tree branch hanging precariously over footpath in front of Fictional Community Park.',
    address: 'Fictional Community Park',
    lat: 18.5100,
    lng: 73.8400,
    expectedCategory: 'Tree Hazard',
    target: 'Lower-severity complaint handling'
  },
  {
    id: 'STG-008',
    description: 'Large deep crater and broken asphalt on Fictional Avenue close to Milestone 4 damaging cars.',
    address: 'Fictional Avenue Milestone 4',
    lat: 18.5205,
    lng: 73.8568, // ~15m from STG-001
    expectedCategory: 'Road Damage',
    target: 'Duplicate and relationship detection (pair with STG-001)'
  },
  {
    id: 'STG-009',
    description: 'Broken public park bench with splintered wood slats inside Fictional North Garden.',
    address: 'Fictional North Garden',
    lat: 18.5800,
    lng: 73.8900, // ~8km away from STG-001
    expectedCategory: 'Public Infrastructure',
    target: 'False-positive duplicate check (must NOT duplicate STG-001)'
  },
  {
    id: 'STG-010',
    description: 'Help broken thing', // Short / ambiguous
    address: 'Fictional Unknown Area',
    lat: null,
    lng: null,
    expectedCategory: 'Fallback / Other',
    target: 'Input validation and cautious fallback behavior'
  }
];

async function runStagingVerification() {
  console.log('=================================================================');
  console.log('   PHASE 6: 10-COMPLAINT STAGING VERIFICATION');
  console.log('=================================================================\n');

  const processedCases = [];
  const rules = loadRules();
  const graphService = new ComplaintGraphService();

  for (let i = 0; i < CASES.length; i++) {
    const c = CASES[i];
    console.log(`\n--- Processing [${c.id}]: "${c.description}" ---`);

    const t0 = performance.now();
    let embedding = [];
    let mlResponse = null;
    let activeFlags = [];
    let issueTypes = [];
    let departments = [];
    let probabilities = {};
    let isFallback = false;

    // 1. Validation check
    const isShortOrAmbiguous = c.description.trim().length < 20;

    // 2. Embedding generation
    try {
      embedding = await generateEmbedding(c.description);
    } catch (e) {
      console.error(`Embedding generation failed for ${c.id}:`, e.message);
    }

    // 3. ML Inference
    if (embedding.length === 384) {
      try {
        const res = await axios.post(`${ML_SERVICE_URL}/predict`, { embedding }, { timeout: 4000 });
        mlResponse = res.data;
        activeFlags = mlResponse.labels || [];
        probabilities = mlResponse.probabilities || {};
        isFallback = mlResponse.fallback_used || false;

        // Map flags to Issue Types & Departments
        activeFlags.forEach(flag => {
          const type = LABEL_TO_ISSUE_TYPE[flag];
          if (type && !issueTypes.includes(type)) issueTypes.push(type);
          const dept = LABEL_TO_DEPARTMENT[flag];
          if (dept && !departments.includes(dept)) departments.push(dept);
        });
      } catch (err) {
        console.error(`ML inference failed for ${c.id}:`, err.message);
      }
    }

    // Fallback if no active flags
    if (issueTypes.length === 0) {
      issueTypes = ['Other'];
      departments = ['General Admin'];
      isFallback = true;
    }

    const durationMs = performance.now() - t0;

    const caseRecord = {
      id: c.id,
      description: c.description,
      address: c.address,
      lat: c.lat,
      lng: c.lng,
      created_at: new Date(Date.now() - (10 - i) * 60000).toISOString(),
      embedding_vector: embedding,
      ml_labels: activeFlags,
      probabilities,
      issueTypes,
      departments,
      isFallback,
      durationMs: Number(durationMs.toFixed(2))
    };

    processedCases.push(caseRecord);
    graphService.addComplaintNode(c.id, caseRecord);

    console.log(`  Active Flags: ${JSON.stringify(activeFlags)}`);
    console.log(`  Issue Types:  ${JSON.stringify(issueTypes)}`);
    console.log(`  Departments:  ${JSON.stringify(departments)}`);
    console.log(`  Fallback Used: ${isFallback}`);
    console.log(`  Duration:     ${durationMs.toFixed(2)}ms`);
  }

  // 4. Duplicate & Relationship Cross-Checks
  console.log('\n=== CROSS-COMPLAINT DUPLICATE & RELATIONSHIP VERIFICATION ===');
  
  // Test STG-008 vs STG-001 (Same defect, 15m away)
  const c1 = processedCases.find(c => c.id === 'STG-001');
  const c8 = processedCases.find(c => c.id === 'STG-008');
  const dupScore81 = scoreCandidate(c8, c1);
  console.log(`\nSTG-008 vs STG-001 (Pothole re-report, 15m away):`);
  console.log(`  Semantic Score: ${dupScore81.semanticScore.toFixed(4)}`);
  console.log(`  Location Score: ${dupScore81.locationScore.toFixed(4)}`);
  console.log(`  Temporal Score: ${dupScore81.temporalScore.toFixed(4)}`);
  console.log(`  Duplicate Score: ${dupScore81.duplicateScore.toFixed(4)}`);
  console.log(`  Is Duplicate:    ${dupScore81.isDuplicate}`);

  // Test STG-009 vs STG-001 (Unrelated defect, 8km away)
  const c9 = processedCases.find(c => c.id === 'STG-009');
  const dupScore91 = scoreCandidate(c9, c1);
  console.log(`\nSTG-009 vs STG-001 (Park bench vs Pothole, 8km away):`);
  console.log(`  Semantic Score: ${dupScore91.semanticScore.toFixed(4)}`);
  console.log(`  Location Score: ${dupScore91.locationScore.toFixed(4)}`);
  console.log(`  Duplicate Score: ${dupScore91.duplicateScore.toFixed(4)}`);
  console.log(`  Is Duplicate:    ${dupScore91.isDuplicate} (Guarded against false positive)`);

  // Relationship Model Inference
  let rel81 = null;
  let rel91 = null;
  try {
    rel81 = await predictRelationship(c8, c1);
    console.log(`\nRelationship STG-008 <-> STG-001: ${rel81.relationship} (confidence: ${rel81.confidence})`);
  } catch (e) {
    console.error('Relationship 8-1 failed:', e.message);
  }

  try {
    rel91 = await predictRelationship(c9, c1);
    console.log(`Relationship STG-009 <-> STG-001: ${rel91.relationship} (confidence: ${rel91.confidence})`);
  } catch (e) {
    console.error('Relationship 9-1 failed:', e.message);
  }

  // 5. Connect edges & DFS components
  if (dupScore81.isDuplicate || (rel81 && rel81.relationship === 'Duplicate')) {
    graphService.addRelationshipEdge('STG-008', 'STG-001', 'Duplicate');
  }

  const components = graphService.findConnectedComponents();
  console.log(`\n=== GROUPED CIVIC ISSUE COMPONENTS ===`);
  console.log(`Total Connected Components: ${components.length}`);
  components.forEach((comp, idx) => {
    console.log(`  Component ${idx + 1}: [${comp.join(', ')}]`);
  });

  // Save report JSON
  const reportData = {
    totalComplaints: processedCases.length,
    cases: processedCases.map(c => ({
      id: c.id,
      description: c.description,
      address: c.address,
      coordinates: c.lat && c.lng ? `${c.lat}, ${c.lng}` : 'N/A',
      active_ml_flags: c.ml_labels,
      issue_types: c.issueTypes,
      departments: c.departments,
      is_fallback: c.isFallback,
      duration_ms: c.durationMs
    })),
    duplicateValidation: {
      case8_vs_case1: dupScore81,
      case9_vs_case1: dupScore91,
      relationship8_1: rel81 ? rel81.relationship : 'N/A',
      relationship9_1: rel91 ? rel91.relationship : 'N/A'
    },
    graphComponents: components
  };

  const outPath = path.join(__dirname, '../ten_complaints_verification.json');
  fs.writeFileSync(outPath, JSON.stringify(reportData, null, 2));
  console.log(`\nResults written to: ${outPath}`);
}

runStagingVerification().catch(err => {
  console.error('Staging verification error:', err);
  process.exit(1);
});
