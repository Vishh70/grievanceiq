-- Phase 8 Migration: Task Hardening & Transaction Safety
-- Adds template_id to tasks for stable dependencies

-- 1. Add template_id column
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS template_id text;

-- 2. Drop the old unique constraint (civic_issue_id, issue_type, title)
ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_civic_issue_id_issue_type_title_key;

-- 3. Add the new unique constraint (civic_issue_id, template_id)
ALTER TABLE public.tasks ADD CONSTRAINT tasks_civic_issue_id_template_id_key UNIQUE (civic_issue_id, template_id);

-- 4. Create the Stored Procedure for atomic transaction safety
CREATE OR REPLACE FUNCTION public.update_task_status_transactional(
  p_task_id uuid,
  p_new_status text,
  p_user_email text,
  p_reason text
)
RETURNS void AS $$
DECLARE
  v_civic_issue_id uuid;
  v_workstream_id uuid;
  v_current_status text;
  
  v_ws_all_cancelled boolean;
  v_ws_all_finished boolean;
  v_ws_none_started boolean;
  v_ws_new_status text;
  
  v_issue_all_cancelled boolean;
  v_issue_all_finished boolean;
  v_issue_none_started boolean;
  v_issue_new_status text;
BEGIN
  -- 1. Lock the task and get details
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

  -- 2. Update Task
  UPDATE public.tasks 
  SET 
    status = p_new_status, 
    started_at = CASE WHEN p_new_status = 'IN_PROGRESS' AND v_current_status = 'PENDING' THEN now() ELSE started_at END,
    completed_at = CASE WHEN p_new_status = 'COMPLETED' THEN now() ELSE completed_at END,
    cancelled_at = CASE WHEN p_new_status = 'CANCELLED' THEN now() ELSE cancelled_at END,
    updated_at = now() 
  WHERE id = p_task_id;

  -- 3. Audit Log
  INSERT INTO public.task_status_history 
    (task_id, previous_status, new_status, changed_by, reason)
  VALUES 
    (p_task_id, v_current_status, p_new_status, COALESCE(p_user_email, 'system'), COALESCE(p_reason, 'Transitioned to ' || p_new_status));

  -- 4. Re-evaluate Workstream Status
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

  -- 5. Re-evaluate Civic Issue Status
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
$$ LANGUAGE plpgsql;
