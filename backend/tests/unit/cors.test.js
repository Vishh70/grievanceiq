// tests/unit/cors.test.js
// Regression test suite for environment-specific CORS allowlist behavior and fail-closed validation

const request = require('supertest');
const createApp = require('../../src/app');

describe('CORS Environment-Specific Allowlist', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getAllowedOrigins configuration validation', () => {
    test('Staging allows ONLY explicitly configured staging origins', () => {
      const mockEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        CLIENT_URL: 'https://staging-frontend.vercel.app',
        ALLOWED_ORIGINS: 'https://staging-alt.vercel.app, https://preview.grievanceiq.com/'
      };

      const origins = createApp.getAllowedOrigins(mockEnv);

      expect(origins).toEqual([
        'https://staging-frontend.vercel.app',
        'https://staging-alt.vercel.app',
        'https://preview.grievanceiq.com'
      ]);
      expect(origins).not.toContain('https://grievanceiq-app.vercel.app');
      expect(origins).not.toContain('https://grievanceiq-ten.vercel.app');
      expect(origins).not.toContain('http://localhost:5173');
    });

    test('Staging FAILS CLOSED if production domain is mistakenly placed in CLIENT_URL or ALLOWED_ORIGINS', () => {
      const mockEnv1 = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        CLIENT_URL: 'https://grievanceiq-app.vercel.app'
      };

      expect(() => createApp.getAllowedOrigins(mockEnv1)).toThrow(
        /Production origin "https:\/\/grievanceiq-app\.vercel\.app" is strictly forbidden in staging/
      );

      const mockEnv2 = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        CLIENT_URL: 'https://staging.vercel.app',
        ALLOWED_ORIGINS: 'https://grievanceiq-ten.vercel.app'
      };

      expect(() => createApp.getAllowedOrigins(mockEnv2)).toThrow(
        /Production origin "https:\/\/grievanceiq-ten\.vercel\.app" is strictly forbidden in staging/
      );
    });

    test('Rejects wildcard origin patterns with configuration error', () => {
      const mockEnvWildcard1 = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        CLIENT_URL: '*'
      };

      expect(() => createApp.getAllowedOrigins(mockEnvWildcard1)).toThrow(
        /Wildcard origin pattern "\*" is not permitted/
      );

      const mockEnvWildcard2 = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        CLIENT_URL: 'https://*.vercel.app'
      };

      expect(() => createApp.getAllowedOrigins(mockEnvWildcard2)).toThrow(
        /Wildcard origin pattern "https:\/\/\*\.vercel\.app" is not permitted/
      );
    });

    test('Rejects malformed origin formats (missing scheme or path components)', () => {
      const mockEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        CLIENT_URL: 'staging-domain.vercel.app'
      };

      expect(() => createApp.getAllowedOrigins(mockEnv)).toThrow(
        /Invalid origin format "staging-domain\.vercel\.app"/
      );
    });

    test('Staging with empty configured origins returns empty array (allows NO browser origins)', () => {
      const mockEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'staging',
        CLIENT_URL: '',
        ALLOWED_ORIGINS: ''
      };

      const origins = createApp.getAllowedOrigins(mockEnv);
      expect(origins).toEqual([]);
    });

    test('Production retains official production origins plus any configured domains', () => {
      const mockEnv = {
        NODE_ENV: 'production',
        APP_ENV: 'production',
        CLIENT_URL: 'https://custom-prod.grievanceiq.com'
      };

      const origins = createApp.getAllowedOrigins(mockEnv);

      expect(origins).toContain('https://grievanceiq-app.vercel.app');
      expect(origins).toContain('https://grievanceiq-ten.vercel.app');
      expect(origins).toContain('https://custom-prod.grievanceiq.com');
      expect(origins).not.toContain('http://localhost:5173');
    });

    test('Development / Test defaults to local Vite ports', () => {
      const mockEnv = {
        NODE_ENV: 'development',
        APP_ENV: 'development'
      };

      const origins = createApp.getAllowedOrigins(mockEnv);

      expect(origins).toContain('http://localhost:5173');
      expect(origins).toContain('http://127.0.0.1:5173');
      expect(origins).not.toContain('https://grievanceiq-app.vercel.app');
    });
  });

  describe('HTTP middleware CORS enforcement in Staging mode', () => {
    let app;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = 'staging';
      process.env.CLIENT_URL = 'https://staging-preview.vercel.app';
      process.env.ALLOWED_ORIGINS = 'https://staging-admin.vercel.app';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      app = createApp();
    });

    test('Rejects browser requests from production frontend origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://grievanceiq-app.vercel.app');

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/Origin not allowed by CORS/i);
    });

    test('Rejects browser requests from arbitrary unlisted vercel origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://malicious-preview.vercel.app');

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/Origin not allowed by CORS/i);
    });

    test('Accepts browser requests from exact configured staging origin', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://staging-preview.vercel.app');

      expect(res.headers['access-control-allow-origin']).toBe('https://staging-preview.vercel.app');
    });

    test('Accepts non-browser requests without Origin header (curl / health checks)', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.status).not.toBe(500);
      expect(res.body.environment).toBe('staging');
    });

    test('Fails server initialization when staging is configured with production origin', () => {
      process.env.CLIENT_URL = 'https://grievanceiq-app.vercel.app';
      expect(() => createApp()).toThrow(/Production origin .* strictly forbidden in staging/);
    });
  });

  describe('HTTP middleware CORS enforcement in Production mode', () => {
    let app;

    beforeEach(() => {
      process.env.NODE_ENV = 'production';
      process.env.APP_ENV = 'production';
      process.env.CLIENT_URL = '';
      process.env.ALLOWED_ORIGINS = '';
      process.env.SUPABASE_URL = 'https://test-project.supabase.co';
      process.env.SUPABASE_ANON_KEY = 'test-anon-key';
      process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
      app = createApp();
    });

    test('Accepts browser requests from official production domains', async () => {
      const res1 = await request(app)
        .get('/api/health')
        .set('Origin', 'https://grievanceiq-app.vercel.app');

      expect(res1.headers['access-control-allow-origin']).toBe('https://grievanceiq-app.vercel.app');

      const res2 = await request(app)
        .get('/api/health')
        .set('Origin', 'https://grievanceiq-ten.vercel.app');

      expect(res2.headers['access-control-allow-origin']).toBe('https://grievanceiq-ten.vercel.app');
    });

    test('Rejects browser requests from unlisted external origins in production', async () => {
      const res = await request(app)
        .get('/api/health')
        .set('Origin', 'https://unauthorized-domain.com');

      expect(res.status).toBe(500);
      expect(res.body.error).toMatch(/Origin not allowed by CORS/i);
    });
  });
});
