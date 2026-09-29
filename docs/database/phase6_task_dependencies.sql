-- Phase 6 Migration: Task Dependencies DAG
-- GrievanceIQ AI Pipeline - Phase 6: Task Dependencies + Execution Order

CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  depends_on_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  
  -- Ensure a task cannot depend on itself
  CONSTRAINT no_self_dependency CHECK (task_id != depends_on_task_id),
  
  -- Ensure no duplicate dependency records
  UNIQUE(task_id, depends_on_task_id)
);

CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON public.task_dependencies(task_id);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on ON public.task_dependencies(depends_on_task_id);

COMMENT ON TABLE public.task_dependencies IS 'Directed edges representing task dependencies (task_id must wait for depends_on_task_id to finish)';
