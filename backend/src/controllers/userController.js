// src/controllers/userController.js
const supabase = require('../config/supabase');

exports.getLeaderboard = async (req, res) => {
  try {
    let limit = parseInt(req.query.limit) || 10;
    if (limit > 100) limit = 100;
    
    const { data: users, error } = await supabase
      .from('users')
      .select('id, name, civic_points, badges')
      .eq('role', 'citizen')
      .order('civic_points', { ascending: false, nullsFirst: false })
      .limit(limit);

    if (error) throw error;
    
    const mapped = (users || []).map(u => ({
      _id: u.id,
      name: u.name,
      civicPoints: u.civic_points || 0,
      badges: u.badges || []
    }));

    res.json({ leaderboard: mapped });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
