-- Phase 7 Migration: Task Execution & Progress Tracking
-- GrievanceIQ AI Pipeline

-- 1. Add timestamp fields to tasks table
ALTER TABLE public.tasks 
ADD COLUMN IF NOT EXISTS started_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS completed_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone;

-- 2. Create task_status_history table for auditing
CREATE TABLE IF NOT EXISTS public.task_status_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  previous_status text NOT NULL,
  new_status text NOT NULL,
  changed_by text, -- Ideally user ID or email
  reason text,
  changed_at timestamp with time zone DEFAULT now()
);

-- 3. Create indexes for quick history retrieval
CREATE INDEX IF NOT EXISTS idx_task_status_history_task_id ON public.task_status_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_status_history_changed_at ON public.task_status_history(changed_at);

-- 4. Documentation
COMMENT ON TABLE public.task_status_history IS 'Audit log of all manual task status transitions and the user who triggered them';
