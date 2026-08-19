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
  updateStatus,
  getSimilarComplaints,
  getPublicComplaints,
  upvoteComplaint,
} = require('../controllers/complaintController');

// Publicly readable endpoints (with optional auth for citizen upvote states)
router.get('/public', optionalAuth, getPublicComplaints);
router.get('/:id', optionalAuth, getComplaintById);
router.get('/:id/similar', optionalAuth, getSimilarComplaints);

// Protected routes (require valid citizen/admin JWT)
router.use(protect);

router.post('/',              upload.single('image'), validate(complaintSchema), createComplaint);
router.get('/',               getComplaints);
router.patch('/:id/status',   restrictTo('admin'), updateStatus);
router.post('/:id/upvote',    upvoteComplaint);

module.exports = router;

