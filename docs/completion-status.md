# GrievanceIQ — Remediation & Verification Work Log

**Current Commit**: `066dc2e08211511c4e8d776adf08f33af61d6c0a`  
**Branch**: `main` (synced with `origin/main`)  
**Date**: 2026-11-12  
**Status**: `IMPLEMENTED — STAGING VERIFICATION BLOCKED`

---

## 1. Executive Summary & Root Cause

### Root Cause Analysis
The WICR Review Queue production error (`Failed to fetch pending reviews: Could not find the table 'public.v_pending_wicr_reviews' in the schema cache`) observed at `https://grievanceiq-app.vercel.app/admin?tab=wicr-reviews` stems from:
1. **Unapplied Migration**: The live Supabase instance connected to Render backend (`https://grievanceiq-gky1.onrender.com`) was only migrated through Phase 13. WICR schema definitions (Phases 17 & 18) were previously stored only in `docs/database/` and had never been applied to the live database.
2. **Defensive Migration Bypass**: Migration `20261101131302_gate1_database_permissions.sql` in `supabase/migrations/` guarded view permission grants with `IF to_regclass('public.v_pending_wicr_reviews') IS NOT NULL`, meaning it skipped `v_pending_wicr_reviews` without error because the view did not exist.
3. **Missing PostgREST Discovery**: Because neither `v_pending_wicr_reviews` nor `wicr_decisions` existed in PostgreSQL, PostgREST returned HTTP 404 / code `PGRST205` ("Could not find the table 'public.v_pending_wicr_reviews' in the schema cache").
4. **PL/pgSQL Unassigned Variable Bug**: In earlier draft versions of `resolve_wicr_review`, `v_reviewer` was declared as a `RECORD`. When `p_reviewer_id` was NULL, accessing `v_reviewer.email` resulted in runtime error `record "v_reviewer" is not assigned yet`.

---

## 2. Implemented Code & Migration Remediation

### A. Canonical Database Migrations
- `supabase/migrations/20261102140000_wicr_reviews_and_gate1_permissions.sql`:
  - Adds `users.department` column if not present.
  - Creates `public.wicr_decisions` table and indexes.
  - Creates `public.wicr_review_events` append-only audit trail and anti-mutation trigger `trg_prevent_wicr_event_mutation`.
  - Creates `public.v_pending_wicr_reviews` queue view joining complaints and decisions where `review_status = 'PENDING'`.
  - Creates `public.record_wicr_decision` RPC.
  - Creates `public.resolve_wicr_review` RPC with row locking (`FOR UPDATE`), atomic duplicate/related relationship insertion, and safe scalar variables (`v_reviewer_email`, `v_reviewer_role`) handling NULL `p_reviewer_id`.
  - Applies Gate 1 security hardening: sets `security_invoker = true` on `v_pending_wicr_reviews`, revokes all permissions from `PUBLIC`, `anon`, and `authenticated`, grants `SELECT` to `service_role`, grants `service_role` on underlying base tables (`complaints`, `departments`, `users`, etc.), and reloads PostgREST schema cache via `NOTIFY pgrst, 'reload schema'`.
- `docs/database/apply_wicr_and_gate1_hardening.sql`: Self-contained, idempotent script for one-click manual execution in Supabase SQL Editor.

### B. Backend Services & Controllers
- `backend/src/app.js`: Removed frontend `VITE_*` variable lookups; strictly prioritized `SUPABASE_SERVICE_ROLE_KEY`.
- `backend/src/config/supabase.js`: Added production check warning when `SUPABASE_SERVICE_ROLE_KEY` is missing.
- `backend/src/services/reviewQueueService.js`: Removed silent error suppression in `getQueueStats` so missing-schema failures are never masked by falsy 0 metrics.
- `backend/tests/unit/wicrController.test.js`: Added unit tests verifying HTTP 500 error propagation on missing schema cache without suppressing errors.
- `backend/tests/integration/wicrQueuePermissionsAndSchema.test.js`: Added 13 isolated PGlite tests verifying schema existence, missing-schema rejection, direct anon/authenticated access denial, and service-role success.

---

## 3. Test & Verification Baseline

| Test Suite / Command | Total Suites | Passed Suites | Skipped Suites | Total Tests | Passed Tests | Skipped Tests | Duration | Verification Engine |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- |
| **Backend Unit Tests**<br>`npm.cmd run test:unit` | 26 | 26 | 0 | 256 | 256 | 0 | 41.56s | Jest In-Memory / Mocks |
| **Backend Integration Tests**<br>`npm.cmd run test:integration` | 7 | 4 | 3 | 34 | 31 | 3 | 42.88s | PGlite (PostgreSQL 16 WASM) & Redis |
| **Frontend Build**<br>`npm.cmd run build` | 1 | 1 | 0 | — | — | — | 0.93s | Vite + TypeScript 6 |
| **Playwright E2E**<br>`npx.cmd playwright test 06-responsive-a11y` | 1 | 1 | 0 | 4 | 4 | 0 | 19.30s | Chromium Headless |
| **ML Inference Unit Tests**<br>`python -m pytest backend/ml/tests/test_inference.py` | 1 | 1 | 0 | 8 | 8 | 0 | 8.00s | Pytest / Flask Test Client |
| **ML Models Audit**<br>`python backend/scripts/audit_all_models.py` | 1 | 1 | 0 | 10 | 10 | 0 | 2.12s | Scikit-Learn Joblib Models |

### Detailed Integration Test Breakdown
1. `tests/integration/migration.test.js`: **10 passed** (PGlite)
2. `tests/integration/dataApiPermissions.test.js`: **7 passed** (PGlite)
3. `tests/integration/wicrQueuePermissionsAndSchema.test.js`: **13 passed** (PGlite)
4. `tests/integration/worker.test.js`: **1 passed** (Worker/Queue)
5. `tests/integration/livePostgrestSecurity.test.js`: **1 skipped** (requires live cloud Supabase environment variables)
6. `tests/integration/supabase.test.js`: **1 skipped** (requires live cloud Supabase credentials)
7. `tests/integration/true_e2e.test.js`: **1 skipped** (requires live cloud Supabase credentials)

---

## 4. Current Deployment & CI Status

- **GitHub Actions (Commit `066dc2e`)**:
  - `Supabase Preview`: **SUCCESS**
  - `Backend CI (build-and-test 22.x)`: **SUCCESS**
  - `Frontend CI (build 22.x)`: **SUCCESS**
- **Vercel Frontend**:
  - URL: `https://grievanceiq-app.vercel.app`
  - Status: HTTP 200 (Cache HIT, `X-Vercel-Id: bom1::x25wh-1794466142331-f3deb1e9072c`)
- **Render Backend**:
  - URL: `https://grievanceiq-gky1.onrender.com/api/health`
  - Status: HTTP 200
  - Response: `status: ok`, `database: connected`, `version: 1.0.3-unified-auth-production`, `environment: production`
  - WICR Route (`/api/wicr/reviews`): Denies unauthenticated access with HTTP 401 (`{"error":"Not authorised — no token"}`).

---

## 5. Remaining Blocker & Exact Owner Action Required

Per Hard Safety Boundaries (Rules 1, 2, 4, and 9):
1. **Never run unverified migrations or DDL writes against production**.
2. **`supabase-red-cable` (`bvyyeefapmdisxzuttds`) is not confirmed isolated from production and must not be modified**.
3. **`grievanceiq-staging-clean` has not yet been provisioned in Supabase**.
4. **No Supabase CLI access token (`AccessTokenRequiredError`) or organization billing approval is present to provision a new project autonomously**.

### Minimal Owner Action to Unblock Live Verification:
1. **Option A (Recommended: Clean Staging Project)**:
   - Create or provision `grievanceiq-staging-clean` in Supabase dashboard.
   - Run `docs/database/apply_wicr_and_gate1_hardening.sql` in the Supabase SQL Editor.
   - Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in Render staging environment.
2. **Option B (Confirm `supabase-red-cable` Isolation)**:
   - If `supabase-red-cable` (`bvyyeefapmdisxzuttds`) is confirmed by the owner as an isolated staging database containing only synthetic data, execute `docs/database/apply_wicr_and_gate1_hardening.sql` in its SQL Editor.
   - PostgREST schema cache will automatically reload via `NOTIFY pgrst, 'reload schema'`.
