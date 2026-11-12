// backend/tests/integration/wicrQueuePermissionsAndSchema.test.js
// Verification of WICR Review Queue Schema, Missing Schema Handling, and Role Permissions
// Uses isolated embedded PostgreSQL engine (PGlite)

const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../../..');
const baseFiles = [
  '00_initial_schema.sql',
  'phase1_embedding.sql',
  'phase2_duplicate_detection.sql',
  'phase4_civic_issue.sql',
  'phase5_routing_tasks.sql',
  'phase6_task_dependencies.sql',
  'phase7_task_execution.sql',
  'phase8_task_hardening.sql',
  'phase10_ml_multilabel.sql',
  'phase11_google_auth.sql',
  'phase12_relationships.sql',
  'phase13_processing_status.sql'
];

describe('WICR Review Queue: Schema Installation, Error Propagation & Role-Based Permissions', () => {
  let db;

  beforeAll(async () => {
    db = new PGlite();
    // Setup standard Supabase roles
    await db.exec(`
      CREATE ROLE anon;
      CREATE ROLE authenticated;
      CREATE ROLE service_role BYPASSRLS;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);

    // Apply baseline schema (Phases 0 through 13) - WICR NOT YET INSTALLED
    for (const file of baseFiles) {
      const sql = fs.readFileSync(path.join(root, 'docs/database', file), 'utf8');
      await db.exec(sql);
    }
  });

  afterAll(async () => {
    if (db) await db.close();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Missing Schema Behavior
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Missing Schema Gives Clear Backend Error', () => {
    test('Querying v_pending_wicr_reviews before migration gives a clear relation-not-found error', async () => {
      await expect(
        db.query('SELECT * FROM public.v_pending_wicr_reviews LIMIT 1')
      ).rejects.toThrow(/relation "public\.v_pending_wicr_reviews" does not exist/);
    });

    test('Querying wicr_decisions before migration gives a clear relation-not-found error', async () => {
      await expect(
        db.query('SELECT * FROM public.wicr_decisions LIMIT 1')
      ).rejects.toThrow(/relation "public\.wicr_decisions" does not exist/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Migration Execution
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. Reviewed WICR Migration Execution', () => {
    test('Applies apply_wicr_and_gate1_hardening.sql cleanly', async () => {
      const migrationSql = fs.readFileSync(
        path.join(root, 'docs/database/apply_wicr_and_gate1_hardening.sql'),
        'utf8'
      );
      await expect(db.exec(migrationSql)).resolves.not.toThrow();

      // Verify tables exist
      const tableRes = await db.query(`
        SELECT table_name FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name IN ('wicr_decisions', 'wicr_review_events');
      `);
      const tableNames = tableRes.rows.map(r => r.table_name);
      expect(tableNames).toContain('wicr_decisions');
      expect(tableNames).toContain('wicr_review_events');

      // Verify view exists
      const viewRes = await db.query(`
        SELECT table_name FROM information_schema.views 
        WHERE table_schema = 'public' AND table_name = 'v_pending_wicr_reviews';
      `);
      expect(viewRes.rows).toHaveLength(1);

      // Verify view is security_invoker = true
      const classRes = await db.query(
        "SELECT relname, reloptions FROM pg_class WHERE relname = 'v_pending_wicr_reviews'"
      );
      expect(classRes.rows[0].reloptions).toContain('security_invoker=true');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. WICR Queue Query Succeeds When Schema Installed
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. WICR Queue Query Succeeds When Schema Installed', () => {
    let comp1Id;
    let comp2Id;
    let decisionId;

    beforeAll(async () => {
      // Seed two test complaints with departments
      const c1 = await db.query(`
        INSERT INTO public.complaints (title, description, category, department_id)
        VALUES ('Water pipe leak on Main St', 'Major leak causing street flooding', 'Water Supply', 'Water')
        RETURNING id;
      `);
      const c2 = await db.query(`
        INSERT INTO public.complaints (title, description, category, department_id)
        VALUES ('Street flooded near Main St', 'Water pooling 100m from pipe leak', 'Road Damage', 'Roads')
        RETURNING id;
      `);
      comp1Id = c1.rows[0].id;
      comp2Id = c2.rows[0].id;

      // Record a decision routed to REVIEW
      const recRes = await db.query(`
        SELECT public.record_wicr_decision(
          $1::uuid, $2::uuid, 'Duplicate', 0.55, 0.52, true,
          4.8, 2.6, 1.0,
          '{"false_lock": 10.0, "missed_link": 5.0, "review": 1.0}'::jsonb,
          'REVIEW', 'MINIMUM_EXPECTED_LOSS_REVIEW', '1.0', '1.0', '1.0'
        ) AS res;
      `, [comp1Id, comp2Id]);
      decisionId = recRes.rows[0].res.decision_id;
    });

    test('Service role can query pending WICR reviews from view with full context', async () => {
      await db.exec('SET ROLE service_role');
      try {
        const res = await db.query(
          'SELECT * FROM public.v_pending_wicr_reviews WHERE decision_id = $1',
          [decisionId]
        );
        expect(res.rows).toHaveLength(1);
        const row = res.rows[0];
        expect(row.decision_id).toBe(decisionId);
        expect(row.source_title).toBe('Water pipe leak on Main St');
        expect(row.target_title).toBe('Street flooded near Main St');
        expect(row.source_department).toBe('Water');
        expect(row.target_department).toBe('Roads');
        expect(row.relationship_type).toBe('Duplicate');
        expect(row.review_status).toBe('PENDING');
      } finally {
        await db.exec('RESET ROLE');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Role Permissions: Direct Anon & Authenticated Access Denied
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Direct Anon & Authenticated Access to Backend WICR Objects is Denied', () => {
    test.each(['anon', 'authenticated'])('%s cannot SELECT from v_pending_wicr_reviews', async (role) => {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(
          db.query('SELECT * FROM public.v_pending_wicr_reviews LIMIT 1')
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec('RESET ROLE');
      }
    });

    test.each(['anon', 'authenticated'])('%s cannot SELECT from wicr_decisions', async (role) => {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(
          db.query('SELECT * FROM public.wicr_decisions LIMIT 1')
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec('RESET ROLE');
      }
    });

    test.each(['anon', 'authenticated'])('%s cannot SELECT from wicr_review_events', async (role) => {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(
          db.query('SELECT * FROM public.wicr_review_events LIMIT 1')
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec('RESET ROLE');
      }
    });

    test.each(['anon', 'authenticated'])('%s cannot EXECUTE resolve_wicr_review', async (role) => {
      await db.exec(`SET ROLE ${role}`);
      try {
        await expect(
          db.query("SELECT public.resolve_wicr_review(NULL, NULL, 'ACCEPT', NULL)")
        ).rejects.toThrow(/permission denied/);
      } finally {
        await db.exec('RESET ROLE');
      }
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Service Role Access Verification
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Backend Service Role Access Succeeds', () => {
    test('Service role can read wicr_decisions, view, and execute resolve_wicr_review', async () => {
      await db.exec('SET ROLE service_role');
      try {
        // Read decisions
        const decRes = await db.query('SELECT * FROM public.wicr_decisions WHERE review_status = $1', ['PENDING']);
        expect(decRes.rows.length).toBeGreaterThan(0);
        const decisionId = decRes.rows[0].id;

        // Read view
        const viewRes = await db.query('SELECT * FROM public.v_pending_wicr_reviews WHERE decision_id = $1', [decisionId]);
        expect(viewRes.rows).toHaveLength(1);

        // Execute resolution RPC
        const resolveRes = await db.query(`
          SELECT public.resolve_wicr_review($1::uuid, NULL, 'ACCEPT', 'Verified by officer') AS res;
        `, [decisionId]);
        expect(resolveRes.rows[0].res.success).toBe(true);
        expect(resolveRes.rows[0].res.review_status).toBe('RESOLVED_ACCEPT');

        // Verify audit event exists
        const eventRes = await db.query(
          'SELECT * FROM public.wicr_review_events WHERE decision_id = $1',
          [decisionId]
        );
        expect(eventRes.rows.length).toBeGreaterThanOrEqual(2); // DECISION_RECORDED + RESOLVED_ACCEPT
      } finally {
        await db.exec('RESET ROLE');
      }
    });
  });
});

