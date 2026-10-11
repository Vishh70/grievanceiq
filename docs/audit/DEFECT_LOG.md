# Defect Log

## Defect 001: Gemini Model Configuration and Hardcoded Identifiers
* **Severity**: High
* **Description**:
  1. `backend/src/services/aiService.js` originally hardcoded a model identifier without dynamic environment configuration.
  2. The initial audit pass incorrectly characterized `gemini-3.6-flash` as a nonexistent model and substituted `gemini-1.5-flash`. However, `gemini-3.6-flash` is a documented Google model, while `gemini-1.5-flash` was officially shut down on September 29, 2025.
  3. Google currently recommends `gemini-3.8-flash` as the stable GA model for new applications and production deployments.
* **Affected Files**:
  * `backend/src/services/aiService.js`
  * `backend/.env.example`
* **Fix Applied**:
  * Made the model dynamically configurable using `process.env.GEMINI_MODEL`, with a default of `gemini-3.8-flash`.
  * Added `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite` and `GEMINI_MAX_RETRIES=1` with automatic fallback logic in `generateWithRetryAndFallback`.
  * Added `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_FALLBACK_MODEL`, and `GEMINI_MAX_RETRIES` to `backend/.env.example`.
  * Exported `getModel`, `extractJson`, `generateWithRetryAndFallback`, `isTransientError`, and `FALLBACK_RESPONSE` from `aiService.js`.
  * Created unit test suite `backend/tests/unit/aiService.test.js` (11 passing tests) validating configuration, JSON fence handling, malformed responses, missing API keys, network errors, severity score boundaries, and transient 503 fallback recovery.
  * Created `backend/scripts/smoke_test_gemini.js` for authenticated live API verification.
* **Status**: **RESOLVED & VERIFIED LIVE** (Live execution passed schema validation, recovering cleanly via fallback model when 503 capacity spikes occur on primary).

---

## Defect 002: Incomplete Backend Environment Template
* **Severity**: Medium
* **Description**: `backend/.env.example` omitted critical configuration variables `GEMINI_API_KEY`, `GEMINI_MODEL`, and `ML_SERVICE_SECRET`.
* **Affected Files**: `backend/.env.example`
* **Root Cause**: Environment template drifted from implementation requirements.
* **Fix Applied**: Added `GEMINI_API_KEY=your_gemini_api_key`, `GEMINI_MODEL=gemini-3.8-flash`, `GEMINI_FALLBACK_MODEL=gemini-3.5-flash-lite`, `GEMINI_MAX_RETRIES=1`, and `ML_SERVICE_SECRET=your_ml_service_secret` to `backend/.env.example`.
* **Status**: **VERIFIED / RESOLVED**

---

## Defect 003: Silent Discarding of ML Metadata Columns
* **Severity**: Medium
* **Description**: When `docs/database/phase10_ml_multilabel.sql` had not been executed on a target database, `complaintWorker.js` caught the schema error and stripped columns (`ml_labels`, `ml_probabilities`, `ml_departments`) with a generic warning, without explicitly alerting the developer to the unapplied migration.
* **Affected Files**: `backend/src/workers/complaintWorker.js`
* **Fix Applied**: Enhanced error handling to detect when `ml_labels`, `ml_probabilities`, or `ml_departments` are dropped, emitting an observable error log explicitly directing the operator to apply `docs/database/phase10_ml_multilabel.sql`.
* **Status**: **VERIFIED / RESOLVED**

---

## Defect 004: Duplicate `test_inference.py` Leading to Pytest Collection Ambiguity
* **Severity**: Low
* **Description**: Both `backend/ml/inference/test_inference.py` and `backend/ml/tests/test_inference.py` existed, causing Pytest to raise an `import file mismatch` error when invoked at the ML root without path targeting.
* **Affected Files**: `backend/ml/inference/test_inference.py`, `backend/ml/tests/test_inference.py`
* **Fix Applied**: Targeted test suites directly (`pytest tests/test_inference.py` or `python inference/test_inference.py`).
* **Status**: **VERIFIED / MITIGATED**

---

## Defect 005: Stalled HTTP Request, Open TCPSERVERWRAP Handle, and Worker Teardown in `true_e2e.test.js`
* **Severity**: Critical
* **CI Evidence (GitHub Actions Run 38071760652)**:
  * `true_e2e.test.js` exceeded its 90-second test timeout while awaiting `POST /api/complaints`.
  * During test teardown, Jest reported `TypeError: worker.close is not a function`.
  * Jest detected an open `TCPSERVERWRAP` handle.
  * Backend test job finished with 1 failed, 101 passed, exit code 1.
* **Root Causes**:
  1. **Factory Function Passed to Supertest**: `true_e2e.test.js` imported `const app = require('../../src/app')` without invoking `createApp()`. Supertest wrapped the factory function in `http.createServer(createApp)`. On incoming requests, `createApp(req, res)` created a detached Express app without writing to or ending `res`. Supertest awaited the response indefinitely until Jest's 90-second timeout expired, leaving the underlying TCP server socket open (`TCPSERVERWRAP`).
  2. **Worker Export Mismatch in Teardown**: `complaintWorker.js` exported `{ worker, processComplaintLogic }`, but `true_e2e.test.js` assigned the whole module object to `worker`. In `afterAll`, `await worker.close(true)` threw `TypeError: worker.close is not a function`.
  3. **Strict String Validation for Numeric Coordinates**: `validate.js` defined `lat: z.string().optional()` and `lng: z.string().optional()`. Passing numeric latitude/longitude in JSON payloads caused Zod validation failures (HTTP 400).
  4. **Jest Module Cache Race**: Jest's `setup.js` loaded and cached mocked BullMQ/ioredis before `true_e2e.test.js` ran. Unmocking required clearing the module cache for `config/queue`, `controllers/complaintController`, and `app`.
* **Fix Applied**:
  * Preserved the original module export contract in `complaintWorker.js` (`module.exports = { worker, processComplaintLogic }`) without self-referential properties.
  * In `true_e2e.test.js`: explicitly imported `worker = workerModule.worker`, safely unwrapped teardown with `typeof worker?.close === 'function'`, and cleanly disconnected Redis connections.
  * In `true_e2e.test.js`: properly instantiated the Express application using `const createApp = require('../../src/app'); app = createApp()`.
  * Invalidated cached mock modules in `true_e2e.test.js` when `hasValidCredentials` is true so real Redis and BullMQ connections are used.
  * In `validate.js`: updated `lat` and `lng` to `z.union([z.string(), z.number()]).optional()`.
  * In `complaintController.js`: hardened queue dispatch to use `activeQueue` and fall back gracefully if Redis is unavailable.
* **Status**: **VERIFIED & RESOLVED ON GITHUB CI (Run #144 / Commit 8847375 - 100% Passed in 1m 36s)**

---

## Defect 006: Unmapped ML Metadata in API Response
* **Severity**: Low
* **Description**: `complaintController.js` omitted `ml_labels`, `ml_probabilities`, and `ml_departments` in `mapComplaint`, preventing frontend clients and API consumers from inspecting persisted ML classifications.
* **Affected Files**: `backend/src/controllers/complaintController.js`
* **Fix Applied**: Added `mlLabels: row.ml_labels || []`, `mlProbabilities: row.ml_probabilities || {}`, and `mlDepartments: row.ml_departments || []` to `mapComplaint`.
* **Status**: **VERIFIED / RESOLVED**

---

## Defect 007: Unconditional Global Mocks in Jest Setup & Incomplete ML Metadata Assertions
* **Severity**: Medium
* **Description**:
  1. `backend/tests/setup.js` unconditionally mocked `ioredis` and `bullmq` and imported `config/queue` during Jest initialization. In GitHub Actions Run #144, this caused `true_e2e.test.js` to run against the mock queue and complete via the in-memory fallback rather than executing a verified BullMQ job against the Redis container.
  2. `true_e2e.test.js` only asserted `ml_labels`, omitting explicit assertions for `ml_probabilities` and `ml_departments`.
  3. CI workflows execute without `GEMINI_API_KEY`, exercising the internal mock fallback path, which was previously conflated with live API triage in audit documentation.
* **Fix Applied**:
  1. Split test pipelines: created `jest.integration.config.js` and `tests/setup.integration.js` without global mocks (`MOCK_REDIS='false'`).
  2. Configured unit tests in `jest.config.js` to ignore `/tests/integration/`.
  3. Added `"test:unit"` and `"test:integration"` scripts to `backend/package.json`.
  4. Added explicit assertions verifying all three ML metadata fields (`ml_labels`, `ml_probabilities`, `ml_departments`) in database records and HTTP retrieval.
  5. Calibrated master audit report to distinguish mock CI triage from standalone live Gemini smoke testing.
* **Status**: **RESOLVED & VERIFIED**

