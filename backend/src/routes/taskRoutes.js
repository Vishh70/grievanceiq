// src/routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const { getTask, updateTaskStatus } = require('../controllers/civicIssueController');
const { protect, optionalAuth, restrictTo } = require('../middleware/auth');

router.get('/:id', protect, restrictTo('admin'), getTask);
router.patch('/:id/status', protect, restrictTo('admin'), updateTaskStatus);

module.exports = router;
