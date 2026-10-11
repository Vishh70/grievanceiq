# GrievanceIQ — Comprehensive Local Pre-Staging Deep Audit Report
**Phase**: Pre-Staging Verification & Staging Infrastructure Proposal  
**Branch**: `feature/r3-staging-routing` (Commit `d95765b`)  
**Auditor**: Antigravity Autonomous Pair Programmer  
**Date**: October 11, 2026  
**Verdict**: **PASS WITH LIMITATIONS (Awaiting Staging Infrastructure Approval)**

---

## 1. Executive Summary

Following the green remote CI milestone (Frontend Run #38133519830, Backend Run #38133519764), a full deep audit was conducted across every first-party source file, model artifact, API endpoint, and core algorithm.

### Key Milestones Verified:
1. **Model Validation**: Real inference execution of all **9 Logistic Regression category models** and the **10-tree Random Forest relationship classifier** passed with empirical numeric verification.
2. **Algorithm Correctness**: Kahn's algorithm (DAG topological sort and cycle detection), DFS connected component grouping, Haversine spatial calculation, and tri-modal duplicate scoring were verified with zero mocks.
3. **Staging Isolation Safety**: Proved client-side URL inlining in Vite bundles. Identified the critical necessity of setting `VITE_API_URL` on Vercel Preview to neutralize `vercel.json`'s production proxy rewrite.
4. **Defect Discovery**: Uncovered 4 new operational and architectural risks/defects (Defects 008–011), including a critical production embedding dependency on the HuggingFace Inference API.

---

## 2. Staging Infrastructure Proposal & Cost Estimate (Step 1)

> [!IMPORTANT]
> **NO CLOUD RESOURCES HAVE BEEN PROVISIONED YET.** All work in this report was performed strictly in local isolated environments. The following costed proposal requires explicit user approval before provisioning.

| Infrastructure Component | Provider | Recommended Tier | Monthly Cost | Free-Tier Limitations & Operational Constraints | Required Credentials & Env Vars |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Staging Database & Auth** | Supabase | Free Tier | **$0.00** | Pauses after 7 days of inactivity (resumable via dashboard); 500MB DB limit; max 2 free projects per account. | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Queue / Cache Instance** | Upstash Redis | Serverless Free | **$0.00** | 10,000 commands/day cap; 256MB memory cap. Ideal for staging tests; supports native TLS direct connection string. | `REDIS_URL` (`rediss://...`) |
| **Staging Backend & ML Supervisor** | Render | Free Web Service | **$0.00** | 512MB RAM cap; spins down after 15 minutes of inactivity; 50-second cold-start delay on first request. | `APP_ENV=staging`, `NODE_ENV=production`, `PORT=5000`, `CLIENT_URL`, `JWT_SECRET`, `ADMIN_PASSWORD` |
| **Staging Frontend Preview** | Vercel | Hobby (Free) | **$0.00** | Max 100 deployments/day. Must configure `VITE_API_URL` scoped strictly to Preview. | `VITE_API_URL` (points to staging Render URL) |

**Total Estimated Infrastructure Cost: $0.00 / month.**

---

## 3. Real ML Model Validation Matrix

Tests were conducted directly against `backend/ml/models/` without mocks:

| Model / Flag | Architecture | Features / Inputs | Intercept | Coef L2 Norm | Threshold | Test Prob (`test_3issue_vector`) | Decision |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `road_damage_flag` | LogisticRegression | 384-dim dense embedding | -3.4148 | 21.7170 | 0.5900 | 1.0000 | **ACTIVE** |
| `roadside_flooding_flag` | LogisticRegression | 384-dim dense embedding | -3.0733 | 22.6578 | 0.6100 | 0.0861 | INACTIVE |
| `water_leakage_flag` | LogisticRegression | 384-dim dense embedding | -3.5042 | 21.5687 | 0.5100 | 1.0000 | **ACTIVE** |
| `electric_pole_flag` | LogisticRegression | 384-dim dense embedding | -3.1938 | 16.4895 | 0.5800 | 0.0010 | INACTIVE |
| `streetlight_flag` | LogisticRegression | 384-dim dense embedding | -3.2868 | 18.5467 | 0.5800 | 0.0012 | INACTIVE |
| `traffic_signal_flag` | LogisticRegression | 384-dim dense embedding | -3.4231 | 22.2260 | 0.6000 | 1.0000 | **ACTIVE** |
| `garbage_flag` | LogisticRegression | 384-dim dense embedding | -2.7142 | 20.6685 | 0.6500 | 0.0001 | INACTIVE |
| `tree_hazard_flag` | LogisticRegression | 384-dim dense embedding | -2.5431 | 20.9144 | 0.4300 | 0.2325 | INACTIVE |
| `drainage_flag` | LogisticRegression | 384-dim dense embedding | -3.4527 | 21.3585 | 0.6600 | 0.0005 | INACTIVE |

### Random Forest Relationship Classifier (`relationship_corrected_rf_10tree.joblib`):
- **Architecture**: 10-tree scikit-learn `RandomForestClassifier`, 20 engineered features.
- **Classes**: `0: Duplicate`, `1: Similar`, `2: Related`, `3: Independent`.
- **Validation Results**:
  - *Identical Duplicate Case*: Predicted `Duplicate` (prob = 1.0).
  - *Semantic Match but Distant Case*: Predicted `Related` (prob = 0.80, Duplicate = 0.10).
  - *Shared Infrastructure Area Case*: Predicted `Duplicate` (prob = 1.0).
  - *Unrelated Independent Events*: Predicted `Independent` (prob = 0.40, Duplicate = 0.30, Related = 0.30).

---

## 4. Core Algorithms Verification Matrix

| Algorithm | Implementation File | Verification Scenario | Expected Output | Observed Output | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Haversine Distance** | `duplicateDetectionService.js` | Exact same coordinate (0m) | 0.00m | 0.00m | **PASS** |
| **Spatial Decay** | `duplicateDetectionService.js` | 54.58m offset on 500m radius | 1 - (54.58/500) = 0.8908 | 0.8908 | **PASS** |
| **Temporal Decay** | `duplicateDetectionService.js` | 2h diff on 48h window | 1 - (2/48) = 0.9583 | 0.9583 | **PASS** |
| **Duplicate Scoring** | `duplicateDetectionService.js` | 0.5×1.0 + 0.3×0.8908 + 0.2×0.9583 | 0.9589 (>= 0.80) | 0.9589 (`isDuplicate: true`) | **PASS** |
| **DFS Graph Components** | `complaintGraphService.js` | 6 complaints, 2 duplicate edges, 1 related edge, 1 similar edge | 3 connected components; 'Similar' filtered out | Components: `[C1,C2,C3]`, `[C4,C5]`, `[C6]` | **PASS** |
| **Department Routing** | `routingService.js` | Rule mapping from `Road Damage` | `Road Department` | `Road Department` | **PASS** |
| **Kahn's Sort (Valid DAG)** | `taskDependencyService.js` | 4 tasks: Inspect -> Barricade -> Asphalt -> Check | 4 sequential stages | Stages: `[["T_INSPECT"],["T_BARRICADE"],["T_ASPHALT"],["T_FINAL_CHECK"]]` | **PASS** |
| **Kahn's Sort (Cycle Detection)** | `taskDependencyService.js` | Back-edge introduced: Check -> Inspect | `validDag: false`, cycle detected | `validDag: false`, detected all 4 cycle nodes | **PASS** |

---

## 5. First-Party Source File Audit Matrix

| Layer / File | Primary Responsibility | Error Handling & Fallbacks | Security & Auth | Audit Finding |
| :--- | :--- | :--- | :--- | :--- |
| `backend/src/app.js` | Express application factory, CORS, health probe | Dynamic probe against ML supervisor; Fail-closed CORS | Environment-based CORS (`APP_ENV=staging` blocks prod origins) | **PASS** |
| `backend/src/server.js` | HTTP bootstrap & graceful shutdown coordinator | Integrates `mlSupervisor` & `shutdownManager` | Strict signal traps (`SIGTERM`, `SIGINT`) | **PASS** |
| `backend/src/config/queue.js` | BullMQ connection factory & application client | Lazy connect, bounded retry strategy (3 attempts) | Isolated connection options from direct client | **PASS** |
| `backend/src/services/shutdownManager.js` | Coordinated 5-step application teardown | Immediate worker timer disarm, nonzero exit on timeout | Prevents leaked handles and orphan jobs | **PASS** |
| `backend/src/services/mlSupervisor.js` | Child process lifecycle for Python Flask | Escalates to SIGKILL at 2s; reports unconfirmed exit | Captures stdout/stderr, health checks before mark ready | **PASS** |
| `backend/src/services/embeddingService.js` | 384-dim vector generation | Uses HuggingFace API in prod, Xenova in dev/test | **Defect 008**: Missing HF_TOKEN or HF API throttling halts job | **LIMITATION** |
| `backend/src/services/aiService.js` | Gemini triage & extraction | Bounded retries + fallback to `gemini-3.5-flash-lite` | Sanitized markdown JSON fences | **PASS** |
| `backend/src/controllers/complaintController.js`| Complaint submission, filtering, retrieval | In-process fallback if BullMQ/Redis disconnected | JWT Bearer token authentication required | **PASS** |
| `backend/src/workers/complaintWorker.js` | Background job processing | Marks PROCESSING -> PROCESSED or error | Cleanly awaits models; handles missing vector gracefully | **PASS** |
| `frontend/src/services/api.js` | Axios HTTP client & interceptor | Global 401 redirect, 45s cold-start toast | JWT auto-attachment from `localStorage` | **PASS** |
| `frontend/src/pages/SubmitComplaint.jsx` | Citizen complaint submission form | Viewfinder cleanup, client validation | Form input sanitation, camera track disarm | **PASS** |
| `frontend/src/pages/AdminDashboard.jsx` | Operations command center | Filter state preservation, drawer modal | Admin-only route guard (`ProtectedRoute`) | **PASS** |

---

## 6. Newly Discovered Defects & Operational Risks

### Defect 008 (High Severity): Production Embedding OOM Guard Relies Exclusively on External HuggingFace API
- **Location**: [backend/src/services/embeddingService.js](file:///e:/new%20project/backend/src/services/embeddingService.js#L77-L105)
- **Root Cause**: When `NODE_ENV === 'production'`, `embeddingService.js` skips local `@xenova/transformers` to prevent Render 512MB RAM OOM crashes. However, it sends requests to `https://api-inference.huggingface.co/...`. If `HF_TOKEN` is unset in staging/production, HuggingFace returns HTTP 401/429/404, throwing:
  `Error: HuggingFace API embedding generation failed. No fallback embedding generated.`
- **Impact**: Without `HF_TOKEN`, every complaint processed on Render staging/production will fail in the background worker, leaving complaints in `PROCESSING` status or failing jobs.
- **Recommended Remediation**: Provide `HF_TOKEN` in Render staging configuration OR provide an in-process fallback using the supervised local Python ML service (which already has numpy and scikit-learn).

### Defect 009 (Medium Severity): `vercel.json` Production Rewrite Trap for Staging Preview
- **Location**: [vercel.json](file:///e:/new%20project/vercel.json#L5-L10)
- **Root Cause**: The static rewrite rule `"source": "/api/(.*)", "destination": "https://grievanceiq-gky1.onrender.com/api/$1"` applies globally across all Vercel deployments.
- **Impact**: If a Vercel Preview frontend is built without `VITE_API_URL`, Axios defaults to `baseURL: '/api'`, and Vercel transparently proxies test complaints to the **production database**.
- **Remediation**: Verified that setting `VITE_API_URL` compiles an absolute URL directly into the bundle. Must enforce Vercel Preview environment variable before any staging tests.

### Defect 010 (Low Severity): Unescaped Quotation in PostgREST Array Filtering for Multi-Word Departments
- **Location**: [backend/src/controllers/complaintController.js](file:///e:/new%20project/backend/src/controllers/complaintController.js#L185)
- **Root Cause**: `query.or(\`department_id.eq."\${department}",ml_departments.cs.{"\${department}"}\`)` relies on string interpolation. If `department` contains spaces or special characters, PostgREST array containment filter `ml_departments.cs.{"Road Department"}` can be malformed if not URL-encoded.
- **Remediation**: Sanitize and quote query parameters when filtering by department.

### Defect 011 (Low Severity): Zod Numeric Latitude/Longitude Validation Coercion in Ingestion Route
- **Location**: `backend/src/utils/validate.js`
- **Root Cause**: Form submissions sent via multipart/form-data transmit `lat` and `lng` as strings. If a client submits raw JSON with floats, `z.union([z.string(), z.number()])` accepts both, but standard string coercers may fail if a string `""` (empty string) is passed from an unlocated browser.
- **Remediation**: Use `z.preprocess()` to coerce empty strings to `null` or `undefined`.

---

## 7. Audit Verdict & Controlled Stop

- **Overall Audit Verdict**: **RESOLVED WITH CONTROLLED RECOVERY PLAN**
  - **Unit & Integration Suite**: 168/168 backend unit tests passed (18/18 suites); PGlite integration tests passed; Frontend production build passed (`tsc && vite build` in 4.72s).
  - **Pipeline Hardening**: 7-stage resilient worker architecture implemented, Stage 2 AI triage persisted before embedding, Hugging Face Router endpoint configured with 10s timeout, deterministic department resolver installed, Admin UI updated with AI processing badges and retry triggers.
  - **Dedicated Fix Branch**: `fix/ai-ml-pipeline-routing`.
- **Boundaries Maintained**:
  - Zero modifications to production database records during diagnostic phase.
  - No synthetic complaints submitted to live production URL.
  - Shared credentials protected and untouched.

---

## 8. Root Cause Analysis & Bug Fix: Production AI/ML Processing & Automatic Routing (Phases 1–10)

### 8.1 The Problem & Diagnosed Complaint IDs
On the production application dashboard (`https://grievanceiq-app.vercel.app/admin`), newly ingested complaints exhibited:
- **Category**: `General`
- **Priority**: `Low`
- **Severity**: `Unscored`
- **Department**: `Unassigned`
- **Status**: `Pending`

Specifically inspected short IDs:
- `#6873a9`, `#07d590`, `#feedff`, `#130969`, `#b60081`, `#281c1d`, `#f8ae5c`

### 8.2 Confirmed Root Causes

1. **Decommissioned Hugging Face Endpoint (HTTP 410 / DNS Failure)**:
   - In `backend/src/services/embeddingService.js`, the production embedding caller targeted the legacy URL `https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2`.
   - Hugging Face migrated external inference to the Router API (`https://router.huggingface.co/hf-inference/...`), causing requests from Render to fail with `ENOTFOUND` or HTTP 410/404.
2. **Premature Job Failure & All-or-Nothing Persistence Anti-Pattern**:
   - In `backend/src/workers/complaintWorker.js`, AI triage (Gemini) ran successfully in memory, but the database update was deferred until after embedding generation and ML classification.
   - When the embedding call threw an exception, execution immediately skipped to the outer `catch` block. Consequently, the complaint record was left with default/null fields (`category: null`, `severity_score: null`, `department_id: null`).
3. **Admin Dashboard Display Masking**:
   - `frontend/src/components/admin/ComplaintsTable.jsx` previously rendered only workflow `status` and masked missing AI fields via fallbacks: `c.category || 'General'`, `c.severityScore != null ? ... : 'Unscored'`, and `c.department || 'Unassigned'`.
   - The UI never displayed `processing_status` or `processing_error`, giving the illusion that complaints were created with "General" categories rather than being in a failed background processing state.
4. **Disconnected Redis & Startup Recovery Race**:
   - The production Render backend health probe (`https://grievanceiq-gky1.onrender.com/api/health`) reported `redis: "end"` (disconnected).
   - In `backend/src/server.js`, background jobs were processed in-memory. However, the startup recovery loop fired concurrently for all pending complaints before the Python ML service supervisor had confirmed model readiness.
5. **Broken Demo Seeder Script**:
   - `backend/scripts/seedDemoData.js` attempted to require a non-existent `complaintService.js`, bypassing the worker pipeline.

---

### 8.3 Implemented Fixes Matrix

| Component | Source File | Implemented Fix |
| :--- | :--- | :--- |
| **Embedding Pipeline** | `backend/src/services/embeddingService.js` | Updated endpoint to official Hugging Face Router URL (`https://router.huggingface.co/hf-inference/models/sentence-transformers/all-MiniLM-L6-v2/pipeline/feature-extraction`). Implemented 10s `AbortController` timeout, strict 384-dim vector normalization, finite number verification, sanitized error reporting, and exported readiness check `checkEmbeddingHealth()`. |
| **Worker Pipeline** | `backend/src/workers/complaintWorker.js` | Refactored into a resilient 7-stage pipeline. **Stage 2 immediately persists validated AI triage** (category, priority, severity, hazards, suggested action, initial department) before embedding. If embedding or ML fails, Stage 2 results remain safely stored, and `processing_status: 'FAILED'` with sanitized `processing_error` is recorded without falsely claiming `ai_processed: true`. |
| **Department Routing** | `backend/src/utils/departmentResolver.js` | Built deterministic canonical department resolver mapping Road Damage -> Road Dept, Garbage -> Sanitation Dept, Streetlight/Electric Pole -> Electricity Dept, Traffic Signal -> Traffic Dept, Water Leakage -> Water Dept, Drainage -> Drainage Dept, Tree Hazard -> Garden Dept. |
| **API & Controller** | `backend/src/controllers/complaintController.js`<br>`backend/src/routes/complaintRoutes.js` | Integrated `resolveDisplayDepartment`, exposed truthful `processingStatus` and `processingError` in `mapComplaint`, and created authenticated admin endpoint `POST /api/complaints/:id/retry` for idempotent job re-execution. |
| **Server Startup** | `backend/src/server.js` | Added Python ML service readiness check before enqueuing pending complaints. Replaced concurrent firing with bounded sequential recovery (batch size 20, 150ms pacing). |
| **Admin Dashboard UI** | `frontend/src/components/admin/ComplaintsTable.jsx`<br>`frontend/src/components/admin/ComplaintDrawer.jsx`<br>`frontend/src/pages/AdminDashboard.jsx` | Added dedicated `AI Processing` column with status badges (`Pending AI`, `Processing...`, `Processed`, `Failed`), hover error tooltips, drawer failure banner, and interactive "Retry AI" buttons connected to bounded polling. |
| **Demo Seeder** | `backend/scripts/seedDemoData.js` | Rewritten to invoke `processComplaintLogic` and real database intake schema. |

---

### 8.4 Regression Test Suite (Phase 8)

Two new dedicated regression test suites were created and verified:

1. **`backend/tests/unit/pipelineRegression.test.js`** (11 tests):
   - Verified deterministic department resolution for Road, Sanitation, Electricity, Traffic, Water, and Drainage categories.
   - Verified that unmapped or low-confidence categories return `null` rather than fabricating arbitrary departments.
   - Verified embedding edge cases (empty strings, non-numeric values, zero vectors) handled safely.
   - Verified `mapComplaint` accurately projects `processingStatus: 'FAILED'` and error messages without collapsing into default "Pending".
2. **`backend/tests/unit/complaintWorkerStages.test.js`** (2 tests):
   - **Stage 2 Persistence on Downstream Failure**: Simulated Hugging Face HTTP 429 failure. Verified DB immediately retained Stage 2 AI triage (Roads, High, Severity 8), recorded `processing_status: 'FAILED'`, recorded sanitized error, and kept `ai_processed: false`.
   - **Full End-to-End Success**: Verified all 7 stages execute cleanly, marking `processing_status: 'PROCESSED'` and `ai_processed: true` with ML labels and probabilities.

**Test Execution Results**:
- Backend Unit Tests: **18/18 test suites passed, 168/168 tests passed** (0 failures).
- Backend Integration Tests: **2/2 active test suites passed, 4/4 tests passed** (0 failures).
- Frontend Production Build: **Passed in 4.72s (`tsc && vite build`)**, 0 errors.
- `git diff --check`: **Clean (0 trailing whitespace or formatting errors)**.

---

### 8.5 Required External Configuration

To ensure background embedding generation functions on Render without OOM risk:
- **Environment Variable Name**: `HF_TOKEN`
- **Location**: Render Backend Dashboard -> Environment -> Environment Variables
- **Value**: A valid Hugging Face User Access Token (Read permissions).
- **Note**: With `HF_TOKEN` configured, the backend accesses the Hugging Face Router endpoint with authenticated rate limits. If `HF_TOKEN` is absent in production, local `@xenova/transformers` remains disarmed to protect Render's 512MB RAM limit, and complaints will cleanly record an explicit failure status (`HF_TOKEN required for production embedding inference`) rather than crashing silently.

---

### 8.6 Safe Reprocessing Plan for Affected Production Records

The 7 previously affected complaints (`#6873a9`, `#07d590`, `#feedff`, `#130969`, `#b60081`, `#281c1d`, `#f8ae5c`) should **NOT** be bulk-modified directly in SQL. Instead, execute the following safe, authenticated, idempotent procedure:

1. **Deploy the fix branch `fix/ai-ml-pipeline-routing`** to Render and Vercel.
2. **Confirm `HF_TOKEN` is set** in Render environment variables and `/api/health` reports embedding service ready.
3. **Log in as Administrator** on the production dashboard: `https://grievanceiq-app.vercel.app/admin`.
4. Locate the affected complaints in the refreshed **Complaints Intelligence** table.
   - Each complaint will now display an `AI: Failed` or `AI: Pending` badge.
5. Click the **Retry** icon button next to each affected complaint (or click "Retry AI" inside the complaint details drawer).
   - This invokes `POST /api/complaints/:id/retry` with the administrator's JWT.
   - The backend sets `processing_status: 'PENDING'`, clears stale errors, and processes the complaint through the 7-stage pipeline.
   - The dashboard bounded poller will automatically refresh the table within 5-10 seconds, displaying the updated Category, Priority, Severity Score, and Recommended Department.
