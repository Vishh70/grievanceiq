const getBullMQ = () => {
  if (process.env.NODE_ENV === 'test' && process.env.MOCK_REDIS !== 'false') {
    return require('../../__mocks__/bullmq');
  }
  return typeof jest !== 'undefined' ? jest.requireActual('bullmq') : require('bullmq');
};
const { Worker } = getBullMQ();
const { getRedisConnectionOptions } = require('../config/queue');
const supabase = require('../config/supabase');
const crypto = require('crypto');

const { analyzeComplaint } = require('../services/aiService');
const { generateEmbedding } = require('../services/embeddingService');
const { predictIssueLabels } = require('../services/mlService');
const { findBestDuplicate, DUPLICATE_CONFIG } = require('../services/duplicateDetectionService');
const { processCivicIssueGrouping } = require('../services/civicIssueService');
const { resolveRecommendedDepartments } = require('../utils/departmentResolver');

// ── Lease Configuration ──────────────────────────────────────────────────────
const LEASE_DURATION_SECONDS = 300; // 5 minutes
const LEASE_RENEWAL_INTERVAL_MS = 120000; // Renew every 2 minutes

/**
 * Generates a unique worker token for lease ownership.
 */
function generateWorkerId() {
  return `worker-${process.pid}-${crypto.randomBytes(4).toString('hex')}-${Date.now()}`;
}

/**
 * Attempts to atomically acquire a processing lease on a complaint.
 * Uses the acquire_complaint_lease RPC function if available,
 * otherwise falls back to a conditional UPDATE.
 *
 * @param {string} complaintId
 * @param {string} workerId
 * @returns {Promise<boolean>} true if lease was acquired
 */
async function acquireLease(complaintId, workerId) {
  // Try RPC first (Phase 14 migration)
  try {
    const { data, error } = await supabase.rpc('acquire_complaint_lease', {
      p_complaint_id: complaintId,
      p_worker_id: workerId,
      p_lease_duration_seconds: LEASE_DURATION_SECONDS
    });
    if (!error) {
      if (Array.isArray(data)) return data.length > 0;
      return data !== null && data !== false;
    }
    // RPC not available — fall through to manual approach
    if (!error.message.includes('function') && !error.message.includes('does not exist')) {
      throw error;
    }
  } catch (rpcErr) {
    if (rpcErr.message && !rpcErr.message.includes('function') && !rpcErr.message.includes('does not exist')) {
      throw rpcErr;
    }
  }

  // Fallback: conditional update for schemas without the RPC function
  const leaseExpiry = new Date(Date.now() + LEASE_DURATION_SECONDS * 1000).toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from('complaints')
    .update({
      processing_status: 'PROCESSING',
      locked_by: workerId,
      lock_expires_at: leaseExpiry,
      retry_count: supabase.rpc ? undefined : 1, // Can't increment in plain update
      processing_error: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', complaintId)
    .in('processing_status', ['PENDING', 'FAILED'])
    .select('id')
    .single();

  if (updateErr) {
    // Check if columns don't exist yet (pre-migration)
    if (updateErr.message && (updateErr.message.includes('locked_by') || updateErr.message.includes('lock_expires_at'))) {
      // Pre-migration fallback: simple status update without lease columns
      const { error: simpleErr } = await supabase
        .from('complaints')
        .update({
          processing_status: 'PROCESSING',
          processing_error: null
        })
        .eq('id', complaintId)
        .in('processing_status', ['PENDING', 'FAILED']);
      return !simpleErr;
    }
    return false;
  }

  return !!updated;
}

/**
 * Renews the lease for a complaint being processed.
 * @returns {Promise<boolean>}
 */
async function renewLease(complaintId, workerId) {
  try {
    const { data, error } = await supabase.rpc('renew_complaint_lease', {
      p_complaint_id: complaintId,
      p_worker_id: workerId,
      p_lease_duration_seconds: LEASE_DURATION_SECONDS
    });
    if (!error) return !!data;
  } catch {
    // RPC not available, try manual
  }

  // Fallback
  try {
    const leaseExpiry = new Date(Date.now() + LEASE_DURATION_SECONDS * 1000).toISOString();
    const { error } = await supabase
      .from('complaints')
      .update({ lock_expires_at: leaseExpiry, updated_at: new Date().toISOString() })
      .eq('id', complaintId)
      .eq('locked_by', workerId)
      .eq('processing_status', 'PROCESSING');
    return !error;
  } catch {
    return false;
  }
}

/**
 * Atomically commits all processing results and releases the lease.
 * Verifies worker ownership before committing.
 *
 * @param {string} complaintId
 * @param {string} workerId
 * @param {object} payload - All processing results
 * @returns {Promise<boolean>} true if commit succeeded
 */
async function commitProcessing(complaintId, workerId, payload) {
  // Try RPC first
  try {
    const { data, error } = await supabase.rpc('commit_complaint_processing', {
      p_complaint_id: complaintId,
      p_worker_id: workerId,
      p_category: payload.category || null,
      p_priority: payload.priority || null,
      p_severity_score: payload.severity_score || null,
      p_safety_hazards: payload.safety_hazards || null,
      p_suggested_action: payload.suggested_action || null,
      p_keywords: payload.keywords || null,
      p_embedding_vector: payload.embedding_vector || null,
      p_similar_group_id: payload.similar_group_id || null,
      p_ai_duplicate_flag: payload.ai_duplicate_flag || false,
      p_duplicate_score: payload.duplicate_score || 0,
      p_duplicate_candidate_id: payload.duplicate_candidate_id || null,
      p_duplicate_semantic_score: payload.duplicate_semantic_score || 0,
      p_duplicate_location_score: payload.duplicate_location_score || 0,
      p_duplicate_temporal_score: payload.duplicate_temporal_score || 0,
      p_ml_labels: payload.ml_labels || null,
      p_ml_probabilities: payload.ml_probabilities || null,
      p_ml_departments: payload.ml_departments || null,
      p_civic_issue_id: payload.civic_issue_id || null
    });
    if (!error) return !!data;
    if (!error.message.includes('function') && !error.message.includes('does not exist')) {
      throw error;
    }
  } catch (rpcErr) {
    if (rpcErr.message && !rpcErr.message.includes('function') && !rpcErr.message.includes('does not exist')) {
      throw rpcErr;
    }
  }

  // Fallback: conditional update with ownership check
  const commitPayload = {
    ...payload,
    ai_processed: true,
    processing_status: 'PROCESSED',
    processing_error: null,
    locked_by: null,
    lock_expires_at: null,
    updated_at: new Date().toISOString()
  };

  // Remove null/undefined values
  Object.keys(commitPayload).forEach(k => {
    if (commitPayload[k] === undefined) delete commitPayload[k];
  });

  let query = supabase.from('complaints').update(commitPayload).eq('id', complaintId);
  if (workerId) {
    query = query.eq('locked_by', workerId);
  }
  query = query.eq('processing_status', 'PROCESSING');

  const { error } = await query;
  if (error && (error.message?.includes('locked_by') || error.message?.includes('lock_expires_at') || error.code === '42703')) {
    // Pre-migration fallback: retry without lease columns
    const legacyPayload = { ...commitPayload };
    delete legacyPayload.locked_by;
    delete legacyPayload.lock_expires_at;
    const { error: legacyErr } = await supabase
      .from('complaints')
      .update(legacyPayload)
      .eq('id', complaintId)
      .eq('processing_status', 'PROCESSING');
    return !legacyErr;
  }
  return !error;
}

/**
 * Records a processing failure and releases the lease.
 * This runs OUTSIDE the main processing transaction so failures are always recorded.
 */
async function recordProcessingFailure(complaintId, workerId, errorMessage) {
  try {
    // Try RPC first
    try {
      const { error } = await supabase.rpc('record_complaint_failure', {
        p_complaint_id: complaintId,
        p_worker_id: workerId,
        p_error_message: String(errorMessage || 'Unknown processing error').slice(0, 500)
      });
      if (!error) return;
    } catch {
      // RPC not available
    }

    // Fallback
    const sanitizedError = String(errorMessage || 'Unknown processing error').slice(0, 500);
    await supabase.from('complaints').update({
      processing_status: 'FAILED',
      processing_error: sanitizedError,
      ai_processed: false,
      locked_by: null,
      lock_expires_at: null,
      updated_at: new Date().toISOString()
    }).eq('id', complaintId);
  } catch (err) {
    console.error(`[Worker] Failed to record failure state for complaint ${complaintId}:`, err.message);
  }
}

/**
 * Resiliently updates a complaint in Supabase, dropping missing schema columns if needed.
 * Used for intermediate stage persistence (triage results before final commit).
 */
async function safeDbUpdate(complaintId, payload) {
  let currentPayload = { ...payload };
  let attempts = 0;
  const REQUIRED_COLUMNS = ['category', 'priority', 'severity_score', 'processing_status'];

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
      // SECURITY: Never silently drop required columns
      if (REQUIRED_COLUMNS.includes(badCol)) {
        console.error(`[Worker] ❌ Required column '${badCol}' is missing from schema. Cannot continue.`);
        throw new Error(`Required schema column '${badCol}' is missing. Run database migrations.`);
      }
      console.warn(`[Worker] Schema mismatch: Dropping optional column '${badCol}' from update.`);
      delete currentPayload[badCol];
      continue;
    }

    console.error(`[Worker] DB Update Error on complaint ${complaintId}: ${error.message}`);
    throw new Error(`Database update failed: ${error.message}`);
  }
  throw new Error('Failed to update complaint after schema fallback attempts.');
}

async function processComplaintLogic(jobData) {
  const { complaintId, text, imageBase64, mimeType } = jobData;
  const workerId = generateWorkerId();
  let leaseRenewalTimer = null;

  // ── Stage 0: Acquire Processing Lease ────────────────────────────────────
  const leaseAcquired = await acquireLease(complaintId, workerId);
  if (!leaseAcquired) {
    console.log(`[Worker] Complaint ${complaintId} is already being processed or completed. Skipping.`);
    return; // Idempotent: another worker owns it or it's already PROCESSED
  }

  // Start periodic lease renewal
  leaseRenewalTimer = setInterval(async () => {
    const renewed = await renewLease(complaintId, workerId);
    if (!renewed) {
      console.warn(`[Worker] Lease renewal failed for complaint ${complaintId}. Ownership may be lost.`);
    }
  }, LEASE_RENEWAL_INTERVAL_MS);

  console.log(`[Worker] Acquired lease for complaint ${complaintId} (worker: ${workerId})`);

  try {
    // Fetch complaint record
    const { data: complaintData, error: fetchErr } = await supabase.from('complaints').select('*').eq('id', complaintId).single();
    if (fetchErr || !complaintData) {
      throw new Error('Complaint not found in DB');
    }

    // ── Stage 1: AI Triage (Gemini) ──────────────────────────────────────────
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

    // Persist Stage 1 AI Triage results immediately so they are never lost
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
    console.log(`[Worker] Stage 1 AI triage persisted for complaint ${complaintId} (Category: ${validatedCategory}, Priority: ${validatedPriority})`);

    // ── Stage 2: Embedding Generation & Validation ───────────────────────────
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

    // ── Stage 3: Multi-Label ML Classification ───────────────────────────────
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

    // ── Stage 4: Duplicate Detection & Relationship Analysis ─────────────────
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

    // Renew lease before heavy civic-issue grouping
    await renewLease(complaintId, workerId);

    // ── Stage 5: Civic Issue Grouping & Routing ──────────────────────────────
    let civicIssueId = complaintData.civic_issue_id;
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
      
      const groupingResult = await processCivicIssueGrouping(newComplaintObj, candidateComplaints);
      if (groupingResult && groupingResult.civicIssueId) {
        civicIssueId = groupingResult.civicIssueId;
      }
      console.log(`[Worker] Complaint ${complaintData.id} Civic Issue grouping complete.`);
    } catch (grpErr) {
      console.error('[Worker] Civic Issue Grouping failed:', grpErr.message);
      throw new Error(`Civic Issue Grouping failed: ${grpErr.message}`);
    }

    // ── Stage 6: Atomic Commit with Ownership Verification ──────────────────
    const commitPayload = {
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
      civic_issue_id: civicIssueId
    };

    if (Array.isArray(embeddingVector) && embeddingVector.length === 384) {
      commitPayload.embedding_vector = embeddingVector;
    }

    const committed = await commitProcessing(complaintId, workerId, commitPayload);
    if (!committed) {
      console.warn(`[Worker] Ownership lost for complaint ${complaintId} during commit. Another worker may have taken over.`);
      return; // Do not throw — ownership was lost gracefully
    }

    console.log(`[Worker] Complaint ${complaintData.id} processing successfully committed.`);

  } catch (err) {
    console.error(`[Worker] Failed processing ${complaintId}:`, err.message);
    // Record failure OUTSIDE the main processing — this is a separate operation
    await recordProcessingFailure(complaintId, workerId, err.message);
    throw err;
  } finally {
    // Always clear the lease renewal timer
    if (leaseRenewalTimer) {
      clearInterval(leaseRenewalTimer);
    }
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
