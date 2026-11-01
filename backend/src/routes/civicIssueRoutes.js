// src/routes/civicIssueRoutes.js
const express = require('express');
const router = express.Router();
const {
  getCivicIssues,
  getCivicIssueById,
  routeIssue,
  getRoutingResult,
  getTasks,
  addDependency,
  getDependencies,
  getExecutionPlan,
  getCivicIssueProgress,
  generatePrerequisiteRecommendations,
  getPendingRecommendations,
  verifyCivicIssueResolution
} = require('../controllers/civicIssueController');
const { optionalAuth, protect, restrictTo } = require('../middleware/auth');

router.get('/', optionalAuth, getCivicIssues);
router.get('/:id', optionalAuth, getCivicIssueById);
router.post('/:id/route', protect, restrictTo('admin', 'officer'), routeIssue);
router.get('/:id/routing', protect, restrictTo('admin', 'officer'), getRoutingResult);
router.get('/:id/tasks', protect, restrictTo('admin', 'officer'), getTasks);

// Dependencies & Execution Plan
router.post('/:id/dependencies', protect, restrictTo('admin', 'officer'), addDependency);
router.get('/:id/dependencies', protect, restrictTo('admin', 'officer'), getDependencies);
router.get('/:id/execution-plan', protect, restrictTo('admin', 'officer'), getExecutionPlan);

// Progress
router.get('/:id/progress', protect, restrictTo('admin', 'officer'), getCivicIssueProgress);

// Phase 6: Prerequisite DAG Recommendations & Resolution Verification
router.post('/:id/recommendations/generate', protect, restrictTo('admin', 'officer'), generatePrerequisiteRecommendations);
router.get('/:id/recommendations', protect, restrictTo('admin', 'officer'), getPendingRecommendations);
router.post('/:id/verify-resolution', protect, restrictTo('admin', 'officer'), verifyCivicIssueResolution);

module.exports = router;
