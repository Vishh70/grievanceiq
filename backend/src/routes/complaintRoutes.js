// src/routes/complaintRoutes.js
const express = require('express');
const router  = express.Router();
const upload  = require('../middleware/upload');
const { protect, restrictTo } = require('../middleware/auth');
const { validate, complaintSchema } = require('../middleware/validate');
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  updateStatus,
  getSimilarComplaints,
} = require('../controllers/complaintController');

// All routes require authentication
router.use(protect);

router.post('/',              upload.single('image'), validate(complaintSchema), createComplaint);
router.get('/',               getComplaints);
router.get('/:id',            getComplaintById);
router.get('/:id/similar',    getSimilarComplaints);
router.patch('/:id/status',   restrictTo('admin'), updateStatus);

module.exports = router;
