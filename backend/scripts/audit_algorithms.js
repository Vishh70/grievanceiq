const fs = require('fs');
const path = require('path');
const { generateEmbedding, cosineSimilarity } = require('../src/services/embeddingService');
const { 
  scoreCandidate, 
  findBestDuplicate, 
  haversineDistance, 
  normalizeLocationScore, 
  normalizeTemporalScore, 
  timeDifferenceHours,
  DUPLICATE_CONFIG 
} = require('../src/services/duplicateDetectionService');
const { ComplaintGraphService } = require('../src/services/complaintGraphService');
const { loadRules, mapIssueTypesToDepartments } = require('../src/services/routingService');
const { buildGraph, kahnTopologicalSort } = require('../src/services/taskDependencyService');

async function auditAlgorithms() {
  const results = {
    embedding: {},
    duplicateDetection: {},
    graphDfs: {},
    routing: {},
    kahnsAlgorithm: {}
  };

  console.log('=== AUDITING EMBEDDINGS (MiniLM) ===');
  // 1. MiniLM Embedding Tests
  const texts = [
    { name: 'Pothole A', text: 'Large dangerous pothole on MG Road near the metro station' },
    { name: 'Pothole B (Paraphrased)', text: 'Deep crater in the middle of MG Road close to metro entrance' },
    { name: 'Garbage', text: 'Overflowing garbage bin and stinking waste accumulation on street corner' },
    { name: 'Water Leak', text: 'Clean drinking water gushing from cracked main pipeline under pavement' },
    { name: 'Long Text', text: 'The road has been broken for months with multiple deep potholes that fill with rainwater during heavy downpours creating severe traffic congestion, damaging vehicle suspensions, causing two-wheeler accidents, and splashing dirty road water onto pedestrians walking on the pavement during peak morning and evening commute hours.' }
  ];

  const embeddings = {};
  for (const t of texts) {
    const t0 = performance.now();
    const emb = await generateEmbedding(t.text);
    const dur = performance.now() - t0;
    embeddings[t.name] = {
      length: emb.length,
      finite: emb.every(v => Number.isFinite(v)),
      latencyMs: Number(dur.toFixed(2)),
      vector: emb
    };
    console.log(`- ${t.name}: length=${emb.length}, latency=${dur.toFixed(2)}ms`);
  }

  // Edge cases
  const emptyEmb = await generateEmbedding('');
  const whitespaceEmb = await generateEmbedding('   ');
  console.log(`- Empty text handled: length=${emptyEmb.length}`);
  console.log(`- Whitespace text handled: length=${whitespaceEmb.length}`);

  // Cosine similarities
  const simPara = cosineSimilarity(embeddings['Pothole A'].vector, embeddings['Pothole B (Paraphrased)'].vector);
  const simGarbage = cosineSimilarity(embeddings['Pothole A'].vector, embeddings['Garbage'].vector);
  const simWater = cosineSimilarity(embeddings['Pothole A'].vector, embeddings['Water Leak'].vector);

  results.embedding = {
    dimension: 384,
    similarityPotholePara: Number(simPara.toFixed(4)),
    similarityPotholeGarbage: Number(simGarbage.toFixed(4)),
    similarityPotholeWater: Number(simWater.toFixed(4)),
    emptyLength: emptyEmb.length,
    whitespaceLength: whitespaceEmb.length,
    status: simPara > 0.70 && simGarbage < 0.35 ? 'PASS' : 'FAIL'
  };

  console.log(`  Similarity Pothole vs Paraphrase: ${simPara.toFixed(4)}`);
  console.log(`  Similarity Pothole vs Garbage:    ${simGarbage.toFixed(4)}`);
  console.log(`  Similarity Pothole vs Water:      ${simWater.toFixed(4)}`);

  console.log('\n=== AUDITING DUPLICATE DETECTION ===');
  // 2. Duplicate Detection Tests
  // Exact duplicate text, same location, same time
  const candExact = {
    id: 'c1',
    embedding_vector: embeddings['Pothole A'].vector,
    location_lat: 18.5204,
    location_lng: 73.8567,
    created_at: new Date().toISOString()
  };
  const newExact = {
    embedding_vector: embeddings['Pothole A'].vector,
    location_lat: 18.5204,
    location_lng: 73.8567,
    created_at: new Date().toISOString()
  };
  const scoreExact = scoreCandidate(newExact, candExact);

  // Paraphrased, nearby (50m), 2 hours later
  const candPara = {
    id: 'c2',
    embedding_vector: embeddings['Pothole B (Paraphrased)'].vector,
    location_lat: 18.5207,
    location_lng: 73.8569,
    created_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  };
  const scorePara = scoreCandidate(newExact, candPara);

  // Similar text but different location (5 km away)
  const candFar = {
    id: 'c3',
    embedding_vector: embeddings['Pothole B (Paraphrased)'].vector,
    location_lat: 18.5604,
    location_lng: 73.8967,
    created_at: new Date().toISOString()
  };
  const scoreFar = scoreCandidate(newExact, candFar);

  results.duplicateDetection = {
    exactScore: scoreExact,
    paraphrasedScore: scorePara,
    farLocationScore: scoreFar,
    status: scoreExact.isDuplicate && !scoreFar.isDuplicate ? 'PASS' : 'FAIL'
  };
  console.log(`- Exact Duplicate: isDup=${scoreExact.isDuplicate}, score=${scoreExact.duplicateScore.toFixed(4)}`);
  console.log(`- Paraphrased Nearby: isDup=${scorePara.isDuplicate}, score=${scorePara.duplicateScore.toFixed(4)}`);
  console.log(`- Paraphrased 5km Far: isDup=${scoreFar.isDuplicate}, score=${scoreFar.duplicateScore.toFixed(4)}`);

  console.log('\n=== AUDITING GRAPH DFS CONNECTED COMPONENTS ===');
  // 3. DFS Graph Connected Components
  const graphService = new ComplaintGraphService();
  const testNodes = [
    { id: 'cmp-1', text: 'Pothole 1' },
    { id: 'cmp-2', text: 'Pothole 2' },
    { id: 'cmp-3', text: 'Pothole 3' },
    { id: 'cmp-4', text: 'Streetlight 1' },
    { id: 'cmp-5', text: 'Garbage 1' }
  ];
  // cmp-1 <-> cmp-2 (Duplicate), cmp-2 <-> cmp-3 (Related), cmp-4 (Isolated), cmp-5 (Isolated)
  const testEdges = [
    { sourceId: 'cmp-1', targetId: 'cmp-2', relationship: 'Duplicate' },
    { sourceId: 'cmp-2', targetId: 'cmp-3', relationship: 'Related' },
    { sourceId: 'cmp-1', targetId: 'cmp-4', relationship: 'Similar' } // Should be ignored by design
  ];
  graphService.buildGraph(testNodes, testEdges);
  const components = graphService.findConnectedComponents();

  results.graphDfs = {
    totalNodes: testNodes.length,
    componentsCount: components.length,
    components: components,
    status: components.length === 3 ? 'PASS' : 'FAIL'
  };
  console.log(`- Components found: ${components.length}`);
  console.log(`- Components: ${JSON.stringify(components)}`);

  console.log('\n=== AUDITING DETERMINISTIC ROUTING ===');
  // 4. Deterministic Routing Rules
  const rules = loadRules();
  const routingTestCases = rules.issueTypes.map(type => {
    const res = mapIssueTypesToDepartments([{ label: type, confidence: 1.0 }]);
    return {
      issueType: type,
      assignedDept: res.departments[0] || 'NONE',
      expectedDept: rules.departmentMapping[type],
      match: res.departments[0] === rules.departmentMapping[type]
    };
  });
  const allRoutesMatch = routingTestCases.every(c => c.match);
  results.routing = {
    testCases: routingTestCases,
    status: allRoutesMatch ? 'PASS' : 'FAIL'
  };
  console.log(`- All 9 issue types route to correct departments: ${allRoutesMatch ? 'PASS' : 'FAIL'}`);

  console.log('\n=== AUDITING KAHN TOPOLOGICAL SORT & CYCLE DETECTION ===');
  // 5. Kahn's Algorithm
  // Valid DAG test
  const dagTasks = [
    { id: 't1', title: 'Inspect leakage' },
    { id: 't2', title: 'Isolate/repair pipeline' },
    { id: 't3', title: 'Verify restoration' }
  ];
  const dagDeps = [
    { task_id: 't2', depends_on_task_id: 't1' },
    { task_id: 't3', depends_on_task_id: 't2' }
  ];
  const { graph: g1, inDegree: in1 } = buildGraph(dagTasks, dagDeps);
  const plan1 = kahnTopologicalSort(dagTasks, g1, in1);

  // Cycle test: t1 -> t2 -> t3 -> t1
  const cycleDeps = [
    ...dagDeps,
    { task_id: 't1', depends_on_task_id: 't3' }
  ];
  const { graph: g2, inDegree: in2 } = buildGraph(dagTasks, cycleDeps);
  const planCycle = kahnTopologicalSort(dagTasks, g2, in2);

  results.kahnsAlgorithm = {
    validDag: plan1.validDag,
    stagesCount: plan1.stages.length,
    sortedIds: plan1.sorted,
    cycleDetected: !planCycle.validDag,
    cycle: planCycle.cycle,
    status: plan1.validDag && !planCycle.validDag ? 'PASS' : 'FAIL'
  };
  console.log(`- Valid DAG topological sort: valid=${plan1.validDag}, stages=${plan1.stages.length}`);
  console.log(`- Cycle graph topological sort: valid=${planCycle.validDag}, cycleDetected=${!planCycle.validDag}`);

  fs.writeFileSync(path.join(__dirname, '../algorithm_audit_results.json'), JSON.stringify(results, null, 2));
  console.log('\nAlgorithm audit results saved to backend/algorithm_audit_results.json');
}

auditAlgorithms().catch(err => {
  console.error('Audit failed:', err);
  process.exit(1);
});
