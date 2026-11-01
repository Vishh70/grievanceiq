/**
 * GrievanceIQ WICR Review Routes (FR06 / Phase 5)
 * =================================================
 * Enforces server-side authentication and role-based access control.
 * Only 'admin' and 'officer' roles can access these endpoints.
 * Citizens and unauthenticated requests are strictly rejected.
 */

const express = require('express');
const router = express.Router();
const wicrController = require('../controllers/wicrController');
const { protect, restrictTo } = require('../middleware/auth');

// Require valid JWT authentication for all WICR endpoints
router.use(protect);

// Require administrative or municipal officer privileges
router.use(restrictTo('admin', 'officer'));

// Queue retrieval with search, filtering, and pagination
router.get('/reviews', wicrController.getPendingReviews);

// Statistical summary of review queue
router.get('/stats', wicrController.getStats);

// Atomic resolution (ACCEPT / REJECT) with concurrency handling
router.post('/reviews/:id/resolve', wicrController.resolveReview);

// Append-only audit events for a decision
router.get('/reviews/:id/events', wicrController.getAuditEvents);

// Versioned decision history for a complaint pair
router.get('/history/:sourceId/:targetId', wicrController.getDecisionHistory);

module.exports = router;

