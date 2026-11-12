/**
 * GrievanceIQ Review Queue & Decision Persistence Service (FR06)
 * ===============================================================
 * Manages WICR decision records, human review queue interactions,
 * immutable decision resolution audit trails, and concurrent conflict resolution.
 */

const supabase = require('../config/supabase');

class ReviewQueueService {
  /**
   * Persists a WICR decision into public.wicr_decisions via PostgreSQL RPC.
   * 
   * @param {object} decision
   * @returns {Promise<object>}
   */
  async recordDecision(decision) {
    const {
      sourceComplaintId,
      targetComplaintId,
      relationshipType,
      rawProbability,
      calibratedProbability,
      isCalibrated,
      expectedLosses,
      costMatrix,
      action,
      routedToReviewReason,
      modelVersion = '1.0',
      calibrationVersion = '1.0',
      policyVersion = '1.0'
    } = decision;

    try {
      const { data, error } = await supabase.rpc('record_wicr_decision', {
        p_source_id: sourceComplaintId,
        p_target_id: targetComplaintId,
        p_relationship_type: relationshipType,
        p_raw_prob: rawProbability,
        p_cal_prob: calibratedProbability,
        p_is_calibrated: Boolean(isCalibrated),
        p_loss_accept: expectedLosses ? expectedLosses.accept : 0,
        p_loss_reject: expectedLosses ? expectedLosses.reject : 0,
        p_loss_review: expectedLosses ? expectedLosses.review : 1.0,
        p_cost_matrix: costMatrix || { false_lock: 10.0, missed_link: 5.0, review: 1.0 },
        p_selected_action: action,
        p_routed_reason: routedToReviewReason || null,
        p_model_version: modelVersion,
        p_calibration_version: calibrationVersion,
        p_policy_version: policyVersion
      });

      if (error) {
        console.error(`[ReviewQueueService] RPC error recording decision for ${sourceComplaintId} <-> ${targetComplaintId}:`, error.message);
        throw new Error(`Failed to record WICR decision: ${error.message}`);
      }

      return data;
    } catch (err) {
      console.error(`[ReviewQueueService] Exception recording decision:`, err.message);
      throw err;
    }
  }

  /**
   * Fetches pending reviews from the database view with pagination, search, and department scoping.
   * 
   * @param {object} [options]
   * @param {number} [options.limit=50]
   * @param {number} [options.offset=0]
   * @param {string} [options.relationshipType]
   * @param {string} [options.department]
   * @param {string} [options.search]
   * @returns {Promise<{ reviews: Array<object>, total: number, limit: number, offset: number }>}
   */
  async getPendingReviews(options = {}) {
    const limit = Math.max(1, Math.min(100, options.limit || 50));
    const offset = Math.max(0, options.offset || 0);

    try {
      let query = supabase
        .from('v_pending_wicr_reviews')
        .select('*', { count: 'exact' });

      if (options.relationshipType && options.relationshipType !== 'ALL') {
        query = query.eq('relationship_type', options.relationshipType);
      }

      if (options.department && options.department !== 'ALL') {
        query = query.or(`source_department.eq.${options.department},target_department.eq.${options.department}`);
      }

      if (options.search && options.search.trim()) {
        const term = options.search.trim();
        query = query.or(`source_title.ilike.%${term}%,target_title.ilike.%${term}%,source_description.ilike.%${term}%,target_description.ilike.%${term}%`);
      }

      query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, count, error } = await query;
      if (error) {
        console.error(`[ReviewQueueService] Error fetching pending reviews:`, error.message);
        throw new Error(`Failed to fetch pending reviews: ${error.message}`);
      }

      return {
        reviews: data || [],
        total: count != null ? count : (data ? data.length : 0),
        limit,
        offset
      };
    } catch (err) {
      console.error(`[ReviewQueueService] Exception fetching pending reviews:`, err.message);
      throw err;
    }
  }

  /**
   * Resolves a pending review decision via PostgreSQL RPC.
   * Concurrency-safe: uses row locks and throws 409 conflict if already resolved.
   * 
   * @param {object} params
   * @param {string} params.decisionId - UUID of decision
   * @param {string} params.reviewerId - UUID of reviewing officer/admin
   * @param {string} params.action - 'ACCEPT' | 'REJECT'
   * @param {string} [params.notes] - Optional reviewer notes
   * @returns {Promise<object>}
   */
  async resolveReview({ decisionId, reviewerId, action, notes = null }) {
    if (!decisionId || !reviewerId || !action) {
      const err = new Error('decisionId, reviewerId, and action (ACCEPT/REJECT) are required.');
      err.status = 400;
      throw err;
    }

    if (!['ACCEPT', 'REJECT'].includes(action)) {
      const err = new Error(`Invalid resolution action: ${action}. Must be 'ACCEPT' or 'REJECT'.`);
      err.status = 400;
      throw err;
    }

    try {
      const { data, error } = await supabase.rpc('resolve_wicr_review', {
        p_decision_id: decisionId,
        p_reviewer_id: reviewerId,
        p_action: action,
        p_notes: notes
      });

      if (error) {
        if (error.message && error.message.toLowerCase().includes('already resolved')) {
          const conflictErr = new Error('Conflict: This decision has already been resolved by another reviewer.');
          conflictErr.status = 409;
          conflictErr.code = 'REVIEW_ALREADY_RESOLVED';
          throw conflictErr;
        }
        console.error(`[ReviewQueueService] Error resolving review ${decisionId}:`, error.message);
        throw new Error(`Failed to resolve review: ${error.message}`);
      }

      return data;
    } catch (err) {
      console.error(`[ReviewQueueService] Exception resolving review:`, err.message);
      throw err;
    }
  }

  /**
   * Fetches append-only audit events for a given decision ID.
   * 
   * @param {string} decisionId 
   * @returns {Promise<Array<object>>}
   */
  async getAuditEvents(decisionId) {
    try {
      const { data, error } = await supabase
        .from('wicr_review_events')
        .select('*')
        .eq('decision_id', decisionId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error(`[ReviewQueueService] Error fetching audit events for ${decisionId}:`, error.message);
        throw new Error(`Failed to fetch audit events: ${error.message}`);
      }

      return data || [];
    } catch (err) {
      console.error(`[ReviewQueueService] Exception fetching audit events:`, err.message);
      throw err;
    }
  }

  /**
   * Fetches the complete immutable versioned decision history for a pair of complaints,
   * including append-only audit events.
   * 
   * @param {string} complaintId1 
   * @param {string} complaintId2 
   * @returns {Promise<Array<object>>}
   */
  async getDecisionHistory(complaintId1, complaintId2) {
    try {
      const { data, error } = await supabase
        .from('wicr_decisions')
        .select('*')
        .or(`and(source_complaint_id.eq.${complaintId1},target_complaint_id.eq.${complaintId2}),and(source_complaint_id.eq.${complaintId2},target_complaint_id.eq.${complaintId1})`)
        .order('created_at', { ascending: false });

      if (error) {
        console.error(`[ReviewQueueService] Error fetching history for ${complaintId1} <-> ${complaintId2}:`, error.message);
        throw new Error(`Failed to fetch decision history: ${error.message}`);
      }

      return data || [];
    } catch (err) {
      console.error(`[ReviewQueueService] Exception fetching decision history:`, err.message);
      throw err;
    }
  }

  /**
   * Returns aggregated queue metrics for officer dashboard.
   * 
   * @param {string} [department]
   * @returns {Promise<object>}
   */
  async getQueueStats(department = null) {
    try {
      let query = supabase.from('wicr_decisions').select('selected_action, review_status, relationship_type');

      const { data, error } = await query;
      if (error) {
        throw new Error(`Failed to fetch queue stats: ${error.message}`);
      }

      const rows = data || [];
      const pending = rows.filter(r => r.review_status === 'PENDING').length;
      const resolvedAccept = rows.filter(r => r.review_status === 'RESOLVED_ACCEPT').length;
      const resolvedReject = rows.filter(r => r.review_status === 'RESOLVED_REJECT').length;
      const duplicatesPending = rows.filter(r => r.review_status === 'PENDING' && r.relationship_type === 'Duplicate').length;
      const relatedPending = rows.filter(r => r.review_status === 'PENDING' && r.relationship_type === 'Related').length;

      return {
        pending,
        resolvedAccept,
        resolvedReject,
        duplicatesPending,
        relatedPending,
        totalEvaluated: rows.length
      };
    } catch (err) {
      console.error(`[ReviewQueueService] Exception fetching stats:`, err.message);
      throw err;
    }
  }
}

module.exports = new ReviewQueueService();
