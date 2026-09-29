-- Phase 4 Migration: Create Civic Issues Table and Link Complaints
-- GrievanceIQ AI Pipeline - Phase 4: Civic Knowledge Graph + Connected Components

-- 1. Create civic_issues table
CREATE TABLE IF NOT EXISTS public.civic_issues (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  title text NOT NULL,
  description text,
  primary_category text,
  priority text DEFAULT 'Medium',
  status text DEFAULT 'Open',
  location_lat numeric,
  location_lng numeric,
  complaint_ids uuid[] DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- 2. Add civic_issue_id to complaints table
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS civic_issue_id uuid REFERENCES public.civic_issues(id) ON DELETE SET NULL;

-- 3. Documentation comments
COMMENT ON TABLE public.civic_issues IS 'Aggregated civic issues formed by connected components of related/duplicate complaints';
COMMENT ON COLUMN public.complaints.civic_issue_id IS 'UUID of the civic issue this complaint is grouped into';
