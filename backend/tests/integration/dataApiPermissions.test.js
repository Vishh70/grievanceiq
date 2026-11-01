// Isolated PostgreSQL permission checks. These do NOT certify live PostgREST access.
const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
const permissions = fs.readFileSync(path.join(root, 'supabase/migrations/20261101131302_gate1_database_permissions.sql'), 'utf8');
const views = ['v_pending_wicr_reviews', 'v_pending_dependency_recommendations', 'v_civic_issue_related_links'];
let db;

test('fresh-install SQL includes the canonical permission migration', () => {
  expect(fs.readFileSync(path.join(root, 'docs/database/ALL_MIGRATIONS.sql'), 'utf8')).toContain(permissions);
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
    GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon,authenticated,service_role;`);
  // Use standalone migrations to test legacy defaults before hardening.
  const files = ['00_initial_schema.sql','phase1_embedding.sql','phase2_duplicate_detection.sql',
    'phase4_civic_issue.sql','phase5_routing_tasks.sql','phase6_task_dependencies.sql','phase7_task_execution.sql',
    'phase8_task_hardening.sql','phase10_ml_multilabel.sql','phase11_google_auth.sql','phase12_relationships.sql',
    'phase13_processing_status.sql','phase14_worker_leases.sql','phase15_duplicate_only_identity.sql',
    'phase16_cross_issue_dependencies.sql','phase17_wicr_decisions.sql','phase18_wicr_audit_immutability.sql',
    'phase19_prerequisite_recommendations.sql'];
  for (const file of files) await db.exec(fs.readFileSync(path.join(root, 'docs/database', file), 'utf8'));
  await db.exec(`CREATE TABLE public.departments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text);
    ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
    CREATE POLICY "Enable all access for service_role" ON public.users FOR ALL TO public USING(true) WITH CHECK(true);
    CREATE POLICY "Enable all access for service_role" ON public.complaints FOR ALL TO public USING(true) WITH CHECK(true);
    CREATE POLICY "Enable all access for service_role" ON public.departments FOR ALL TO public USING(true) WITH CHECK(true);`);
});
afterAll(async () => { if (db) await db.close(); });

test('legacy Supabase defaults expose owner-permission views before the patch', async () => {
  await db.exec('SET ROLE anon');
  try {
    for (const view of views) await expect(db.query(`SELECT * FROM public.${view} LIMIT 0`)).resolves.toBeDefined();
    await expect(db.query('SELECT id FROM public.users LIMIT 0')).resolves.toBeDefined();
  } finally { await db.exec('RESET ROLE'); }
});

test('permission patch is repeatable and enables invoker views with RLS on every application table', async () => {
  await db.exec(permissions);
  await db.exec(permissions);
  const result = await db.query("SELECT relname,reloptions FROM pg_class WHERE relname=ANY($1)", [views]);
  expect(result.rows).toHaveLength(3);
  for (const row of result.rows) expect(row.reloptions).toContain('security_invoker=true');
  const disabled = await db.query("SELECT relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND relkind='r' AND NOT relrowsecurity");
  expect(disabled.rows).toHaveLength(0);
  const legacy = await db.query("SELECT * FROM pg_policies WHERE policyname='Enable all access for service_role'");
  expect(legacy.rows).toHaveLength(0);
});

test.each(['anon','authenticated'])('%s cannot SELECT views/tables or invoke review, approval and status RPCs', async role => {
  await db.exec(`SET ROLE ${role}`);
  try {
    for (const view of views) await expect(db.query(`SELECT * FROM public.${view} LIMIT 0`)).rejects.toThrow('permission denied');
    for (const table of ['users','complaints','departments','wicr_decisions','wicr_review_events','task_dependency_recommendations','tasks']) {
      await expect(db.query(`SELECT * FROM public.${table} LIMIT 0`)).rejects.toThrow('permission denied');
    }
    await expect(db.query("SELECT public.resolve_wicr_review(NULL,NULL,'ACCEPT',NULL)")).rejects.toThrow('permission denied');
    await expect(db.query('SELECT public.accept_dependency_recommendation(NULL,NULL,NULL)')).rejects.toThrow('permission denied');
    await expect(db.query('SELECT public.reject_dependency_recommendation(NULL,NULL,NULL)')).rejects.toThrow('permission denied');
    await expect(db.query("SELECT public.update_task_status_transactional(NULL,'COMPLETED','fake','fake')")).rejects.toThrow('permission denied');
  } finally { await db.exec('RESET ROLE'); }
});

test('service role retains required reads and sensitive function execution, without definer functions', async () => {
  await db.exec('SET ROLE service_role');
  try {
    for (const view of views) await expect(db.query(`SELECT * FROM public.${view} LIMIT 0`)).resolves.toBeDefined();
    const access = await db.query("SELECT p.proname, has_function_privilege(current_user,p.oid,'EXECUTE') AS allowed,p.prosecdef,p.proconfig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'");
    for (const fn of access.rows) {
      expect(fn.allowed).toBe(true);
      expect(fn.prosecdef).toBe(false);
      expect(fn.proconfig).toContain('search_path=""');
    }
    await expect(db.query("SELECT public.update_task_status_transactional(NULL,'COMPLETED','test','test')")).rejects.toThrow('Task not found');
  } finally { await db.exec('RESET ROLE'); }
});

test('new objects do not inherit anonymous table/view or function permissions', async () => {
  await db.exec('CREATE TABLE public.permission_test_only(id int); CREATE VIEW public.permission_test_view AS SELECT * FROM public.permission_test_only; CREATE FUNCTION public.permission_test_function() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;');
  for (const role of ['anon','authenticated']) {
    const result = await db.query("SELECT has_table_privilege($1,'public.permission_test_view','SELECT') AS view_access,has_function_privilege($1,'public.permission_test_function()','EXECUTE') AS rpc_access", [role]);
    expect(result.rows[0]).toEqual({ view_access: false, rpc_access: false });
  }
});
