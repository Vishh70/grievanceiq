// src/server.js
require('dotenv').config();
const createApp = require('./app');
const supabase = require('./config/supabase');

const app = createApp();

// ── Database ──────────────────────────────────────────────────────────────────
// Automatically seed default admin user into Supabase if not exists
(async () => {
  try {
    const adminEmail = 'system@grievanceiq.com';
    const { data: existingAdmin, error: fetchErr } = await supabase.from('users').select('id').eq('email', adminEmail).single();
    
    if (fetchErr && fetchErr.code !== 'PGRST116') { // PGRST116 is 'not found'
      console.error('Failed to check admin:', fetchErr);
      return;
    }

    if (!existingAdmin) {
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 12);
      
      const { error: insertErr } = await supabase.from('users').insert([{
        name: 'System Admin',
        email: adminEmail,
        password_hash: passwordHash,
        role: 'admin'
      }]);
      
      if (insertErr) throw insertErr;
      console.log('✅ Default Admin created in Supabase: system@grievanceiq.com / admin123');
    }
  } catch (err) {
    console.error('Failed to seed admin:', err.message);
  }
})();

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 GrievanceIQ Backend running on port ${PORT} (Connected to Supabase)`);
});
