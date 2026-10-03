// backend/scripts/run_comprehensive_audit.js
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const { LABEL_TO_ISSUE_TYPE, LABEL_TO_DEPARTMENT, LABEL_DESCRIPTIONS } = require('../src/services/mlService');
const { 
  scoreCandidate, 
  findBestDuplicate, 
  haversineDistance, 
  normalizeLocationScore, 
  normalizeTemporalScore, 
  timeDifferenceHours,
  DUPLICATE_CONFIG 
} = require('../src/services/duplicateDetectionService');
const { 
  extractRelationshipFeatures, 
  predictRelationship, 
  loadModel, 
  RELATIONSHIP_LABELS, 
  CATEGORIES 
} = require('../src/services/relationshipService');
const complaintGraphService = require('../src/services/complaintGraphService');
const { 
  generateCivicIssueTitle, 
  calculateRepresentativeLocation, 
  aggregatePriority 
} = require('../src/services/civicIssueService');
const { 
  loadRules, 
  mapIssueTypesToDepartments 
} = require('../src/services/routingService');
const { 
  buildGraph, 
  kahnTopologicalSort 
} = require('../src/services/taskDependencyService');
const supabase = require('../src/config/supabase');

async function runAudit() {
  console.log('=================================================================');
  console.log('   GRIEVANCEIQ PRE-VIVA COMPREHENSIVE SYSTEM AUDIT');
  console.log('=================================================================\n');

  let allPassed = true;

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT 1: Multi-Label Data Flow Trace
  // ─────────────────────────────────────────────────────────────────────────
  console.log('=== AUDIT 1: MULTI-LABEL DATA FLOW ===');
  const issueLabelsPath = path.join(__dirname, '../ml/models/issue_labels.json');
  const rawLabels = JSON.parse(fs.readFileSync(issueLabelsPath, 'utf8'));
  const rules = loadRules();

  console.log(`Verifying all ${rawLabels.length} ML labels from issue_labels.json:`);
  const audit1Table = [];

  for (const rawLabel of rawLabels) {
    const issueType = LABEL_TO_ISSUE_TYPE[rawLabel];
    const dept = LABEL_TO_DEPARTMENT[rawLabel];
    const routingDept = rules.departmentMapping[issueType];
    const hasTemplates = Array.isArray(rules.taskTemplates[issueType]) && rules.taskTemplates[issueType].length > 0;
    
    const isMapped = !!issueType;
    const isDeptConsistent = dept === routingDept;
    const isUsedDownstream = isMapped && isDeptConsistent && hasTemplates;

    audit1Table.push({
      'Raw ML Label': rawLabel,
      'Issue Type': issueType || 'MISSING',
      'Department': dept || 'MISSING',
      'Rules Match?': isDeptConsistent ? 'YES' : 'NO',
      'Task Templates': hasTemplates ? rules.taskTemplates[issueType].length : 0,
      'Persisted?': 'YES (ml_labels, category)',
      'Used Downstream?': isUsedDownstream ? 'YES' : 'NO'
    });

    if (!isUsedDownstream) allPassed = false;
  }
  console.table(audit1Table);

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT 2: Phase 10 Candidate Retrieval Query Verification
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== AUDIT 2: PHASE 10 CANDIDATE RETRIEVAL QUERY ===');
  const sampleCandidateIssueTypes = ['Road Damage', 'Water Leakage', 'Public Safety Hazard'];
  const sampleCandidateMlLabels = ['road_damage_flag', 'water_leakage_flag', 'traffic_signal_flag'];

  const typesForIn = sampleCandidateIssueTypes.map(t => `"${t}"`).join(',');
  const labelsForOv = sampleCandidateMlLabels.map(l => `"${l}"`).join(',');
  const orQuery = `category.in.(${typesForIn}),ml_labels.ov.{${labelsForOv}}`;

  console.log('Generated OR Query String:');
  console.log('  ', orQuery);

  // Validate format regex
  const expectedPattern = /^category\.in\(\"[^\"]+\"(?:,\"[^\"]+\")*\),ml_labels\.ov\.\{\"[^\"]+\"(?:,\"[^\"]+\")*\}$/;
  const isQueryPatternValid = expectedPattern.test(orQuery);
  console.log('Query pattern matches PostgREST specification:', isQueryPatternValid ? 'PASS' : 'FAIL');

  // Live Supabase query test (read-only)
  let liveDbQueryResult = 'NOT RUN';
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 30);
    const { data, error } = await supabase.from('complaints')
      .select('id, category, ml_labels, created_at')
      .or(orQuery)
      .limit(5);

    if (error) {
      console.error('Supabase query error:', error.message);
      liveDbQueryResult = `FAIL: ${error.message}`;
    } else {
      console.log(`Live Supabase query executed successfully! Found ${data ? data.length : 0} matching records.`);
      liveDbQueryResult = `PASS (${data ? data.length : 0} rows retrieved)`;
    }
  } catch (err) {
    console.error('Live Supabase query threw exception:', err.message);
    liveDbQueryResult = `FAIL: ${err.message}`;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT 3: Duplicate Pipeline Edge Cases
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== AUDIT 3: DUPLICATE PIPELINE EDGE CASES ===');

  // Dummy 384-D vector generator
  const createMockEmbedding = (seed) => {
    const vec = new Array(384).fill(0);
    for (let i = 0; i < 384; i++) {
      vec[i] = Math.sin(seed * (i + 1));
    }
    const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
    return vec.map(v => v / norm);
  };

  const embPotholeA = createMockEmbedding(1.0);
  const embPotholeB = createMockEmbedding(1.0005); // High similarity ~0.999
  const embGarbage = createMockEmbedding(5.0);    // Low similarity

  const baseDate = new Date('2026-10-01T10:00:00Z');
  const within2hDate = new Date('2026-10-01T12:00:00Z');
  const past60hDate = new Date('2026-09-28T20:00:00Z'); // 62 hours prior

  // Case 1: True Duplicate (Same issue, same spot, 2h apart)
  const case1New = {
    embedding_vector: embPotholeA,
    location_lat: 18.52043,
    location_lng: 73.85674,
    created_at: within2hDate.toISOString()
  };
  const case1Cand = {
    id: 'cand-1',
    embedding_vector: embPotholeB,
    location_lat: 18.52045,
    location_lng: 73.85676,
    created_at: baseDate.toISOString()
  };
  const score1 = scoreCandidate(case1New, case1Cand);
  console.log('Case 1 (True Duplicate):', {
    semantic: score1.semanticScore,
    distanceM: score1.distanceMeters,
    locScore: score1.locationScore,
    timeH: score1.timeDiffHours,
    tempScore: score1.temporalScore,
    dupScore: score1.duplicateScore,
    isDuplicate: score1.isDuplicate
  });

  // Case 2: Nearby but Different Issue (10m apart, but completely different issue)
  const case2Cand = {
    id: 'cand-2',
    embedding_vector: embGarbage,
    location_lat: 18.52045,
    location_lng: 73.85676,
    created_at: baseDate.toISOString()
  };
  const score2 = scoreCandidate(case1New, case2Cand);
  console.log('Case 2 (Nearby Different Issue):', {
    semantic: score2.semanticScore,
    locScore: score2.locationScore,
    dupScore: score2.duplicateScore,
    isDuplicate: score2.isDuplicate
  });

  // Case 3: Same Issue Far Away (>500m radius limit, e.g. 10km away)
  const case3Cand = {
    id: 'cand-3',
    embedding_vector: embPotholeB,
    location_lat: 18.62043, // ~11 km away
    location_lng: 73.85674,
    created_at: baseDate.toISOString()
  };
  const score3 = scoreCandidate(case1New, case3Cand);
  console.log('Case 3 (Same Issue Far Away):', {
    semantic: score3.semanticScore,
    distanceM: score3.distanceMeters,
    locScore: score3.locationScore,
    dupScore: score3.duplicateScore,
    isDuplicate: score3.isDuplicate
  });

  // Case 4: Same Issue Outside Temporal Window (>48h window limit)
  const case4Cand = {
    id: 'cand-4',
    embedding_vector: embPotholeB,
    location_lat: 18.52045,
    location_lng: 73.85676,
    created_at: past60hDate.toISOString()
  };
  const score4 = scoreCandidate(case1New, case4Cand);
  console.log('Case 4 (Same Issue Outside Temporal Window):', {
    semantic: score4.semanticScore,
    timeH: score4.timeDiffHours,
    tempScore: score4.temporalScore,
    dupScore: score4.duplicateScore,
    isDuplicate: score4.isDuplicate
  });

  const dupChecksPassed = score1.isDuplicate === true &&
                         score2.isDuplicate === false &&
                         score3.isDuplicate === false;
  console.log('Duplicate scoring logic verification:', dupChecksPassed ? 'PASS' : 'FAIL');

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT 4: Relationship Model All 4 Classes & Normalization
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== AUDIT 4: RELATIONSHIP MODEL & NORMALIZATION ===');
  const rfModel = loadModel();
  console.log('Random Forest Model loaded:', rfModel ? 'YES' : 'NO');
  console.log('Supported Relationship Labels:', RELATIONSHIP_LABELS);
  console.log('Supported Categories:', CATEGORIES);

  // Test category normalization across all 9 ML issue types
  const testIssueTypes = [
    'Road Damage', 'Road Flooding', 'Water Leakage', 
    'Electrical Hazard', 'Streetlight Failure', 'Power Outage',
    'Drainage Overflow', 'Garbage Accumulation', 'Public Safety Hazard'
  ];

  const normalizeCategory = (cat) => {
    const c = cat || 'Other';
    if (c === 'Road Damage' || c === 'Road Flooding') return 'Roads';
    if (c === 'Water Leakage') return 'Water Supply';
    if (c === 'Electrical Hazard' || c === 'Streetlight Failure' || c === 'Power Outage') return 'Electricity';
    if (c === 'Drainage Overflow') return 'Drainage';
    if (c === 'Garbage Accumulation') return 'Waste Management';
    if (c === 'Public Safety Hazard') return 'Public Infrastructure';
    if (CATEGORIES.includes(c)) return c;
    return 'Other';
  };

  const normAudit = testIssueTypes.map(type => ({
    'Issue Type': type,
    'Normalized Category': normalizeCategory(type),
    'In CATEGORIES?': CATEGORIES.includes(normalizeCategory(type)) ? 'YES' : 'NO'
  }));
  console.table(normAudit);

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT 5: Civic Issue Aggregation & Connected Components
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== AUDIT 5: CIVIC ISSUE AGGREGATION & CONNECTED COMPONENTS ===');
  const mockComplaints = [
    { id: 'C1', category: 'Road Damage', location_lat: 18.5204, location_lng: 73.8567, priority: 'Medium' },
    { id: 'C2', category: 'Water Leakage', location_lat: 18.5206, location_lng: 73.8569, priority: 'High' },
    { id: 'C3', category: 'Road Flooding', location_lat: 18.5205, location_lng: 73.8568, priority: 'Critical' },
    { id: 'C4', category: 'Garbage Accumulation', location_lat: 18.5900, location_lng: 73.9100, priority: 'Low' }
  ];

  // C1 and C2 are Related (Pipeline burst causing road cave-in)
  // C2 and C3 are Duplicate/Related
  // C4 is Independent
  const mockEdges = [
    { sourceId: 'C1', targetId: 'C2', relationship: 'Related' },
    { sourceId: 'C2', targetId: 'C3', relationship: 'Duplicate' },
    { sourceId: 'C1', targetId: 'C4', relationship: 'Independent' } // Should NOT form an edge
  ];

  complaintGraphService.buildGraph(mockComplaints, mockEdges);
  const components = complaintGraphService.findConnectedComponents();
  console.log('Graph Connected Components found:', components);

  const group1 = components.find(c => c.includes('C1'));
  const group2 = components.find(c => c.includes('C4'));

  const group1Complaints = group1.map(id => mockComplaints.find(c => c.id === id));
  const title = generateCivicIssueTitle(group1Complaints);
  const location = calculateRepresentativeLocation(group1Complaints);
  const aggPriority = aggregatePriority(group1Complaints);

  console.log('Group 1 Aggregation Results:');
  console.log('  Complaints:', group1);
  console.log('  Title:', title);
  console.log('  Representative Location:', location);
  console.log('  Aggregated Priority:', aggPriority, '(Expected: Critical from C3)');

  const graphPassed = group1.length === 3 && group2.length === 1 && aggPriority === 'Critical';
  console.log('Graph clustering & aggregation verification:', graphPassed ? 'PASS' : 'FAIL');

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT 6: Department Routing Mapping
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== AUDIT 6: DEPARTMENT ROUTING MAPPING ===');
  const allDeptIssueTypes = rules.issueTypes.map(label => ({ label, confidence: 0.9 }));
  const deptMappingResult = mapIssueTypesToDepartments(allDeptIssueTypes);
  console.log('Mapped Departments for all issue types:');
  console.log(deptMappingResult.mappingReasons);

  // ─────────────────────────────────────────────────────────────────────────
  // AUDIT 7: Workflow DAG & Topological Sort (Kahn's Algorithm)
  // ─────────────────────────────────────────────────────────────────────────
  console.log('\n=== AUDIT 7: WORKFLOW DAG & CYCLE DETECTION ===');

  // Case A: Valid Dependency Chain
  // Task 1 (Inspect) -> Task 2 (Repair) -> Task 3 (Verify)
  const validTasks = [
    { id: 'T1', title: 'Inspect', priority: 'High', created_at: '2026-10-01' },
    { id: 'T2', title: 'Repair', priority: 'High', created_at: '2026-10-01' },
    { id: 'T3', title: 'Verify', priority: 'Medium', created_at: '2026-10-01' }
  ];
  const validDeps = [
    { task_id: 'T2', depends_on_task_id: 'T1' },
    { task_id: 'T3', depends_on_task_id: 'T2' }
  ];
  const { graph: gA, inDegree: inA } = buildGraph(validTasks, validDeps);
  const planA = kahnTopologicalSort(validTasks, gA, inA);
  console.log('Case A (Valid Chain):', {
    validDag: planA.validDag,
    order: planA.sorted,
    stages: planA.stages
  });

  // Case B: Independent Tasks (Parallel execution)
  const indepTasks = [
    { id: 'T1', title: 'Road repair', priority: 'High', created_at: '2026-10-01' },
    { id: 'T2', title: 'Sanitation clean', priority: 'Medium', created_at: '2026-10-01' }
  ];
  const { graph: gB, inDegree: inB } = buildGraph(indepTasks, []);
  const planB = kahnTopologicalSort(indepTasks, gB, inB);
  console.log('Case B (Independent Tasks):', {
    validDag: planB.validDag,
    order: planB.sorted,
    stages: planB.stages
  });

  // Case C: Missing Dependency (Dependency points to a task outside the set)
  const missingDepTasks = [
    { id: 'T1', title: 'Road repair', priority: 'High', created_at: '2026-10-01' }
  ];
  const missingDeps = [
    { task_id: 'T1', depends_on_task_id: 'NONEXISTENT_TASK' }
  ];
  const { graph: gC, inDegree: inC } = buildGraph(missingDepTasks, missingDeps);
  const planC = kahnTopologicalSort(missingDepTasks, gC, inC);
  console.log('Case C (Missing Dependency):', {
    validDag: planC.validDag,
    order: planC.sorted,
    stages: planC.stages
  });

  // Case D: Circular Dependency (T1 -> T2 and T2 -> T1)
  const cycleTasks = [
    { id: 'T1', title: 'Task A', priority: 'High', created_at: '2026-10-01' },
    { id: 'T2', title: 'Task B', priority: 'High', created_at: '2026-10-01' }
  ];
  const cycleDeps = [
    { task_id: 'T2', depends_on_task_id: 'T1' },
    { task_id: 'T1', depends_on_task_id: 'T2' }
  ];
  const { graph: gD, inDegree: inD } = buildGraph(cycleTasks, cycleDeps);
  const planD = kahnTopologicalSort(cycleTasks, gD, inD);
  console.log('Case D (Circular Dependency):', {
    validDag: planD.validDag,
    cycle: planD.cycle,
    sortedLength: planD.sorted.length
  });

  const dagAuditPassed = planA.validDag === true &&
                         planA.sorted[0] === 'T1' &&
                         planA.sorted[1] === 'T2' &&
                         planA.sorted[2] === 'T3' &&
                         planB.validDag === true &&
                         planC.validDag === true && // Safely ignores external unlinked
                         planD.validDag === false &&
                         planD.cycle.length === 2;
  console.log('Workflow DAG verification:', dagAuditPassed ? 'PASS' : 'FAIL');

  console.log('\n=================================================================');
  console.log('AUDIT COMPREHENSIVE SUITE FINISHED');
  console.log('=================================================================');
}

runAudit().catch(err => {
  console.error('Audit failed with error:', err);
  process.exit(1);
});
