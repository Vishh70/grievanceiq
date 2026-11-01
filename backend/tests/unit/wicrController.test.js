/**
 * GrievanceIQ WICR Controller & Role-Based Access Control (RBAC) Unit Tests (Phase 5)
 * ====================================================================================
 * Verifies:
 * 1. Server-enforced authentication: rejects unauthenticated requests (401).
 * 2. Role-based authorization:
 *    - Rejects 'citizen' role with 403 Forbidden.
 *    - Grants access to 'officer' and 'admin' roles.
 * 3. Department scoping for municipal officers.
 * 4. Atomic resolution validation and concurrency conflict (409 Conflict).
 * 5. Audit events and versioned history retrieval.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');
const express = require('express');

const wicrRoutes = require('../../src/routes/wicrRoutes');
const reviewQueueService = require('../../src/services/reviewQueueService');
const supabase = require('../../src/config/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';

function generateTestToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('FR06 / Phase 5: WICR Review Controller & RBAC Authorization', () => {
  let app;

  const mockAdmin = {
    id: '11111111-1111-1111-1111-111111111111',
    email: 'admin@city.gov',
    role: 'admin',
    department: null
  };

  const mockOfficerRoads = {
    id: '22222222-2222-2222-2222-222222222222',
    email: 'officer.roads@city.gov',
    role: 'officer',
    department: 'Roads'
  };

  const mockCitizen = {
    id: '33333333-3333-3333-3333-333333333333',
    email: 'citizen.jane@example.com',
    role: 'citizen',
    department: null
  };

  beforeAll(() => {
    process.env.JWT_SECRET = JWT_SECRET;
    app = express();
    app.use(express.json());
    app.use('/api/wicr', wicrRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Supabase user lookup used in auth.protect middleware
    jest.spyOn(supabase, 'from').mockImplementation((table) => {
      if (table === 'users') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockImplementation((col, val) => {
            return {
              single: jest.fn().mockImplementation(async () => {
                if (val === mockAdmin.id) return { data: { ...mockAdmin }, error: null };
                if (val === mockOfficerRoads.id) return { data: { ...mockOfficerRoads }, error: null };
                if (val === mockCitizen.id) return { data: { ...mockCitizen }, error: null };
                return { data: null, error: { message: 'User not found' } };
              })
            };
          })
        };
      }
      return { select: jest.fn().mockReturnThis() };
    });
  });

  describe('1. Authentication & Role-Based Access Control (RBAC)', () => {
    it('A. Rejects unauthenticated requests with 401 Unauthorized', async () => {
      const res = await request(app).get('/api/wicr/reviews');
      expect(res.status).toBe(401);
      expect(res.body.error).toContain('Not authorised');
    });

    it('B. Strictly rejects citizen role with 403 Forbidden', async () => {
      const token = generateTestToken(mockCitizen);
      const res = await request(app)
        .get('/api/wicr/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('insufficient role');
    });

    it('C. Authorizes municipal officer role with 200 OK', async () => {
      jest.spyOn(reviewQueueService, 'getPendingReviews').mockResolvedValueOnce({
        reviews: [],
        total: 0,
        limit: 50,
        offset: 0
      });

      const token = generateTestToken(mockOfficerRoads);
      const res = await request(app)
        .get('/api/wicr/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.reviews).toEqual([]);
    });

    it('D. Authorizes administrator role with 200 OK', async () => {
      jest.spyOn(reviewQueueService, 'getPendingReviews').mockResolvedValueOnce({
        reviews: [],
        total: 0,
        limit: 50,
        offset: 0
      });

      const token = generateTestToken(mockAdmin);
      const res = await request(app)
        .get('/api/wicr/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('2. Queue Retrieval & Department Scoping', () => {
    it('A. Scopes query to officer department by default', async () => {
      const spy = jest.spyOn(reviewQueueService, 'getPendingReviews').mockResolvedValueOnce({
        reviews: [
          {
            decision_id: 'dec-1',
            source_title: 'Pothole',
            source_department: 'Roads',
            target_title: 'Road crack',
            target_department: 'Roads',
            relationship_type: 'Duplicate'
          }
        ],
        total: 1,
        limit: 50,
        offset: 0
      });

      const token = generateTestToken(mockOfficerRoads);
      const res = await request(app)
        .get('/api/wicr/reviews')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({
        department: 'Roads'
      }));
      expect(res.body.scopedDepartment).toBe('Roads');
      expect(res.body.reviews).toHaveLength(1);
    });

    it('B. Passes search and relationship filters accurately', async () => {
      const spy = jest.spyOn(reviewQueueService, 'getPendingReviews').mockResolvedValueOnce({
        reviews: [],
        total: 0,
        limit: 25,
        offset: 10
      });

      const token = generateTestToken(mockAdmin);
      const res = await request(app)
        .get('/api/wicr/reviews?relationshipType=Related&search=water&limit=25&offset=10')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith({
        limit: 25,
        offset: 10,
        relationshipType: 'Related',
        department: undefined,
        search: 'water'
      });
    });
  });

  describe('3. Review Resolution & Concurrency Safety', () => {
    it('A. Successfully resolves a review as ACCEPT', async () => {
      const spy = jest.spyOn(reviewQueueService, 'resolveReview').mockResolvedValueOnce({
        success: true,
        decision_id: 'dec-99',
        resolved_action: 'ACCEPT',
        review_status: 'RESOLVED_ACCEPT',
        reviewer_id: mockAdmin.id
      });

      const token = generateTestToken(mockAdmin);
      const res = await request(app)
        .post('/api/wicr/reviews/dec-99/resolve')
        .set('Authorization', `Bearer ${token}`)
        .send({
          action: 'ACCEPT',
          notes: 'Confirmed duplicate water main incident'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(spy).toHaveBeenCalledWith({
        decisionId: 'dec-99',
        reviewerId: mockAdmin.id,
        action: 'ACCEPT',
        notes: 'Confirmed duplicate water main incident'
      });
    });

    it('B. Rejects invalid resolution actions with 400 Bad Request', async () => {
      const token = generateTestToken(mockAdmin);
      const res = await request(app)
        .post('/api/wicr/reviews/dec-99/resolve')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'INVALID_ACTION' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Must be 'ACCEPT' or 'REJECT'");
    });

    it('C. Handles concurrent resolution conflict with HTTP 409 Conflict', async () => {
      const conflictError = new Error('Conflict: This decision has already been resolved by another reviewer.');
      conflictError.status = 409;
      conflictError.code = 'REVIEW_ALREADY_RESOLVED';

      jest.spyOn(reviewQueueService, 'resolveReview').mockRejectedValueOnce(conflictError);

      const token = generateTestToken(mockOfficerRoads);
      const res = await request(app)
        .post('/api/wicr/reviews/dec-concurrent/resolve')
        .set('Authorization', `Bearer ${token}`)
        .send({ action: 'ACCEPT', notes: 'Trying to accept' });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('REVIEW_ALREADY_RESOLVED');
      expect(res.body.error).toContain('already been resolved');
    });
  });

  describe('4. Audit Events & Queue Statistics', () => {
    it('A. Retrieves append-only audit events for a decision', async () => {
      const mockEvents = [
        {
          id: 'evt-1',
          decision_id: 'dec-1',
          event_type: 'DECISION_RECORDED',
          new_status: 'PENDING',
          created_at: new Date().toISOString()
        },
        {
          id: 'evt-2',
          decision_id: 'dec-1',
          event_type: 'RESOLVED_ACCEPT',
          new_status: 'RESOLVED_ACCEPT',
          actor_email: 'officer@city.gov',
          notes: 'Approved by officer',
          created_at: new Date().toISOString()
        }
      ];

      jest.spyOn(reviewQueueService, 'getAuditEvents').mockResolvedValueOnce(mockEvents);

      const token = generateTestToken(mockAdmin);
      const res = await request(app)
        .get('/api/wicr/reviews/dec-1/events')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.events).toHaveLength(2);
      expect(res.body.events[0].event_type).toBe('DECISION_RECORDED');
      expect(res.body.events[1].event_type).toBe('RESOLVED_ACCEPT');
    });

    it('B. Retrieves queue statistics', async () => {
      jest.spyOn(reviewQueueService, 'getQueueStats').mockResolvedValueOnce({
        pending: 5,
        resolvedAccept: 12,
        resolvedReject: 3,
        duplicatesPending: 3,
        relatedPending: 2,
        totalEvaluated: 20
      });

      const token = generateTestToken(mockOfficerRoads);
      const res = await request(app)
        .get('/api/wicr/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.stats.pending).toBe(5);
      expect(res.body.stats.resolvedAccept).toBe(12);
    });
  });

});

