# GrievanceIQ

GrievanceIQ is an end-to-end civic intelligence and operational routing platform. It transforms unstructured citizen complaints into structured, dependency-aware workflows for municipal departments using a hybrid of AI and deterministic graph algorithms.

## What GrievanceIQ Does
1. **Intelligent Intake**: Accepts citizen complaints and generates local semantic embeddings.
2. **Deduplication & Clustering**: Uses similarity, location, and time to detect duplicates and uses graph connected-components to cluster related issues into a unified `Civic Issue`.
3. **Multi-Label Routing**: Evaluates complex issues (e.g., "pipe burst caused road flood") and assigns them to multiple required departments simultaneously.
4. **Dependency-Aware Execution**: Converts assigned departmental workstreams into a Directed Acyclic Graph (DAG) of executable tasks.
5. **Execution Tracking**: Provides a strict state machine to track resolution progress without allowing operators to skip required prerequisites.

## Architecture & Technology Stack
- **Frontend**: React (Vite), Recharts, Leaflet
- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL with `pgvector` for embeddings)
- **AI/ML**: Hybrid AI Architecture
  - **Google Gemini**: Initial complaint understanding, category, priority, hazards, suggested action.
  - **Local Transformers**: `Xenova/all-MiniLM-L6-v2` running via WebAssembly in Node.js for embeddings and semantic similarity.
  - **Corrected Random Forest**: The active relationship model (sklearn .joblib) served via a Python Flask ML service, with legacy Node.js fallback.

## Algorithms Used
- **Cosine Similarity**: For detecting semantic closeness between texts.
- **Haversine Formula**: For calculating geographical distance penalties.
- **Graph Connected Components**: For clustering pairs of relationships into broad civic issues.
- **Directed Acyclic Graph (DAG)**: For modeling task prerequisites.
- **Kahn's Topological Sort**: For flattening the DAG into parallel, executable work stages.
- **Cycle Detection (Kahn's residual-node validation)**: For preventing impossible operational loops.

## Project Setup & Execution

### 1. Prerequisites
- Node.js v22+
- Supabase Project (PostgreSQL with `pgvector` enabled)

### 2. Installation
Clone the repository and install dependencies for both components:
```bash
cd backend
npm install
cd ../frontend
npm install
```

### 3. Environment variables
Create a `.env` file in the `backend/` directory:
```text
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_key
NODE_ENV=development
```
*(Never place actual secret values in README or commit them to version control).*

### 4. Supabase setup
Ensure your Supabase project is active and that the `pgvector` extension is enabled via the SQL editor:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

### 5. Database migrations
Execute the following files found in `docs/database/` in the exact order below via the Supabase SQL Editor. See `docs/database/migration_guide.md` for verification details.
1. `phase1_embedding.sql`
2. `phase2_duplicate_detection.sql`
3. `phase4_civic_issue.sql`
4. `phase5_routing_tasks.sql`
5. `phase6_task_dependencies.sql`
6. `phase7_task_execution.sql`
7. `phase8_task_hardening.sql`
8. `phase10_ml_multilabel.sql`

### 6. Backend startup
```bash
cd backend
npm run dev
```

### 7. Frontend startup
```bash
cd frontend
npm run dev
```

### 8. Running tests
The backend includes a comprehensive suite. We use custom npm scripts to handle Node's experimental VM modules needed for local AI:
```bash
cd backend
npm test                 # Run all tests
npm run test:e2e         # Run end-to-end pipeline evaluation
npm run test:integration # Run Supabase live integration tests
```

### 9. Demo setup
To automatically inject a reproducible demonstration scenario (a cascading multi-department failure) into the database:
```bash
cd backend
npm run demo
```
This data is explicitly tagged with `[DEMO]` to prevent confusion with real complaints.

### 10. Demo reset
To safely remove all generated demo data without affecting real complaints:
```bash
cd backend
npm run demo:reset
```

## Known Limitations
Please review `docs/evaluation/limitations.md` for a comprehensive list of architectural and prototype boundaries. Most notably:
- The AI models run locally and are evaluated on synthetic/prototype datasets.
- The system is "CI-certified" (94 tests passed, 0 skipped; CI workflow succeeded) but is not validated on real-world municipal production scale workloads, nor is it production-security-certified. The 0.9330 accuracy and 0.8999 macro F1 are synthetic held-out evaluation results, not real-world generalization proofs.
- Progress metrics treat all tasks equally (no effort-based weighting).
- There is no live physical workforce dispatching or external municipal legacy system integration.
