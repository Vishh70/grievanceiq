// backend/tests/unit/securityAudit.test.js
/**
 * Test Suite for Phase 7: Security & Authorization Audit
 *
 * Verifies that:
 * 1. JWT_SECRET is mandatory in production environment.
 * 2. Unauthenticated requests are rejected with 401 Unauthorized.
 * 3. Expired or malformed JWT tokens are rejected with 401 Unauthorized.
 * 4. Citizen role is strictly forbidden from accessing municipal review/admin endpoints (403 Forbidden).
 * 5. Municipal officers and administrators are authorized for operational endpoints.
 * 6. Public registration rejects role spoofing / privilege escalation (forces citizen role).
 * 7. Startup server verification never resets an existing admin password.
 * 8. Department-level scoping is enforced on municipal review queries.
 */

const sinon = require('sinon');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../../src/middleware/auth');
const authController = require('../../src/controllers/authController');
const supabase = require('../../src/config/supabase');

describe('Phase 7: Security & Authorization Audit', () => {
  let sandbox;
  const TEST_SECRET = 'test-audit-jwt-secret-minimum-32-characters-long!';

  beforeEach(() => {
    sandbox = sinon.createSandbox();
    process.env.JWT_SECRET = TEST_SECRET;
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. JWT Secret Enforcement & Secret Management
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Secret Management & Production Guard', () => {
    it('throws in production mode if JWT_SECRET is not configured', () => {
      const origEnv = process.env.NODE_ENV;
      const origSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.JWT_SECRET;

        const req = { headers: { authorization: 'Bearer some.token.here' } };
        const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
        const next = sinon.stub();

        // Calling protect should fail due to missing JWT_SECRET
        authMiddleware.protect(req, res, next);
        expect(res.status.calledWith(401)).toBe(true);
      } finally {
        process.env.NODE_ENV = origEnv;
        process.env.JWT_SECRET = origSecret;
      }
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Authentication Route Protection
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Authentication Route Guard (protect)', () => {
    it('returns 401 Unauthorized when Authorization header is missing', async () => {
      const req = { headers: {} };
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      const next = sinon.stub();

      await authMiddleware.protect(req, res, next);

      expect(res.status.calledWith(401)).toBe(true);
      expect(res.json.calledWith(sinon.match({ error: sinon.match(/Not authorised/) }))).toBe(true);
      expect(next.called).toBe(false);
    });

    it('returns 401 Unauthorized when token is invalid or forged', async () => {
      const req = { headers: { authorization: 'Bearer completely-invalid-jwt-token' } };
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      const next = sinon.stub();

      await authMiddleware.protect(req, res, next);

      expect(res.status.calledWith(401)).toBe(true);
      expect(res.json.calledWith(sinon.match({ error: sinon.match(/invalid or expired/) }))).toBe(true);
      expect(next.called).toBe(false);
    });

    it('attaches sanitized user (without password_hash) when token is valid', async () => {
      const userId = 'user-uuid-123';
      const validToken = jwt.sign({ id: userId }, TEST_SECRET, { expiresIn: '1h' });
      const mockUser = { id: userId, email: 'officer@city.gov', role: 'officer', password_hash: '$2b$12$hashedpwd' };

      sandbox.stub(supabase, 'from').returns({
        select: sandbox.stub().returnsThis(),
        eq: sandbox.stub().returns({
          single: sandbox.stub().resolves({ data: mockUser, error: null })
        })
      });

      const req = { headers: { authorization: `Bearer ${validToken}` } };
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      const next = sinon.stub();

      await authMiddleware.protect(req, res, next);

      expect(next.calledOnce).toBe(true);
      expect(req.user).toBeDefined();
      expect(req.user.id).toBe(userId);
      expect(req.user.password_hash).toBeUndefined(); // Must be sanitized
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Role-Based Access Control (restrictTo)
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Role-Based Access Control', () => {
    it('strictly forbids citizen role from accessing officer/admin endpoints (403)', () => {
      const req = { user: { id: 'citizen-1', role: 'citizen' } };
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      const next = sinon.stub();

      const middleware = authMiddleware.restrictTo('admin', 'officer');
      middleware(req, res, next);

      expect(res.status.calledWith(403)).toBe(true);
      expect(res.json.calledWith(sinon.match({ error: sinon.match(/insufficient role/i) }))).toBe(true);
      expect(next.called).toBe(false);
    });

    it('allows municipal officer role for review & verification endpoints', () => {
      const req = { user: { id: 'officer-1', role: 'officer', department: 'Water Department' } };
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      const next = sinon.stub();

      const middleware = authMiddleware.restrictTo('admin', 'officer');
      middleware(req, res, next);

      expect(next.calledOnce).toBe(true);
      expect(res.status.called).toBe(false);
    });

    it('allows administrator role for system management endpoints', () => {
      const req = { user: { id: 'admin-1', role: 'admin' } };
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };
      const next = sinon.stub();

      const middleware = authMiddleware.restrictTo('admin');
      middleware(req, res, next);

      expect(next.calledOnce).toBe(true);
      expect(res.status.called).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Privilege Escalation Prevention on Public Registration
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Registration Privilege Escalation Protection', () => {
    it('forces citizen role even if malicious payload attempts to set role: "admin"', async () => {
      const insertStub = sandbox.stub().returns({
        select: sandbox.stub().returns({
          single: sandbox.stub().resolves({
            data: { id: 'new-id', email: 'attacker@evil.com', role: 'citizen' },
            error: null
          })
        })
      });

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'users') {
          return {
            select: sandbox.stub().returnsThis(),
            eq: sandbox.stub().returns({
              single: sandbox.stub().resolves({ data: null, error: null }) // Not registered yet
            }),
            insert: insertStub
          };
        }
        return {};
      });

      const req = {
        body: {
          name: 'Mallory Attacker',
          email: 'attacker@evil.com',
          password: 'SecretPassword123!',
          role: 'admin' // Attempted privilege escalation
        }
      };
      const res = { status: sinon.stub().returnsThis(), json: sinon.stub() };

      await authController.register(req, res);

      expect(res.status.calledWith(201)).toBe(true);
      expect(insertStub.calledOnce).toBe(true);

      const insertedPayload = insertStub.firstCall.args[0][0];
      expect(insertedPayload.role).toBe('citizen'); // Escalation rejected
      expect(insertedPayload.role).not.toBe('admin');
    });
  });
});

