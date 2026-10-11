// src/controllers/authController.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const supabase = require('../config/supabase');
const { OAuth2Client } = require('google-auth-library');

const DEFAULT_GOOGLE_CLIENT_ID = '195200639587-v8d2ram47i72psddft6blqrdeieteuu1.apps.googleusercontent.com';
const configuredClientId = (process.env.GOOGLE_CLIENT_ID || '').replace(/[\s"]/g, '');
const clientId = configuredClientId || DEFAULT_GOOGLE_CLIENT_ID;
const googleClient = new OAuth2Client(clientId);


function signToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function mapUser(user) {
  if (!user) return user;
  const mapped = { ...user };
  delete mapped.password_hash;
  delete mapped.civic_points;
  delete mapped.badges;
  return mapped;
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
    res.status(201).json({ token, user: mapUser(user) });
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
    res.json({ token, user: mapUser(user) });
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
      const allowedAudiences = [configuredClientId, DEFAULT_GOOGLE_CLIENT_ID].filter(Boolean);
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: allowedAudiences.length === 1 ? allowedAudiences[0] : allowedAudiences,
      });
      payload = ticket.getPayload();
    } catch (err) {
      console.error('Google token verification failed:', err.message);
      return res.status(401).json({ error: 'Invalid or expired Google token' });
    }

    const { email, name, email_verified, sub: google_id, picture } = payload;

    if (!email_verified) {
      return res.status(403).json({ error: 'Google account email must be verified' });
    }

    // Check if user already exists
    console.log('[Google Auth] Looking up existing user by email');
    const { data: existingUser, error: findError } = await supabase
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase())
      .single();

    if (findError && findError.code !== 'PGRST116') {
      console.error('[Google Auth] Database error during user lookup:', findError);
      throw new Error('Database error during user lookup');
    }

    if (existingUser) {
      console.log('[Google Auth] Existing user found. Checking for Google linking');
      // User exists (either via previous Google login or Email/Password login)
      // Attempt to link Google identity if not already linked
      if (!existingUser.google_id) {
        console.log('[Google Auth] Linking Google identity to existing account');
        try {
          const { error: updateError } = await supabase
            .from('users')
            .update({ 
              google_id: google_id,
              auth_provider: 'google',
              email_verified: !!email_verified,
              avatar_url: picture || null
            })
            .eq('id', existingUser.id);
          
          if (!updateError) {
            existingUser.google_id = google_id;
            existingUser.auth_provider = 'google';
            existingUser.email_verified = !!email_verified;
            existingUser.avatar_url = picture || null;
          } else {
            console.warn('[Google Auth] Non-fatal: column update failed or columns not present:', updateError.message);
          }
        } catch (linkErr) {
          console.warn('[Google Auth] Non-fatal link error:', linkErr.message);
        }
      }
      
      console.log('[Google Auth] Generating token for existing user');
      const token = signToken(existingUser.id);
      return res.json({ token, user: mapUser(existingUser) });
    }

    console.log('[Google Auth] User does not exist, creating new citizen account');
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 12);

    // Attempt insert with full Google metadata; gracefully fall back to minimal citizen schema if custom columns absent
    let newUser = null;
    const { data: createdWithGoogle, error: createError } = await supabase.from('users').insert([{
      name: name || 'Citizen',
      email: email.toLowerCase(),
      password_hash: passwordHash,
      role: 'citizen', // NEVER assign admin automatically
      phone: '',
      google_id: google_id,
      auth_provider: 'google',
      email_verified: !!email_verified,
      avatar_url: picture || null
    }]).select().single();

    if (createError) {
      console.warn('[Google Auth] Insert with Google columns failed, attempting core citizen insert:', createError.message);
      const { data: createdBasic, error: basicError } = await supabase.from('users').insert([{
        name: name || 'Citizen',
        email: email.toLowerCase(),
        password_hash: passwordHash,
        role: 'citizen',
        phone: ''
      }]).select().single();

      if (basicError) {
        console.error('[Google Auth] Failed to create new user:', basicError);
        throw new Error('Database error during user creation');
      }
      newUser = createdBasic;
    } else {
      newUser = createdWithGoogle;
    }

    console.log('[Google Auth] New user created, generating token');
    const token = signToken(newUser.id);
    res.status(201).json({ token, user: mapUser(newUser) });
  } catch (err) {
    console.error('Google login error:', err.message || err);
    res.status(500).json({ error: 'Unable to complete Google login due to a server error. Please try again.' });
  }
};

// GET /api/auth/me  (protected)
exports.getMe = async (req, res) => {
  res.json({ user: mapUser(req.user) });
};
