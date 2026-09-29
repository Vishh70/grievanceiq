-- Phase 2 Migration: Add duplicate detection diagnostic columns to complaints table
-- GrievanceIQ AI Pipeline - Phase 2: Real Duplicate Detection
--
-- Prerequisite: Phase 1 migration (embedding_vector) must have been run first.
-- Run this in your Supabase SQL Editor after phase1_embedding.sql.

-- 1. Add numeric duplicate score (weighted combination of semantic + location + temporal)
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS duplicate_score numeric DEFAULT 0;

-- 2. Add reference to the complaint this was matched against
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS duplicate_candidate_id uuid REFERENCES public.complaints(id) ON DELETE SET NULL;

-- 3. Add individual diagnostic scores for debugging / demonstration
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS duplicate_semantic_score numeric DEFAULT 0;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS duplicate_location_score numeric DEFAULT 0;

ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS duplicate_temporal_score numeric DEFAULT 0;

-- 4. Documentation comments
COMMENT ON COLUMN public.complaints.duplicate_score IS 'Weighted duplicate score: 0.50*semantic + 0.30*location + 0.20*temporal';
COMMENT ON COLUMN public.complaints.duplicate_candidate_id IS 'UUID of the existing complaint this was identified as a duplicate of';
COMMENT ON COLUMN public.complaints.duplicate_semantic_score IS 'Cosine similarity between MiniLM embeddings (0-1)';
COMMENT ON COLUMN public.complaints.duplicate_location_score IS 'Haversine proximity score (0-1, decays over 500m radius)';
COMMENT ON COLUMN public.complaints.duplicate_temporal_score IS 'Temporal proximity score (0-1, decays over 48h window)';
