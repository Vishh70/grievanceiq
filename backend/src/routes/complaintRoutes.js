// src/routes/complaintRoutes.js
const express = require('express');
const router  = express.Router();
const upload  = require('../middleware/upload');
const { protect, optionalAuth, restrictTo } = require('../middleware/auth');
const { validate, complaintSchema } = require('../middleware/validate');
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  getComplaintStatus,
  updateStatus,
  getSimilarComplaints,
  getPublicComplaints,
  upvoteComplaint,
  calculateSimilarity,
  classifyRelationship,
  retryComplaintProcessing,
} = require('../controllers/complaintController');

// Phase 1: Semantic similarity test endpoint
router.post('/similarity', calculateSimilarity);

// Phase 3: Relationship classification test endpoint
router.post('/relationship', classifyRelationship);

// Publicly readable endpoints (with optional auth for citizen upvote states / user context)
router.get('/public', optionalAuth, getPublicComplaints);
router.get('/:id', optionalAuth, getComplaintById);
router.get('/:id/similar', optionalAuth, getSimilarComplaints);

// Protected routes (require valid citizen/admin JWT)
router.use(protect);

router.get('/:id/status',     getComplaintStatus);
router.post('/',              upload.single('image'), validate(complaintSchema), createComplaint);
router.get('/',               getComplaints);
router.patch('/:id/status',   restrictTo('admin'), updateStatus);
router.post('/:id/retry',     restrictTo('admin'), retryComplaintProcessing);
router.post('/:id/upvote',    upvoteComplaint);

module.exports = router;

