-- ============================================================================
-- Phase 19 Migration — FR06 / Phase 6: Prerequisite DAG Recommendations & Staged Resolution
-- 
-- Phase 6 Architecture:
-- 1. Table for candidate multi-department & cross-issue dependency recommendations.
--    Recommendations require explicit officer approval before DAG insertion.
-- 2. Enhanced task verification fields (verified_at, verified_by, verification_notes).
-- 3. Enhanced civic issue verification fields (verified_at, verified_by, resolution_evidence).
-- 4. Stored procedures for atomic recommendation approval/rejection with cycle checks.
-- 5. Stored procedure for verified municipal issue closure ensuring all tasks across
--    all departments are completed and verified.
-- ============================================================================

-- 1. Create table for explainable dependency recommendations
CREATE TABLE IF NOT EXISTS public.task_dependency_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  source_civic_issue_id UUID REFERENCES public.civic_issues(id) ON DELETE CASCADE,
  target_civic_issue_id UUID REFERENCES public.civic_issues(id) ON DELETE CASCADE,
  is_cross_issue BOOLEAN NOT NULL DEFAULT false,
  source_department TEXT NOT NULL,
  target_department TEXT NOT NULL,
  confidence NUMERIC(4, 2) NOT NULL,
  recommendation_type TEXT NOT NULL DEFAULT 'CROSS_DEPARTMENT' CHECK (recommendation_type IN ('CROSS_DEPARTMENT', 'INTRA_DEPARTMENT', 'CROSS_ISSUE')),
  reason TEXT NOT NULL,
  evidence JSONB DEFAULT '{}'::jsonb,
  rule_version TEXT NOT NULL DEFAULT '1.0',
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT unique_task_pair_recommendation UNIQUE (task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_rec_task ON public.task_dependency_recommendations(task_id);
CREATE INDEX IF NOT EXISTS idx_rec_depends_on ON public.task_dependency_recommendations(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_rec_status ON public.task_dependency_recommendations(status);
CREATE INDEX IF NOT EXISTS idx_rec_source_issue ON public.task_dependency_recommendations(source_civic_issue_id);
CREATE INDEX IF NOT EXISTS idx_rec_target_issue ON public.task_dependency_recommendations(target_civic_issue_id);

-- 2. Add verification columns to tasks table
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS verification_evidence JSONB DEFAULT '{}'::jsonb;

-- 3. Add verification columns to civic_issues table
ALTER TABLE public.civic_issues
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS verification_notes TEXT,
  ADD COLUMN IF NOT EXISTS resolution_evidence JSONB DEFAULT '{}'::jsonb;

-- 4. View for active recommendation queue with rich task and department details
CREATE OR REPLACE VIEW public.v_pending_dependency_recommendations AS
SELECT 
  r.id AS recommendation_id,
  r.task_id,
  t_down.title AS task_title,
  t_down.status AS task_status,
  t_down.department_id AS task_department,
  r.depends_on_task_id,
  t_up.title AS prerequisite_title,
  t_up.status AS prerequisite_status,
  t_up.department_id AS prerequisite_department,
  r.source_civic_issue_id,
  ci_src.title AS source_issue_title,
  r.target_civic_issue_id,
  ci_tgt.title AS target_issue_title,
  r.is_cross_issue,
  r.confidence,
  r.recommendation_type,
  r.reason,
  r.evidence,
  r.rule_version,
  r.status,
  r.created_at
FROM public.task_dependency_recommendations r
JOIN public.tasks t_down ON t_down.id = r.task_id
JOIN public.tasks t_up ON t_up.id = r.depends_on_task_id
LEFT JOIN public.civic_issues ci_src ON ci_src.id = r.source_civic_issue_id
LEFT JOIN public.civic_issues ci_tgt ON ci_tgt.id = r.target_civic_issue_id
WHERE r.status = 'PENDING'
ORDER BY r.confidence DESC, r.created_at DESC;

-- 5. Stored Procedure: accept_dependency_recommendation
-- Atomically calls add_task_dependency_transactional with advisory locks & cycle checks,
-- and records the approval audit metadata.
CREATE OR REPLACE FUNCTION public.accept_dependency_recommendation(
  p_recommendation_id UUID,
  p_reviewer_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec RECORD;
  v_dep_result JSONB;
BEGIN
  -- Acquire row lock
  SELECT * INTO v_rec
  FROM public.task_dependency_recommendations
  WHERE id = p_recommendation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation % not found', p_recommendation_id;
  END IF;

  IF v_rec.status != 'PENDING' THEN
    RAISE EXCEPTION 'Recommendation % is already resolved (status: %)', p_recommendation_id, v_rec.status;
  END IF;

  -- Add the dependency atomically through cycle-prevention RPC
  v_dep_result := public.add_task_dependency_transactional(v_rec.task_id, v_rec.depends_on_task_id);

  -- Update recommendation status
  UPDATE public.task_dependency_recommendations
  SET status = 'ACCEPTED',
      reviewed_by = p_reviewer_id,
      reviewer_notes = p_notes,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_recommendation_id;

  RETURN jsonb_build_object(
    'success', true,
    'recommendation_id', p_recommendation_id,
    'status', 'ACCEPTED',
    'dependency_result', v_dep_result,
    'reviewed_by', p_reviewer_id,
    'reviewed_at', now()
  );
END;
$$;

-- 6. Stored Procedure: reject_dependency_recommendation
CREATE OR REPLACE FUNCTION public.reject_dependency_recommendation(
  p_recommendation_id UUID,
  p_reviewer_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_rec RECORD;
BEGIN
  SELECT * INTO v_rec
  FROM public.task_dependency_recommendations
  WHERE id = p_recommendation_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recommendation % not found', p_recommendation_id;
  END IF;

  IF v_rec.status != 'PENDING' THEN
    RAISE EXCEPTION 'Recommendation % is already resolved (status: %)', p_recommendation_id, v_rec.status;
  END IF;

  UPDATE public.task_dependency_recommendations
  SET status = 'REJECTED',
      reviewed_by = p_reviewer_id,
      reviewer_notes = p_notes,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_recommendation_id;

  RETURN jsonb_build_object(
    'success', true,
    'recommendation_id', p_recommendation_id,
    'status', 'REJECTED',
    'reviewed_by', p_reviewer_id,
    'reviewed_at', now()
  );
END;
$$;

-- 7. Update update_task_status_transactional to support VERIFIED status & prerequisite readiness
DROP FUNCTION IF EXISTS public.update_task_status_transactional(uuid, text, text, text) CASCADE;
CREATE OR REPLACE FUNCTION public.update_task_status_transactional(
  p_task_id UUID,
  p_new_status TEXT,
  p_user_email TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_status TEXT;
  v_civic_issue_id UUID;
  v_workstream_id UUID;
  v_unmet_task_id UUID;
  v_unmet_title TEXT;
  v_unmet_status TEXT;
  v_ws_new_status TEXT;
  v_ws_all_cancelled BOOLEAN;
  v_ws_all_finished BOOLEAN;
  v_ws_none_started BOOLEAN;
  v_issue_new_status TEXT;
  v_issue_all_cancelled BOOLEAN;
  v_issue_all_finished BOOLEAN;
  v_issue_none_started BOOLEAN;
BEGIN
  -- 1. Lock and fetch current task
  SELECT status, civic_issue_id, workstream_id 
  INTO v_current_status, v_civic_issue_id, v_workstream_id
  FROM public.tasks 
  WHERE id = p_task_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  
  IF v_current_status = p_new_status THEN
    RETURN; -- No change
  END IF;

  -- Validate allowed transitions
  IF v_current_status = 'PENDING' AND p_new_status NOT IN ('IN_PROGRESS', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid status transition from PENDING to %', p_new_status;
  ELSIF v_current_status = 'IN_PROGRESS' AND p_new_status NOT IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'Invalid status transition from IN_PROGRESS to %', p_new_status;
  ELSIF v_current_status = 'COMPLETED' AND p_new_status NOT IN ('VERIFIED') THEN
    RAISE EXCEPTION 'Invalid status transition from COMPLETED to %', p_new_status;
  ELSIF v_current_status IN ('CANCELLED', 'VERIFIED') THEN
    RAISE EXCEPTION 'Task in % status cannot be transitioned to %', v_current_status, p_new_status;
  END IF;

  -- 2. Prerequisite enforcement when transitioning to IN_PROGRESS
  IF p_new_status = 'IN_PROGRESS' THEN
    SELECT t.id, t.title, t.status
    INTO v_unmet_task_id, v_unmet_title, v_unmet_status
    FROM public.task_dependencies td
    JOIN public.tasks t ON t.id = td.depends_on_task_id
    WHERE td.task_id = p_task_id
      AND t.status NOT IN ('COMPLETED', 'VERIFIED')
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Cannot start task. Prerequisite task % ("%") is not COMPLETED or VERIFIED (current status: %)',
        v_unmet_task_id, v_unmet_title, v_unmet_status;
    END IF;
  END IF;

  -- 3. Update Task
  UPDATE public.tasks 
  SET 
    status = p_new_status, 
    started_at = CASE WHEN p_new_status = 'IN_PROGRESS' AND v_current_status = 'PENDING' THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'COMPLETED' THEN now() ELSE completed_at END,
    verified_at = CASE WHEN p_new_status = 'VERIFIED' THEN now() ELSE verified_at END,
    cancelled_at = CASE WHEN p_new_status = 'CANCELLED' THEN now() ELSE cancelled_at END,
    updated_at = now() 
  WHERE id = p_task_id;

  -- 4. Audit Log
  INSERT INTO public.task_status_history 
    (task_id, previous_status, new_status, changed_by, reason)
  VALUES 
    (p_task_id, v_current_status, p_new_status, COALESCE(p_user_email, 'system'), COALESCE(p_reason, 'Transitioned to ' || p_new_status));

  -- 5. Re-evaluate Workstream Status
  SELECT 
    bool_and(status = 'CANCELLED'),
    bool_and(status IN ('COMPLETED', 'VERIFIED', 'CANCELLED')),
    bool_and(status = 'PENDING')
  INTO v_ws_all_cancelled, v_ws_all_finished, v_ws_none_started
  FROM public.tasks
  WHERE workstream_id = v_workstream_id;
  
  IF v_ws_all_cancelled THEN v_ws_new_status := 'CANCELLED';
  ELSIF v_ws_all_finished THEN v_ws_new_status := 'COMPLETED';
  ELSIF NOT v_ws_none_started THEN v_ws_new_status := 'IN_PROGRESS';
  ELSE v_ws_new_status := 'PENDING';
  END IF;
  
  UPDATE public.workstreams 
  SET status = v_ws_new_status, updated_at = now() 
  WHERE id = v_workstream_id;

  -- 6. Re-evaluate Civic Issue Status
  -- Rule: A Civic Issue must not automatically be marked resolved merely because one department finishes.
  -- All required tasks across all workstreams must be completed or cancelled.
  SELECT 
    bool_and(status = 'CANCELLED'),
    bool_and(status IN ('COMPLETED', 'VERIFIED', 'CANCELLED')),
    bool_and(status = 'PENDING')
  INTO v_issue_all_cancelled, v_issue_all_finished, v_issue_none_started
  FROM public.tasks
  WHERE civic_issue_id = v_civic_issue_id;

  IF v_issue_all_cancelled THEN v_issue_new_status := 'CANCELLED';
  ELSIF v_issue_all_finished THEN v_issue_new_status := 'COMPLETED';
  ELSIF NOT v_issue_none_started THEN v_issue_new_status := 'IN_PROGRESS';
  ELSE v_issue_new_status := 'PENDING';
  END IF;

  UPDATE public.civic_issues 
  SET status = v_issue_new_status, updated_at = now() 
  WHERE id = v_civic_issue_id;

END;
$$;

-- 8. Stored Procedure: verify_civic_issue_resolution
-- Enforces that a Civic Issue can only be verified/resolved when all required tasks
-- across all departments are completed.
CREATE OR REPLACE FUNCTION public.verify_civic_issue_resolution(
  p_civic_issue_id UUID,
  p_verifier_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_incomplete_count INT;
  v_total_tasks INT;
  v_verifier RECORD;
BEGIN
  -- 1. Check issue existence
  IF NOT EXISTS (SELECT 1 FROM public.civic_issues WHERE id = p_civic_issue_id) THEN
    RAISE EXCEPTION 'Civic Issue % not found', p_civic_issue_id;
  END IF;

  -- 2. Count incomplete tasks
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'VERIFIED', 'CANCELLED'))
  INTO v_total_tasks, v_incomplete_count
  FROM public.tasks
  WHERE civic_issue_id = p_civic_issue_id;

  IF v_total_tasks = 0 THEN
    RAISE EXCEPTION 'Civic Issue % has no tasks to verify', p_civic_issue_id;
  END IF;

  IF v_incomplete_count > 0 THEN
    RAISE EXCEPTION 'Cannot verify Civic Issue resolution. % incomplete task(s) remain across departments', v_incomplete_count;
  END IF;

  -- 3. Fetch verifier info
  IF p_verifier_id IS NOT NULL THEN
    SELECT id, email, role INTO v_verifier FROM public.users WHERE id = p_verifier_id;
  END IF;

  -- 4. Mark all completed tasks as VERIFIED
  UPDATE public.tasks
  SET status = 'VERIFIED',
      verified_at = now(),
      verified_by = p_verifier_id,
      verification_notes = COALESCE(p_notes, 'Verified during final issue resolution'),
      updated_at = now()
  WHERE civic_issue_id = p_civic_issue_id AND status = 'COMPLETED';

  -- 5. Mark workstreams as COMPLETED/VERIFIED
  UPDATE public.workstreams
  SET status = 'COMPLETED', updated_at = now()
  WHERE civic_issue_id = p_civic_issue_id AND status != 'CANCELLED';

  -- 6. Mark civic issue as VERIFIED
  UPDATE public.civic_issues
  SET status = 'VERIFIED',
      resolved_at = now(),
      verified_at = now(),
      verified_by = p_verifier_id,
      verification_notes = p_notes,
      updated_at = now()
  WHERE id = p_civic_issue_id;

  -- 7. Update all linked complaints in this Civic Issue to 'Resolved'
  UPDATE public.complaints
  SET status = 'Resolved', updated_at = now()
  WHERE civic_issue_id = p_civic_issue_id;

  RETURN jsonb_build_object(
    'success', true,
    'civic_issue_id', p_civic_issue_id,
    'status', 'VERIFIED',
    'verified_by', p_verifier_id,
    'verified_at', now(),
    'notes', p_notes
  );
END;
$$;

