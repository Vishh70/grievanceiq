// src/routes/civicIssueRoutes.js
const express = require('express');
const router = express.Router();
const { getCivicIssues, getCivicIssueById, routeIssue, getRoutingResult, getTasks, addDependency, getDependencies, getExecutionPlan, getCivicIssueProgress } = require('../controllers/civicIssueController');
const { optionalAuth, protect, restrictTo } = require('../middleware/auth');

router.get('/', optionalAuth, getCivicIssues);
router.get('/:id', optionalAuth, getCivicIssueById);
router.post('/:id/route', protect, restrictTo('admin'), routeIssue);
router.get('/:id/routing', protect, restrictTo('admin'), getRoutingResult);
router.get('/:id/tasks', protect, restrictTo('admin'), getTasks);

// Phase 6 endpoints
router.post('/:id/dependencies', protect, restrictTo('admin'), addDependency);
router.get('/:id/dependencies', protect, restrictTo('admin'), getDependencies);
router.get('/:id/execution-plan', protect, restrictTo('admin'), getExecutionPlan);

// Phase 7 endpoints
router.get('/:id/progress', protect, restrictTo('admin'), getCivicIssueProgress);

module.exports = router;
