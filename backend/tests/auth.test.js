process.env.JWT_SECRET = 'test-secret';
const request = require('supertest');
const app = require('../src/app')();
const supabase = require('../src/config/supabase');

let mockVerifyIdToken = jest.fn();
jest.mock('google-auth-library', () => {
  return {
    OAuth2Client: jest.fn().mockImplementation(() => {
      return {
        verifyIdToken: (...args) => mockVerifyIdToken(...args)
      };
    })
  };
});

jest.mock('../src/config/supabase');

describe('Auth Controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockVerifyIdToken.mockReset();
  });

  describe('POST /api/auth/register', () => {
    it('should assign citizen role even if admin is requested', async () => {
      supabase.from.mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null }) // no existing user
      });

      let insertedData = null;
      supabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null }),
            insert: jest.fn().mockImplementation((data) => {
              insertedData = data[0];
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: { id: 'user-1', ...insertedData } })
              };
            })
          };
        }
      });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Hacker',
          email: 'hacker@example.com',
          password: 'password123',
          role: 'admin' // Attempt privilege escalation
        });

      expect(res.statusCode).toEqual(201);
      expect(insertedData.role).toEqual('citizen'); // Must be citizen
    });
  });

  describe('POST /api/auth/google', () => {

    it('should return 400 if credential is missing', async () => {
      const res = await request(app)
        .post('/api/auth/google')
        .send({});
      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toBeDefined();
    });

    it('should return 401 if Google token is invalid', async () => {
      mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));
      
      const res = await request(app)
        .post('/api/auth/google')
        .send({ credential: 'bad_token' });
        
      expect(res.statusCode).toEqual(401);
      expect(res.body.error).toMatch(/invalid or expired/i);
    });

    it('should return 403 if email is not verified', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email_verified: false, email: 'test@test.com' })
      });
      
      const res = await request(app)
        .post('/api/auth/google')
        .send({ credential: 'valid_token_but_unverified' });
        
      expect(res.statusCode).toEqual(403);
      expect(res.body.error).toMatch(/must be verified/i);
    });

    it('should login an existing user if email matches', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email_verified: true, email: 'existing@test.com', name: 'Existing User' })
      });

      supabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({
              data: { id: 'exist-1', email: 'existing@test.com', role: 'admin', password_hash: 'hashed' }
            }),
            update: jest.fn().mockReturnThis()
          };
        }
      });
      
      const res = await request(app)
        .post('/api/auth/google')
        .send({ credential: 'good_token' });
        
      expect(res.statusCode).toEqual(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.role).toEqual('admin');
      expect(res.body.user).not.toHaveProperty('password_hash');
    });

    it('should create a new citizen user if email does not exist', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({ email_verified: true, email: 'new@test.com', name: 'New User' })
      });

      let insertedData = null;
      supabase.from.mockImplementation((table) => {
        if (table === 'users') {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockImplementation(() => {
              if (insertedData) {
                return Promise.resolve({ data: { id: 'new-1', ...insertedData } });
              }
              return Promise.resolve({ data: null });
            }),
            insert: jest.fn().mockImplementation((data) => {
              insertedData = data[0];
              return {
                select: jest.fn().mockReturnThis(),
                single: jest.fn().mockResolvedValue({ data: { id: 'new-1', ...insertedData } })
              };
            })
          };
        }
      });
      
      const res = await request(app)
        .post('/api/auth/google')
        .send({ credential: 'good_token' });
        
      expect(res.statusCode).toEqual(201);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user.role).toEqual('citizen');
      expect(insertedData.password_hash).toBeDefined();
    });
  });
});
