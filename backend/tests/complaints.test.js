// tests/complaints.test.js
require('./setup');
const request = require('supertest');
const createApp = require('../src/app');
const Complaint = require('../src/models/Complaint');

// Mock the AI service at the module boundary — never hits real Gemini in tests
jest.mock('../src/services/aiService');
const { analyzeComplaint } = require('../src/services/aiService');

const app = createApp();

// Helper: register a user and return their JWT
async function registerUser(overrides = {}) {
  const data = {
    name: overrides.name || 'Test Citizen',
    email: overrides.email || `citizen-${Date.now()}@test.com`,
    password: overrides.password || 'password123',
    ...overrides,
  };
  const res = await request(app).post('/api/auth/register').send(data);
  return { token: res.body.token, user: res.body.user };
}

// Helper: register an admin
async function registerAdmin() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Admin User', email: `admin-${Date.now()}@test.com`, password: 'adminpass123', role: 'admin' });
  return { token: res.body.token, user: res.body.user };
}

describe('Complaint Routes', () => {
  // ── 2a: AI mock scenarios ─────────────────────────────────────────────────
  describe('AI categorization via mock', () => {
    it('uses AI category/priority when Gemini succeeds', async () => {
      analyzeComplaint.mockResolvedValueOnce({
        category: 'Water Supply',
        priority: 'High',
        recommendedDepartment: 'Water Works Dept',
        keywords: ['burst', 'pipe', 'flooding'],
      });

      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'There is a major burst pipe flooding the entire street near the school' });

      expect(res.status).toBe(201);

      // The 201 response returns immediately before async AI processing completes.
      // Wait briefly, then check the DB directly for the AI-processed values.
      await new Promise(resolve => setTimeout(resolve, 1000));

      const complaint = await Complaint.findById(res.body.complaint._id);
      expect(complaint.category).toBe('Water Supply');
      expect(complaint.priority).toBe('High');
      expect(complaint.recommendedDepartment).toBe('Water Works Dept');
      expect(complaint.aiProcessed).toBe(true);
    });

    it('falls back to Other/Medium when Gemini throws an error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      analyzeComplaint.mockRejectedValueOnce(new Error('API rate limited'));

      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Streetlight broken near my house making it unsafe to walk at night' });

      // Submission itself must not fail for the citizen
      expect(res.status).toBe(201);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // The async IIFE catches the error and logs it
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Gemini AI processing failed'),
        expect.any(String)
      );
      consoleSpy.mockRestore();
    });

    it('falls back with warning log when GEMINI_API_KEY is unset', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const originalKey = process.env.GEMINI_API_KEY;
      delete process.env.GEMINI_API_KEY;

      // Re-require the real module for this test to hit the env check
      jest.resetModules();
      const realAiService = jest.requireActual('../src/services/aiService');
      const result = await realAiService.analyzeComplaint('test complaint');

      expect(result.category).toBe('Other');
      expect(result.priority).toBe('Medium');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('GEMINI_API_KEY is not set')
      );

      // Restore
      if (originalKey) process.env.GEMINI_API_KEY = originalKey;
      consoleSpy.mockRestore();
    });
  });

  // ── 2b: Core submission behavior ──────────────────────────────────────────
  describe('Core submission', () => {
    beforeEach(() => {
      analyzeComplaint.mockResolvedValue({
        category: 'Roads',
        priority: 'Medium',
        recommendedDepartment: 'PWD',
        keywords: ['pothole'],
      });
    });

    it('citizen can submit a complaint with just text (no image, no location)', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'There is a large pothole on MG Road near the bus stop causing accidents' });

      expect(res.status).toBe(201);
      expect(res.body.complaint).toBeDefined();
      expect(res.body.complaint.text).toMatch(/pothole/i);
      expect(res.body.complaint.status).toBe('Submitted');
    });

    it('rejects unauthenticated submission with 401', async () => {
      const res = await request(app)
        .post('/api/complaints')
        .send({ text: 'Some complaint about broken road near my house, very unsafe' });

      expect(res.status).toBe(401);
    });

    it('rejects submission with empty/missing text (400)', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: '' });

      expect(res.status).toBe(400);
    });

    it('saves location lat/lng correctly when provided', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Open manhole cover on the main road near residential area creating danger', lat: '18.5204', lng: '73.8567' });

      expect(res.status).toBe(201);
      expect(res.body.complaint.location.lat).toBe(18.5204);
      expect(res.body.complaint.location.lng).toBe(73.8567);
    });

    it('does not crash when lat/lng are omitted', async () => {
      const { token } = await registerUser();
      const res = await request(app)
        .post('/api/complaints')
        .set('Authorization', `Bearer ${token}`)
        .send({ text: 'Overflowing garbage bin near school, health hazard for children walking by' });

      expect(res.status).toBe(201);
      expect(res.body.complaint.location.lat).toBeNull();
      expect(res.body.complaint.location.lng).toBeNull();
    });
  });

  // ── 2c: Listing / filtering ───────────────────────────────────────────────
  describe('Listing and filtering', () => {
    beforeEach(() => {
      analyzeComplaint.mockResolvedValue({
        category: 'Other',
        priority: 'Medium',
        recommendedDepartment: 'General Admin',
        keywords: [],
      });
    });

    it('citizen only sees their own complaints, not others', async () => {
      const { token: tokenA } = await registerUser({ email: 'a@test.com' });
      const { token: tokenB } = await registerUser({ email: 'b@test.com' });

      await request(app).post('/api/complaints').set('Authorization', `Bearer ${tokenA}`)
        .send({ text: 'Citizen A complaint about broken road, very dangerous for vehicles' });
      await request(app).post('/api/complaints').set('Authorization', `Bearer ${tokenB}`)
        .send({ text: 'Citizen B complaint about water supply cut off for three days now' });

      const resA = await request(app).get('/api/complaints').set('Authorization', `Bearer ${tokenA}`);
      expect(resA.body.complaints).toHaveLength(1);
      expect(resA.body.complaints[0].text).toMatch(/Citizen A/);
    });

    it('admin sees all complaints across citizens', async () => {
      const { token: tokenA } = await registerUser({ email: 'c@test.com' });
      const { token: tokenB } = await registerUser({ email: 'd@test.com' });
      const { token: adminToken } = await registerAdmin();

      await request(app).post('/api/complaints').set('Authorization', `Bearer ${tokenA}`)
        .send({ text: 'Admin test complaint one about broken streetlight near park entrance' });
      await request(app).post('/api/complaints').set('Authorization', `Bearer ${tokenB}`)
        .send({ text: 'Admin test complaint two about overflowing drain causing flooding' });

      const res = await request(app).get('/api/complaints').set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.complaints.length).toBeGreaterThanOrEqual(2);
    });

    it('filtering by priority returns only matching results', async () => {
      const { token: adminToken } = await registerAdmin();
      const { token: citizenToken } = await registerUser({ email: 'filter@test.com' });

      // Submit 3 complaints, then manually set their priorities
      const r1 = await request(app).post('/api/complaints').set('Authorization', `Bearer ${citizenToken}`)
        .send({ text: 'High priority complaint about dangerous exposed electrical wires near school' });
      const r2 = await request(app).post('/api/complaints').set('Authorization', `Bearer ${citizenToken}`)
        .send({ text: 'Low priority complaint about faded road markings in residential area' });
      const r3 = await request(app).post('/api/complaints').set('Authorization', `Bearer ${citizenToken}`)
        .send({ text: 'High priority complaint about collapsed bridge railing near river bank' });

      // Directly set priorities in DB for deterministic test
      await Complaint.findByIdAndUpdate(r1.body.complaint._id, { priority: 'High' });
      await Complaint.findByIdAndUpdate(r2.body.complaint._id, { priority: 'Low' });
      await Complaint.findByIdAndUpdate(r3.body.complaint._id, { priority: 'High' });

      const res = await request(app)
        .get('/api/complaints?priority=High')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body.complaints).toHaveLength(2);
      res.body.complaints.forEach(c => {
        expect(c.priority).toBe('High');
      });
    });
  });
});
