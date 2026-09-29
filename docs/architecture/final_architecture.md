# GrievanceIQ Final Architecture

## System Flow

```text
                       CITIZEN
                          ↓
                     COMPLAINT
                          ↓
                 ┌─────────────────┐
                 │ AI / ML LAYER   │
                 │                 │
                 │ Embedding       │
                 │ Duplicate       │
                 │ Relationship    │
                 │ Classification  │
                 └────────┬────────┘
                          ↓
                  CIVIC ISSUE GROUP
                          ↓
                 ISSUE TYPE LABELS
                          ↓
                 DEPARTMENT ROUTING
                          ↓
                   WORKSTREAMS
                          ↓
                      TASKS
                          ↓
               DEPENDENCY DAG
                          ↓
              CYCLE DETECTION
                          ↓
             TOPOLOGICAL SORT
                          ↓
             EXECUTION STAGES
                          ↓
                 TASK READINESS
                          ↓
                HUMAN OPERATOR
                          ↓
                  TASK STATUS
                          ↓
                PROGRESS TRACKING
                          ↓
                 ISSUE COMPLETION
```

## Component Breakdown

### 1. AI / ML Components
- **Embedding Generation**: Uses local Transformer models (Xenova/all-MiniLM-L6-v2) to generate semantic vectors for complaint text.
- **Duplicate Detection**: A weighted ML-heuristic hybrid combining semantic similarity, Haversine GPS distance, and temporal proximity.
- **Relationship Classifier**: Zero-shot local Transformer pipeline categorizing complaint pairs into Duplicate, Similar, Related, or Independent.
- **Multi-Label Classifier**: Maps citizen language to official department issue types (e.g., "Water Leakage") using zero-shot semantic confidence scoring.

### 2. Graph Algorithms
- **Relationship Graph & Connected Components**: Uses an undirected graph traversal to link independent citizen complaints into a unified `Civic Issue` if they share 'Duplicate', 'Similar', or 'Related' edges.
- **Dependency Graph**: A Directed Acyclic Graph (DAG) constructed from operational rules (e.g., Water Department must finish before Road Department).
- **Cycle Detection**: DFS-based algorithm to prevent circular dependencies in the operational workflow.
- **Topological Sort**: Kahn's Algorithm is used to flatten the DAG into parallel, executable stages.

### 3. Rules & Deterministic Logic
- **Department Mapping**: Deterministic rule engine parsing the multi-label AI outputs and routing to explicit `workstreams`.
- **Task Generation**: Deterministic blueprint expansion creating actionable `tasks` based on the mapped `departments`.
- **Task Readiness**: Real-time evaluation of a task's prerequisites; tasks are strictly `BLOCKED` until all parent tasks in the topological DAG are `COMPLETED`.

### 4. Database (Supabase)
- **Vector Storage**: `pgvector` utilized for storing and querying complaint embeddings.
- **Relational Schema**: Manages the hierarchy of Complaints → Civic Issues → Workstreams → Tasks.
- **Audit Logging**: Maintains an immutable timeline (`task_status_history`) of execution state transitions.

### 5. Application Workflow
- **Task Execution**: A strict state machine allowing authorized operators to progress tasks through `PENDING` → `IN_PROGRESS` → `COMPLETED` / `CANCELLED`.
- **Progress Tracking**: Cascading roll-ups calculating the overall resolution percentage of a Civic Issue based on underlying task states.
