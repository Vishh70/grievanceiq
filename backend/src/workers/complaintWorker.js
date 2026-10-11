const getBullMQ = () => {
  if (process.env.NODE_ENV === 'test' && process.env.MOCK_REDIS !== 'false') {
    return require('../../__mocks__/bullmq');
  }
  return typeof jest !== 'undefined' ? jest.requireActual('bullmq') : require('bullmq');
};
const { Worker } = getBullMQ();
const { getRedisConnectionOptions } = require('../config/queue');
const supabase = require('../config/supabase');

const { analyzeComplaint } = require('../services/aiService');
const { generateEmbedding } = require('../services/embeddingService');
const { predictIssueLabels } = require('../services/mlService');
const { findBestDuplicate, DUPLICATE_CONFIG } = require('../services/duplicateDetectionService');
const { processCivicIssueGrouping } = require('../services/civicIssueService');
const { resolveRecommendedDepartments } = require('../utils/departmentResolver');

/**
 * Resiliently updates a complaint in Supabase, dropping missing schema columns if needed.
 */
async function safeDbUpdate(complaintId, payload) {
  let currentPayload = { ...payload };
  let attempts = 0;
  while (attempts < 10) {
    attempts++;
    const { error } = await supabase.from('complaints').update(currentPayload).eq('id', complaintId);
    if (!error) return true;

    let badCol = null;
    if (error.message) {
      if (error.message.includes('does not exist')) {
        const match = error.message.match(/column "(.*?)" of relation/);
        if (match) badCol = match[1];
      } else if (error.message.includes('Could not find the')) {
        const match = error.message.match(/find the '(.*?)' column/);
        if (match) badCol = match[1];
      }
    }

    if (badCol) {
      if (['ml_labels', 'ml_probabilities', 'ml_departments'].includes(badCol)) {
        console.error(`[Worker] ⚠️ Column '${badCol}' missing from 'complaints' table. Omitting.`);
      } else {
        console.warn(`[Worker] Schema mismatch: Dropping column '${badCol}' from update.`);
      }
      delete currentPayload[badCol];
      continue;
    }

    console.error(`[Worker] DB Update Error on complaint ${complaintId}: ${error.message}`);
    throw new Error(`Database update failed: ${error.message}`);
  }
  throw new Error('Failed to update complaint after schema fallback attempts.');
}

/**
 * Records an explicit failure outcome without setting ai_processed to true.
 */
async function recordProcessingFailure(complaintId, errorMessage) {
  try {
    const sanitizedError = String(errorMessage || 'Unknown processing error').slice(0, 500);
    await safeDbUpdate(complaintId, {
      processing_status: 'FAILED',
      processing_error: sanitizedError,
      ai_processed: false
    });
  } catch (err) {
    console.error(`[Worker] Failed to record failure state for complaint ${complaintId}:`, err.message);
  }
}

async function processComplaintLogic(jobData) {
  const { complaintId, text, imageBase64, mimeType } = jobData;
  
  // ── Stage 1: Record initial processing state ───────────────────────────────
  try {
    await safeDbUpdate(complaintId, {
      processing_status: 'PROCESSING',
      processing_error: null
    });
  } catch (initErr) {
    console.error(`[Worker] Failed to mark complaint ${complaintId} as PROCESSING:`, initErr.message);
    await recordProcessingFailure(complaintId, `Initial status update failed: ${initErr.message}`);
    throw initErr;
  }

  console.log(`[Worker] Started processing complaint ${complaintId}`);

  try {
    // Fetch complaint record
    const { data: complaintData, error: fetchErr } = await supabase.from('complaints').select('*').eq('id', complaintId).single();
    if (fetchErr || !complaintData) {
      throw new Error('Complaint not found in DB');
    }

    // ── Stage 2: AI Triage (Gemini) ──────────────────────────────────────────
    let aiResult;
    try {
      aiResult = await analyzeComplaint(text, imageBase64, mimeType);
    } catch (aiErr) {
      throw new Error(`AI Triage failed: ${aiErr.message}`);
    }

    // Validate and sanitize AI triage results
    const validatedCategory = aiResult.category || 'Other';
    const validatedPriority = ['Critical', 'High', 'Medium', 'Low'].includes(aiResult.priority) ? aiResult.priority : 'Medium';
    const parsedSeverity = parseInt(aiResult.severityScore, 10);
    const validatedSeverity = (!isNaN(parsedSeverity) && parsedSeverity >= 1 && parsedSeverity <= 10) ? parsedSeverity : 5;
    const validatedSafetyHazards = Array.isArray(aiResult.safetyHazards) ? aiResult.safetyHazards : [];
    const validatedSuggestedAction = aiResult.suggestedAction || 'Field inspection required';
    const validatedKeywords = Array.isArray(aiResult.keywords) ? aiResult.keywords : [];

    // Derive deterministic initial department recommendation from validated AI category
    const initialDepts = resolveRecommendedDepartments({
      category: validatedCategory,
      aiRecommendedDepartment: aiResult.recommendedDepartment
    });

    // Persist Stage 2 AI Triage results immediately so they are never lost
    await safeDbUpdate(complaintId, {
      category: validatedCategory,
      priority: validatedPriority,
      severity_score: validatedSeverity,
      safety_hazards: validatedSafetyHazards,
      suggested_action: validatedSuggestedAction,
      keywords: validatedKeywords,
      ml_departments: initialDepts,
      processing_status: 'PROCESSING',
      processing_error: null
    });
    console.log(`[Worker] Stage 2 AI triage persisted for complaint ${complaintId} (Category: ${validatedCategory}, Priority: ${validatedPriority})`);

    // ── Stage 3: Embedding Generation & Validation ───────────────────────────
    let embeddingVector = [];
    try {
      embeddingVector = await generateEmbedding(text);
      if (!Array.isArray(embeddingVector) || embeddingVector.length !== 384) {
        throw new Error(`Expected 384-dimensional embedding, received ${Array.isArray(embeddingVector) ? embeddingVector.length : 'non-array'}`);
      }
    } catch (embedErr) {
      console.error('[Worker] Embedding generation failed:', embedErr.message);
      throw new Error(`Embedding generation failed: ${embedErr.message}`);
    }

    // ── Stage 4: Multi-Label ML Classification ───────────────────────────────
    let mlPrediction = { labels: [], issueTypes: [], probabilities: {}, departments: [], serviceAvailable: false };
    try {
      mlPrediction = await predictIssueLabels(embeddingVector, text);
    } catch (mlErr) {
      console.error('[Worker] ML Issue Classification failed:', mlErr.message);
      throw new Error(`ML Issue Classification failed: ${mlErr.message}`);
    }

    // Determine primary category: prioritize ML classification if flags triggered, else retain AI triage category
    const primaryCategory = (mlPrediction.issueTypes && mlPrediction.issueTypes.length > 0)
      ? mlPrediction.issueTypes[0]
      : validatedCategory;

    const candidateIssueTypes = (mlPrediction.issueTypes && mlPrediction.issueTypes.length > 0)
      ? mlPrediction.issueTypes
      : [validatedCategory];

    const candidateMlLabels = (mlPrediction.labels && mlPrediction.labels.length > 0)
      ? mlPrediction.labels
      : [];

    // Combine ML departments and AI departments using deterministic resolver
    const resolvedDepartments = resolveRecommendedDepartments({
      mlDepartments: mlPrediction.departments,
      category: primaryCategory,
      aiRecommendedDepartment: aiResult.recommendedDepartment
    });

    // ── Stage 5: Duplicate Detection & Relationship Analysis ─────────────────
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

        const { bestMatch } = findBestDuplicate(newComplaintForScoring, candidates);

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

    // Persist Stage 4 & 5 outputs (embeddings, ML classifications, and duplicate features)
    const stage5Payload = {
      category: primaryCategory,
      priority: validatedPriority,
      keywords: validatedKeywords,
      severity_score: validatedSeverity,
      safety_hazards: validatedSafetyHazards,
      suggested_action: validatedSuggestedAction,
      similar_group_id: similarGroupId,
      ai_duplicate_flag: isDuplicate,
      duplicate_score: duplicateScore,
      duplicate_candidate_id: duplicateCandidateId,
      duplicate_semantic_score: dupSemanticScore,
      duplicate_location_score: dupLocationScore,
      duplicate_temporal_score: dupTemporalScore,
      ml_labels: mlPrediction.labels,
      ml_probabilities: mlPrediction.probabilities,
      ml_departments: resolvedDepartments,
      processing_status: 'PROCESSING'
    };

    if (Array.isArray(embeddingVector) && embeddingVector.length === 384) {
      stage5Payload.embedding_vector = embeddingVector;
    }

    await safeDbUpdate(complaintData.id, stage5Payload);

    // ── Stage 6: Civic Issue Grouping & Routing ──────────────────────────────
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
    } catch (grpErr) {
      console.error('[Worker] Civic Issue Grouping failed:', grpErr.message);
      throw new Error(`Civic Issue Grouping failed: ${grpErr.message}`);
    }

    // ── Stage 7: Mark Successful Completion ──────────────────────────────────
    // Only marked PROCESSED and ai_processed=true after all mandatory stages pass
    await safeDbUpdate(complaintData.id, {
      ai_processed: true,
      processing_status: 'PROCESSED',
      processing_error: null
    });
    console.log(`[Worker] Complaint ${complaintData.id} processing successfully completed.`);

  } catch (err) {
    console.error(`[Worker] Failed processing ${complaintId}:`, err.message);
    await recordProcessingFailure(complaintId, err.message);
    throw err;
  }
}

const worker = new Worker('ComplaintProcessing', async job => {
  console.log(`[BullMQ Worker] Processing job ${job.id} for complaint ${job.data.complaintId}`);
  return processComplaintLogic(job.data);
}, { connection: getRedisConnectionOptions() });

worker.on('failed', (job, err) => {
  console.log(`[Worker] Job ${job.id} has failed with ${err.message}`);
});

module.exports = { worker, processComplaintLogic };
