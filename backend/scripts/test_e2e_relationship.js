require('dotenv').config();
const { supabase } = require('../src/config/supabase');
const { generateEmbedding } = require('../src/services/embeddingService');
const { predictIssueLabels } = require('../src/services/mlService');
const { processCivicIssueGrouping } = require('../src/services/civicIssueService');

// Stub ML service temporarily if not active, but we just want to run the flow
async function runE2ETest() {
  console.log('--- STEP 7: VERIFY END-TO-END COMPLAINT FLOW ---');
  
  const complaintText = "There is water leakage beside the road and the leakage has damaged the road surface.";
  console.log(`Complaint: "${complaintText}"`);
  
  let embeddingVector = [];
  try {
    embeddingVector = await generateEmbedding(complaintText);
    console.log('1. Embedding generated');
  } catch (err) {
    console.error('Embedding failed', err);
    return;
  }

  let mlPrediction = { labels: [], issueTypes: [], probabilities: {}, departments: [], serviceAvailable: false };
  try {
    mlPrediction = await predictIssueLabels(embeddingVector, complaintText);
    console.log('2. ML prediction:', mlPrediction.issueTypes);
  } catch (err) {
    console.error('ML Issue Classification failed', err);
    return;
  }

  const primaryCategory = mlPrediction.issueTypes && mlPrediction.issueTypes.length > 0 
    ? mlPrediction.issueTypes[0] 
    : 'Roads';
    
  const candidateMlLabels = mlPrediction.labels && mlPrediction.labels.length > 0
    ? mlPrediction.labels
    : [];

  const newComplaintObj = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    text: complaintText,
    category: primaryCategory,
    ml_labels: candidateMlLabels,
    location_lat: 40.7128,
    location_lng: -74.0060,
    created_at: new Date().toISOString(),
    embedding_vector: embeddingVector
  };

  // Mock candidates to trigger relationship extraction
  const candidateComplaints = [
    {
      id: '123e4567-e89b-12d3-a456-426614174001',
      category: 'Roads',
      ml_labels: ['Road Damage'],
      location_lat: 40.7129,
      location_lng: -74.0061,
      created_at: new Date(Date.now() - 86400000).toISOString(),
      embedding_vector: embeddingVector,
      similar_group_id: '123e4567-e89b-12d3-a456-426614174002'
    }
  ];

  console.log('3. All relevant categories preserved:', candidateMlLabels);
  console.log('4. Calling civic issue grouping (relationship + routing)...');
  
  try {
    await processCivicIssueGrouping(newComplaintObj, candidateComplaints);
    console.log('--- END TO END SUCCESS ---');
  } catch (err) {
    console.error('Grouping failed:', err);
  }
}

runE2ETest().then(() => process.exit(0));
