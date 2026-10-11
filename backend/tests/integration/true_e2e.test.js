const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const supabase = require('../../src/config/supabase');
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
const hasValidCredentials = supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder');

let worker = null;
let connection = null;
let complaintQueue = null;
let app = null;

if (hasValidCredentials) {
  process.env.MOCK_REDIS = 'false';
  jest.unmock('bullmq');
  jest.unmock('ioredis');

  // Clear module cache to guarantee unmocked Redis and BullMQ instances are loaded
  try {
    delete require.cache[require.resolve('../../src/config/queue')];
    delete require.cache[require.resolve('../../src/workers/complaintWorker')];
    delete require.cache[require.resolve('../../src/controllers/complaintController')];
    delete require.cache[require.resolve('../../src/routes/complaintRoutes')];
    delete require.cache[require.resolve('../../src/app')];
  } catch (e) {}

  const workerModule = require('../../src/workers/complaintWorker');
  worker = workerModule.worker;
  const queueConfig = require('../../src/config/queue');
  connection = queueConfig.connection;
  complaintQueue = queueConfig.complaintQueue;
  const createApp = require('../../src/app');
  app = createApp();
} else {
  const createApp = require('../../src/app');
  app = createApp();
}

describe('True E2E Asynchronous Flow', () => {
  if (!hasValidCredentials) {
    it.skip('SKIPPED — integration environment not configured', () => {});
    
    // Clean up connections if instantiated
    afterAll(async () => {
      if (worker) {
        if (typeof worker.close === 'function') await worker.close(true);
        if (worker.workerConnection && typeof worker.workerConnection.disconnect === 'function') {
          worker.workerConnection.disconnect();
        }
      }
      if (complaintQueue) {
        if (typeof complaintQueue.close === 'function') await complaintQueue.close();
        if (complaintQueue.client && typeof complaintQueue.client.then === 'function') {
          await complaintQueue.client.then(c => c && typeof c.disconnect === 'function' && c.disconnect());
        }
      }
      if (connection && typeof connection.disconnect === 'function') connection.disconnect();
      delete process.env.MOCK_REDIS;
    });
    return;
  }

  let userToken;
  let userId;
  let testRunId;
  let createdComplaintIds = [];
  
  beforeAll(async () => {
    testRunId = crypto.randomUUID();
    userId = crypto.randomUUID();

    // Ensure Redis connection and worker are ready before running real queue jobs
    if (connection) {
      if (typeof connection.ping === 'function') {
        try {
          await connection.ping();
          console.log('[E2E Test] Real Redis connection verified: PONG');
        } catch (e) {
          console.warn('[E2E Test] Redis connection ping:', e.message);
        }
      }
      if (connection.status !== 'ready' && typeof connection.once === 'function') {
        await new Promise(r => {
          const t = setTimeout(r, 2000);
          connection.once('ready', () => { clearTimeout(t); r(); });
        });
      }
    }
    if (worker && typeof worker.waitUntilReady === 'function') {
      try {
        await worker.waitUntilReady();
        console.log('[E2E Test] BullMQ Worker verified ready');
      } catch (e) {}
    }
    if (complaintQueue && typeof complaintQueue.waitUntilReady === 'function') {
      try {
        await complaintQueue.waitUntilReady();
        console.log('[E2E Test] BullMQ Queue verified ready');
      } catch (e) {}
    }
    
    // Create a mock user in staging database
    await supabase.from('users').insert({
      id: userId,
      email: `e2e_test_${testRunId}@example.com`,
      name: 'E2E Test User',
      role: 'citizen'
    });
    
    userToken = jwt.sign({ id: userId, role: 'citizen' }, process.env.JWT_SECRET || 'test_jwt_secret', { expiresIn: '1h' });
  });
  
  afterAll(async () => {
    // Safely cleanup generated data
    for (const cid of createdComplaintIds) {
      const { data: comp } = await supabase.from('complaints').select('civic_issue_id').eq('id', cid).single();
      if (comp && comp.civic_issue_id) {
         // delete dependencies, tasks, workstreams safely
         const { data: tasks } = await supabase.from('tasks').select('id').eq('civic_issue_id', comp.civic_issue_id);
         if (tasks && tasks.length > 0) {
           const taskIds = tasks.map(t => t.id);
           await supabase.from('task_status_history').delete().in('task_id', taskIds);
           await supabase.from('task_dependencies').delete().in('task_id', taskIds);
           await supabase.from('task_dependencies').delete().in('depends_on_task_id', taskIds);
           await supabase.from('tasks').delete().in('id', taskIds);
         }
         await supabase.from('workstreams').delete().eq('civic_issue_id', comp.civic_issue_id);
         await supabase.from('routing_results').delete().eq('civic_issue_id', comp.civic_issue_id);
         await supabase.from('civic_issues').delete().eq('id', comp.civic_issue_id);
      }
      
      await supabase.from('complaint_relationships').delete().eq('complaint_a_id', cid);
      await supabase.from('complaint_relationships').delete().eq('complaint_b_id', cid);
    }
    
    if (createdComplaintIds.length > 0) {
      await supabase.from('complaints').delete().in('id', createdComplaintIds);
    }
    
    await supabase.from('users').delete().eq('id', userId);
    
    // Disconnect worker and redis to allow Jest to exit gracefully
    if (worker) {
      if (typeof worker.close === 'function') await worker.close(true);
      if (worker.workerConnection && typeof worker.workerConnection.disconnect === 'function') {
        worker.workerConnection.disconnect();
      }
    }
    if (complaintQueue) {
      if (typeof complaintQueue.close === 'function') await complaintQueue.close();
      if (complaintQueue.client && typeof complaintQueue.client.then === 'function') {
        await complaintQueue.client.then(c => c && typeof c.disconnect === 'function' && c.disconnect());
      }
    }
    if (connection && typeof connection.disconnect === 'function') connection.disconnect();
    
    delete process.env.MOCK_REDIS;
  });

  it('Submits complaints via real HTTP API, processes asynchronously via BullMQ, and generates Civic Issues', async () => {
    // 1. Submit through the real endpoint
    const res = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        text: `release-e2e-test: Large pothole causing traffic problems near a road intersection. The damaged road surface may be dangerous for vehicles. [Run: ${testRunId}]`,
        lat: 18.5204,
        lng: 73.8567,
        address: 'E2E Test Location 1'
      });
      
    expect(res.status).toBe(201);
    expect(res.body.complaint).toBeDefined();
    expect(res.body.complaint.processingStatus).toBe('PENDING'); // Prove initial status transition
    
    const complaintId = res.body.complaint._id;
    createdComplaintIds.push(complaintId);
    
    // 2. Poll for worker processing completion (Prove BullMQ execution)
    let status = 'PENDING';
    let attempts = 0;
    let finalComplaint = null;
    while (status !== 'PROCESSED' && status !== 'FAILED' && attempts < 25) {
      attempts++;
      await new Promise(r => setTimeout(r, 2000)); // Poll every 2 seconds
      const { data } = await supabase.from('complaints').select('*').eq('id', complaintId).single();
      if (data) {
        status = data.processing_status;
        finalComplaint = data;
        if (status === 'FAILED') {
          console.error('[E2E Test Complaint 1] Processing failed:', data.processing_error);
        }
      }
    }
    
    expect(status).toBe('PROCESSED');
    
    // 3. Prove ML Execution output & All 3 Persisted ML Metadata Fields
    expect(finalComplaint.ml_labels).toBeDefined();
    expect(finalComplaint.ml_labels.length).toBeGreaterThan(0);
    expect(finalComplaint.ml_probabilities).toBeDefined();
    expect(typeof finalComplaint.ml_probabilities).toBe('object');
    expect(finalComplaint.ml_departments).toBeDefined();
    expect(Array.isArray(finalComplaint.ml_departments)).toBe(true);
    expect(finalComplaint.civic_issue_id).not.toBeNull();
    expect(finalComplaint.priority).toBeDefined();
    
    // 4. Prove Civic Issue Creation & Graph processing
    const { data: civicIssue } = await supabase.from('civic_issues').select('*').eq('id', finalComplaint.civic_issue_id).single();
    expect(civicIssue).toBeDefined();
    expect(['Open', 'PENDING']).toContain(civicIssue.status);

    if (complaintQueue && typeof complaintQueue.getJobCounts === 'function') {
      try {
        const jobCounts = await complaintQueue.getJobCounts();
        console.log('[E2E Test] Verified Real BullMQ Job Counts:', jobCounts);
      } catch (e) {}
    }

    // 5. Prove HTTP API returns mapped ML metadata on retrieval
    const getRes = await request(app)
      .get(`/api/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.complaint.mlLabels).toBeDefined();
    expect(getRes.body.complaint.mlLabels.length).toBeGreaterThan(0);
    expect(getRes.body.complaint.mlProbabilities).toBeDefined();
    expect(getRes.body.complaint.mlDepartments).toBeDefined();
    
    // 6. Submit second complaint to trigger duplicate/relationship logic
    const res2 = await request(app)
      .post('/api/complaints')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        text: `release-e2e-test: Deep road pothole at the same nearby test location making traffic unsafe. [Run: ${testRunId}]`,
        lat: 18.5205,
        lng: 73.8568,
        address: 'E2E Test Location 2'
      });
      
    expect(res2.status).toBe(201);
    const complaint2Id = res2.body.complaint._id;
    createdComplaintIds.push(complaint2Id);
    
    let status2 = 'PENDING';
    attempts = 0;
    let finalComplaint2 = null;
    while (status2 !== 'PROCESSED' && status2 !== 'FAILED' && attempts < 25) {
      attempts++;
      await new Promise(r => setTimeout(r, 2000));
      const { data } = await supabase.from('complaints').select('*').eq('id', complaint2Id).single();
      if (data) {
        status2 = data.processing_status;
        finalComplaint2 = data;
        if (status2 === 'FAILED') {
          console.error('[E2E Test Complaint 2] Processing failed:', data.processing_error);
        }
      }
    }
    
    expect(status2).toBe('PROCESSED');
    expect(finalComplaint2.ml_labels).toBeDefined();
    expect(finalComplaint2.ml_probabilities).toBeDefined();
    expect(finalComplaint2.ml_departments).toBeDefined();
    
    // Check relationship or similar_group_id was evaluated by the relationship logic
    expect(finalComplaint2.similar_group_id).toBeDefined();
    
  }, 90000); // Allow up to 90 seconds for two sequential asynchronous E2E ML operations
});
