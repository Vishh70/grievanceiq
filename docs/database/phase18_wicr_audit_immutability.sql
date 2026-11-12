-- ============================================================================
-- Phase 18 Migration — FR06 WICR Audit Immutability & Concurrency Hardening
-- 
-- FR06 Hardening:
-- 1. Adds `department` to `public.users` for municipal officer scoping.
-- 2. Creates `public.wicr_review_events` as a strictly append-only audit trail.
-- 3. Attaches an immutable trigger preventing any UPDATE or DELETE on events.
-- 4. Upgrades `resolve_wicr_review` with row-level locks (FOR UPDATE) to prevent
--    concurrent conflicting resolutions and logs durable audit events.
-- 5. Updates `v_pending_wicr_reviews` to expose department and category fields.
-- ============================================================================

-- 1. Add department column to users table if not already present
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department TEXT;

-- 2. Create strictly append-only audit log table for all WICR decisions and review actions
CREATE TABLE IF NOT EXISTS public.wicr_review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL REFERENCES public.wicr_decisions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('DECISION_RECORDED', 'RESOLVED_ACCEPT', 'RESOLVED_REJECT', 'STATUS_MODIFIED')),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  action TEXT,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  actor_role TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wicr_events_decision ON public.wicr_review_events(decision_id);
CREATE INDEX IF NOT EXISTS idx_wicr_events_actor ON public.wicr_review_events(actor_id);
CREATE INDEX IF NOT EXISTS idx_wicr_events_created ON public.wicr_review_events(created_at DESC);

-- 3. Strict trigger function to prevent any UPDATE or DELETE on the audit log table
CREATE OR REPLACE FUNCTION public.prevent_wicr_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'Table wicr_review_events is append-only. Modification or deletion of audit events is prohibited.';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_wicr_event_mutation ON public.wicr_review_events;
CREATE TRIGGER trg_prevent_wicr_event_mutation
BEFORE UPDATE OR DELETE ON public.wicr_review_events
FOR EACH ROW
EXECUTE FUNCTION public.prevent_wicr_event_mutation();

-- 4. Update view v_pending_wicr_reviews to expose departments and category context
DROP VIEW IF EXISTS public.v_pending_wicr_reviews CASCADE;
CREATE VIEW public.v_pending_wicr_reviews AS
SELECT 
  d.id AS decision_id,
  d.source_complaint_id,
  c1.title AS source_title,
  c1.category AS source_category,
  c1.department_id AS source_department,
  c1.description AS source_description,
  d.target_complaint_id,
  c2.title AS target_title,
  c2.category AS target_category,
  c2.department_id AS target_department,
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

-- 5. Upgraded record_wicr_decision logging initial append-only audit event
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
  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = p_source_id) THEN
    RAISE EXCEPTION 'Source complaint % not found', p_source_id;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.complaints WHERE id = p_target_id) THEN
    RAISE EXCEPTION 'Target complaint % not found', p_target_id;
  END IF;

  IF p_source_id < p_target_id THEN
    v_src := p_source_id;
    v_tgt := p_target_id;
  ELSE
    v_src := p_target_id;
    v_tgt := p_source_id;
  END IF;

  IF p_selected_action = 'REVIEW' THEN
    v_review_status := 'PENDING';
  ELSE
    v_review_status := 'NOT_REQUIRED';
  END IF;

  UPDATE public.wicr_decisions
  SET is_latest = false, updated_at = now()
  WHERE source_complaint_id = p_source_id 
    AND target_complaint_id = p_target_id
    AND is_latest = true;

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

  -- Append-only immutable audit event
  INSERT INTO public.wicr_review_events (
    decision_id,
    event_type,
    previous_status,
    new_status,
    action,
    actor_id,
    actor_email,
    actor_role,
    notes,
    metadata
  )
  VALUES (
    v_decision_id,
    'DECISION_RECORDED',
    NULL,
    v_review_status,
    p_selected_action,
    NULL,
    'system',
    'system',
    'Automated WICR decision evaluated: ' || p_selected_action,
    jsonb_build_object(
      'relationship_type', p_relationship_type,
      'raw_probability', p_raw_prob,
      'calibrated_probability', p_cal_prob,
      'loss_accept', p_loss_accept,
      'loss_reject', p_loss_reject,
      'loss_review', p_loss_review,
      'routed_reason', p_routed_reason
    )
  );

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

-- 6. Upgraded resolve_wicr_review with row locking (FOR UPDATE) and immutable audit log
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
  v_reviewer_email TEXT := 'system';
  v_reviewer_role TEXT := 'system';
  v_new_status TEXT;
  v_src UUID;
  v_tgt UUID;
BEGIN
  IF p_action NOT IN ('ACCEPT', 'REJECT') THEN
    RAISE EXCEPTION 'Invalid review resolution action %. Must be ACCEPT or REJECT', p_action;
  END IF;

  -- Acquire row lock to prevent race condition between concurrent reviewers
  SELECT * INTO v_record
  FROM public.wicr_decisions
  WHERE id = p_decision_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'WICR decision % not found', p_decision_id;
  END IF;

  IF v_record.review_status != 'PENDING' THEN
    RAISE EXCEPTION 'WICR decision % is already resolved (status: %)', p_decision_id, v_record.review_status;
  END IF;

  -- Fetch reviewer details if reviewer_id is provided
  IF p_reviewer_id IS NOT NULL THEN
    SELECT email, role INTO v_reviewer_email, v_reviewer_role FROM public.users WHERE id = p_reviewer_id;
  END IF;

  IF p_action = 'ACCEPT' THEN
    v_new_status := 'RESOLVED_ACCEPT';
  ELSE
    v_new_status := 'RESOLVED_REJECT';
  END IF;

  -- Update decision row
  UPDATE public.wicr_decisions
  SET review_status = v_new_status,
      reviewer_id = p_reviewer_id,
      reviewer_notes = p_notes,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_decision_id;

  -- Insert immutable audit event
  INSERT INTO public.wicr_review_events (
    decision_id,
    event_type,
    previous_status,
    new_status,
    action,
    actor_id,
    actor_email,
    actor_role,
    notes,
    metadata
  )
  VALUES (
    p_decision_id,
    v_new_status,
    'PENDING',
    v_new_status,
    p_action,
    p_reviewer_id,
    COALESCE(v_reviewer_email, 'system'),
    COALESCE(v_reviewer_role, 'system'),
    p_notes,
    jsonb_build_object(
      'relationship_type', v_record.relationship_type,
      'raw_probability', v_record.raw_probability,
      'calibrated_probability', v_record.calibrated_probability,
      'resolved_at', now()
    )
  );

  IF v_record.source_complaint_id < v_record.target_complaint_id THEN
    v_src := v_record.source_complaint_id;
    v_tgt := v_record.target_complaint_id;
  ELSE
    v_src := v_record.target_complaint_id;
    v_tgt := v_record.source_complaint_id;
  END IF;

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
