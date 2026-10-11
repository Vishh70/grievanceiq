const jwt = require('jsonwebtoken');
const supabase = require('../config/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'grievanceiq_super_secret_jwt_fallback_key_2026_production';

/**
 * Protect route — requires a valid Bearer JWT
 */
exports.protect = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Not authorised — no token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const { data: user, error } = await supabase.from('users').select('*').eq('id', decoded.id).single();
    if (error || !user) return res.status(401).json({ error: 'User not found' });
    
    delete user.password_hash;
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalid or expired' });
  }
};

/**
 * Optional authentication — attaches req.user if a valid token is present,
 * but allows the request to proceed if unauthenticated.
 */
exports.optionalAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const { data: user } = await supabase.from('users').select('*').eq('id', decoded.id).single();
    if (user) {
      delete user.password_hash;
      req.user = user;
    }
  } catch (err) {
    // Ignore invalid token for optional auth
  }
  next();
};

/**
 * Restrict route to specific roles (e.g. 'admin')
 */
exports.restrictTo = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Access denied — insufficient role' });
  }
  next();
};

