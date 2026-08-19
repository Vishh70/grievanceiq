// tests/adminStatus.test.js
require('./setup');
const request = require('supertest');
const createApp = require('../src/app');
const Complaint = require('../src/models/Complaint');

// Mock AI service — not relevant to status updates but needed for complaint creation
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

async function registerAdmin() {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ name: 'Admin', email: `admin-${Date.now()}@test.com`, password: 'adminpass123', role: 'admin' });
  return { token: res.body.token, user: res.body.user };
}

// Helper: create a complaint and return its ID
async function createComplaint(token, text) {
  const res = await request(app)
    .post('/api/complaints')
    .set('Authorization', `Bearer ${token}`)
    .send({ text: text || 'Default test complaint about broken infrastructure in the city area' });
  return res.body.complaint._id;
}

describe('Admin Status Update Routes', () => {
  beforeEach(() => {
    analyzeComplaint.mockResolvedValue({
      category: 'Roads',
      priority: 'Medium',
      recommendedDepartment: 'PWD',
      keywords: ['test'],
    });
  });

  it('admin can successfully update a complaint status and the change persists', async () => {
    const { token: citizenToken } = await registerUser();
    const { token: adminToken } = await registerAdmin();
    const complaintId = await createComplaint(citizenToken);

    // Update status: Submitted → In Progress
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Progress', note: 'Assigned to PWD team' });

    expect(res.status).toBe(200);
    expect(res.body.complaint.status).toBe('In Progress');

    // Verify persistence by fetching again
    const getRes = await request(app)
      .get(`/api/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.body.complaint.status).toBe('In Progress');
    // Verify status history was appended
    const history = getRes.body.complaint.statusHistory;
    expect(history.length).toBeGreaterThanOrEqual(2); // Submitted + In Progress
    expect(history[history.length - 1].status).toBe('In Progress');
    expect(history[history.length - 1].note).toBe('Assigned to PWD team');
  });

  it('citizen (non-admin) is rejected with 403 when trying to update status', async () => {
    const { token: citizenToken } = await registerUser();
    const { token: adminToken } = await registerAdmin();
    const complaintId = await createComplaint(citizenToken);

    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ status: 'Resolved' });

    expect(res.status).toBe(403);

    // Confirm the status is unchanged
    const getRes = await request(app)
      .get(`/api/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(getRes.body.complaint.status).toBe('Submitted');
  });

  it('unauthenticated request is rejected with 401', async () => {
    const { token } = await registerUser();
    const complaintId = await createComplaint(token);

    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .send({ status: 'Resolved' });

    expect(res.status).toBe(401);
  });

  it('updating a non-existent complaint returns 404, not 500', async () => {
    const { token: adminToken } = await registerAdmin();
    const fakeId = '000000000000000000000000'; // Valid ObjectId format, doesn't exist

    const res = await request(app)
      .patch(`/api/complaints/${fakeId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Resolved' });

    expect(res.status).toBe(404);
  });

  it('admin can transition through multiple statuses: Submitted → In Review → Resolved', async () => {
    const { token: citizenToken } = await registerUser();
    const { token: adminToken } = await registerAdmin();
    const complaintId = await createComplaint(citizenToken);

    // → In Review
    await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'In Review' });

    // → Resolved
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Resolved', note: 'Issue fixed by maintenance crew' });

    expect(res.status).toBe(200);
    expect(res.body.complaint.status).toBe('Resolved');

    // Verify full history
    const getRes = await request(app)
      .get(`/api/complaints/${complaintId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const statuses = getRes.body.complaint.statusHistory.map(h => h.status);
    expect(statuses).toEqual(['Submitted', 'In Review', 'Resolved']);
  });

  // OBSERVATION: There is currently NO transition validation in the codebase.
  // Status can be set to any valid enum value from any other value with no
  // transition rules. For example, going from Resolved backward to Submitted
  // is allowed. Flagging this in case it's unintentional — not adding
  // validation logic that wasn't requested.
  it('allows backward transitions (Resolved → Submitted) — no transition rules enforced', async () => {
    const { token: citizenToken } = await registerUser();
    const { token: adminToken } = await registerAdmin();
    const complaintId = await createComplaint(citizenToken);

    // First go to Resolved
    await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Resolved' });

    // Then go backward to Submitted
    const res = await request(app)
      .patch(`/api/complaints/${complaintId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'Submitted', note: 'Re-opening after citizen follow-up' });

    expect(res.status).toBe(200);
    expect(res.body.complaint.status).toBe('Submitted');
  });
});
