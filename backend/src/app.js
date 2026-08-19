// src/app.js
// Express app factory — extracted from server.js so tests can import the app
// without triggering connectDB() or app.listen().
const express = require('express');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

function createApp() {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────
  const allowedOrigins = [
    'https://grievanceiq-app.vercel.app',
    'https://grievanceiq-ten.vercel.app',
    process.env.CLIENT_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173'
  ].filter(Boolean);

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
  app.use('/api/auth',       require('./routes/authRoutes'));
  app.use('/api/users',      require('./routes/userRoutes'));
  app.use('/api/complaints', require('./routes/complaintRoutes'));
  app.use('/api/dashboard',  require('./routes/dashboardRoutes'));

  // ── Health Check ───────────────────────────────────────────────────────────
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'GrievanceIQ Backend', time: new Date() });
  });

  // ── Global Error Handler ───────────────────────────────────────────────────
  app.use((err, _req, res, _next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  return app;
}

module.exports = createApp;
