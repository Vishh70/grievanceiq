-- ============================================================================
-- GrievanceIQ Database Rollback Script (Reverse Migration Order)
-- Environment: Staging / Testing Teardown ONLY
-- 
-- CAUTION & WARNING:
-- DO NOT EXECUTE THIS SCRIPT AGAINST PRODUCTION DATABASES OR ANY DATABASE
-- CONTAINING REAL CITIZEN RECORDS. Dropping columns and tables will permanently
-- delete inspection verifications, audit event ledgers, and task recommendations.
-- This script is strictly provided for testing rollback automation in isolated
-- ephemeral staging or CI/CD test environments.
-- ============================================================================

-- Step 17 Rollback (Phase 19: Prerequisite Recommendations & Staged Resolution)
DROP FUNCTION IF EXISTS public.verify_civic_issue_resolution(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.accept_dependency_recommendation(uuid, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.reject_dependency_recommendation(uuid, uuid, text) CASCADE;
DROP VIEW IF EXISTS public.v_pending_dependency_recommendations CASCADE;
DROP TABLE IF EXISTS public.task_dependency_recommendations CASCADE;

ALTER TABLE public.tasks
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS verification_notes,
  DROP COLUMN IF EXISTS verification_evidence;

ALTER TABLE public.civic_issues
  DROP COLUMN IF EXISTS resolved_at,
  DROP COLUMN IF EXISTS verified_at,
  DROP COLUMN IF EXISTS verified_by,
  DROP COLUMN IF EXISTS verification_notes,
  DROP COLUMN IF EXISTS resolution_evidence;

-- Step 16 Rollback (Phase 18: WICR Review Events Append-Only Ledger)
DROP TRIGGER IF EXISTS trg_prevent_wicr_event_mutation ON public.wicr_review_events;
DROP FUNCTION IF EXISTS public.prevent_wicr_event_mutation() CASCADE;
DROP TABLE IF EXISTS public.wicr_review_events CASCADE;

-- Step 15 Rollback (Phase 17: WICR Decisions & Review Queue)
DROP VIEW IF EXISTS public.v_pending_wicr_reviews CASCADE;
DROP FUNCTION IF EXISTS public.resolve_wicr_review(uuid, text, uuid, text) CASCADE;
DROP FUNCTION IF EXISTS public.record_wicr_decision(uuid, uuid, text, numeric, text, text, jsonb, jsonb, text, text, text) CASCADE;
DROP TABLE IF EXISTS public.wicr_decisions CASCADE;

-- Step 14 Rollback (Phase 16: Cross-Issue Dependencies & Cycle Prevention)
DROP TRIGGER IF EXISTS trg_prevent_task_dependency_cycles ON public.task_dependencies;
DROP FUNCTION IF EXISTS public.check_task_cycle_trigger() CASCADE;
DROP FUNCTION IF EXISTS public.add_task_dependency_transactional(uuid, uuid) CASCADE;

-- Step 13 Rollback (Phase 15: Duplicate-Only Identity Views & Helpers)
DROP FUNCTION IF EXISTS public.check_improper_civic_issue_groupings() CASCADE;
DROP FUNCTION IF EXISTS public.get_related_civic_issues(uuid) CASCADE;
DROP VIEW IF EXISTS public.v_civic_issue_related_links CASCADE;

-- Step 12 Rollback (Phase 14: Worker Leases & Idempotency)
DROP FUNCTION IF EXISTS public.commit_complaint_processing(uuid, text, text, jsonb, jsonb, jsonb, text) CASCADE;
DROP FUNCTION IF EXISTS public.release_complaint_lease(uuid, text, text) CASCADE;
DROP FUNCTION IF EXISTS public.renew_complaint_lease(uuid, text, int) CASCADE;
DROP FUNCTION IF EXISTS public.acquire_complaint_lease(uuid, text, int) CASCADE;

ALTER TABLE public.complaints
  DROP COLUMN IF EXISTS locked_by,
  DROP COLUMN IF EXISTS lock_expires_at,
  DROP COLUMN IF EXISTS retry_count,
  DROP COLUMN IF EXISTS processing_error;

