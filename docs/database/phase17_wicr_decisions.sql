-- ============================================================================
-- Phase 17 Migration — FR06 WICR Decision Service & Review Audit Trail
-- 
-- FR06 Policy:
-- 1. Evaluates Weighted Incident & Causality Resolution (WICR) decisions using
--    minimum expected loss over empirically calibrated probabilities.
-- 2. Maintains an immutable versioned audit history of all WICR decisions
--    in `public.wicr_decisions` with model, calibrator, and policy versions.
-- 3. Exposes a review queue view `v_pending_wicr_reviews` for items routed
--    to human verification due to high uncertainty, near-ties, or uncalibrated scores.
-- 4. Provides stored procedures for atomic decision recording and review resolution.
-- ============================================================================

-- 1. Table for immutable versioned WICR decisions and review queue
CREATE TABLE IF NOT EXISTS public.wicr_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  target_complaint_id UUID NOT NULL REFERENCES public.complaints(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  raw_probability NUMERIC(6, 4) NOT NULL,
  calibrated_probability NUMERIC(6, 4),
  is_calibrated BOOLEAN NOT NULL DEFAULT false,
  loss_accept NUMERIC(10, 4) NOT NULL,
  loss_reject NUMERIC(10, 4) NOT NULL,
  loss_review NUMERIC(10, 4) NOT NULL,
  cost_matrix JSONB NOT NULL DEFAULT '{"false_lock": 10.0, "missed_link": 5.0, "review": 1.0}'::jsonb,
  selected_action TEXT NOT NULL CHECK (selected_action IN ('ACCEPT', 'REJECT', 'REVIEW')),
  review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status IN ('NOT_REQUIRED', 'PENDING', 'RESOLVED_ACCEPT', 'RESOLVED_REJECT')),
  routed_reason TEXT,
  model_version TEXT NOT NULL DEFAULT '1.0',
  calibration_version TEXT DEFAULT '1.0',
  policy_version TEXT NOT NULL DEFAULT '1.0',
  reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewer_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  is_latest BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wicr_source_target ON public.wicr_decisions (source_complaint_id, target_complaint_id);
CREATE INDEX IF NOT EXISTS idx_wicr_pending ON public.wicr_decisions (review_status) WHERE review_status = 'PENDING';
CREATE INDEX IF NOT EXISTS idx_wicr_latest ON public.wicr_decisions (source_complaint_id, target_complaint_id, is_latest);

-- 2. View for pending human review queue with complaint context
CREATE OR REPLACE VIEW public.v_pending_wicr_reviews AS
SELECT 
  d.id AS decision_id,
  d.source_complaint_id,
  c1.title AS source_title,
  c1.category AS source_category,
  c1.description AS source_description,
  d.target_complaint_id,
  c2.title AS target_title,
  c2.category AS target_category,
  c2.description AS target_description,
  d.relationship_type,
  d.raw_probability,
  d.calibrated_probability,
  d.is_calibrated,
  d.loss_accept,
  d.loss_reject,
  d.loss_review,
  d.cost_matrix,
  d.selected_action,
  d.review_status,
  d.routed_reason,
  d.model_version,
  d.calibration_version,
  d.policy_version,
  d.created_at
FROM public.wicr_decisions d
JOIN public.complaints c1 ON c1.id = d.source_complaint_id
JOIN public.complaints c2 ON c2.id = d.target_complaint_id
WHERE d.review_status = 'PENDING' AND d.is_latest = true
ORDER BY d.created_at DESC;

-- 3. Stored Procedure: record_wicr_decision
CREATE OR REPLACE FUNCTION public.record_wicr_decision(
  p_source_id UUID,
  p_target_id UUID,
  p_relationship_type TEXT,
  p_raw_prob NUMERIC,
  p_cal_prob NUMERIC,
  p_is_calibrated BOOLEAN,
  p_loss_accept NUMERIC,
  p_loss_reject NUMERIC,
  p_loss_review NUMERIC,
  p_cost_matrix JSONB,
  p_selected_action TEXT,
  p_routed_reason TEXT,
  p_model_version TEXT DEFAULT '1.0',
  p_calibration_version TEXT DEFAULT '1.0',
  p_policy_version TEXT DEFAULT '1.0'
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_decision_id UUID;
  v_review_status TEXT;
  v_src UUID;
  v_tgt UUID;
BEGIN
  -- Validate complaint existence
  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = p_source_id) THEN
    RAISE EXCEPTION 'Source complaint % not found', p_source_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Target complaint % not found', p_target_id;
  END IF;

  -- Canonical pair ordering for relationship persistence
  IF p_source_id < p_target_id THEN
    v_src := p_source_id;
    v_tgt := p_target_id;
  ELSE
    v_src := p_target_id;
    v_tgt := p_source_id;
  END IF;

  -- Determine initial review status
  IF p_selected_action = 'REVIEW' THEN
    v_review_status := 'PENDING';
  ELSE
    v_review_status := 'NOT_REQUIRED';
  END IF;

  -- Archive prior decisions for this exact complaint pair
  UPDATE public.wicr_decisions
  SET is_latest = false, updated_at = now()
  WHERE source_complaint_id = p_source_id 
    AND target_complaint_id = p_target_id
    AND is_latest = true;

  -- Insert the new decision record
  INSERT INTO public.wicr_decisions (
    source_complaint_id,
    target_complaint_id,
    relationship_type,
    raw_probability,
    calibrated_probability,
    is_calibrated,
    loss_accept,
    loss_reject,
    loss_review,
    cost_matrix,
    selected_action,
    review_status,
    routed_reason,
    model_version,
    calibration_version,
    policy_version,
    is_latest
  )
  VALUES (
    p_source_id,
    p_target_id,
    p_relationship_type,
    p_raw_prob,
    p_cal_prob,
    COALESCE(p_is_calibrated, false),
    p_loss_accept,
    p_loss_reject,
    p_loss_review,
    COALESCE(p_cost_matrix, '{"false_lock": 10.0, "missed_link": 5.0, "review": 1.0}'::jsonb),
    p_selected_action,
    v_review_status,
    p_routed_reason,
    COALESCE(p_model_version, '1.0'),
    p_calibration_version,
    COALESCE(p_policy_version, '1.0'),
    true
  )
  RETURNING id INTO v_decision_id;

  -- If ACCEPTED, persist the edge into complaint_relationships if valid link type
  IF p_selected_action = 'ACCEPT' AND p_relationship_type IN ('Duplicate', 'Related') THEN
    INSERT INTO public.complaint_relationships (
      source_complaint_id, target_complaint_id, relationship_type, confidence, reason
    )
    VALUES (
      v_src,
      v_tgt,
      p_relationship_type,
      COALESCE(p_cal_prob, p_raw_prob),
      'WICR Automated Decision ACCEPT (Loss=' || p_loss_accept || ')'
    )
    ON CONFLICT (source_complaint_id, target_complaint_id) DO UPDATE
    SET relationship_type = EXCLUDED.relationship_type,
        confidence = EXCLUDED.confidence,
        reason = EXCLUDED.reason;
  ELSIF p_selected_action = 'REJECT' THEN
    -- If an automated REJECT occurs, ensure any existing edge is removed
    DELETE FROM public.complaint_relationships
    WHERE source_complaint_id = v_src AND target_complaint_id = v_tgt;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', v_decision_id,
    'selected_action', p_selected_action,
    'review_status', v_review_status,
    'source_complaint_id', p_source_id,
    'target_complaint_id', p_target_id,
    'relationship_type', p_relationship_type,
    'is_calibrated', p_is_calibrated
  );
END;
$$;

-- 4. Stored Procedure: resolve_wicr_review
CREATE OR REPLACE FUNCTION public.resolve_wicr_review(
  p_decision_id UUID,
  p_reviewer_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_record RECORD;
  v_new_status TEXT;
  v_src UUID;
  v_tgt UUID;
BEGIN
  -- Validate action
  IF p_action NOT IN ('ACCEPT', 'REJECT') THEN
    RAISE EXCEPTION 'Invalid review resolution action %. Must be ACCEPT or REJECT', p_action;
  END IF;

  -- Find decision
  SELECT * INTO v_record
  FROM public.wicr_decisions
  WHERE id = p_decision_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WICR decision % not found', p_decision_id;
  END IF;

  IF v_record.review_status != 'PENDING' THEN
    RAISE EXCEPTION 'WICR decision % is already resolved (status: %)', p_decision_id, v_record.review_status;
  END IF;

  IF p_action = 'ACCEPT' THEN
    v_new_status := 'RESOLVED_ACCEPT';
  ELSE
    v_new_status := 'RESOLVED_REJECT';
  END IF;

  -- Update decision
  UPDATE public.wicr_decisions
  SET review_status = v_new_status,
      reviewer_id = p_reviewer_id,
      reviewer_notes = p_notes,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_decision_id;

  -- Canonical pair ordering
  IF v_record.source_complaint_id < v_record.target_complaint_id THEN
    v_src := v_record.source_complaint_id;
    v_tgt := v_record.target_complaint_id;
  ELSE
    v_src := v_record.target_complaint_id;
    v_tgt := v_record.source_complaint_id;
  END IF;

  -- Sync with complaint_relationships
  IF p_action = 'ACCEPT' AND v_record.relationship_type IN ('Duplicate', 'Related') THEN
    INSERT INTO public.complaint_relationships (
      source_complaint_id, target_complaint_id, relationship_type, confidence, reason
    )
    VALUES (
      v_src,
      v_tgt,
      v_record.relationship_type,
      COALESCE(v_record.calibrated_probability, v_record.raw_probability),
      'Human verified via WICR Review Queue: ' || COALESCE(p_notes, 'Approved by reviewer')
    )
    ON CONFLICT (source_complaint_id, target_complaint_id) DO UPDATE
    SET relationship_type = EXCLUDED.relationship_type,
        confidence = EXCLUDED.confidence,
        reason = EXCLUDED.reason;
  ELSIF p_action = 'REJECT' THEN
    DELETE FROM public.complaint_relationships
    WHERE source_complaint_id = v_src AND target_complaint_id = v_tgt;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'decision_id', p_decision_id,
    'resolved_action', p_action,
    'review_status', v_new_status,
    'reviewer_id', p_reviewer_id,
    'resolved_at', now()
  );
END;
$$;

