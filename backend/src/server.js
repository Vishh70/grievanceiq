// src/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./config/db');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'https://grievanceiq-app.vercel.app',
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173'
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    // or requests from our allowed list
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

// ── Rate Limiting ─────────────────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Render) to properly capture client IPs
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api', apiLimiter);

// ── Database ──────────────────────────────────────────────────────────────────
connectDB().then(async () => {
  // Auto-seed default admin user
  try {
    const User = require('./models/User');
    const adminEmail = 'system@grievanceiq.com';
    const existingAdmin = await User.findOne({ email: adminEmail });
    if (!existingAdmin) {
      await User.create({
        name: 'System Admin',
        email: adminEmail,
        passwordHash: process.env.ADMIN_PASSWORD || 'admin123', // the schema pre-save hook will hash this
        role: 'admin'
      });
      console.log('✅ Default Admin created: system@grievanceiq.com / admin123');
    }
  } catch (err) {
    console.error('Failed to seed admin:', err);
  }
});

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/auth',       require('./routes/authRoutes'));
app.use('/api/users',      require('./routes/userRoutes'));
app.use('/api/complaints', require('./routes/complaintRoutes'));
app.use('/api/dashboard',  require('./routes/dashboardRoutes'));

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'GrievanceIQ Backend', time: new Date() });
});

// ── Global Error Handler ──────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 GrievanceIQ Backend running on port ${PORT}`);
});
