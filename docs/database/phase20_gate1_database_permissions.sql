-- Gate 1: GrievanceIQ uses custom application JWTs through Express.
-- These tables, views and RPCs are backend-only, including public-feed reads.
-- Safe to run before the feature upgrade for existing objects and again after it.
-- PostgreSQL 15+ required for security_invoker views (selected staging uses 17).
BEGIN;

DO $permissions$
DECLARE object_name text; role_name text; fn record;
BEGIN
  FOREACH object_name IN ARRAY ARRAY[
    'users','complaints','departments','civic_issues','complaint_relationships',
    'workstreams','tasks','routing_results','task_dependencies','task_status_history',
    'wicr_decisions','wicr_review_events','task_dependency_recommendations'
  ] LOOP
    IF to_regclass(format('public.%I',object_name)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',object_name);
    -- The observed legacy policy is TO public USING (true), despite its name.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I','Enable all access for service_role',object_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',object_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',object_name,role_name);
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE public.%I TO service_role',object_name);
    END IF;
  END LOOP;

  FOREACH object_name IN ARRAY ARRAY[
    'v_pending_wicr_reviews','v_pending_dependency_recommendations','v_civic_issue_related_links'
  ] LOOP
    IF to_regclass(format('public.%I',object_name)) IS NULL THEN CONTINUE; END IF;
    EXECUTE format('ALTER VIEW public.%I SET (security_invoker=true)',object_name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC',object_name);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I',object_name,role_name);
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO service_role',object_name);
    END IF;
  END LOOP;

  -- Handle every overload of the named application functions, including future
  -- signature changes. Do not alter extension-owned or unrelated functions.
  FOR fn IN SELECT p.oid::regprocedure AS signature FROM pg_proc p
    JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
      'acquire_complaint_lease','renew_complaint_lease','commit_complaint_processing',
      'record_complaint_failure','commit_complaint_pipeline_transaction',
      'get_related_civic_issues','check_improper_civic_issue_groupings',
      'add_task_dependency_transactional','check_task_cycle_trigger',
      'update_task_status_transactional','record_wicr_decision','resolve_wicr_review',
      'prevent_wicr_event_mutation','accept_dependency_recommendation',
      'reject_dependency_recommendation','verify_civic_issue_resolution'
    ]) LOOP
    EXECUTE format('ALTER FUNCTION %s SECURITY INVOKER',fn.signature);
    EXECUTE format('ALTER FUNCTION %s SET search_path = %L',fn.signature,'');
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',fn.signature);
    FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',fn.signature,role_name);
      END IF;
    END LOOP;
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',fn.signature);
    END IF;
  END LOOP;

  -- Defaults apply to objects subsequently created by this migration's owner.
  -- PUBLIC function EXECUTE is a global default and requires a global revoke;
  -- a schema-scoped revoke alone does not remove that inherited default.
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM %I',role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM %I',role_name);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',role_name);
    END IF;
  END LOOP;
END
$permissions$;

NOTIFY pgrst, 'reload schema';
COMMIT;
