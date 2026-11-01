// tests/integration/livePostgrestSecurity.test.js
// Gate 1: Live PostgREST Data API Security Verification
// Verifies that:
// 1. All target views, tables, and stored procedures genuinely exist in PostgREST schema cache.
// 2. Anonymous HTTP clients are strictly denied access (401/403 or code 42501; NOT 404).
// 3. Authenticated citizen user sessions are strictly denied access to backend views, internal tables, and RPCs.
// 4. Privileged backend service_role retains full authorized access.

const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = Boolean(
  supabaseUrl &&
  anonKey &&
  serviceKey &&
  !supabaseUrl.includes('placeholder')
);

const TARGET_VIEWS = [
  'v_pending_wicr_reviews',
  'v_pending_dependency_recommendations',
  'v_civic_issue_related_links',
];

const TARGET_TABLES = [
  'users',
  'complaints',
  'departments',
  'tasks',
  'wicr_decisions',
  'wicr_review_events',
  'task_dependency_recommendations',
];

const TARGET_RPCS = [
  'commit_complaint_processing',
  'acquire_complaint_lease',
  'resolve_wicr_review', // Corrected Phase 18 RPC name
];

describe('Gate 1: Live PostgREST Data API Security Verification', () => {
  if (!isConfigured) {
    it.skip('SKIPPED — live staging Supabase credentials (SUPABASE_URL, ANON_KEY, SERVICE_ROLE_KEY) not fully configured', () => {});
    return;
  }

  let anonClient;
  let serviceClient;
  let authClient = null;
  let testUserId = null;

  beforeAll(async () => {
    anonClient = axios.create({
      baseURL: `${supabaseUrl}/rest/v1`,
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });

    serviceClient = axios.create({
      baseURL: `${supabaseUrl}/rest/v1`,
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      },
      validateStatus: () => true,
    });

    // Create a genuine Supabase authenticated user session
    try {
      const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false },
      });

      const uniqueSuffix = Date.now();
      const testEmail = `gate1-user-${uniqueSuffix}@grievanceiq.local`;
      const testPassword = `P@ssword123-${uniqueSuffix}`;

      const { data: createData, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true,
      });

      if (createData?.user) {
        testUserId = createData.user.id;

        const { data: sessionData, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
          email: testEmail,
          password: testPassword,
        });

        const token = sessionData?.session?.access_token;
        if (token) {
          authClient = axios.create({
            baseURL: `${supabaseUrl}/rest/v1`,
            headers: {
              apikey: anonKey,
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            validateStatus: () => true,
          });
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not create synthetic authenticated user:', err.message);
    }
  });

  afterAll(async () => {
    if (testUserId && serviceKey) {
      try {
        const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
          auth: { autoRefreshToken: false, persistSession: false },
        });
        await supabaseAdmin.auth.admin.deleteUser(testUserId);
      } catch (err) {
        console.warn('⚠️ Could not delete synthetic test user:', err.message);
      }
    }
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Schema Existence Verification (via Service Role)
  // Ensures objects actually exist; avoids false positives from 404 Missing endpoints
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Object Existence Check (Service Role)', () => {
    test.each(TARGET_VIEWS)('View %s exists in PostgREST schema', async (viewName) => {
      const res = await serviceClient.get(`/${viewName}?limit=1`);
      expect(res.status).not.toBe(404);
      expect([200, 206]).toContain(res.status);
    });

    test.each(TARGET_TABLES)('Table %s exists in PostgREST schema', async (tableName) => {
      const res = await serviceClient.get(`/${tableName}?limit=1`);
      expect(res.status).not.toBe(404);
      expect([200, 206]).toContain(res.status);
    });

    test.each(TARGET_RPCS)('RPC %s exists in PostgREST schema', async (rpcName) => {
      const res = await serviceClient.post(`/rpc/${rpcName}`, {});
      // In PostgREST, a missing RPC returns 404 "Could not find the function".
      // An existing RPC invoked with empty parameters returns 400 (Bad Request - missing param)
      // or 200/500, but NEVER 404.
      expect(res.status).not.toBe(404);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Helper to assert strict permission denial (rejects 404 false positives)
  // ─────────────────────────────────────────────────────────────────────────────
  function assertPermissionDenied(res, objectName) {
    // 404 means the view/table/function does not exist in the schema cache!
    // A secure denial MUST be 401 Unauthorized, 403 Forbidden, or Postgres 42501.
    expect(res.status).not.toBe(404);

    const isDeniedStatus = res.status === 401 || res.status === 403;
    const isDeniedPgCode = res.data && (
      res.data.code === '42501' ||
      /permission denied/i.test(res.data.message || '') ||
      /permission denied/i.test(res.data.hint || '')
    );

    const isProperlyDenied = isDeniedStatus || isDeniedPgCode;
    expect(isProperlyDenied).toBe(true);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Anonymous Access Rejection
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Anonymous Access Rejection', () => {
    test.each(TARGET_VIEWS)('Anon cannot read view %s (401/403/42501, not 404)', async (viewName) => {
      const res = await anonClient.get(`/${viewName}?limit=1`);
      assertPermissionDenied(res, viewName);
    });

    test.each(TARGET_TABLES)('Anon cannot read table %s (401/403/42501, not 404)', async (tableName) => {
      const res = await anonClient.get(`/${tableName}?limit=1`);
      assertPermissionDenied(res, tableName);
    });

    test.each(TARGET_RPCS)('Anon cannot execute RPC %s (401/403/42501, not 404)', async (rpcName) => {
      const res = await anonClient.post(`/rpc/${rpcName}`, {});
      assertPermissionDenied(res, rpcName);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Authenticated User Session Access Rejection
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Authenticated Citizen Session Access Rejection', () => {
    test('Authenticated user session was provisioned', () => {
      expect(authClient).not.toBeNull();
    });

    test.each(TARGET_VIEWS)('Authenticated citizen cannot read view %s', async (viewName) => {
      if (!authClient) return;
      const res = await authClient.get(`/${viewName}?limit=1`);
      assertPermissionDenied(res, viewName);
    });

    test.each(TARGET_TABLES)('Authenticated citizen cannot read table %s', async (tableName) => {
      if (!authClient) return;
      const res = await authClient.get(`/${tableName}?limit=1`);
      assertPermissionDenied(res, tableName);
    });

    test.each(TARGET_RPCS)('Authenticated citizen cannot execute RPC %s', async (rpcName) => {
      if (!authClient) return;
      const res = await authClient.post(`/rpc/${rpcName}`, {});
      assertPermissionDenied(res, rpcName);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Backend Service Role Authorized Access
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Service Role Legitimate Access', () => {
    test('Service role can query complaints table', async () => {
      const res = await serviceClient.get('/complaints?limit=1');
      expect([200, 206]).toContain(res.status);
      expect(Array.isArray(res.data)).toBe(true);
    });

    test('Service role can query hardened security views', async () => {
      const res = await serviceClient.get('/v_pending_wicr_reviews?limit=1');
      expect([200, 206]).toContain(res.status);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });
});
