// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const supabase = require('../config/supabase');

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const { data: existing } = await supabase.from('users').select('*').eq('email', email).single();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const assignedRole = role === 'admin' ? 'admin' : 'citizen';
    const passwordHash = await bcrypt.hash(password, 12);

    const { data: user, error } = await supabase.from('users').insert([{
      name,
      email: email.toLowerCase(),
      password_hash: passwordHash,
      phone: phone || '',
      role: assignedRole,
    }]).select().single();

    if (error) throw error;

    const token = signToken(user.id);
    delete user.password_hash;
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
};

// POST /api/auth/login
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password are required' });

    const { data: user, error } = await supabase.from('users').select('*').eq('email', email.toLowerCase()).single();
    
    if (error || !user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = signToken(user.id);
    delete user.password_hash;
    res.json({ token, user });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: err.message });
  }
};

// GET /api/auth/me  (protected)
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};
