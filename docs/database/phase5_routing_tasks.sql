-- Phase 5 Migration: Create Routing, Workstreams, and Tasks
-- GrievanceIQ AI Pipeline - Phase 5: Multi-Department Routing + Task Generation

-- 1. Create workstreams table
CREATE TABLE IF NOT EXISTS public.workstreams (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  civic_issue_id uuid REFERENCES public.civic_issues(id) ON DELETE CASCADE,
  department_id text NOT NULL, -- Storing the department name string as requested (e.g. "Water Department")
  issue_types text[] DEFAULT '{}',
  status text DEFAULT 'PENDING',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(civic_issue_id, department_id) -- Idempotency: One workstream per department per civic issue
);

-- 2. Create tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  civic_issue_id uuid REFERENCES public.civic_issues(id) ON DELETE CASCADE,
  workstream_id uuid REFERENCES public.workstreams(id) ON DELETE CASCADE,
  department_id text NOT NULL,
  issue_type text NOT NULL,
  title text NOT NULL,
  description text,
  status text DEFAULT 'PENDING',
  priority text DEFAULT 'Medium',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(civic_issue_id, issue_type, title) -- Idempotency: Prevent duplicate tasks for the same issue
);

-- 3. Create routing_results table (Optional, for caching/explainability)
CREATE TABLE IF NOT EXISTS public.routing_results (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  civic_issue_id uuid REFERENCES public.civic_issues(id) ON DELETE CASCADE UNIQUE,
  issue_types jsonb DEFAULT '[]',
  departments jsonb DEFAULT '[]',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 4. Create Indexes
CREATE INDEX IF NOT EXISTS idx_workstreams_civic_issue_id ON public.workstreams(civic_issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_civic_issue_id ON public.tasks(civic_issue_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workstream_id ON public.tasks(workstream_id);

-- 5. Documentation
COMMENT ON TABLE public.workstreams IS 'Department-specific workstreams generated from a Civic Issue';
COMMENT ON TABLE public.tasks IS 'Actionable operational tasks generated from deterministic templates';
COMMENT ON TABLE public.routing_results IS 'Stored results of the multi-label classification and department routing process';
