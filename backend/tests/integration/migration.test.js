// backend/tests/integration/migration.test.js
// Verifies Phase R1 Database Schema Reproducibility using an embedded PostgreSQL-compatible database engine (PGlite)

const { PGlite } = require('@electric-sql/pglite');
const fs = require('fs');
const path = require('path');

const DB_DOCS_DIR = path.join(__dirname, '../../../docs/database');

describe('Phase R1: Embedded PostgreSQL-Compatible Database Schema Reproducibility', () => {

  it('1. Initializes an empty database and applies ALL_MIGRATIONS.sql cleanly', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    const sql = fs.readFileSync(allMigrationsPath, 'utf8');

    // Execute full consolidated script
    await expect(db.exec(sql)).resolves.not.toThrow();

    // Verify all 9 core tables exist
    const res = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map(r => r.table_name);
    const expectedTables = [
      'civic_issues',
      'complaint_relationships',
      'complaints',
      'routing_results',
      'task_dependencies',
      'task_status_history',
      'tasks',
      'users',
      'workstreams'
    ];

    expectedTables.forEach(expected => {
      expect(tableNames).toContain(expected);
    });
  });

  it('2. Initializes an empty database and applies each standalone migration file in strict sequential order', async () => {
    const db = new PGlite();
    const sequentialFiles = [
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

    for (const fileName of sequentialFiles) {
      const filePath = path.join(DB_DOCS_DIR, fileName);
      expect(fs.existsSync(filePath)).toBe(true);
      const sql = fs.readFileSync(filePath, 'utf8');
      
      try {
        await db.exec(sql);
      } catch (err) {
        throw new Error(`Migration step failed on ${fileName}: ${err.message}`);
      }
    }

    // Verify critical columns on complaints
    const compColsRes = await db.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'complaints'
    `);
    const compCols = compColsRes.rows.map(r => r.column_name);

    expect(compCols).toContain('id');
    expect(compCols).toContain('citizen_id');
    expect(compCols).toContain('title');
    expect(compCols).toContain('description');
    expect(compCols).toContain('status');
    expect(compCols).toContain('embedding_vector');
    expect(compCols).toContain('duplicate_score');
    expect(compCols).toContain('civic_issue_id');
    expect(compCols).toContain('ml_labels');
    expect(compCols).toContain('ml_probabilities');
    expect(compCols).toContain('ml_departments');
    expect(compCols).toContain('processing_status');
    expect(compCols).toContain('processing_error');

    // Verify critical columns on users
    const userColsRes = await db.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    const userCols = userColsRes.rows.map(r => r.column_name);

    expect(userCols).toContain('id');
    expect(userCols).toContain('email');
    expect(userCols).toContain('role');
    expect(userCols).toContain('google_id');
    expect(userCols).toContain('auth_provider');
    expect(userCols).toContain('avatar_url');
    expect(userCols).toContain('email_verified');

    // Verify transactional stored procedure exists
    const procRes = await db.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name = 'update_task_status_transactional';
    `);
    expect(procRes.rows.length).toBe(1);
  });

  it('3. Successfully performs end-to-end relational operations and transactional RPC on the migrated database', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Step A: Insert a user
    const userRes = await db.query(`
      INSERT INTO public.users (name, email, role)
      VALUES ('Test Citizen', 'citizen@example.com', 'citizen')
      RETURNING id;
    `);
    const userId = userRes.rows[0].id;
    expect(userId).toBeDefined();

    // Step B: Insert a complaint referencing the user
    const compRes = await db.query(`
      INSERT INTO public.complaints (
        citizen_id, title, description, category, priority, status,
        location_lat, location_lng, processing_status, ml_labels, ml_departments
      )
      VALUES (
        $1, 'Broken Pothole', 'Dangerous road hole', 'Roads', 'High', 'Pending',
        18.5204, 73.8567, 'PROCESSED', ARRAY['road_damage_flag'], ARRAY['Road Maintenance']
      )
      RETURNING id, processing_status;
    `, [userId]);
    const compId = compRes.rows[0].id;
    expect(compId).toBeDefined();
    expect(compRes.rows[0].processing_status).toBe('PROCESSED');

    // Step C: Insert a Civic Issue and cluster the complaint
    const issueRes = await db.query(`
      INSERT INTO public.civic_issues (title, primary_category, priority, status, complaint_ids)
      VALUES ('Sector 4 Pothole Cluster', 'Roads', 'High', 'PENDING', ARRAY[$1]::uuid[])
      RETURNING id;
    `, [compId]);
    const issueId = issueRes.rows[0].id;
    expect(issueId).toBeDefined();

    await db.query(`
      UPDATE public.complaints
      SET civic_issue_id = $1
      WHERE id = $2;
    `, [issueId, compId]);

    // Step D: Create workstream and task
    const wsRes = await db.query(`
      INSERT INTO public.workstreams (civic_issue_id, department_id, status)
      VALUES ($1, 'Road Maintenance', 'PENDING')
      RETURNING id;
    `, [issueId]);
    const wsId = wsRes.rows[0].id;

    const taskRes = await db.query(`
      INSERT INTO public.tasks (civic_issue_id, workstream_id, department_id, issue_type, title, template_id, status)
      VALUES ($1, $2, 'Road Maintenance', 'pothole_fill', 'Fill Pothole', 'road_tmpl_1', 'PENDING')
      RETURNING id;
    `, [issueId, wsId]);
    const taskId = taskRes.rows[0].id;

    // Step E: Execute transactional RPC update_task_status_transactional
    await db.query(`
      SELECT public.update_task_status_transactional(
        $1::uuid,
        'IN_PROGRESS',
        'operator@grievanceiq.com',
        'Work started by field crew'
      );
    `, [taskId]);

    // Verify task state updated
    const updatedTask = await db.query(`SELECT status, started_at FROM public.tasks WHERE id = $1`, [taskId]);
    expect(updatedTask.rows[0].status).toBe('IN_PROGRESS');
    expect(updatedTask.rows[0].started_at).not.toBeNull();

    // Verify audit log created
    const auditRes = await db.query(`SELECT previous_status, new_status, changed_by FROM public.task_status_history WHERE task_id = $1`, [taskId]);
    expect(auditRes.rows.length).toBe(1);
    expect(auditRes.rows[0].previous_status).toBe('PENDING');
    expect(auditRes.rows[0].new_status).toBe('IN_PROGRESS');
    expect(auditRes.rows[0].changed_by).toBe('operator@grievanceiq.com');

    // Verify workstream and civic issue status rolled up to IN_PROGRESS
    const updatedWs = await db.query(`SELECT status FROM public.workstreams WHERE id = $1`, [wsId]);
    expect(updatedWs.rows[0].status).toBe('IN_PROGRESS');

    const updatedIssue = await db.query(`SELECT status FROM public.civic_issues WHERE id = $1`, [issueId]);
    expect(updatedIssue.rows[0].status).toBe('IN_PROGRESS');

    // Step F: Test complaint relationships constraint (source < target canonical ordering)
    const comp2Res = await db.query(`
      INSERT INTO public.complaints (title, description) VALUES ('Second Pothole', 'Duplicate report') RETURNING id;
    `);
    const comp2Id = comp2Res.rows[0].id;

    let sourceId = compId < comp2Id ? compId : comp2Id;
    let targetId = compId < comp2Id ? comp2Id : compId;

    await db.query(`
      INSERT INTO public.complaint_relationships (source_complaint_id, target_complaint_id, relationship_type, confidence)
      VALUES ($1, $2, 'Duplicate', 0.95);
    `, [sourceId, targetId]);

    // Attempting inverted order should violate check constraint
    await expect(db.query(`
      INSERT INTO public.complaint_relationships (source_complaint_id, target_complaint_id, relationship_type)
      VALUES ($1, $2, 'Similar');
    `, [targetId, sourceId])).rejects.toThrow();
  });

});
