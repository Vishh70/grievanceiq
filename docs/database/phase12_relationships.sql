-- Phase 12: Relationship Persistence

CREATE TABLE IF NOT EXISTS public.complaint_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    target_complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
    relationship_type TEXT NOT NULL,
    confidence NUMERIC,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    
    -- Ensure canonical order: source_complaint_id < target_complaint_id
    CONSTRAINT canonical_edge_order CHECK (source_complaint_id < target_complaint_id),
    -- Ensure uniqueness of pairs
    CONSTRAINT unique_relationship_pair UNIQUE (source_complaint_id, target_complaint_id)
);

CREATE INDEX IF NOT EXISTS idx_complaint_rels_source ON public.complaint_relationships(source_complaint_id);
CREATE INDEX IF NOT EXISTS idx_complaint_rels_target ON public.complaint_relationships(target_complaint_id);
CREATE INDEX IF NOT EXISTS idx_complaint_rels_type ON public.complaint_relationships(relationship_type);

-- Step 2: Civic Issue Merging Support
ALTER TABLE public.civic_issues
  ADD COLUMN IF NOT EXISTS merged_into_id UUID REFERENCES public.civic_issues(id) ON DELETE SET NULL;

