// src/server.js
require('dotenv').config();
const connectDB = require('./config/db');
const createApp = require('./app');

const app = createApp();

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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 GrievanceIQ Backend running on port ${PORT}`);
});
