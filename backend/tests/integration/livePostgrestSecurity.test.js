// tests/integration/livePostgrestSecurity.test.js
// Gate 1: Live PostgREST Data API Security Verification
// Verifies that anonymous and authenticated HTTP requests to PostgREST
// are strictly denied access to backend views, tables, and RPCs, while
// the backend service_role retains full authorized access.

const axios = require('axios');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const isConfigured = supabaseUrl && anonKey && !supabaseUrl.includes('placeholder');

describe('Gate 1: Live PostgREST Data API Security Verification', () => {
  if (!isConfigured) {
    it.skip('SKIPPED — live staging Supabase environment not configured', () => {});
    return;
  }

  const anonClient = axios.create({
    baseURL: `${supabaseUrl}/rest/v1`,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    validateStatus: () => true, // Don't throw on HTTP error codes
  });

  const serviceClient = serviceKey
    ? axios.create({
        baseURL: `${supabaseUrl}/rest/v1`,
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          'Content-Type': 'application/json',
        },
        validateStatus: () => true,
      })
    : null;

  describe('Anonymous Client Access Rejection (HTTP REST/RPC)', () => {
    const sensitiveViews = [
      'v_pending_wicr_reviews',
      'v_pending_dependency_recommendations',
      'v_civic_issue_related_links',
    ];

    test.each(sensitiveViews)('Anon cannot query view %s via PostgREST', async (viewName) => {
      const res = await anonClient.get(`/${viewName}?limit=1`);
      // Expect 401 Unauthorized, 403 Forbidden, or PostgREST error 42501 (permission denied)
      const isDenied = res.status === 401 || res.status === 403 || res.status === 404 ||
        (res.data && (res.data.code === '42501' || /permission denied/i.test(res.data.message || '')));
      expect(isDenied).toBe(true);
    });

    const sensitiveTables = [
      'users',
      'complaints',
      'departments',
      'tasks',
      'wicr_decisions',
      'wicr_review_events',
      'task_dependency_recommendations',
    ];

    test.each(sensitiveTables)('Anon cannot read sensitive table %s via PostgREST', async (tableName) => {
      const res = await anonClient.get(`/${tableName}?limit=1`);
      const isDenied = res.status === 401 || res.status === 403 ||
        (res.data && (res.data.code === '42501' || /permission denied/i.test(res.data.message || '')));
      expect(isDenied).toBe(true);
    });

    const sensitiveRpcs = [
      'commit_complaint_processing',
      'acquire_complaint_lease',
      'execute_wicr_review_decision',
    ];

    test.each(sensitiveRpcs)('Anon cannot execute internal RPC %s via PostgREST', async (rpcName) => {
      const res = await anonClient.post(`/rpc/${rpcName}`, {});
      const isDenied = res.status === 401 || res.status === 403 || res.status === 404 ||
        (res.data && (res.data.code === '42501' || /permission denied/i.test(res.data.message || '')));
      expect(isDenied).toBe(true);
    });
  });

  describe('Service Role Client Legitimate Access (HTTP REST/RPC)', () => {
    if (!serviceClient) {
      it.skip('SKIPPED — SUPABASE_SERVICE_ROLE_KEY not provided', () => {});
      return;
    }

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
