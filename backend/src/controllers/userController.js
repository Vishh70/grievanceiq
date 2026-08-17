// src/controllers/userController.js
const User = require('../models/User');

exports.getLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const users = await User.find({ role: 'citizen', civicPoints: { $gt: 0 } })
      .select('name civicPoints badges')
      .sort({ civicPoints: -1 })
      .limit(limit);

    res.json({ leaderboard: users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
