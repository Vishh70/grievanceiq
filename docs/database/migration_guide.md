# Database Migration Guide

This guide details the exact order and purpose of the Supabase (PostgreSQL) migrations required to run GrievanceIQ.

## Prerequisites
- A PostgreSQL 13+ instance or a Supabase project.
- Native standard PostgreSQL setup (`pgcrypto` extension is created automatically if needed; no vector extensions required as embeddings use standard `float8[]`).
- Service role access: Backend operations bypass RLS via the `SUPABASE_SERVICE_ROLE_KEY`.

---

## Fast-Track Setup: Single File Execution
For a clean database initialization, execute the consolidated script in the Supabase SQL Editor or via `migrate_live.js`:
- **`ALL_MIGRATIONS.sql`** — Contains all 12 steps below in strict deterministic order.

> **Verification Notice**: Local automated tests (`backend/tests/integration/migration.test.js`) execute this migration sequence and stored procedure against an embedded PostgreSQL-compatible engine (`@electric-sql/pglite`). Verification against a live Supabase cloud project instance is deferred to Phase R3 acceptance testing.

---

## Detailed Step-by-Step Execution Order

If executing individual migration files found in `docs/database/`, follow this exact sequence:

1. **`00_initial_schema.sql`** (Step 0)
   - **Purpose**: Creates the foundational `users` and `complaints` tables, base foreign keys, constraints, and indexes. Enables Row-Level Security (RLS) by default.

2. **`phase1_embedding.sql`** (Step 1)
   - **Purpose**: Adds the `embedding_vector float8[]` column to `complaints` for AI semantic similarity search.

3. **`phase2_duplicate_detection.sql`** (Step 2)
   - **Purpose**: Extends `complaints` with diagnostic duplicate detection columns: `duplicate_score`, `duplicate_candidate_id`, `duplicate_semantic_score`, `duplicate_location_score`, and `duplicate_temporal_score`.

4. **`phase4_civic_issue.sql`** (Step 3)
   - **Purpose**: Creates `civic_issues` table and adds `civic_issue_id` foreign key to `complaints` for connected component issue grouping.

5. **`phase5_routing_tasks.sql`** (Step 4)
   - **Purpose**: Creates operational routing tables: `workstreams`, `tasks`, and `routing_results`.

6. **`phase6_task_dependencies.sql`** (Step 5)
   - **Purpose**: Creates `task_dependencies` table modeling the Directed Acyclic Graph (DAG) with self-dependency checks.

7. **`phase7_task_execution.sql`** (Step 6)
   - **Purpose**: Adds timestamp lifecycle columns (`started_at`, `completed_at`, `cancelled_at`) to `tasks` and creates `task_status_history` audit log table.

8. **`phase8_task_hardening.sql`** (Step 7)
   - **Purpose**: Adds `template_id` to `tasks` and creates the `update_task_status_transactional` stored procedure for atomic status roll-ups.

9. **`phase10_ml_multilabel.sql`** (Step 8)
   - **Purpose**: Adds `ml_labels`, `ml_probabilities`, and `ml_departments` columns to `complaints` to persist Python ML classification outputs.

10. **`phase11_google_auth.sql`** (Step 9)
    - **Purpose**: Adds Google OAuth authentication columns (`google_id`, `auth_provider`, `avatar_url`, `email_verified`) to `users` and drops `NOT NULL` on `password_hash`.

11. **`phase12_relationships.sql`** (Step 10)
    - **Purpose**: Creates `complaint_relationships` table with canonical edge ordering and adds `merged_into_id` to `civic_issues`.

12. **`phase13_processing_status.sql`** (Step 11)
    - **Purpose**: Adds `processing_status` and `processing_error` columns to `complaints` for asynchronous BullMQ worker state tracking.

---

## Security & Row-Level Security (RLS) Policy Architecture
- **Service Role Access**: The backend API connects to Supabase with administrative permissions via `SUPABASE_SERVICE_ROLE_KEY`, which automatically bypasses RLS for workflow orchestration, task management, and queue operations.
- **Custom JWT Auth**: GrievanceIQ authenticates users in the Node.js Express tier using custom JWT tokens verified by `middleware/auth.js`. It does not rely on Supabase Auth sessions (`auth.uid()`).
- **Data Protection**: RLS is enabled on all tables by default. PostgREST anonymous client access is denied by default unless explicit read policies are created. All public citizen data endpoints (e.g. `/api/complaints/public`) are served through Express controllers that explicitly sanitize and truncate coordinates to ~1.1km precision.

---

## Schema Verification Checklist
Verify that all 9 application tables exist:
- `users`
- `complaints`
- `civic_issues`
- `workstreams`
- `tasks`
- `routing_results`
- `task_dependencies`
- `task_status_history`
- `complaint_relationships`

Verify that the stored procedure exists:
- `public.update_task_status_transactional(uuid, text, text, text)`
