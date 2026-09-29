// src/controllers/userController.js
const supabase = require('../config/supabase');

exports.getLeaderboard = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    // Assuming users table has civicPoints. If it fails, fallback to empty.
    const { data: users, error } = await supabase
      .from('users')
      .select('name')
      .eq('role', 'citizen')
      .limit(limit);

    if (error) throw error;
    res.json({ leaderboard: users || [] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
