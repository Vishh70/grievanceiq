/**
 * GrievanceIQ WICR Review Controller (FR06 / Phase 5)
 * ====================================================
 * Exposes endpoints for municipal officers and administrators to:
 * - Query pending WICR human review items (with department scoping)
 * - Atomically resolve reviews (Accept / Reject) with concurrency protection
 * - Retrieve durable append-only decision audit events and versioned history
 * - Retrieve queue statistical aggregates
 */

const reviewQueueService = require('../services/reviewQueueService');

/**
 * GET /api/wicr/reviews
 * Retrieves pending WICR reviews with pagination, filtering, and search.
 */
exports.getPendingReviews = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const offset = parseInt(req.query.offset, 10) || 0;
    const relationshipType = req.query.relationshipType;
    const search = req.query.search;

    // Department scoping: officers with assigned department default to their department
    let department = req.query.department;
    if (!department && req.user && req.user.role === 'officer' && req.user.department) {
      department = req.user.department;
    }

    const result = await reviewQueueService.getPendingReviews({
      limit,
      offset,
      relationshipType,
      department,
      search
    });

    res.status(200).json({
      success: true,
      reviews: result.reviews,
      total: result.total,
      limit: result.limit,
      offset: result.offset,
      scopedDepartment: department || null
    });
  } catch (err) {
    console.error('[WicrController] Error in getPendingReviews:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch pending reviews' });
  }
};

/**
 * POST /api/wicr/reviews/:id/resolve
 * Atomically resolves a pending WICR decision with reviewer identity and audit notes.
 * Enforces concurrency safety (returns 409 Conflict if already resolved).
 */
exports.resolveReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { action, notes } = req.body;

    if (!action || !['ACCEPT', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: "Invalid action. Must be 'ACCEPT' or 'REJECT'." });
    }

    const reviewerId = req.user ? req.user.id : null;
    if (!reviewerId) {
      return res.status(401).json({ error: 'Reviewer authentication required.' });
    }

    const result = await reviewQueueService.resolveReview({
      decisionId: id,
      reviewerId,
      action,
      notes: notes ? String(notes).trim() : null
    });

    res.status(200).json({
      success: true,
      message: `Review successfully resolved as ${action}.`,
      result
    });
  } catch (err) {
    if (err.status === 409 || err.code === 'REVIEW_ALREADY_RESOLVED') {
      return res.status(409).json({
        error: err.message || 'Conflict: This decision has already been resolved by another reviewer.',
        code: 'REVIEW_ALREADY_RESOLVED'
      });
    }

    console.error(`[WicrController] Error resolving review ${req.params.id}:`, err.message);
    res.status(err.status || 500).json({ error: err.message || 'Failed to resolve review' });
  }
};

/**
 * GET /api/wicr/reviews/:id/events
 * Fetches durable append-only audit events for a specific decision.
 */
exports.getAuditEvents = async (req, res) => {
  try {
    const { id } = req.params;
    const events = await reviewQueueService.getAuditEvents(id);

    res.status(200).json({
      success: true,
      decisionId: id,
      events
    });
  } catch (err) {
    console.error(`[WicrController] Error fetching audit events for ${req.params.id}:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch audit events' });
  }
};

/**
 * GET /api/wicr/history/:sourceId/:targetId
 * Fetches versioned decision history between two complaints.
 */
exports.getDecisionHistory = async (req, res) => {
  try {
    const { sourceId, targetId } = req.params;
    const history = await reviewQueueService.getDecisionHistory(sourceId, targetId);

    res.status(200).json({
      success: true,
      sourceId,
      targetId,
      history
    });
  } catch (err) {
    console.error(`[WicrController] Error fetching decision history:`, err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch decision history' });
  }
};

/**
 * GET /api/wicr/stats
 * Fetches statistical summary of review queue items.
 */
exports.getStats = async (req, res) => {
  try {
    const department = (req.user && req.user.role === 'officer') ? req.user.department : null;
    const stats = await reviewQueueService.getQueueStats(department);

    res.status(200).json({
      success: true,
      stats,
      scopedDepartment: department || null
    });
  } catch (err) {
    console.error('[WicrController] Error fetching stats:', err.message);
    res.status(500).json({ error: err.message || 'Failed to fetch stats' });
  }
};

