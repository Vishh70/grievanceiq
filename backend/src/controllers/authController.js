// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/register
exports.register = async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const { data: existing } = await supabase.from('users').select('*').eq('email', email.toLowerCase()).single();
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    // CRITICAL SECURITY FIX: Never accept role from public registration. Always 'citizen'.
    const assignedRole = 'citizen';
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

    if (!user.password_hash) {
      return res.status(401).json({ error: 'Invalid email or password' }); // Account might be Google-only
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

// POST /api/auth/google
exports.googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential token is required' });
    }

    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired Google token' });
    }

    const { email, name, email_verified, sub: google_id } = payload;

    if (!email_verified) {
      return res.status(403).json({ error: 'Google account email must be verified' });
    }

    // Check if user already exists
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (existingUser) {
      // User exists (either via previous Google login or Email/Password login)
      // We safely link by simply logging them in. No duplicate account is created.
      const token = signToken(existingUser.id);
      delete existingUser.password_hash;
      return res.json({ token, user: existingUser });
    }

    // User does not exist, create a new citizen account
    // Generate a random, unusable password hash for safety
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    const { data: newUser, error: createError } = await supabase.from('users').insert([{
      name: name || 'Citizen',
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role: 'citizen', // NEVER assign admin automatically
      phone: ''
    }]).select().single();

    if (createError) {
      throw createError;
    }

    const token = signToken(newUser.id);
    delete newUser.password_hash;
    res.status(201).json({ token, user: newUser });
  } catch (err) {
    console.error('Google login error:', err);
    res.status(500).json({ error: 'Unable to complete Google login. Please try again.' });
  }
};

// GET /api/auth/me  (protected)
exports.getMe = async (req, res) => {
  res.json({ user: req.user });
};
