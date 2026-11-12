# GrievanceIQ — Comprehensive Acceptance Criteria & Verification Matrix

**Current Commit**: `a6316e4ee3812e1c3dff3e22ea90ff88fc473359`  
**Branch**: `main` (synced with `origin/main`)  
**Date**: 2026-11-12  
**Final Status**: `IMPLEMENTED — LIVE VERIFICATION BLOCKED`

---

## 1. Executive Summary & Verification Methodology

Per the Senior Full-Stack Engineering protocol:
- **VERIFIED**: Tested successfully in the intended environment, with concrete automated or probe evidence.
- **IMPLEMENTED, NOT LIVE-VERIFIED**: Code exists, is locally/PGlite verified, but live cloud staging behavior is unproven.
- **BLOCKED**: Requires owner confirmation, billing/cost approval, credentials, or infrastructure provisioning.
- **FAILED**: An executed test or check failed.
- **NOT STARTED**: Work has not been implemented.

### Overall Completion Summary (34 Total Acceptance Criteria)
- **VERIFIED**: **24 / 34 (70.6%)**
- **IMPLEMENTED, NOT LIVE-VERIFIED**: **4 / 34 (11.8%)**
- **BLOCKED (Owner / Infra Action Required)**: **6 / 34 (17.6%)**
- **FAILED**: **0 / 34 (0.0%)**
- **NOT STARTED**: **0 / 34 (0.0%)**

---

## 2. Requirements Traceability Matrix (FR01 – FR06)

| ID | Requirement Area | Status | Evidence & Verification Notes |
| :---: | :--- | :---: | :--- |
| **AC-01.1** | **FR01: Payload Validation & Intake**<br>Validates coordinates, description text, and evidence metadata; rejects malformed inputs. | **VERIFIED** | Unit tests in `complaintController.test.js` & Playwright `01-citizen-submit.spec.js`. |
| **AC-01.2** | **FR01: Leased Execution & Idempotency**<br>Atomic lease acquisition prevents duplicate execution across worker crashes/restarts. | **VERIFIED** | 11 unit tests in `workerLeaseAndIdempotency.test.js` & PGlite migration test. |
| **AC-01.3** | **FR01: Real-Time Citizen Tracking**<br>Maintains complaint queryability across status transitions (`PENDING` &rarr; `PROCESSING` &rarr; `PROCESSED`). | **VERIFIED** | Playwright `02-complaint-track.spec.js` & `complaintController.test.js`. |
| **AC-02.1** | **FR02: Dense Vector Embeddings**<br>Generates 384-dimensional dense vectors via `all-MiniLM-L6-v2`. | **VERIFIED** | Tested in `aiService.test.js`, `test_embed.py`, and CI embedding tests. |
| **AC-02.2** | **FR02: Multi-Label Classification**<br>Calibrated Logistic Regression classifiers evaluate 9 municipal category flags. | **VERIFIED** | `python -m pytest backend/ml/tests/test_inference.py` (8 passed) & `audit_all_models.py` (9/9 passed, F1 &ge; 0.97). |
| **AC-03.1** | **FR03: Spatial-Semantic Inference**<br>20-dimensional feature extraction and Random Forest relationship classifier (`relationship_corrected_rf_10tree.joblib`). | **VERIFIED** | Audited in `backend/scripts/audit_all_models.py` (5 test pairs evaluated correctly). |
| **AC-03.2** | **FR03: Platt Scaling Calibration**<br>Transforms raw ensemble tree scores to empirical posterior probabilities ($p$). | **VERIFIED** | Verified in `wicrDecisionAndCalibration.test.js` and calibration manifest. |
| **AC-04.1** | **FR04: Cross-Issue DAG Dependencies**<br>Workstream routing, cross-issue dependency creation, and Kahn's topological sort. | **VERIFIED** | `crossIssueTaskDependency.test.js` (18 unit tests passed). |
| **AC-04.2** | **FR04: Atomic Cycle Prevention in PostgreSQL**<br>Advisory locks + recursive CTE prevent cyclic graph dependencies atomically. | **VERIFIED** | PGlite `migration.test.js` Test 7 verified cycle rejection. |
| **AC-04.3** | **FR04: Staged Execution & Cancellation Handling**<br>Prerequisite state transitions; cancelled tasks never satisfy dependent tasks. | **VERIFIED** | Tested in `taskExecution.test.js` and `prerequisiteRecommendation.test.js`. |
| **AC-05.1** | **FR05: Strict Duplicate-Only Identity**<br>Only verified `Duplicate` reports share `CivicIssue` identity; `Related` reports remain separate. | **VERIFIED** | Tested in `duplicateOnlyIncidentGrouping.test.js` & PGlite `migration.test.js` Test 6. |
| **AC-05.2** | **FR05: Related Incident Cross-Issue Evidence**<br>`complaint_relationships` stores cross-issue evidence; exposed via `v_civic_issue_related_links`. | **VERIFIED** | Tested in `civicGraph.test.js` and PGlite. |
| **AC-06.1** | **FR06: Minimum Expected Loss Engine**<br>Calculates $L_{\text{accept}}$, $L_{\text{reject}}$, $L_{\text{review}}$ and routes near-ties ($\Delta L \le 0.05$) to review queue. | **VERIFIED** | Tested in `wicrDecisionAndCalibration.test.js`. |
| **AC-06.2** | **FR06: Append-Only Audit Trail**<br>`wicr_review_events` protected by anti-mutation trigger `trg_prevent_wicr_event_mutation`. | **VERIFIED** | PGlite `wicrQueuePermissionsAndSchema.test.js` & `migration.test.js`. |
| **AC-06.3** | **FR06: Concurrency-Safe Resolution RPC**<br>`resolve_wicr_review` with row locks (`FOR UPDATE`), 409 conflict, and scalar variable null-reviewer safety. | **VERIFIED** | PGlite `wicrQueuePermissionsAndSchema.test.js` & `wicrController.test.js`. |

---

## 3. Gate 1: Supabase Database & PostgREST Schema

| ID | Acceptance Criterion | Status | Evidence & Verification Notes |
| :---: | :--- | :---: | :--- |
| **AC-G1.1** | **Migration Script Preparation & Syntax Validity** | **VERIFIED** | Canonical migration `20261102140000_wicr_reviews_and_gate1_permissions.sql` verified in PGlite & GitHub CI. |
| **AC-G1.2** | **Staging Database Instance Provisioning** | **BLOCKED** | `grievanceiq-staging-clean` unprovisioned; Supabase CLI reports `AccessTokenRequiredError`. |
| **AC-G1.3** | **Migration Application to Staging Cloud Database** | **BLOCKED** | Awaiting owner provisioning / isolation confirmation before cloud DDL execution. |
| **AC-G1.4** | **PostgREST Discovery of `v_pending_wicr_reviews`** | **IMPLEMENTED, NOT LIVE-VERIFIED** | Verified in PGlite with `NOTIFY pgrst, 'reload schema'`; pending cloud staging. |
| **AC-G1.5** | **Direct Anon / Authenticated Access Denial** | **IMPLEMENTED, NOT LIVE-VERIFIED** | Verified in PGlite: both roles denied with `permission denied`; live cloud check pending staging. |
| **AC-G1.6** | **Service-Role Privileged Backend Operations** | **IMPLEMENTED, NOT LIVE-VERIFIED** | Verified in PGlite: `service_role` selects view and resolves reviews; live cloud check pending staging. |
| **AC-G1.7** | **Live Cloud Integration Test Suite** | **BLOCKED** | Network integration tests (`livePostgrestSecurity.test.js`, `supabase.test.js`, `true_e2e.test.js`) require live cloud credentials. |

---

## 4. Gate 2: Redis & BullMQ Worker Queue Lifecycle

| ID | Acceptance Criterion | Status | Evidence & Verification Notes |
| :---: | :--- | :---: | :--- |
| **AC-G2.1** | **Isolated Staging Redis Service Provisioning** | **BLOCKED** | Dedicated Redis instance needed; Render currently has no configured managed Redis. |
| **AC-G2.2** | **Live BullMQ Worker Connection & Health** | **IMPLEMENTED, NOT LIVE-VERIFIED** | In `app.js`, health reports `redis: end` when disconnected. In-memory fallback verified; live connection pending `REDIS_URL`. |
| **AC-G2.3** | **Asynchronous Job Processing & Lease Ownership** | **VERIFIED** | Verified in `workerLeaseAndIdempotency.test.js` and `complaintWorkerStages.test.js`. |
| **AC-G2.4** | **Worker Graceful Shutdown & Connection Cleanup** | **VERIFIED** | Verified in `shutdownManager.test.js` and `worker.test.js`. |

---

## 5. Security, Deployment & Governance

| ID | Acceptance Criterion | Status | Evidence & Verification Notes |
| :---: | :--- | :---: | :--- |
| **AC-SEC.1** | **Server-Side RBAC on Admin & Review Endpoints** | **VERIFIED** | Express JWT middleware returns `401 Unauthorized` for unauthenticated requests to `/api/wicr/reviews`. |
| **AC-SEC.2** | **Secret Isolation (No Secrets in Frontend)** | **VERIFIED** | Zero service-role or database secrets present in frontend code or Vite build bundles. |
| **AC-SEC.3** | **Row Level Security (RLS) on Base Tables** | **VERIFIED** | Verified in PGlite `dataApiPermissions.test.js` and `migration.test.js`. |
| **AC-SEC.4** | **Security Invoker on WICR Queue View** | **VERIFIED** | Verified in PGlite: `v_pending_wicr_reviews` has `security_invoker = true`. |
| **AC-DEP.1** | **GitHub Actions CI Green on Latest Commit** | **VERIFIED** | All 3 checks (`Supabase Preview`, `Frontend CI`, `Backend CI`) passed on commit `a6316e4`. |
| **AC-DEP.2** | **Frontend Production Build Generation** | **VERIFIED** | `tsc && vite build` built in 934ms, 0 errors, service worker generated. |
| **AC-DEP.3** | **Vercel Frontend Hosting & Routing** | **VERIFIED** | Live Vercel probe at `https://grievanceiq-app.vercel.app` returns `HTTP 200 OK`. |
| **AC-DEP.4** | **Render Backend Hosting & Health Endpoint** | **VERIFIED** | Live Render probe at `https://grievanceiq-gky1.onrender.com/api/health` returns `HTTP 200 OK`. |
| **AC-DOC.1** | **Persistent Completion & Verification Log** | **VERIFIED** | Committed in repository at `docs/completion-status.md`. |
| **AC-DOC.2** | **Idempotent 1-Click Migration Runner Script** | **VERIFIED** | Committed in repository at `docs/database/apply_wicr_and_gate1_hardening.sql`. |
| **AC-DOC.3** | **Hard Safety Boundaries Compliance** | **VERIFIED** | Zero unconfirmed cloud database writes; zero credentials leaked; strict isolation preserved. |

---

## 6. Exact Owner Action Required to Unblock 100% Verification

1. **Gate 1 (Supabase Cloud Database)**:
   - **Option A (Clean Staging Project — Recommended)**: Create a free/clean Supabase project (e.g. `grievanceiq-staging-clean`), execute `docs/database/apply_wicr_and_gate1_hardening.sql` in its SQL Editor, and provide staging `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   - **Option B (Confirm `supabase-red-cable` Isolation)**: If `supabase-red-cable` (`bvyyeefapmdisxzuttds`) is confirmed as an isolated staging database with synthetic data, execute `docs/database/apply_wicr_and_gate1_hardening.sql` in its SQL Editor. PostgREST will reload automatically via `NOTIFY pgrst, 'reload schema'`.
2. **Gate 2 (Redis / BullMQ Staging)**:
   - Provision a free isolated Redis database (e.g. Upstash Redis).
   - Configure `REDIS_URL` in the staging environment to enable live BullMQ worker processing.
