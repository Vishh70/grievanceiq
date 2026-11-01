// src/routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const {
  getTask,
  updateTaskStatus,
  getPendingRecommendations,
  acceptRecommendation,
  rejectRecommendation,
  verifyTask
} = require('../controllers/civicIssueController');
const { protect, restrictTo } = require('../middleware/auth');

// Recommendations approval workflows
router.get('/recommendations', protect, restrictTo('admin', 'officer'), getPendingRecommendations);
router.post('/recommendations/:id/accept', protect, restrictTo('admin', 'officer'), acceptRecommendation);
router.post('/recommendations/:id/reject', protect, restrictTo('admin', 'officer'), rejectRecommendation);

// Task inspection verification & status updates
router.get('/:id', protect, restrictTo('admin', 'officer'), getTask);
router.patch('/:id/status', protect, restrictTo('admin', 'officer'), updateTaskStatus);
router.post('/:id/verify', protect, restrictTo('admin', 'officer'), verifyTask);

module.exports = router;
