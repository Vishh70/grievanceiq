// src/routes/civicIssueRoutes.js
const express = require('express');
const router = express.Router();
const { getCivicIssues, getCivicIssueById, routeIssue, getRoutingResult, getTasks, addDependency, getDependencies, getExecutionPlan, getCivicIssueProgress } = require('../controllers/civicIssueController');
const { optionalAuth, protect } = require('../middleware/auth');

router.get('/', optionalAuth, getCivicIssues);
router.get('/:id', optionalAuth, getCivicIssueById);
router.post('/:id/route', protect, routeIssue);
router.get('/:id/routing', optionalAuth, getRoutingResult);
router.get('/:id/tasks', optionalAuth, getTasks);

// Phase 6 endpoints
router.post('/:id/dependencies', protect, addDependency);
router.get('/:id/dependencies', optionalAuth, getDependencies);
router.get('/:id/execution-plan', optionalAuth, getExecutionPlan);

// Phase 7 endpoints
router.get('/:id/progress', optionalAuth, getCivicIssueProgress);

module.exports = router;
