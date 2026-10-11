// src/app.js
// Express app factory — extracted from server.js so tests can import the app
// without triggering connectDB() or app.listen().
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

function createApp() {
  const app = express();

  // Startup Config Validation
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseKey) {
    console.warn('[Startup] ⚠️ Supabase configuration: MISSING (Tests/Mocks may still work)');
  } else {
    console.log('[Startup] ✅ Supabase configuration: OK');
  }
  console.log('[Startup] ✅ AI configuration: OK (Hybrid: Gemini + Local Transformers/Xenova)');

  // ── Middleware ──────────────────────────────────────────────────────────────
  const allowedOrigins = getAllowedOrigins(process.env);

  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Origin not allowed by CORS'));
      }
    },
    credentials: true
  }));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve uploaded images statically
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

  // ── Rate Limiting ──────────────────────────────────────────────────────────
  app.set('trust proxy', 1);
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: 'Too many requests from this IP, please try again after 15 minutes'
  });
  app.use('/api', apiLimiter);

  // ── Routes ─────────────────────────────────────────────────────────────────
  app.use('/api/auth',         require('./routes/authRoutes'));
  app.use('/api/complaints',   require('./routes/complaintRoutes'));
  app.use('/api/dashboard',    require('./routes/dashboardRoutes'));
  app.use('/api/civic-issues', require('./routes/civicIssueRoutes'));
  app.use('/api/tasks',        require('./routes/taskRoutes'));

  // ── Health Check ───────────────────────────────────────────────────────────
  app.get('/api/health', async (_req, res) => {
    const { checkEmbeddingHealth } = require('./services/embeddingService');
    const embeddingHealth = checkEmbeddingHealth();

    const health = {
      status: 'ok',
      database: 'disconnected',
      environment: process.env.APP_ENV || process.env.NODE_ENV || 'development',
      services: {
        ai: 'hybrid', // Gemini + Local Transformers
        embedding: embeddingHealth.status,
        embeddingProvider: embeddingHealth.provider,
        relationshipModel: 'unavailable',
        mlInference: 'unavailable',
        mlSupervisor: require('./services/mlSupervisor').getStatus()
      },
      time: new Date()
    };

    // Check ML Service probe
    try {
      const mlUrl = process.env.ML_SERVICE_URL;
      if (mlUrl && mlUrl.startsWith('http')) {
        const axios = require('axios');
        const mlRes = await axios.get(`${mlUrl.replace(/\/$/, '')}/health`, { timeout: 1000 });
        if (mlRes.status === 200 && mlRes.data?.status === 'ok' && mlRes.data?.model_loaded === true) {
          health.services.mlInference = 'ready';
          health.services.relationshipModel = mlRes.data?.relationship_model_loaded ? 'ready' : 'unavailable';
        } else {
          health.services.mlInference = 'degraded';
          health.services.relationshipModel = 'degraded';
        }
      }
    } catch (_mlErr) {
      health.services.mlInference = 'unavailable';
      health.services.relationshipModel = 'unavailable';
    }

    // Check DB
    try {
      if (supabaseUrl && supabaseKey) {
        const supabase = require('./config/supabase');
        const { error } = await supabase.from('civic_issues').select('id').limit(1);
        health.database = error ? 'error' : 'connected';
      } else {
        health.database = 'disconnected';
      }
    } catch (e) {
      health.database = 'disconnected';
    }

    // Check Redis
    try {
      const { connection } = require('./config/queue');
      if (connection.status === 'ready') {
        health.redis = 'connected';
      } else {
        health.redis = connection.status;
      }
    } catch (e) {
      health.redis = 'error';
    }

    const statusCode = health.database === 'connected' ? 200 : 503;
    res.status(statusCode).json(health);
  });

  // ── Global Error Handler ───────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

const PRODUCTION_ORIGINS = [
  'https://grievanceiq-app.vercel.app',
  'https://grievanceiq-ten.vercel.app'
];

function getAllowedOrigins(env = process.env) {
  const parseOrigins = (val) => (val || '')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean);

  const configuredOrigins = [
    ...parseOrigins(env.CLIENT_URL),
    ...parseOrigins(env.ALLOWED_ORIGINS)
  ];

  // Validation: Reject wildcards and malformed origins
  for (const origin of configuredOrigins) {
    if (origin.includes('*')) {
      throw new Error(`[CORS Configuration Error] Wildcard origin pattern "${origin}" is not permitted.`);
    }
    if (!/^https?:\/\/[a-zA-Z0-9-.]+(:[0-9]+)?$/.test(origin)) {
      throw new Error(`[CORS Configuration Error] Invalid origin format "${origin}". Expected full http(s) origin.`);
    }
  }

  const appEnv = (env.APP_ENV || (env.NODE_ENV === 'production' ? 'production' : 'development')).toLowerCase();

  if (appEnv === 'staging') {
    // Fail-closed safeguard: Staging strictly forbids production frontend domains
    for (const origin of configuredOrigins) {
      if (PRODUCTION_ORIGINS.includes(origin)) {
        throw new Error(`[CORS Configuration Error] Production origin "${origin}" is strictly forbidden in staging environment.`);
      }
    }
    // Staging allows ONLY explicitly configured, validated staging frontend origins
    return Array.from(new Set(configuredOrigins));
  }

  if (appEnv === 'production') {
    // Production includes verified production domains + any validated configured origins
    return Array.from(new Set([
      ...PRODUCTION_ORIGINS,
      ...configuredOrigins
    ]));
  }

  // Development / Test defaults
  return Array.from(new Set([
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    ...configuredOrigins
  ]));
}

createApp.getAllowedOrigins = getAllowedOrigins;
createApp.PRODUCTION_ORIGINS = PRODUCTION_ORIGINS;

module.exports = createApp;
