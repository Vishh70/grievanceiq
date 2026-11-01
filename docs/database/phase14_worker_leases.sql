-- ============================================================================
-- Phase 14 Migration — Worker Lease Locking & Atomic Pipeline Commit
-- Adds distributed lease columns to complaints for idempotent processing.
-- Adds RPC function for atomic complaint pipeline commit.
-- ============================================================================

-- 1. Worker lease tracking columns
ALTER TABLE public.complaints
  ADD COLUMN IF NOT EXISTS locked_by TEXT,
  ADD COLUMN IF NOT EXISTS lock_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_complaints_lock_expires ON public.complaints(lock_expires_at)
  WHERE processing_status IN ('PROCESSING', 'PENDING', 'FAILED');

COMMENT ON COLUMN public.complaints.locked_by IS 'Unique worker token that currently owns this complaint for processing';
COMMENT ON COLUMN public.complaints.lock_expires_at IS 'Lease expiration time; expired leases can be reclaimed by other workers';
COMMENT ON COLUMN public.complaints.retry_count IS 'Number of processing attempts for this complaint';

-- 2. Atomic lease acquisition function
-- Returns the complaint ID if lease was acquired, NULL if already claimed
CREATE OR REPLACE FUNCTION public.acquire_complaint_lease(
  p_complaint_id UUID,
  p_worker_id TEXT,
  p_lease_duration_seconds INTEGER DEFAULT 300
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_acquired_id UUID;
BEGIN
  UPDATE public.complaints
  SET
    processing_status = 'PROCESSING',
    locked_by = p_worker_id,
    lock_expires_at = NOW() + (p_lease_duration_seconds || ' seconds')::INTERVAL,
    retry_count = COALESCE(retry_count, 0) + 1,
    processing_error = NULL,
    updated_at = NOW()
  WHERE id = p_complaint_id
    AND (
      processing_status IN ('PENDING', 'FAILED')
      OR (processing_status = 'PROCESSING' AND lock_expires_at < NOW())
    )
    AND processing_status != 'PROCESSED'
  RETURNING id INTO v_acquired_id;

  RETURN v_acquired_id;
END;
$$;

COMMENT ON FUNCTION public.acquire_complaint_lease IS 'Atomically acquires a processing lease on a complaint. Returns NULL if already claimed or PROCESSED.';

-- 3. Lease renewal function
CREATE OR REPLACE FUNCTION public.renew_complaint_lease(
  p_complaint_id UUID,
  p_worker_id TEXT,
  p_lease_duration_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.complaints
  SET
    lock_expires_at = NOW() + (p_lease_duration_seconds || ' seconds')::INTERVAL,
    updated_at = NOW()
  WHERE id = p_complaint_id
    AND locked_by = p_worker_id
    AND processing_status = 'PROCESSING';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

-- 4. Atomic pipeline commit function
-- Commits processing results and releases the lease in one transaction.
-- Verifies worker ownership before committing.
CREATE OR REPLACE FUNCTION public.commit_complaint_processing(
  p_complaint_id UUID,
  p_worker_id TEXT,
  p_category TEXT DEFAULT NULL,
  p_priority TEXT DEFAULT NULL,
  p_severity_score NUMERIC DEFAULT NULL,
  p_safety_hazards TEXT[] DEFAULT NULL,
  p_suggested_action TEXT DEFAULT NULL,
  p_keywords TEXT[] DEFAULT NULL,
  p_embedding_vector FLOAT8[] DEFAULT NULL,
  p_similar_group_id UUID DEFAULT NULL,
  p_ai_duplicate_flag BOOLEAN DEFAULT FALSE,
  p_duplicate_score NUMERIC DEFAULT 0,
  p_duplicate_candidate_id UUID DEFAULT NULL,
  p_duplicate_semantic_score NUMERIC DEFAULT 0,
  p_duplicate_location_score NUMERIC DEFAULT 0,
  p_duplicate_temporal_score NUMERIC DEFAULT 0,
  p_ml_labels TEXT[] DEFAULT NULL,
  p_ml_probabilities JSONB DEFAULT NULL,
  p_ml_departments TEXT[] DEFAULT NULL,
  p_civic_issue_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_rows INTEGER;
BEGIN
  UPDATE public.complaints
  SET
    category = COALESCE(p_category, category),
    priority = COALESCE(p_priority, priority),
    severity_score = COALESCE(p_severity_score, severity_score),
    safety_hazards = COALESCE(p_safety_hazards, safety_hazards),
    suggested_action = COALESCE(p_suggested_action, suggested_action),
    keywords = COALESCE(p_keywords, keywords),
    embedding_vector = COALESCE(p_embedding_vector, embedding_vector),
    similar_group_id = COALESCE(p_similar_group_id, similar_group_id),
    ai_duplicate_flag = p_ai_duplicate_flag,
    duplicate_score = p_duplicate_score,
    duplicate_candidate_id = p_duplicate_candidate_id,
    duplicate_semantic_score = p_duplicate_semantic_score,
    duplicate_location_score = p_duplicate_location_score,
    duplicate_temporal_score = p_duplicate_temporal_score,
    ml_labels = COALESCE(p_ml_labels, ml_labels),
    ml_probabilities = COALESCE(p_ml_probabilities, ml_probabilities),
    ml_departments = COALESCE(p_ml_departments, ml_departments),
    civic_issue_id = COALESCE(p_civic_issue_id, civic_issue_id),
    ai_processed = TRUE,
    processing_status = 'PROCESSED',
    processing_error = NULL,
    locked_by = NULL,
    lock_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_complaint_id
    AND locked_by = p_worker_id
    AND processing_status = 'PROCESSING';

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows > 0;
END;
$$;

COMMENT ON FUNCTION public.commit_complaint_processing IS 'Atomically commits all processing results and releases the worker lease. Returns FALSE if ownership was lost.';

-- 5. Record processing failure (outside the main transaction)
CREATE OR REPLACE FUNCTION public.record_complaint_failure(
  p_complaint_id UUID,
  p_worker_id TEXT,
  p_error_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.complaints
  SET
    processing_status = 'FAILED',
    processing_error = LEFT(COALESCE(p_error_message, 'Unknown error'), 500),
    locked_by = NULL,
    lock_expires_at = NULL,
    ai_processed = FALSE,
    updated_at = NOW()
  WHERE id = p_complaint_id
    AND (locked_by = p_worker_id OR locked_by IS NULL OR lock_expires_at < NOW());
END;
$$;

-- ============================================================================
-- 6. Comprehensive Atomic Pipeline Transaction Function
-- Commits civic issue, tasks, workstreams, relationships, and complaint processing status
-- in a single atomic transaction. Verifies lease ownership with row-level locking (FOR UPDATE).
-- If any part fails or ownership is lost, the entire transaction rolls back.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.commit_complaint_pipeline_transaction(
  p_complaint_id UUID,
  p_worker_id TEXT,
  p_complaint_updates JSONB,
  p_civic_issue JSONB DEFAULT NULL,
  p_relationships JSONB DEFAULT '[]'::jsonb,
  p_tasks JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_current_worker TEXT;
  v_current_status TEXT;
  v_lock_expires TIMESTAMPTZ;
  v_civic_issue_id UUID;
  v_rel JSONB;
  v_task JSONB;
  v_ws_id UUID;
  v_src_id UUID;
  v_tgt_id UUID;
  v_temp UUID;
  v_merged_id UUID;
  v_complaint_ids UUID[];
BEGIN
  -- Row-level lock and verify worker lease ownership
  SELECT locked_by, processing_status, lock_expires_at
  INTO v_current_worker, v_current_status, v_lock_expires
  FROM public.complaints
  WHERE id = p_complaint_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Complaint % not found', p_complaint_id;
  END IF;

  IF v_current_status = 'PROCESSED' THEN
    RAISE EXCEPTION 'Complaint % is already PROCESSED', p_complaint_id;
  END IF;

  IF v_current_worker IS DISTINCT FROM p_worker_id THEN
    RAISE EXCEPTION 'Worker % lost lease ownership to % on complaint %', p_worker_id, v_current_worker, p_complaint_id;
  END IF;

  IF v_lock_expires IS NOT NULL AND v_lock_expires < NOW() THEN
    RAISE EXCEPTION 'Lease expired for worker % on complaint %', p_worker_id, p_complaint_id;
  END IF;

  -- 1. Civic Issue handling
  IF p_civic_issue IS NOT NULL AND p_civic_issue != 'null'::jsonb THEN
    IF p_civic_issue->>'complaint_ids' IS NOT NULL THEN
      SELECT ARRAY(SELECT jsonb_array_elements_text(p_civic_issue->'complaint_ids')::UUID)
      INTO v_complaint_ids;
    ELSE
      v_complaint_ids := ARRAY[p_complaint_id];
    END IF;

    IF p_civic_issue->>'id' IS NOT NULL THEN
      v_civic_issue_id := (p_civic_issue->>'id')::UUID;
      UPDATE public.civic_issues
      SET
        title = COALESCE(p_civic_issue->>'title', title),
        primary_category = COALESCE(p_civic_issue->>'primary_category', primary_category),
        priority = COALESCE(p_civic_issue->>'priority', priority),
        complaint_ids = v_complaint_ids,
        updated_at = NOW()
      WHERE id = v_civic_issue_id;
    ELSE
      INSERT INTO public.civic_issues (
        title, primary_category, priority, location_lat, location_lng, complaint_ids
      )
      VALUES (
        COALESCE(p_civic_issue->>'title', 'General Civic Issue'),
        COALESCE(p_civic_issue->>'primary_category', 'Other'),
        COALESCE(p_civic_issue->>'priority', 'Medium'),
        (p_civic_issue->>'location_lat')::NUMERIC,
        (p_civic_issue->>'location_lng')::NUMERIC,
        v_complaint_ids
      )
      RETURNING id INTO v_civic_issue_id;
    END IF;

    -- Update all associated complaints to link to this civic issue
    IF v_civic_issue_id IS NOT NULL AND array_length(v_complaint_ids, 1) > 0 THEN
      UPDATE public.complaints
      SET civic_issue_id = v_civic_issue_id
      WHERE id = ANY(v_complaint_ids);
    END IF;

    -- Handle merged civic issues
    IF p_civic_issue->'merged_issues' IS NOT NULL THEN
      FOR v_merged_id IN SELECT jsonb_array_elements_text(p_civic_issue->'merged_issues')::UUID LOOP
        UPDATE public.civic_issues
        SET status = 'Merged', merged_into_id = v_civic_issue_id, updated_at = NOW()
        WHERE id = v_merged_id;
      END LOOP;
    END IF;
  END IF;

  -- 2. Relationships handling
  IF p_relationships IS NOT NULL AND jsonb_array_length(p_relationships) > 0 THEN
    FOR v_rel IN SELECT * FROM jsonb_array_elements(p_relationships) LOOP
      v_src_id := (v_rel->>'source_id')::UUID;
      v_tgt_id := (v_rel->>'target_id')::UUID;

      -- Enforce canonical edge ordering: source < target
      IF v_src_id > v_tgt_id THEN
        v_temp := v_src_id;
        v_src_id := v_tgt_id;
        v_tgt_id := v_temp;
      END IF;

      IF v_src_id != v_tgt_id THEN
        INSERT INTO public.complaint_relationships (
          source_complaint_id, target_complaint_id, relationship_type, confidence, reason
        )
        VALUES (
          v_src_id, v_tgt_id, v_rel->>'type', (v_rel->>'confidence')::NUMERIC, v_rel->>'reason'
        )
        ON CONFLICT (source_complaint_id, target_complaint_id) DO UPDATE
        SET relationship_type = EXCLUDED.relationship_type,
            confidence = EXCLUDED.confidence,
            reason = EXCLUDED.reason;
      END IF;
    END LOOP;
  END IF;

  -- 3. Workstreams & Tasks handling
  IF p_tasks IS NOT NULL AND jsonb_array_length(p_tasks) > 0 AND v_civic_issue_id IS NOT NULL THEN
    FOR v_task IN SELECT * FROM jsonb_array_elements(p_tasks) LOOP
      -- Ensure workstream exists
      INSERT INTO public.workstreams (civic_issue_id, department_id, status)
      VALUES (v_civic_issue_id, v_task->>'department_id', 'PENDING')
      ON CONFLICT (civic_issue_id, department_id) DO UPDATE
      SET updated_at = NOW()
      RETURNING id INTO v_ws_id;

      -- Insert task
      INSERT INTO public.tasks (
        civic_issue_id, workstream_id, department_id, issue_type, title, description, priority, status
      )
      VALUES (
        v_civic_issue_id,
        v_ws_id,
        v_task->>'department_id',
        v_task->>'issue_type',
        v_task->>'title',
        v_task->>'description',
        COALESCE(v_task->>'priority', 'Medium'),
        'PENDING'
      );
    END LOOP;
  END IF;

  -- 4. Final Complaint update & lease release
  UPDATE public.complaints
  SET
    category = COALESCE(p_complaint_updates->>'category', category),
    priority = COALESCE(p_complaint_updates->>'priority', priority),
    severity_score = COALESCE((p_complaint_updates->>'severity_score')::NUMERIC, severity_score),
    suggested_action = COALESCE(p_complaint_updates->>'suggested_action', suggested_action),
    similar_group_id = COALESCE((p_complaint_updates->>'similar_group_id')::UUID, similar_group_id),
    ai_duplicate_flag = COALESCE((p_complaint_updates->>'ai_duplicate_flag')::BOOLEAN, ai_duplicate_flag),
    duplicate_score = COALESCE((p_complaint_updates->>'duplicate_score')::NUMERIC, duplicate_score),
    duplicate_candidate_id = COALESCE((p_complaint_updates->>'duplicate_candidate_id')::UUID, duplicate_candidate_id),
    duplicate_semantic_score = COALESCE((p_complaint_updates->>'duplicate_semantic_score')::NUMERIC, duplicate_semantic_score),
    duplicate_location_score = COALESCE((p_complaint_updates->>'duplicate_location_score')::NUMERIC, duplicate_location_score),
    duplicate_temporal_score = COALESCE((p_complaint_updates->>'duplicate_temporal_score')::NUMERIC, duplicate_temporal_score),
    civic_issue_id = COALESCE(v_civic_issue_id, (p_complaint_updates->>'civic_issue_id')::UUID, civic_issue_id),
    keywords = CASE 
      WHEN p_complaint_updates ? 'keywords' AND jsonb_typeof(p_complaint_updates->'keywords') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_complaint_updates->'keywords'))
      ELSE keywords
    END,
    safety_hazards = CASE 
      WHEN p_complaint_updates ? 'safety_hazards' AND jsonb_typeof(p_complaint_updates->'safety_hazards') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_complaint_updates->'safety_hazards'))
      ELSE safety_hazards
    END,
    ml_labels = CASE 
      WHEN p_complaint_updates ? 'ml_labels' AND jsonb_typeof(p_complaint_updates->'ml_labels') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_complaint_updates->'ml_labels'))
      ELSE ml_labels
    END,
    ml_departments = CASE 
      WHEN p_complaint_updates ? 'ml_departments' AND jsonb_typeof(p_complaint_updates->'ml_departments') = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(p_complaint_updates->'ml_departments'))
      ELSE ml_departments
    END,
    ml_probabilities = COALESCE(p_complaint_updates->'ml_probabilities', ml_probabilities),
    embedding_vector = CASE 
      WHEN p_complaint_updates ? 'embedding_vector' AND jsonb_typeof(p_complaint_updates->'embedding_vector') = 'array'
      THEN ARRAY(SELECT (jsonb_array_elements_text(p_complaint_updates->'embedding_vector'))::FLOAT8)
      ELSE embedding_vector
    END,
    ai_processed = TRUE,
    processing_status = 'PROCESSED',
    processing_error = NULL,
    locked_by = NULL,
    lock_expires_at = NULL,
    updated_at = NOW()
  WHERE id = p_complaint_id;

  RETURN jsonb_build_object(
    'success', true,
    'complaint_id', p_complaint_id,
    'civic_issue_id', v_civic_issue_id
  );
END;
$$;

COMMENT ON FUNCTION public.commit_complaint_pipeline_transaction IS 'Atomically commits civic issue, tasks, workstreams, relationships, and complaint processing status in a single transaction with lease ownership verification.';
