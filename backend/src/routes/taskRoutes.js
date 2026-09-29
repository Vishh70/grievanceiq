// src/routes/taskRoutes.js
const express = require('express');
const router = express.Router();
const { getTask, updateTaskStatus } = require('../controllers/civicIssueController');
const { protect, optionalAuth } = require('../middleware/auth');

router.get('/:id', optionalAuth, getTask);
router.patch('/:id/status', protect, updateTaskStatus);

module.exports = router;
