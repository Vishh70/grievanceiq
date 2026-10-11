# ML Model Validation Report

## 1. MiniLM Embedding Validation
* **Implementation**: `backend/src/services/embeddingService.js`
* **Model**: `Xenova/all-MiniLM-L6-v2` (Local development) / `sentence-transformers/all-MiniLM-L6-v2` (Hugging Face API for production).
* **Output**: Produces a 384-dimensional dense float vector with L2 normalization (`normalize: true`).
* **Integrity Checks**: Validated in `tests/embedding.test.js`. Protects against non-finite values, zero-magnitude vectors, and out-of-range cosine similarity scores.
* **Production Error Handling**: Hugging Face API errors throw an explicit error rather than silently injecting dummy vectors.
* **CI Verification**: Successfully executed and verified in remote CI step `Run real MiniLM smoke test` on [Backend CI Run #146](https://github.com/Vishh70/grievanceiq/actions/runs/38117823915) (commit `c99ca86fa2e5b8e7fe74ff77abe258b5824b7c66`).

## 2. Multi-Label Logistic Regression Classifier
* **Architecture**: A dictionary of 9 independent `sklearn.linear_model.LogisticRegression` estimators (`multilabel_classifier.joblib`).
* **Thresholds**: Defined in `multilabel_thresholds.csv`:
  * Road damage: 0.59
  * Roadside flooding: 0.61
  * Water leakage: 0.51
  * Electric pole: 0.58
  * Streetlight: 0.58
  * Traffic signal: 0.60
  * Garbage: 0.65
  * Tree hazard: 0.43
  * Drainage: 0.66
* **Fallback Behavior**: If no probability exceeds the category threshold, the label with the single highest raw probability is selected.
* **Evaluation Baseline**: Synthetic held-out test set records 98.53% Micro-F1 and 98.49% Macro-F1 (`multilabel_evaluation_metrics.json`).

## 3. Random Forest Relationship Classifier
* **Model Artifact**: `relationship_corrected_rf_10tree.joblib` (10 estimators).
* **Feature Vector (20 Features, Strict Order)**:
  1. `semantic_similarity`
  2. `location_score`
  3. `temporal_score`
  4. `duplicate_score`
  5. `duplicate_flag`
  6. `same_category`
  7-13. `category_a_*` (Multi-hot for 7 categories)
  14-20. `category_b_*` (Multi-hot for 7 categories)
* **Alignment**: Verified exact feature matching between `src/utils/relationshipFeatures.js`, `train_relationship.py`, and `grievanceiq_inference.py`.
* **Classes**: 0: Duplicate, 1: Similar, 2: Related, 3: Independent.
* **Evaluation Baseline**: Reported test accuracy: 93.30%, Macro-F1: 89.99% on synthetic held-out pairs.

## 4. Google Gemini Generative AI (Model Triage)
* **Implementation**: `backend/src/services/aiService.js`
* **Configuration**:
  * Primary Model: Configurable via `process.env.GEMINI_MODEL`, defaulting to `gemini-3.8-flash`.
  * Fallback Model: Configurable via `process.env.GEMINI_FALLBACK_MODEL`, defaulting to `gemini-3.5-flash-lite`.
  * Retries: `process.env.GEMINI_MAX_RETRIES` (default: 1 bounded retry on transient 503 / 429 errors).
* **Model Availability & Lifecycle Notes**:
  * `gemini-3.6-flash`: Real, documented Google model.
  * `gemini-3.8-flash`: Google's current stable GA recommendation for production and new applications.
  * `gemini-3.5-flash-lite`: Validated operational model with fast inference and zero demand-spike drops.
  * `gemini-1.5-flash`: Retired and shut down on September 29, 2025; prohibited in production.
* **Unit Testing (`tests/unit/aiService.test.js`)**:
  * 11 unit tests passing: default model selection, custom model override, JSON fence extraction, malformed output fallback, missing API key fallback, network failure fallback, severity score clamping (1-10), and automatic fallback recovery upon 503 errors.
* **Live Smoke Test (`scripts/smoke_test_gemini.js`)**:
  * Direct probe of `gemini-3.8-flash` detected provider-side 503 high demand spike.
  * Application layer automatically executed bounded retry and gracefully degraded to `gemini-3.5-flash-lite`.
  * Execution status: **PASSED (HTTP 200)** — live structured triage payload generated with Category `Electricity`, Priority `Critical`, Severity `10`, Safety Hazards, and Suggested Action.
  * Schema validation: 100% compliant across all 7 fields.

## 5. Model Serialization and Runtime Status
* Both `.joblib` model files load without deserialization errors in Python 3.12 (`test_inference.py` passed, exit code 0).
* **Backend CI Run #146**: Verified passing on commit `c99ca86fa2e5b8e7fe74ff77abe258b5824b7c66` ([View Backend CI Run #146](https://github.com/Vishh70/grievanceiq/actions/runs/38117823915)).
  * **Unit Test Suites**: 12 of 12 suites passed, 110 of 110 unit tests passed without live infrastructure dependencies.
  * **Integration Test Suites**: 3 of 3 suites passed (`worker.test.js`, `supabase.test.js`, `true_e2e.test.js`), 3 of 3 integration tests passed under unmocked runner `jest.integration.config.js`.
  * **Total Test Execution**: 15 of 15 test suites passed, 113 of 113 tests passed (0 failures).
  * **MiniLM Smoke Test**: Step `Run real MiniLM smoke test` passed cleanly in CI.
  * **Real Redis & BullMQ Execution**: Real Redis connection verified (`PONG`); BullMQ worker readiness and two processed complaint jobs (`[BullMQ Worker] Processing job...`) confirmed with zero `[MockBullMQ]` or in-memory fallback logs.
  * **ML Metadata Persistence Assertions**: Explicit assertions verified for `ml_labels`, `ml_probabilities`, and `ml_departments` in Supabase records and returned via API response `GET /api/complaints/:id`.
* **Generative AI Triage**: Standalone live Gemini triage confirmed operational with dynamic model selection and automatic fallback to `gemini-3.5-flash-lite` on transient 503 errors (CI executes verified internal fallback triage path).
