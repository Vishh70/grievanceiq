-- Phase 13 Migration: Add processing_status and processing_error columns to complaints
-- GrievanceIQ - Async Worker Processing Status Tracking
--
-- These columns are used by the BullMQ complaint worker to track
-- the state of async AI processing (PENDING → PROCESSING → PROCESSED/FAILED).
-- They were referenced in the application code but never added to the schema.

-- 1. Add processing_status column to track async worker state
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'PROCESSED';

-- 2. Add processing_error column to store error messages when processing fails
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS processing_error text;

-- 3. Create index for recovery queries (find stale PENDING/PROCESSING complaints)
CREATE INDEX IF NOT EXISTS idx_complaints_processing_status ON public.complaints(processing_status);

-- 4. Documentation comments
COMMENT ON COLUMN public.complaints.processing_status IS 'Tracks async AI processing state: PENDING, PROCESSING, PROCESSED, or FAILED';
COMMENT ON COLUMN public.complaints.processing_error IS 'Error message if AI processing failed, null otherwise';
