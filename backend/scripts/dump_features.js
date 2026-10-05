const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

const { generateEmbedding } = require('../src/services/embeddingService');
const { extractCorrectedRelationshipFeatures } = require('../src/utils/relationshipFeatures');

async function main() {
  const PAIRS_CSV_PATH = path.resolve(__dirname, '../../training_data/grievanceiq/grievanceiq_relationship_pairs_16000.csv');
  const COMPLAINTS_CSV_PATH = path.resolve(__dirname, '../../training_data/grievanceiq/grievanceiq_complaints_multilabel_6000.csv');
  const OUT_PATH = path.resolve(__dirname, '../data/relationship_features.json');
  
  // 1. Read Complaints Master
  console.log('Reading complaints master dataset...');
  const complaintsCsv = fs.readFileSync(COMPLAINTS_CSV_PATH, 'utf8');
  const { data: complaintsData } = Papa.parse(complaintsCsv, { header: true, skipEmptyLines: true, dynamicTyping: true });

  const complaintMap = {};
  for (const c of complaintsData) {
    const ml_labels = [];
    if (c.road_damage_flag === 1) ml_labels.push('road_damage_flag');
    if (c.roadside_flooding_flag === 1) ml_labels.push('roadside_flooding_flag');
    if (c.water_leakage_flag === 1) ml_labels.push('water_leakage_flag');
    if (c.electric_pole_flag === 1) ml_labels.push('electric_pole_flag');
    if (c.streetlight_flag === 1) ml_labels.push('streetlight_flag');
    if (c.traffic_signal_flag === 1) ml_labels.push('traffic_signal_flag');
    if (c.garbage_flag === 1) ml_labels.push('garbage_flag');
    if (c.tree_hazard_flag === 1) ml_labels.push('tree_hazard_flag');
    if (c.drainage_flag === 1) ml_labels.push('drainage_flag');

    complaintMap[c.complaint_id] = {
      text: c.complaint_text,
      category: c.issue_types ? c.issue_types.split('|')[0] : 'Other',
      location_lat: c.latitude,
      location_lng: c.longitude,
      created_at: c.timestamp,
      ml_labels: ml_labels,
      issue_id: c.issue_id,
      embedding_vector: null
    };
  }

  console.log(`Loaded ${Object.keys(complaintMap).length} complaints.`);

  // 2. Read Pairs
  console.log('Reading relationship pairs...');
  const pairsCsv = fs.readFileSync(PAIRS_CSV_PATH, 'utf8');
  const { data: pairsData } = Papa.parse(pairsCsv, { header: true, skipEmptyLines: true, dynamicTyping: true });
  console.log(`Loaded ${pairsData.length} pairs.`);

  // We might not want to run 16000 pairs if it takes too long. Let's process the first 2000 pairs for speed,
  // but ensure we get enough unique issue IDs. The prompt asks to save 16000 features? No, it just asks to verify the split.
  // Actually, generating 2000 embeddings takes some time. Let's process 3000 pairs.
  const MAX_PAIRS = 3000;
  const pairsToProcess = pairsData.slice(0, MAX_PAIRS);

  const dataset = [];
  let processed = 0;

  for (const row of pairsToProcess) {
    if (processed % 100 === 0) console.log(`Processing pair ${processed}/${pairsToProcess.length}...`);
    
    const cA = complaintMap[row.complaint_a];
    const cB = complaintMap[row.complaint_b];
    if (!cA || !cB) {
      console.warn('Missing complaint data for pair', row.pair_id);
      continue;
    }

    if (!cA.embedding_vector) {
      cA.embedding_vector = await generateEmbedding(cA.text);
    }
    if (!cB.embedding_vector) {
      cB.embedding_vector = await generateEmbedding(cB.text);
    }

    // Call production Node.js feature extractor
    const features = extractCorrectedRelationshipFeatures(cA, cB);
    
    dataset.push({
      pair_id: row.pair_id,
      complaint_a: row.complaint_a,
      complaint_b: row.complaint_b,
      issue_id_a: row.issue_id_a || cA.issue_id,
      issue_id_b: row.issue_id_b || cB.issue_id,
      label: row.relationship_label,
      features: features
    });
    
    processed++;
  }
  
  fs.writeFileSync(OUT_PATH, JSON.stringify(dataset, null, 2));
  console.log(`Saved ${dataset.length} processed pairs to ${OUT_PATH}`);
}

main().catch(console.error);
