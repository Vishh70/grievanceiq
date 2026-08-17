// src/routes/dashboardRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, restrictTo } = require('../middleware/auth');
const { getSummary, getSimilarGroups } = require('../controllers/dashboardController');

router.use(protect, restrictTo('admin'));

router.get('/summary',        getSummary);
router.get('/similar-groups', getSimilarGroups);

module.exports = router;
