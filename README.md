# GrievanceIQ

GrievanceIQ is an end-to-end civic intelligence and operational routing platform. It transforms unstructured citizen complaints into structured, dependency-aware workflows for municipal departments using a hybrid of AI and deterministic graph algorithms.

## What GrievanceIQ Does
1. **Intelligent Intake**: Accepts citizen complaints, persists them, and generates local semantic embeddings via MiniLM.
2. **Issue Classification**: Uses a trained multi-label issue classifier (Logistic Regression) to identify categorical issues.
3. **Deduplication & Clustering**: Uses duplicate detection, the corrected Python Random Forest relationship classifier, and relationship persistence to identify linkages.
4. **Knowledge Graph Enrichment**: Enriches the linkages using a domain-specific Knowledge Graph.
5. **Civic Issue Aggregation**: Uses a complaint relationship graph and Connected Components to aggregate relationships into a unified `Civic Issue` containing canonical issue types. A deterministic Civic Issue merge policy ensures consistent state merging.
6. **Multi-Label Routing**: Deterministically maps canonical issue types to specific departments and generates department-specific workstreams and tasks.
7. **Dependency-Aware Execution**: Uses a dependency DAG and Kahn's topological sort to determine executable sequences.
8. **Execution Tracking**: Provides strict transactional execution via the full processing lifecycle (PROCESSING -> PROCESSED/FAILED).

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

## Final Architecture Pipeline
Citizen -> React -> Node/Express -> complaint persistence -> MiniLM -> multi-label issue classifier -> duplicate detection -> Python Random Forest relationship classifier -> relationship persistence -> Knowledge Graph enrichment -> complaint relationship graph -> Connected Components -> Civic Issue -> canonical issue types -> deterministic departments -> workstreams -> tasks -> dependency DAG -> Kahn topological sort -> transactional execution

## Known Limitations & Lifecycle
Please review `docs/evaluation/limitations.md` for a comprehensive list of architectural and prototype boundaries. Most notably:
- **Synthetic Dataset Limitation**: The AI models run locally and are evaluated on synthetic/prototype datasets. The corrected Random Forest relationship model was trained on 8,818 training pairs, validated on 901 pairs, and evaluated on 836 held-out synthetic test pairs, achieving 93.30% test accuracy and 89.99% macro F1. These are synthetic held-out evaluation results, not real-world generalization proofs.
- **Merge & Persistence Operations**: The system now utilizes relationship persistence and a deterministic Civic Issue merge policy for grouping connected issues, protecting data integrity.
- **Processing Lifecycle**: Workflows proceed strictly through the tracked `PROCESSING` -> `PROCESSED` or `FAILED` lifecycle via transactional DAG updates. 
- **Operational Boundaries**: There is no live municipality integration, no autonomous field-agent dispatch, and no production-scale municipal deployment validation.
- **Metric Limitations**: Progress metrics treat all tasks equally (no effort-based weighting).
