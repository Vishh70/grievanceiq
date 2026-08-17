// src/routes/userRoutes.js
const express = require('express');
const router  = express.Router();
const { getLeaderboard } = require('../controllers/userController');

// Public route for leaderboard (or protected, but let's make it public for engagement)
router.get('/leaderboard', getLeaderboard);

module.exports = router;
