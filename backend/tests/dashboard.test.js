// tests/dashboard.test.js
require('./setup');
const request = require('supertest');
const createApp = require('../src/app');
const Complaint = require('../src/models/Complaint');
const mongoose = require('mongoose');

// Mock AI service
jest.mock('../src/services/aiService');

const app = createApp();

describe('Dashboard Analytics & Intelligence Tests', () => {
  let citizenId;
  let adminToken;

  beforeEach(async () => {
    await Complaint.deleteMany({});
    citizenId = new mongoose.Types.ObjectId();

    // Register admin user to get auth token
    const res = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Municipal Admin',
        email: `admin-${Date.now()}-${Math.random()}@test.com`,
        password: 'adminpassword123',
        role: 'admin'
      });
    adminToken = res.body.token;
  });

  it('calculates 100% SLA compliance for complaint resolved in 24h', async () => {
    const now = Date.now();
    const createdAt = new Date(now - 30 * 3600 * 1000); // 30h ago
    const resolvedAt = new Date(now - 6 * 3600 * 1000);  // 6h ago -> took 24h to resolve

    await Complaint.create({
      citizenId,
      text: 'Pothole on Main Street',
      category: 'Roads',
      priority: 'Medium',
      status: 'Resolved',
      createdAt,
      statusHistory: [
        { status: 'Submitted', date: createdAt },
        { status: 'Resolved', date: resolvedAt, note: 'Repaired by road crew' }
      ]
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.resolved).toBe(1);
    expect(res.body.analytics.slaComplianceRate).toBe(100);
    expect(res.body.analytics.avgResolutionHours).toBe(24);
  });

  it('calculates 0% SLA compliance for complaint resolved in 72h', async () => {
    const now = Date.now();
    const createdAt = new Date(now - 100 * 3600 * 1000); // 100h ago
    const resolvedAt = new Date(now - 28 * 3600 * 1000);  // 28h ago -> took 72h to resolve

    await Complaint.create({
      citizenId,
      text: 'Water pipe leak',
      category: 'Water Supply',
      priority: 'High',
      status: 'Resolved',
      createdAt,
      statusHistory: [
        { status: 'Submitted', date: createdAt },
        { status: 'Resolved', date: resolvedAt, note: 'Fixed pipeline' }
      ]
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary.resolved).toBe(1);
    expect(res.body.analytics.slaComplianceRate).toBe(0);
    expect(res.body.analytics.avgResolutionHours).toBe(72);
  });

  it('calculates 50% SLA compliance for mixed resolutions (24h and 72h)', async () => {
    const now = Date.now();
    
    // Complaint 1: 24h resolution
    const created1 = new Date(now - 30 * 3600 * 1000);
    const resolved1 = new Date(now - 6 * 3600 * 1000);
    await Complaint.create({
      citizenId,
      text: 'Issue 1',
      status: 'Resolved',
      createdAt: created1,
      statusHistory: [{ status: 'Resolved', date: resolved1 }]
    });

    // Complaint 2: 72h resolution
    const created2 = new Date(now - 100 * 3600 * 1000);
    const resolved2 = new Date(now - 28 * 3600 * 1000);
    await Complaint.create({
      citizenId,
      text: 'Issue 2',
      status: 'Resolved',
      createdAt: created2,
      statusHistory: [{ status: 'Resolved', date: resolved2 }]
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics.slaComplianceRate).toBe(50);
    expect(res.body.analytics.avgResolutionHours).toBe(48);
  });

  it('identifies open complaints >48h as active SLA breaches', async () => {
    const now = Date.now();

    // Breach 1: Submitted 60 hours ago
    await Complaint.create({
      citizenId,
      text: 'Stagnant garbage',
      status: 'Submitted',
      createdAt: new Date(now - 60 * 3600 * 1000)
    });

    // Breach 2: In Review 50 hours ago
    await Complaint.create({
      citizenId,
      text: 'Broken streetlight',
      status: 'In Review',
      createdAt: new Date(now - 50 * 3600 * 1000)
    });

    // Non-breach: Submitted 10 hours ago
    await Complaint.create({
      citizenId,
      text: 'Park bench vandalized',
      status: 'Submitted',
      createdAt: new Date(now - 10 * 3600 * 1000)
    });

    // Resolved (even if >48h old, resolved issues are not active breaches)
    await Complaint.create({
      citizenId,
      text: 'Old resolved issue',
      status: 'Resolved',
      createdAt: new Date(now - 70 * 3600 * 1000)
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics.activeSlaBreaches).toBe(2);
  });

  it('calculates average severity score and excludes null / unassessed complaints', async () => {
    // Complaint with score 8
    await Complaint.create({
      citizenId,
      text: 'Live wire snapped',
      severityScore: 8
    });

    // Complaint with score 6
    await Complaint.create({
      citizenId,
      text: 'Deep road crater',
      severityScore: 6
    });

    // Legacy complaint with null score
    await Complaint.create({
      citizenId,
      text: 'Legacy unassessed complaint',
      severityScore: null
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // (8 + 6) / 2 = 7.0
    expect(res.body.analytics.avgSeverityScore).toBe(7);
  });

  it('aggregates duplicate and distinct safety hazards correctly', async () => {
    await Complaint.create({
      citizenId,
      text: 'Issue 1',
      safetyHazards: ['Live Wire', 'Flooding Risk']
    });

    await Complaint.create({
      citizenId,
      text: 'Issue 2',
      safetyHazards: ['Live Wire', 'Traffic Obstruction']
    });

    await Complaint.create({
      citizenId,
      text: 'Issue 3',
      safetyHazards: ['Live Wire']
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.analytics.topSafetyHazards).toEqual([
      { hazard: 'Live Wire', count: 3 },
      { hazard: 'Flooding Risk', count: 1 },
      { hazard: 'Traffic Obstruction', count: 1 }
    ]);
  });

  it('includes geotagged complaints in mapPins and excludes missing coordinates', async () => {
    // Valid coordinates
    const geoComplaint = await Complaint.create({
      citizenId,
      text: 'Geotagged pothole',
      category: 'Roads',
      priority: 'High',
      severityScore: 7,
      location: {
        lat: 28.6139,
        lng: 77.2090,
        address: 'New Delhi'
      }
    });

    // Missing coordinates
    await Complaint.create({
      citizenId,
      text: 'No GPS complaint',
      location: {
        lat: null,
        lng: null,
        address: ''
      }
    });

    const res = await request(app)
      .get('/api/dashboard/summary')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.mapPins.length).toBe(1);
    expect(res.body.mapPins[0]._id).toBe(geoComplaint._id.toString());
    expect(res.body.mapPins[0].location.lat).toBe(28.6139);
    expect(res.body.mapPins[0].location.lng).toBe(77.2090);
    expect(res.body.mapPins[0].severityScore).toBe(7);
  });
});
