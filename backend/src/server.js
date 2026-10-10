// src/server.js
require('dotenv').config();

// Fix: Set ML_SERVICE_URL before any modules are required so mlService.js doesn't disable itself
if (!process.env.ML_SERVICE_URL) {
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:5001';
}

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
      if (!process.env.ADMIN_PASSWORD) {
        console.warn('⚠️ No ADMIN_PASSWORD provided. Default admin not created. Set ADMIN_PASSWORD env var to seed admin.');
      } else {
        const bcrypt = require('bcryptjs');
        const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 12);
        
        const { error: insertErr } = await supabase.from('users').insert([{
          name: 'System Admin',
          email: adminEmail,
          password_hash: passwordHash,
          role: 'admin'
        }]);
        
        if (insertErr) throw insertErr;
        console.log('✅ Default Admin created in Supabase: system@grievanceiq.com');
      }
    }
  } catch (err) {
    console.error('Failed to seed admin:', err.message);
  }
})();

const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
  console.log(`🚀 GrievanceIQ Backend running on port ${PORT} (Connected to Supabase)`);

  // ── Spawn Embedded ML Service ──────────────────────────────────────────────
  const { spawn } = require('child_process');
  const path = require('path');
  const os = require('os');
  
  // Set ML_SERVICE_URL to localhost since we run it embedded now
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:5001';
  
  const isWin = os.platform() === 'win32';
  const pythonBin = isWin ? path.join(__dirname, '..', '.venv', 'Scripts', 'python') : path.join(__dirname, '..', '.venv', 'bin', 'python');
  
  const mlProcess = spawn(pythonBin, [path.join(__dirname, '..', 'ml', 'inference', 'grievanceiq_inference.py')]);
  
  mlProcess.stdout.on('data', (data) => console.log(`[ML Embedded]: ${data}`));
  mlProcess.stderr.on('data', (data) => console.error(`[ML Embedded ERR]: ${data}`));
  
  mlProcess.on('close', (code) => {
    console.warn(`⚠️ Embedded ML Service exited with code ${code}`);
  });
  console.log(`🧠 Embedded ML Service spawned on ${process.env.ML_SERVICE_URL}`);


  // Initialize Worker
  require('./workers/complaintWorker');
  console.log(`👷 Complaint Background Worker Started`);

  // Recovery Mechanism: Find PENDING or stale PROCESSING complaints and requeue
  try {
    const { complaintQueue } = require('./config/queue');
    const { data: staleComplaints, error } = await supabase
      .from('complaints')
      .select('id, description, image_base64') // image processing might be lost on restart if not in db, but we have text
      .in('processing_status', ['PROCESSING', 'PENDING']);
      
    if (error) throw error;

    if (staleComplaints && staleComplaints.length > 0) {
      console.log(`🔄 Recovering ${staleComplaints.length} stale complaints...`);
      const queueConfig = require('./config/queue');
      const { processComplaintLogic } = require('./workers/complaintWorker');
      
      for (const complaint of staleComplaints) {
        if (queueConfig.connection && queueConfig.connection.status === 'ready') {
          // Enqueue them safely again
          await complaintQueue.add('process-complaint', {
            complaintId: complaint.id,
            text: complaint.description,
            imageBase64: complaint.image_base64 || '', // Usually images are deleted after upload, but might be base64 in db
            mimeType: '' // Best effort recovery
          }, {
            jobId: `recovery-${complaint.id}`, // Idempotent queuing
            attempts: 3,
            backoff: { type: 'exponential', delay: 5000 }
          });
        } else {
          // Free Tier / Redis Disconnected Fallback
          console.warn(`⚠️ Redis not ready. Recovering complaint ${complaint.id} in-memory.`);
          setTimeout(() => {
            processComplaintLogic({
              complaintId: complaint.id,
              text: complaint.description,
              imageBase64: complaint.image_base64 || '',
              mimeType: ''
            }).catch(err => console.error('In-memory recovery failed:', err));
          }, 100);
        }
      }
    }
  } catch (recErr) {
    console.error('Failed to run recovery mechanism:', recErr.message);
  }
});
