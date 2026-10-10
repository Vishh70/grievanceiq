const { Worker } = require('bullmq');
const { createConnection } = require('../config/queue');
const supabase = require('../config/supabase');

const { analyzeComplaint } = require('../services/aiService');
const { generateEmbedding } = require('../services/embeddingService');
const { predictIssueLabels } = require('../services/mlService');
const { findBestDuplicate, DUPLICATE_CONFIG } = require('../services/duplicateDetectionService');
const { processCivicIssueGrouping } = require('../services/civicIssueService');

const workerConnection = createConnection();
async function processComplaintLogic(jobData) {
  const { complaintId, text, imageBase64, mimeType } = jobData;
  
  // 1. Mark as processing
  const { error: procErr } = await supabase.from('complaints').update({ processing_status: 'PROCESSING' }).eq('id', complaintId);
  if (procErr) throw new Error(`Failed to mark PROCESSING: ${procErr.message}`);
  console.log(`[Worker] Started processing complaint ${complaintId}`);

  try {
    // 2. Fetch complaint data to get created_at, lat, lng
    const { data: complaintData, error: fetchErr } = await supabase.from('complaints').select('*').eq('id', complaintId).single();
    if (fetchErr || !complaintData) throw new Error('Complaint not found in DB');

    const aiResult = await analyzeComplaint(text, imageBase64, mimeType);
    
    let embeddingVector = [];
    try {
      embeddingVector = await generateEmbedding(text);
    } catch (embedErr) {
      console.error('[Worker] Embedding generation failed:', embedErr.message);
      throw new Error(`Embedding generation failed: ${embedErr.message}`);
    }

    let mlPrediction = { labels: [], issueTypes: [], probabilities: {}, departments: [], serviceAvailable: false };
    try {
      mlPrediction = await predictIssueLabels(embeddingVector, text);
    } catch (mlErr) {
      console.error('[Worker] ML Issue Classification failed:', mlErr.message);
      throw new Error(`ML Issue Classification failed: ${mlErr.message}`);
    }

    const primaryCategory = mlPrediction.issueTypes && mlPrediction.issueTypes.length > 0 
      ? mlPrediction.issueTypes[0] 
      : aiResult.category;

    const candidateIssueTypes = mlPrediction.issueTypes && mlPrediction.issueTypes.length > 0
      ? mlPrediction.issueTypes
      : [aiResult.category];

    const candidateMlLabels = mlPrediction.labels && mlPrediction.labels.length > 0
      ? mlPrediction.labels
      : [];

    let similarGroupId = complaintData.id;
    let isDuplicate = false;
    let duplicateScore = 0;
    let duplicateCandidateId = null;
    let dupSemanticScore = 0;
    let dupLocationScore = 0;
    let dupTemporalScore = 0;
    let candidateComplaints = [];

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - DUPLICATE_CONFIG.CANDIDATE_MAX_AGE_DAYS);

      const typesForIn = candidateIssueTypes.map(t => `"${t}"`).join(',');
      let orQuery = `category.in.(${typesForIn})`;
      if (candidateMlLabels.length > 0) {
        const labelsForOv = candidateMlLabels.map(l => `"${l}"`).join(',');
        orQuery = `category.in.(${typesForIn}),ml_labels.ov.{${labelsForOv}}`;
      }

      let { data: candidates, error: candQueryErr } = await supabase.from('complaints')
        .select('id, description, embedding_vector, location_lat, location_lng, created_at, similar_group_id, category, ml_labels, civic_issue_id')
        .or(orQuery)
        .neq('id', complaintData.id)
        .eq('ai_processed', true)
        .gte('created_at', cutoffDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(DUPLICATE_CONFIG.CANDIDATE_LIMIT);

      if (candQueryErr && candQueryErr.message && candQueryErr.message.includes('embedding_vector')) {
        const fallbackRes = await supabase.from('complaints')
          .select('id, description, location_lat, location_lng, created_at, similar_group_id, category, ml_labels, civic_issue_id')
          .or(orQuery)
          .neq('id', complaintData.id)
          .eq('ai_processed', true)
          .gte('created_at', cutoffDate.toISOString())
          .order('created_at', { ascending: false })
          .limit(DUPLICATE_CONFIG.CANDIDATE_LIMIT);
        candidates = fallbackRes.data;
      }

      if (candidates && candidates.length > 0) {
        candidateComplaints = candidates;
        const newComplaintForScoring = {
          embedding_vector: embeddingVector,
          location_lat: complaintData.location_lat,
          location_lng: complaintData.location_lng,
          created_at: complaintData.created_at,
        };

        const { bestMatch, allScores } = findBestDuplicate(newComplaintForScoring, candidates);

        if (bestMatch) {
          isDuplicate = true;
          duplicateScore = bestMatch.duplicateScore;
          duplicateCandidateId = bestMatch.candidateId;
          dupSemanticScore = bestMatch.semanticScore;
          dupLocationScore = bestMatch.locationScore;
          dupTemporalScore = bestMatch.temporalScore;

          const matchedCandidate = candidates.find(c => c.id === bestMatch.candidateId);
          if (matchedCandidate && matchedCandidate.similar_group_id) {
            similarGroupId = matchedCandidate.similar_group_id;
          } else {
            similarGroupId = bestMatch.candidateId;
          }
        }
      }
    } catch (dupErr) {
      console.error('[Worker] Phase 2 duplicate detection failed:', dupErr.message);
    }

    const updatePayload = {
      category: primaryCategory,
      priority: aiResult.priority,
      keywords: aiResult.keywords,
      severity_score: aiResult.severityScore,
      safety_hazards: aiResult.safetyHazards,
      suggested_action: aiResult.suggestedAction,
      similar_group_id: similarGroupId,
      ai_duplicate_flag: isDuplicate,
      ai_processed: true,
      duplicate_score: duplicateScore,
      duplicate_candidate_id: duplicateCandidateId,
      duplicate_semantic_score: dupSemanticScore,
      duplicate_location_score: dupLocationScore,
      duplicate_temporal_score: dupTemporalScore,
      ml_labels: mlPrediction.labels,
      ml_probabilities: mlPrediction.probabilities,
      ml_departments: mlPrediction.departments,
      processing_status: 'PROCESSING'
    };

    if (Array.isArray(embeddingVector) && embeddingVector.length > 0) {
      updatePayload.embedding_vector = embeddingVector;
    }

    let currentPayload = { ...updatePayload };
    let updateSuccess = false;
    let attempts = 0;
    
    while (!updateSuccess && attempts < 10) {
      attempts++;
      const { error: updateErr } = await supabase.from('complaints').update(currentPayload).eq('id', complaintData.id);
      
      if (!updateErr) {
        updateSuccess = true;
        break;
      }
      
      let badCol = null;
      if (updateErr.message) {
        if (updateErr.message.includes('does not exist')) {
          const match = updateErr.message.match(/column "(.*?)" of relation/);
          if (match) badCol = match[1];
        } else if (updateErr.message.includes('Could not find the')) {
          const match = updateErr.message.match(/find the '(.*?)' column/);
          if (match) badCol = match[1];
        }
      }
      
      if (badCol) {
        console.warn(`[Worker] Schema mismatch: Dropping missing column '${badCol}' from update payload.`);
        delete currentPayload[badCol];
        continue;
      }
      
      // If it's a real database error (connection, constraint, syntax), don't swallow it.
      console.error(`[Worker] Critical DB Update Error: ${updateErr.message}`);
      throw new Error(`Database update failed: ${updateErr.message}`);
    }
    
    if (!updateSuccess) {
      throw new Error('Failed to update complaint with processed data after multiple attempts (schema fallback exhausted).');
    }
    
    // Phase 4: Civic Issue Grouping & Routing
    try {
      const newComplaintObj = {
        id: complaintData.id,
        text: text,
        category: primaryCategory,
        ml_labels: candidateMlLabels,
        location_lat: complaintData.location_lat,
        location_lng: complaintData.location_lng,
        created_at: complaintData.created_at,
        embedding_vector: embeddingVector,
        civic_issue_id: complaintData.civic_issue_id
      };
      
      await processCivicIssueGrouping(newComplaintObj, candidateComplaints);
      console.log(`[Worker] Complaint ${complaintData.id} Civic Issue grouping complete.`);
      
      // Finally mark as PROCESSED after all orchestration completes successfully
      const { error: processedErr } = await supabase.from('complaints').update({ processing_status: 'PROCESSED' }).eq('id', complaintData.id);
      if (processedErr) throw new Error(`Failed to mark PROCESSED: ${processedErr.message}`);
      
    } catch (grpErr) {
      console.error('[Worker] Phase 4 Civic Issue Grouping failed:', grpErr.message);
      throw new Error(`Civic Issue Grouping failed: ${grpErr.message}`);
    }
    
  } catch (err) {
    console.error(`[Worker] Failed processing ${complaintId}:`, err);
    await supabase.from('complaints').update({ processing_status: 'FAILED', processing_error: err.message }).eq('id', complaintId);
    throw err;
  }
}

const worker = new Worker('ComplaintProcessing', async job => {
  return processComplaintLogic(job.data);
}, { connection: workerConnection });

worker.workerConnection = workerConnection;

worker.on('failed', (job, err) => {
  console.log(`[Worker] Job ${job.id} has failed with ${err.message}`);
});

module.exports = { worker, processComplaintLogic };
