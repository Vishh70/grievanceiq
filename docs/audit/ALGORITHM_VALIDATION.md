# Algorithm Validation Report

## 1. Cosine Similarity & Vector Operations
* **File**: `backend/src/services/embeddingService.js`
* **Formula**: $\frac{A \cdot B}{\|A\| \|B\|}$
* **Edge-case Protection**:
  * Safeguards against division by zero (returns `0` if $\|A\| = 0$ or $\|B\| = 0$).
  * Handles non-finite elements (returns `0` if any value is `NaN` or `Infinity`).
  * Clamps floating-point precision overflow using `Math.max(-1, Math.min(1, similarity))`.
  * Verified in `tests/embedding.test.js`.

## 2. Haversine Distance & Spatial Decay
* **File**: `backend/src/services/duplicateDetectionService.js`
* **Formula**: Great-circle distance using spherical trigonometry with mean Earth radius of 6,371,000 meters.
* **Validation**:
  * Returns `Infinity` for invalid or missing coordinates.
  * Validates coordinates with `Number.isFinite`.
  * Linear spatial decay: 0 m $\to$ 1.0, 500 m $\to$ 0.0, $>500$ m $\to$ 0.0.

## 3. Hybrid Duplicate Scoring
* **Formula**:
  $$\text{Score} = 0.50 \times \text{Semantic} + 0.30 \times \text{Location} + 0.20 \times \text{Temporal}$$
* **Thresholds**:
  * Overall Duplicate Score $\ge 0.80$
  * Semantic Minimum Score $\ge 0.75$
  * Requires valid location data within a 500-meter radius.
* **Verification**:
  * Identical complaints at distant locations correctly yield low scores (`isDuplicate = false`).
  * Identical complaints at proximate locations within 48 hours produce `isDuplicate = true`.
  * Verified against edge cases (missing coordinates, invalid timestamps, zero vectors).

## 4. Graph Connected Components & Civic Issue Grouping
* **Files**: `backend/src/services/complaintGraphService.js` & `backend/src/services/civicIssueService.js`
* **Mechanism**:
  * Complaints form graph vertices.
  * Only `Duplicate` and `Related` relationships produce undirected graph edges.
  * `Similar` and `Independent` edges are omitted to prevent premature or inappropriate merges.
  * Connected components are resolved using Depth-First Search (DFS).
* **Civic Issue Aggregation**:
  * Representative Location: Arithmetic mean of valid latitude and longitude coordinates.
  * Priority: Aggregated to the highest severity among constituent complaints (`Critical` > `High` > `Medium` > `Low`).
  * Title: Deterministically generated based on component categories.

## 5. Deterministic Routing Rules
* **File**: `backend/src/services/routingService.js`
* **Rules Source**: `backend/data/routing_rules.json`
* **Mapping Matrix**:
  * Road Damage $\to$ Road Department
  * Roadside Flooding $\to$ Drainage Department
  * Water Leakage $\to$ Water Department
  * Electric Pole $\to$ Electricity Department
  * Streetlight $\to$ Electricity Department
  * Traffic Signal $\to$ Traffic Department
  * Garbage $\to$ Sanitation Department
  * Tree Hazard $\to$ Garden Department
  * Drainage $\to$ Drainage Department
* **Confidence Metric**: Expressed transparently as label frequency ratios across complaints rather than misleading calibrated model probabilities.

## 6. DAG Creation & Kahn's Topological Sort
* **File**: `backend/src/services/taskDependencyService.js`
* **Algorithm**:
  * Computes in-degrees for all tasks within an issue.
  * Enqueues tasks with in-degree 0 into distinct execution stages.
  * Breaks ties deterministically: sorts by task priority (`Critical` > `High` > `Medium` > `Low`), then creation timestamp, then task ID.
  * Cycle Detection: Returns `validDag: false` and extracts cycle task IDs if Kahn's queue empties before all tasks are placed.
* **Execution Enforcement**:
  * Self-dependencies are rejected.
  * Blocks execution of dependent tasks until all parent tasks are `COMPLETED`.

## 7. Remote CI Validation & Verification Status
All algorithmic modules have been verified across isolated unit test suites and end-to-end integration workflows on remote CI infrastructure:
* **Backend CI Run #146**: Verified passed cleanly on commit `c99ca86fa2e5b8e7fe74ff77abe258b5824b7c66` ([View Backend CI Run #146](https://github.com/Vishh70/grievanceiq/actions/runs/38117823915)).
  * **Test Suite Metrics**: 12 of 12 unit suites passed (110 unit tests); 3 of 3 integration suites passed (3 integration tests under unmocked runner `jest.integration.config.js`). Total: 15/15 suites and 113/113 tests passed.
  * **Real Redis & Queue State**: Real Redis connection verified with `PONG`; BullMQ worker readiness and two processed complaint jobs (`[BullMQ Worker] Processing job...`) confirmed without any `[MockBullMQ]` or in-memory fallback execution.
  * **MiniLM Embedding Step**: Remote CI step `Run real MiniLM smoke test` passed successfully.
  * **Algorithmic Graph Grouping & Routing in CI**: During `true_e2e.test.js`, two distinct complaints were enqueued, processed by BullMQ, embedded via MiniLM, evaluated for relationships, and grouped into Civic Issues using DFS connected components.
  * **Persisted ML & Department Assertions**: Validated persistence and API responses for `ml_labels`, `ml_probabilities`, and `ml_departments` in both database records and `GET /api/complaints/:id`.

