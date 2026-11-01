// src/server.js
require('dotenv').config();

// Fix: Set ML_SERVICE_URL before any modules are required so mlService.js doesn't disable itself
if (!process.env.ML_SERVICE_URL) {
  process.env.ML_SERVICE_URL = 'http://127.0.0.1:5001';
}

// SECURITY: In production, JWT_SECRET must be explicitly provided
if (!process.env.JWT_SECRET && process.env.NODE_ENV === 'production') {
  console.error('❌ CRITICAL: JWT_SECRET is not configured in production. Exiting.');
  process.exit(1);
}

const createApp = require('./app');
const supabase = require('./config/supabase');

const app = createApp();

// ── Database ──────────────────────────────────────────────────────────────────
// SECURITY: Non-destructive admin verification on startup.
// - Creates the default admin account ONLY if no admin exists at all.
// - Never overwrites or resets an existing admin password.
(async () => {
  try {
    const adminEmail = 'system@grievanceiq.com';

    const checkAdminQuery = supabase.from('users').select('id').eq('email', adminEmail);
    const { data: existingAdmin, error: fetchErr } = typeof checkAdminQuery.maybeSingle === 'function'
      ? await checkAdminQuery.maybeSingle()
      : await checkAdminQuery.single();
    
    if (fetchErr && fetchErr.code !== 'PGRST116') { // PGRST116 is 'not found'
      console.error('Failed to check admin:', fetchErr);
      return;
    }

    if (!existingAdmin) {
      // Only seed a new admin if ADMIN_PASSWORD is explicitly configured
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        console.warn('⚠️ No admin account exists and ADMIN_PASSWORD is not configured. Skipping admin seed.');
        return;
      }
      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      const { error: insertErr } = await supabase.from('users').insert([{
        name: 'System Admin',
        email: adminEmail,
        password_hash: passwordHash,
        role: 'admin'
      }]);
      
      if (insertErr) throw insertErr;
      console.log('✅ Default Admin created: system@grievanceiq.com');
    } else {
      console.log('✅ Admin account verified: system@grievanceiq.com');
    }
  } catch (err) {
    console.error('Failed to verify admin:', err.message);
  }
})();

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, async () => {
  console.log(`🚀 GrievanceIQ Backend running on port ${PORT} (Connected to Supabase)`);

  // ── Spawn / Supervise Embedded ML Service ──────────────────────────────────
  const { startMLSupervisor } = require('./services/mlSupervisor');
  const mlSupervisorInstance = startMLSupervisor();

  // Initialize Worker
  const { worker } = require('./workers/complaintWorker');
  console.log(`👷 Complaint Background Worker Started`);

  // ── Coordinated Graceful Shutdown ──────────────────────────────────────────
  const { registerSignalHandlers } = require('./services/shutdownManager');
  const queueConfig = require('./config/queue');
  registerSignalHandlers({
    server,
    worker,
    supervisor: mlSupervisorInstance,
    queueConfig,
    timeoutMs: 10000
  });

  // ── Recovery Mechanism ───────────────────────────────────────────────────────
  // Recover pending/stale complaints with bounded concurrency & service readiness.
  // Uses atomic lease acquisition to prevent duplicate processing.
  (async () => {
    try {
      const { isMLServiceAvailable } = require('./services/mlService');
      // Grace period: allow ML supervisor up to 4 seconds to report ready
      for (let i = 0; i < 4; i++) {
        const mlReady = await isMLServiceAvailable();
        if (mlReady) break;
        await new Promise(r => setTimeout(r, 1000));
      }

      const { complaintQueue } = require('./config/queue');
      let staleComplaints = [];
      try {
        // Select complaints that are stale: PENDING, FAILED, or PROCESSING with expired leases
        const { data, error } = await supabase
          .from('complaints')
          .select('id, description, image_base64')
          .or('processing_status.in.(PENDING,FAILED),and(processing_status.eq.PROCESSING,lock_expires_at.lt.' + new Date().toISOString() + ')')
          .order('created_at', { ascending: false })
          .limit(50);
        if (!error && data) staleComplaints = data;
      } catch (queryErr) {
        try {
          // Fallback for schemas without lock_expires_at column yet
          const { data } = await supabase
            .from('complaints')
            .select('id, description, image_base64')
            .in('processing_status', ['PENDING', 'FAILED'])
            .limit(20);
          if (data) staleComplaints = data;
        } catch { /* ignore fallback error */ }
      }

      if (staleComplaints && staleComplaints.length > 0) {
        console.log(`🔄 Found ${staleComplaints.length} pending/stale complaints. Starting bounded recovery...`);

        for (const complaint of staleComplaints) {
          if (queueConfig.connection && queueConfig.connection.status === 'ready') {
            try {
              await complaintQueue.add('process-complaint', {
                complaintId: complaint.id,
                text: complaint.description,
                imageBase64: complaint.image_base64 || '',
                mimeType: ''
              }, {
                jobId: `recovery-${complaint.id}`,
                attempts: 3,
                backoff: { type: 'exponential', delay: 5000 }
              });
            } catch (qErr) {
              console.warn(`[Queue] Failed to enqueue recovery for ${complaint.id}:`, qErr.message);
            }
          } else {
            // Free Tier / Redis Disconnected Fallback: Controlled sequential in-memory recovery
            // The worker's processComplaintLogic will use atomic lease acquisition internally
            console.log(`[Recovery] Processing complaint ${complaint.id} in-memory...`);
            const { processComplaintLogic } = require('./workers/complaintWorker');
            try {
              await processComplaintLogic({
                complaintId: complaint.id,
                text: complaint.description,
                imageBase64: complaint.image_base64 || '',
                mimeType: ''
              });
            } catch (procErr) {
              console.error(`[Recovery] In-memory recovery failed for ${complaint.id}:`, procErr.message);
            }
            // Bounded pause between recovered complaints to protect memory/CPU
            await new Promise(r => setTimeout(r, 250));
          }
        }
        console.log(`✅ Completed recovery batch of ${staleComplaints.length} complaints.`);
      }
    } catch (recErr) {
      console.error('Failed to run recovery mechanism:', recErr.message);
    }
  })();
});
