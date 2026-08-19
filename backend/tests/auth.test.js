// tests/auth.test.js
require('./setup');
const request = require('supertest');
const createApp = require('../src/app');

const app = createApp();

describe('Auth Routes', () => {
  // ── Register ────────────────────────────────────────────────────────────────
  describe('POST /api/auth/register', () => {
    it('registers a new citizen with valid data, returns 201 + JWT + user with role citizen', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test Citizen', email: 'citizen@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('citizen');
      expect(res.body.user.name).toBe('Test Citizen');
      expect(res.body.user.email).toBe('citizen@test.com');
    });

    it('rejects registration with a duplicate email (409)', async () => {
      // First registration
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'First', email: 'dupe@test.com', password: 'password123' });

      // Second with same email
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Second', email: 'dupe@test.com', password: 'password456' });

      expect(res.status).toBe(409);
      expect(res.body.error).toMatch(/already registered/i);
    });

    it('rejects registration with password under 6 characters (400)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Short Pass', email: 'short@test.com', password: '12345' });

      expect(res.status).toBe(400);
    });

    it('rejects registration when name is missing (400)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ email: 'noname@test.com', password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('rejects registration when email is missing (400)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'No Email', password: 'password123' });

      expect(res.status).toBe(400);
    });

    it('rejects registration when password is missing (400)', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'No Pass', email: 'nopass@test.com' });

      expect(res.status).toBe(400);
    });

    it('never exposes passwordHash in the response', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Hash Check', email: 'hashcheck@test.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.user.password).toBeUndefined();
    });
  });

  // ── Login ───────────────────────────────────────────────────────────────────
  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Login User', email: 'login@test.com', password: 'password123' });
    });

    it('logs in with correct credentials and returns a JWT', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('login@test.com');
    });

    it('rejects login with correct email but wrong password (401)', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'login@test.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toMatch(/invalid email or password/i);
    });

    it('rejects login with non-existent email (401) with same generic message', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'ghost@test.com', password: 'password123' });

      expect(res.status).toBe(401);
      // Must be the same generic message for both wrong-email and wrong-password
      // to prevent user enumeration
      expect(res.body.error).toMatch(/invalid email or password/i);
    });
  });

  // ── /me (current user) ─────────────────────────────────────────────────────
  describe('GET /api/auth/me', () => {
    it('returns the correct user when a valid JWT is provided', async () => {
      const regRes = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Me User', email: 'me@test.com', password: 'password123' });

      const token = regRes.body.token;

      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('me@test.com');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('returns 401 when no Authorization header is present', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('returns 401 when the JWT is malformed', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer this.is.not.a.real.jwt');

      expect(res.status).toBe(401);
    });
  });
});
