-- ============================================================================
-- GrievanceIQ — WICR Decisions, Audit Immutability & Gate 1 Permission Hardening
-- 
-- Applies:
-- 1. `department` column to public.users (Phase 18)
-- 2. `public.wicr_decisions` table and indexes (Phase 17)
-- 3. `public.wicr_review_events` append-only audit trail and trigger (Phase 18)
-- 4. `public.v_pending_wicr_reviews` queue view (Phase 18)
-- 5. `public.record_wicr_decision` RPC with audit logging (Phase 18)
-- 6. `public.resolve_wicr_review` RPC with row locking (Phase 18)
-- 7. Gate 1 database permission hardening & PostgREST access controls (Phase 20)
-- 8. PostgREST schema cache reload notification
-- ============================================================================

BEGIN;

-- 1. Ensure department exists on users
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS department TEXT;

-- 2. Create wicr_decisions table
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

-- 3. Create wicr_review_events table (strictly append-only audit trail)
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

-- Trigger to prevent UPDATE or DELETE on wicr_review_events
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

-- 4. Create view v_pending_wicr_reviews
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

-- 5. Stored Procedure: record_wicr_decision
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
  IF p_source_id = p_target_id THEN
    RAISE EXCEPTION 'Source and target complaints must be distinct';
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
  WHERE (
    (source_complaint_id = p_source_id AND target_complaint_id = p_target_id)
    OR (source_complaint_id = p_target_id AND target_complaint_id = p_source_id)
  ) AND is_latest = true;

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

-- 6. Stored Procedure: resolve_wicr_review (with row-level lock)
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

  IF p_reviewer_id IS NOT NULL THEN
    SELECT email, role INTO v_reviewer_email, v_reviewer_role FROM public.users WHERE id = p_reviewer_id;
  END IF;

  IF p_action = 'ACCEPT' THEN
    v_new_status := 'RESOLVED_ACCEPT';
  ELSE
    v_new_status := 'RESOLVED_REJECT';
  END IF;

  UPDATE public.wicr_decisions
  SET review_status = v_new_status,
      reviewer_id = p_reviewer_id,
      reviewer_notes = p_notes,
      reviewed_at = now(),
      updated_at = now()
  WHERE id = p_decision_id;

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

-- 7. Gate 1 Security & Permissions Hardening
DO $wicr_permissions$
DECLARE object_name text; role_name text; fn record;
BEGIN
  -- Tables: Enable RLS, revoke public/anon/authenticated, grant service_role
  FOREACH object_name IN ARRAY ARRAY[
    'users','complaints','departments','civic_issues','complaint_relationships',
    'workstreams','tasks','routing_results','task_dependencies','task_status_history',
    'wicr_decisions','wicr_review_events','task_dependency_recommendations'
  ] LOOP
    IF to_regclass(format('public.%I', object_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', object_name);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Enable all access for service_role', object_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', object_name);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', object_name, role_name);
        END IF;
      END LOOP;
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
        EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role', object_name);
      END IF;
    END IF;
  END LOOP;

  -- View: security_invoker = true, revoke public/anon/authenticated, grant service_role
  IF to_regclass('public.v_pending_wicr_reviews') IS NOT NULL THEN
    EXECUTE 'ALTER VIEW public.v_pending_wicr_reviews SET (security_invoker=true)';
    EXECUTE 'REVOKE ALL ON TABLE public.v_pending_wicr_reviews FROM PUBLIC';
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.v_pending_wicr_reviews FROM %I', role_name);
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE 'GRANT SELECT ON TABLE public.v_pending_wicr_reviews TO service_role';
    END IF;
  END IF;

  -- Functions: SECURITY INVOKER, search_path = '', revoke public/anon/authenticated, grant service_role
  FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'record_wicr_decision', 'resolve_wicr_review', 'prevent_wicr_event_mutation'
    ]) LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER', fn.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L', fn.signature, '');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn.signature);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', fn.signature, role_name);
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.signature);
    END IF;
  END LOOP;
END
$wicr_permissions$;

-- 8. PostgREST Schema Cache Reload
NOTIFY pgrst, 'reload schema';

COMMIT;
