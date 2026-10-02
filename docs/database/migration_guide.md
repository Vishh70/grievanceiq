# Database Migration Guide

This guide details the exact order and purpose of the Supabase (PostgreSQL) migrations required to run GrievanceIQ.

## Prerequisites
- A Supabase project.
- The `pgvector` extension enabled in Supabase (`CREATE EXTENSION IF NOT EXISTS vector;`).

## Execution Order
Execute the following files found in `docs/database/` in the exact order listed below using the Supabase SQL Editor:

1. **`phase1_embedding.sql`**
   - **Purpose**: Creates the `complaints` table and adds the `embedding vector(384)` column for AI semantic search.

2. **`phase2_duplicate_detection.sql`**
   - **Purpose**: Extends the `complaints` table to include `duplicate_of` (self-referencing foreign key) and `is_duplicate` boolean flag.

3. **`phase4_civic_issue.sql`**
   - **Purpose**: Creates the `civic_issues` table (id, title, description, priority, status) to group related complaints.
   - **Changes**: Adds `civic_issue_id` to the `complaints` table.

4. **`phase5_routing_tasks.sql`**
   - **Purpose**: Creates the operational routing structure.
   - **Tables**: `routing_results`, `workstreams`, and `tasks`.

5. **`phase6_task_dependencies.sql`**
   - **Purpose**: Creates the `task_dependencies` table to model the Directed Acyclic Graph (DAG).
   - **Constraints**: Enforces `task_id` and `depends_on_task_id` foreign keys to the `tasks` table.

6. **`phase7_task_execution.sql`**
   - **Purpose**: Adds execution lifecycle tracking.
   - **Changes**: Adds timestamp columns (`started_at`, `completed_at`, `cancelled_at`) to the `tasks` table.
   - **Tables**: Creates `task_status_history` for immutable audit logging.

7. **`phase8_resource_scheduling.sql`**
   - **Purpose**: Adds resource scheduling and reservations constraints.

8. **`phase9_cross_issue_dependencies.sql`**
   - **Purpose**: Adds cross-issue execution blocking and global plan DAG.

9. **`phase10_ml_multilabel.sql`**
   - **Purpose**: Adds columns `ml_labels`, `ml_probabilities`, and `ml_departments` to the `complaints` table to persist Python model outputs.

## Verification
You can verify the schema by running a simple test insert or checking the Table Editor in the Supabase dashboard to confirm all 7 tables (`complaints`, `civic_issues`, `routing_results`, `workstreams`, `tasks`, `task_dependencies`, `task_status_history`) exist and contain the correct foreign key relationships.
