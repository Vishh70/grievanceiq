-- ============================================================================
-- Phase 16 Migration — FR04 Cross-Issue Task Dependencies & Atomic Cycle Prevention
-- 
-- FR04 Policy:
-- 1. Tasks can depend on prerequisite tasks belonging to different Civic Issues
--    (e.g., Water Pipe Repair task blocking Road Paving task).
-- 2. Cycles are prevented atomically using transaction-level advisory locks
--    combined with recursive reachability graph traversal.
-- 3. Concurrent conflicting dependency insertions are serialized to prevent
--    race conditions that could form cycles.
-- 4. Tasks transitioning to IN_PROGRESS are blocked at the database level
--    until all prerequisite tasks (intra-issue or cross-issue) are COMPLETED.
-- ============================================================================

-- 1. Stored procedure for atomic dependency insertion with advisory lock & cycle prevention
CREATE OR REPLACE FUNCTION public.add_task_dependency_transactional(
  p_task_id UUID,
  p_depends_on_task_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_t1_id UUID;
  v_t1_issue UUID;
  v_t2_id UUID;
  v_t2_issue UUID;
  v_cycle_path TEXT[];
  v_new_dep_id UUID;
BEGIN
  -- 1. Validate self-dependency
  IF p_task_id = p_depends_on_task_id THEN
    RAISE EXCEPTION 'Self dependency is not allowed.';
  END IF;

  -- 2. Validate existence of both tasks
  SELECT id, civic_issue_id INTO v_t1_id, v_t1_issue FROM public.tasks WHERE id = p_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task % not found', p_task_id;
  END IF;

  SELECT id, civic_issue_id INTO v_t2_id, v_t2_issue FROM public.tasks WHERE id = p_depends_on_task_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Prerequisite task % not found', p_depends_on_task_id;
  END IF;

  -- 3. Acquire transaction-level advisory lock to serialize graph updates across concurrent transactions
  PERFORM pg_advisory_xact_lock(hashtext('task_dependencies_graph_lock'));

  -- 4. Check if dependency already exists (idempotent)
  SELECT id INTO v_new_dep_id
  FROM public.task_dependencies
  WHERE task_id = p_task_id AND depends_on_task_id = p_depends_on_task_id;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'status', 'ALREADY_EXISTS',
      'dependency_id', v_new_dep_id,
      'task_id', p_task_id,
      'depends_on_task_id', p_depends_on_task_id
    );
  END IF;

  -- 5. Recursive cycle check: can p_task_id already reach p_depends_on_task_id?
  -- Edge direction: depends_on_task_id -> task_id (Prerequisite -> Dependent).
  -- If p_task_id can already reach p_depends_on_task_id, adding this edge forms a cycle!
  WITH RECURSIVE reachable AS (
    SELECT task_id, ARRAY[p_task_id::TEXT, task_id::TEXT] AS path
    FROM public.task_dependencies
    WHERE depends_on_task_id = p_task_id

    UNION ALL

    SELECT td.task_id, r.path || td.task_id::TEXT
    FROM public.task_dependencies td
    JOIN reachable r ON td.depends_on_task_id = r.task_id
    WHERE NOT (td.task_id::TEXT = ANY(r.path))
  )
  SELECT path INTO v_cycle_path
  FROM reachable
  WHERE task_id = p_depends_on_task_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Adding this dependency would create a cycle: % -> %',
      array_to_string(v_cycle_path, ' -> '), p_task_id;
  END IF;

  -- 6. Insert new dependency edge
  INSERT INTO public.task_dependencies (task_id, depends_on_task_id)
  VALUES (p_task_id, p_depends_on_task_id)
  RETURNING id INTO v_new_dep_id;

  RETURN jsonb_build_object(
    'success', true,
    'status', 'CREATED',
    'dependency_id', v_new_dep_id,
    'task_id', p_task_id,
    'depends_on_task_id', p_depends_on_task_id,
    'is_cross_issue', (v_t1_issue != v_t2_issue)
  );
END;
$$;

COMMENT ON FUNCTION public.add_task_dependency_transactional IS 'Atomically validates, checks cycles, and inserts a task dependency edge under an advisory lock.';

-- 2. Trigger function to prevent cycle creation even on direct SQL inserts
CREATE OR REPLACE FUNCTION public.check_task_cycle_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_cycle_path TEXT[];
BEGIN
  -- Self-dependency check
  IF NEW.task_id = NEW.depends_on_task_id THEN
    RAISE EXCEPTION 'Self dependency is not allowed.';
  END IF;

  -- Advisory lock for graph mutation serialization
  PERFORM pg_advisory_xact_lock(hashtext('task_dependencies_graph_lock'));

  -- Recursive cycle check
  WITH RECURSIVE reachable AS (
    SELECT task_id, ARRAY[NEW.task_id::TEXT, task_id::TEXT] AS path
    FROM public.task_dependencies
    WHERE depends_on_task_id = NEW.task_id

    UNION ALL

    SELECT td.task_id, r.path || td.task_id::TEXT
    FROM public.task_dependencies td
    JOIN reachable r ON td.depends_on_task_id = r.task_id
    WHERE NOT (td.task_id::TEXT = ANY(r.path))
  )
  SELECT path INTO v_cycle_path
  FROM reachable
  WHERE task_id = NEW.depends_on_task_id
  LIMIT 1;

  IF FOUND THEN
    RAISE EXCEPTION 'Adding this dependency would create a cycle: % -> %',
      array_to_string(v_cycle_path, ' -> '), NEW.task_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_task_dependency_cycles ON public.task_dependencies;
CREATE TRIGGER trg_prevent_task_dependency_cycles
  BEFORE INSERT ON public.task_dependencies
  FOR EACH ROW
  EXECUTE FUNCTION public.check_task_cycle_trigger();

-- 3. Hardened transactional task status updater with database-level prerequisite enforcement
CREATE OR REPLACE FUNCTION public.update_task_status_transactional(
  p_task_id uuid,
  p_new_status text,
  p_user_email text,
  p_reason text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_civic_issue_id uuid;
  v_workstream_id uuid;
  v_current_status text;
  
  v_unmet_task_id uuid;
  v_unmet_title text;
  v_unmet_status text;

  v_ws_all_cancelled boolean;
  v_ws_all_finished boolean;
  v_ws_none_started boolean;
  v_ws_new_status text;
  
  v_issue_all_cancelled boolean;
  v_issue_all_finished boolean;
  v_issue_none_started boolean;
  v_issue_new_status text;
BEGIN
  -- 1. Lock the task row
  SELECT civic_issue_id, workstream_id, status 
  INTO v_civic_issue_id, v_workstream_id, v_current_status
  FROM public.tasks 
  WHERE id = p_task_id 
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Task not found';
  END IF;
  
  IF v_current_status = p_new_status THEN
    RETURN; -- No change
  END IF;

  -- 2. Prerequisite enforcement when transitioning to IN_PROGRESS
  IF p_new_status = 'IN_PROGRESS' THEN
    SELECT t.id, t.title, t.status
    INTO v_unmet_task_id, v_unmet_title, v_unmet_status
    FROM public.task_dependencies td
    JOIN public.tasks t ON t.id = td.depends_on_task_id
    WHERE td.task_id = p_task_id
      AND t.status != 'COMPLETED'
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Cannot start task. Prerequisite task % ("%") is not COMPLETED (current status: %)',
        v_unmet_task_id, v_unmet_title, v_unmet_status;
    END IF;
  END IF;

  -- 3. Update Task
  UPDATE public.tasks 
  SET 
    status = p_new_status, 
    started_at = CASE WHEN p_new_status = 'IN_PROGRESS' AND v_current_status = 'PENDING' THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'COMPLETED' THEN now() ELSE completed_at END,
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
    bool_and(status IN ('COMPLETED', 'CANCELLED')),
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
  SELECT 
    bool_and(status = 'CANCELLED'),
    bool_and(status IN ('COMPLETED', 'CANCELLED')),
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

COMMENT ON FUNCTION public.update_task_status_transactional IS 'Atomically updates task status, enforces prerequisite completion, updates workstream and civic issue status, and logs audit history.';

