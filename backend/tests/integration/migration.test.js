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
      'task_dependency_recommendations',
      'task_status_history',
      'tasks',
      'users',
      'wicr_decisions',
      'wicr_review_events',
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
      'phase13_processing_status.sql',
      'phase14_worker_leases.sql',
      'phase15_duplicate_only_identity.sql',
      'phase16_cross_issue_dependencies.sql',
      'phase17_wicr_decisions.sql',
      'phase18_wicr_audit_immutability.sql',
      'phase19_prerequisite_recommendations.sql'
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
    expect(compCols).toContain('locked_by');
    expect(compCols).toContain('lock_expires_at');
    expect(compCols).toContain('retry_count');

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

    // Verify transactional stored procedures exist
    const procRes = await db.query(`
      SELECT routine_name 
      FROM information_schema.routines 
      WHERE routine_schema = 'public' 
        AND routine_name IN ('update_task_status_transactional', 'acquire_complaint_lease', 'commit_complaint_processing');
    `);
    expect(procRes.rows.length).toBe(3);
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

  it('4. Verifies Phase 14 worker lease acquisition, concurrency exclusion, and atomic commit RPC on PGlite', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Insert a fresh pending complaint
    const insertRes = await db.query(`
      INSERT INTO public.complaints (title, description, processing_status)
      VALUES ('Water Leak', 'Main road pipe bursting', 'PENDING')
      RETURNING id;
    `);
    const compId = insertRes.rows[0].id;

    // Worker A acquires lease
    const workerA = 'worker-A-1234';
    const acquireARes = await db.query(`
      SELECT public.acquire_complaint_lease($1::uuid, $2::text, 300) AS acquired_id;
    `, [compId, workerA]);
    expect(acquireARes.rows[0].acquired_id).toBe(compId);

    // Verify row state: processing_status = PROCESSING, locked_by = workerA, retry_count = 1
    const checkRes = await db.query(`SELECT processing_status, locked_by, retry_count FROM public.complaints WHERE id = $1`, [compId]);
    expect(checkRes.rows[0].processing_status).toBe('PROCESSING');
    expect(checkRes.rows[0].locked_by).toBe(workerA);
    expect(checkRes.rows[0].retry_count).toBe(1);

    // Concurrent Worker B attempts to acquire lease — MUST return NULL
    const workerB = 'worker-B-5678';
    const acquireBRes = await db.query(`
      SELECT public.acquire_complaint_lease($1::uuid, $2::text, 300) AS acquired_id;
    `, [compId, workerB]);
    expect(acquireBRes.rows[0].acquired_id).toBeNull();

    // Worker A commits results atomically
    const commitRes = await db.query(`
      SELECT public.commit_complaint_processing(
        $1::uuid,
        $2::text,
        'Water Supply',
        'Critical',
        9,
        ARRAY['Flooding']::text[],
        'Emergency valve shutoff',
        ARRAY['water', 'leak']::text[]
      ) AS committed;
    `, [compId, workerA]);
    expect(commitRes.rows[0].committed).toBe(true);

    // Verify final state: PROCESSED, ai_processed=true, locked_by=NULL
    const finalRes = await db.query(`SELECT processing_status, ai_processed, locked_by, category, priority FROM public.complaints WHERE id = $1`, [compId]);
    expect(finalRes.rows[0].processing_status).toBe('PROCESSED');
    expect(finalRes.rows[0].ai_processed).toBe(true);
    expect(finalRes.rows[0].locked_by).toBeNull();
    expect(finalRes.rows[0].category).toBe('Water Supply');
    expect(finalRes.rows[0].priority).toBe('Critical');

    // Duplicate delivery check: Now that complaint is PROCESSED, acquire MUST return NULL
    const redeliveryRes = await db.query(`
      SELECT public.acquire_complaint_lease($1::uuid, 'worker-C-9999', 300) AS acquired_id;
    `, [compId]);
    expect(redeliveryRes.rows[0].acquired_id).toBeNull();
  });

  it('5. Verifies commit_complaint_pipeline_transaction: atomic commit of issue, tasks, relationships & rollback on ownership loss', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Insert 2 complaints for relationship testing
    const c1 = await db.query(`INSERT INTO public.complaints (title, description, processing_status) VALUES ('Pipe Leak', 'Water leaking', 'PENDING') RETURNING id;`);
    const c2 = await db.query(`INSERT INTO public.complaints (title, description, processing_status) VALUES ('Road Damage', 'Pothole nearby', 'PENDING') RETURNING id;`);
    const id1 = c1.rows[0].id;
    const id2 = c2.rows[0].id;

    // Worker 1 acquires lease on id1
    const worker1 = 'worker-p1-1111';
    await db.query(`SELECT public.acquire_complaint_lease($1::uuid, $2::text, 300);`, [id1, worker1]);

    // Test A: Stale/wrong worker attempt to commit MUST throw exception
    await expect(db.query(`
      SELECT public.commit_complaint_pipeline_transaction(
        $1::uuid,
        'wrong-worker-token',
        '{"category": "Water Supply", "priority": "High"}'::jsonb,
        '{"title": "Water Main Issue", "primary_category": "Water Supply"}'::jsonb
      );
    `, [id1])).rejects.toThrow(/lost lease ownership/i);

    // Verify nothing changed on complaint or civic_issues
    const issuesCheck = await db.query(`SELECT count(*) as count FROM public.civic_issues;`);
    expect(Number(issuesCheck.rows[0].count)).toBe(0);

    // Test B: Legitimate worker commits pipeline transaction with civic issue, task, and relationship
    const txResult = await db.query(`
      SELECT public.commit_complaint_pipeline_transaction(
        $1::uuid,
        $2::text,
        '{"category": "Water Supply", "priority": "Critical", "severity_score": 9}'::jsonb,
        jsonb_build_object(
          'title', 'Water Pipe Burst & Road Collapse',
          'primary_category', 'Water Supply',
          'priority', 'Critical',
          'location_lat', 18.5204,
          'location_lng', 73.8567,
          'complaint_ids', jsonb_build_array($1::text)
        ),
        jsonb_build_array(
          jsonb_build_object('source_id', $1::text, 'target_id', $3::text, 'type', 'Related', 'confidence', 0.88, 'reason', 'Water caused road damage')
        ),
        jsonb_build_array(
          jsonb_build_object('department_id', 'Water Department', 'issue_type', 'pipe_burst', 'title', 'Replace Pipe Section', 'priority', 'Critical')
        )
      ) AS res;
    `, [id1, worker1, id2]);

    const resObj = txResult.rows[0].res;
    expect(resObj.success).toBe(true);
    expect(resObj.complaint_id).toBe(id1);
    expect(resObj.civic_issue_id).toBeDefined();

    // Verify complaint state: PROCESSED, civic_issue_id set, locked_by released
    const c1Final = await db.query(`SELECT processing_status, ai_processed, locked_by, civic_issue_id, category FROM public.complaints WHERE id = $1;`, [id1]);
    expect(c1Final.rows[0].processing_status).toBe('PROCESSED');
    expect(c1Final.rows[0].ai_processed).toBe(true);
    expect(c1Final.rows[0].locked_by).toBeNull();
    expect(c1Final.rows[0].civic_issue_id).toBe(resObj.civic_issue_id);

    // Verify civic issue created
    const issueFinal = await db.query(`SELECT title, primary_category, priority FROM public.civic_issues WHERE id = $1;`, [resObj.civic_issue_id]);
    expect(issueFinal.rows[0].title).toBe('Water Pipe Burst & Road Collapse');

    // Verify workstream and task created
    const taskFinal = await db.query(`SELECT title, issue_type, department_id, status FROM public.tasks WHERE civic_issue_id = $1;`, [resObj.civic_issue_id]);
    expect(taskFinal.rows.length).toBe(1);
    expect(taskFinal.rows[0].title).toBe('Replace Pipe Section');
    expect(taskFinal.rows[0].department_id).toBe('Water Department');

    // Verify relationship created in complaint_relationships with canonical ordering
    const relFinal = await db.query(`SELECT relationship_type, confidence, reason FROM public.complaint_relationships WHERE source_complaint_id = $1 OR target_complaint_id = $1;`, [id1]);
    expect(relFinal.rows.length).toBe(1);
    expect(relFinal.rows[0].relationship_type).toBe('Related');
    expect(Number(relFinal.rows[0].confidence)).toBe(0.88);

    // Test C: Failure tracking separate from rolled-back transaction
    const c3 = await db.query(`INSERT INTO public.complaints (title, description, processing_status) VALUES ('Power outage', 'Blackout', 'PENDING') RETURNING id;`);
    const id3 = c3.rows[0].id;
    const worker3 = 'worker-fail-test';
    await db.query(`SELECT public.acquire_complaint_lease($1::uuid, $2::text, 300);`, [id3, worker3]);

    // Simulate failure tracking
    await db.query(`SELECT public.record_complaint_failure($1::uuid, $2::text, 'External ML server 503');`, [id3, worker3]);
    const c3Final = await db.query(`SELECT processing_status, processing_error, locked_by FROM public.complaints WHERE id = $1;`, [id3]);
    expect(c3Final.rows[0].processing_status).toBe('FAILED');
    expect(c3Final.rows[0].processing_error).toContain('External ML server 503');
    expect(c3Final.rows[0].locked_by).toBeNull();
  });

  it('6. Phase 15: Exposes cross-incident related links and detects improper multi-complaint groupings', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Step A: Create two complaints
    const c1 = await db.query(`INSERT INTO public.complaints (title, description, category) VALUES ('Water leak on Main St', 'Pipe leaking water', 'Water Supply') RETURNING id;`);
    const c2 = await db.query(`INSERT INTO public.complaints (title, description, category) VALUES ('Road cave-in on Main St', 'Asphalt collapsed', 'Road Damage') RETURNING id;`);
    const id1 = c1.rows[0].id;
    const id2 = c2.rows[0].id;

    // Step B: Create two SEPARATE Civic Issues for them (FR05: Related incidents remain separate)
    const issue1 = await db.query(`INSERT INTO public.civic_issues (title, primary_category, complaint_ids) VALUES ('Water Leak Issue', 'Water Supply', ARRAY[$1]::uuid[]) RETURNING id;`, [id1]);
    const issue2 = await db.query(`INSERT INTO public.civic_issues (title, primary_category, complaint_ids) VALUES ('Road Damage Issue', 'Road Damage', ARRAY[$1]::uuid[]) RETURNING id;`, [id2]);
    const issueId1 = issue1.rows[0].id;
    const issueId2 = issue2.rows[0].id;

    await db.query(`UPDATE public.complaints SET civic_issue_id = $1 WHERE id = $2;`, [issueId1, id1]);
    await db.query(`UPDATE public.complaints SET civic_issue_id = $1 WHERE id = $2;`, [issueId2, id2]);

    // Step C: Persist a 'Related' relationship between the complaints
    const [srcId, tgtId] = id1 < id2 ? [id1, id2] : [id2, id1];
    await db.query(`
      INSERT INTO public.complaint_relationships (source_complaint_id, target_complaint_id, relationship_type, confidence, reason)
      VALUES ($1, $2, 'Related', 0.89, 'Water leakage caused road damage');
    `, [srcId, tgtId]);

    // Step D: Query v_civic_issue_related_links view
    const viewRes = await db.query(`SELECT * FROM public.v_civic_issue_related_links;`);
    expect(viewRes.rows.length).toBe(1);
    expect(viewRes.rows[0].relationship_type).toBe('Related');
    expect(Number(viewRes.rows[0].confidence)).toBe(0.89);
    expect(viewRes.rows[0].source_civic_issue_id).not.toBe(viewRes.rows[0].target_civic_issue_id);

    // Step E: Query get_related_civic_issues(issueId1)
    const funcRes = await db.query(`SELECT * FROM public.get_related_civic_issues($1::uuid);`, [issueId1]);
    expect(funcRes.rows.length).toBe(1);
    expect(funcRes.rows[0].related_civic_issue_id).toBe(issueId2);
    expect(funcRes.rows[0].related_issue_title).toBe('Road Damage Issue');

    // Step F: Test improper grouping detection
    // Issue with 2 complaints but ZERO duplicate relationships between them
    const badIssue = await db.query(`
      INSERT INTO public.civic_issues (title, primary_category, complaint_ids)
      VALUES ('Improperly Merged Issue', 'Mixed', ARRAY[$1, $2]::uuid[])
      RETURNING id;
    `, [id1, id2]);

    const improperRes = await db.query(`SELECT * FROM public.check_improper_civic_issue_groupings();`);
    const flaggedIds = improperRes.rows.map(r => r.civic_issue_id);
    expect(flaggedIds).toContain(badIssue.rows[0].id);
  });

  it('7. Phase 16: Safe cross-issue dependencies, atomic cycle prevention, and prerequisite readiness', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Step A: Setup two separate Civic Issues
    const issue1Res = await db.query(`INSERT INTO public.civic_issues (title, primary_category) VALUES ('Water Main Burst', 'Water Supply') RETURNING id;`);
    const issue2Res = await db.query(`INSERT INTO public.civic_issues (title, primary_category) VALUES ('Main St Sinkhole', 'Road Damage') RETURNING id;`);
    const issueId1 = issue1Res.rows[0].id;
    const issueId2 = issue2Res.rows[0].id;

    // Step B: Setup workstreams
    const ws1Res = await db.query(`INSERT INTO public.workstreams (civic_issue_id, department_id) VALUES ($1, 'Water Dept') RETURNING id;`, [issueId1]);
    const ws2Res = await db.query(`INSERT INTO public.workstreams (civic_issue_id, department_id) VALUES ($1, 'Roads Dept') RETURNING id;`, [issueId2]);
    const wsId1 = ws1Res.rows[0].id;
    const wsId2 = ws2Res.rows[0].id;

    // Step C: Setup tasks: Task A (Water Issue 1), Task B (Road Issue 2), Task C (Road Issue 2)
    const tARes = await db.query(`
      INSERT INTO public.tasks (civic_issue_id, workstream_id, department_id, issue_type, title, status)
      VALUES ($1, $2, 'Water Dept', 'Water Supply', 'Excavate and Replace Pipe', 'PENDING')
      RETURNING id;
    `, [issueId1, wsId1]);
    const tBRes = await db.query(`
      INSERT INTO public.tasks (civic_issue_id, workstream_id, department_id, issue_type, title, status)
      VALUES ($1, $2, 'Roads Dept', 'Road Damage', 'Asphalt Paving and Compaction', 'PENDING')
      RETURNING id;
    `, [issueId2, wsId2]);
    const tCRes = await db.query(`
      INSERT INTO public.tasks (civic_issue_id, workstream_id, department_id, issue_type, title, status)
      VALUES ($1, $2, 'Roads Dept', 'Road Damage', 'Lane Striping and Opening', 'PENDING')
      RETURNING id;
    `, [issueId2, wsId2]);

    const taskA = tARes.rows[0].id;
    const taskB = tBRes.rows[0].id;
    const taskC = tCRes.rows[0].id;

    // Step D: Create valid cross-issue dependency: Task B (Issue 2) depends on Task A (Issue 1)
    const dep1Res = await db.query(`
      SELECT public.add_task_dependency_transactional($1::uuid, $2::uuid) AS res;
    `, [taskB, taskA]);
    const dep1 = dep1Res.rows[0].res;
    expect(dep1.success).toBe(true);
    expect(dep1.status).toBe('CREATED');
    expect(dep1.is_cross_issue).toBe(true);

    // Step E: Create valid intra-issue dependency: Task C (Issue 2) depends on Task B (Issue 2)
    const dep2Res = await db.query(`
      SELECT public.add_task_dependency_transactional($1::uuid, $2::uuid) AS res;
    `, [taskC, taskB]);
    const dep2 = dep2Res.rows[0].res;
    expect(dep2.success).toBe(true);
    expect(dep2.status).toBe('CREATED');
    expect(dep2.is_cross_issue).toBe(false);

    // Step F: Test self-dependency rejection
    await expect(
      db.query(`SELECT public.add_task_dependency_transactional($1::uuid, $1::uuid);`, [taskA])
    ).rejects.toThrow(/Self dependency is not allowed/);

    // Step G: Test direct cycle rejection (Task A depending on Task B)
    await expect(
      db.query(`SELECT public.add_task_dependency_transactional($1::uuid, $2::uuid);`, [taskA, taskB])
    ).rejects.toThrow(/would create a cycle/);

    // Step H: Test indirect cross-issue cycle rejection (Task A depending on Task C, where C -> B -> A)
    await expect(
      db.query(`SELECT public.add_task_dependency_transactional($1::uuid, $2::uuid);`, [taskA, taskC])
    ).rejects.toThrow(/would create a cycle/);

    // Step I: Test database-level trigger rejects direct SQL insert cycle
    await expect(
      db.query(`INSERT INTO public.task_dependencies (task_id, depends_on_task_id) VALUES ($1, $2);`, [taskA, taskC])
    ).rejects.toThrow(/would create a cycle/);

    // Step J: Test prerequisite blocking on update_task_status_transactional
    // Task B cannot start because Task A is still PENDING
    await expect(
      db.query(`SELECT public.update_task_status_transactional($1::uuid, 'IN_PROGRESS', 'engineer@city.gov', 'Starting paving early');`, [taskB])
    ).rejects.toThrow(/Cannot start task. Prerequisite task .* is not COMPLETED/);

    // Step K: Satisfy prerequisite Task A
    await db.query(`SELECT public.update_task_status_transactional($1::uuid, 'IN_PROGRESS', 'plumber@city.gov', 'Start pipe replacement');`, [taskA]);
    await db.query(`SELECT public.update_task_status_transactional($1::uuid, 'COMPLETED', 'plumber@city.gov', 'Pipe replaced and tested');`, [taskA]);

    const taskAFinal = await db.query(`SELECT status FROM public.tasks WHERE id = $1;`, [taskA]);
    expect(taskAFinal.rows[0].status).toBe('COMPLETED');

    // Step L: Task B now unblocks and can transition to IN_PROGRESS!
    await db.query(`SELECT public.update_task_status_transactional($1::uuid, 'IN_PROGRESS', 'engineer@city.gov', 'Starting paving now that pipe is done');`, [taskB]);
    const taskBFinal = await db.query(`SELECT status FROM public.tasks WHERE id = $1;`, [taskB]);
    expect(taskBFinal.rows[0].status).toBe('IN_PROGRESS');
  });

  it('8. Phase 17: WICR decisions recording, versioned audit trail, review queue, and human resolution', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Step A: Setup two complaints and a reviewer user
    const userRes = await db.query(`INSERT INTO public.users (name, email, role) VALUES ('Officer Sarah', 'sarah@city.gov', 'officer') RETURNING id;`);
    const reviewerId = userRes.rows[0].id;

    const c1Res = await db.query(`INSERT INTO public.complaints (title, description, category) VALUES ('Broken Water Pipe', 'Pipe leaking at 4th Ave', 'Water Supply') RETURNING id;`);
    const c2Res = await db.query(`INSERT INTO public.complaints (title, description, category) VALUES ('Sinkhole Forming', 'Ground collapsing near water line', 'Road Damage') RETURNING id;`);
    const comp1 = c1Res.rows[0].id;
    const comp2 = c2Res.rows[0].id;

    // Step B: Record automated ACCEPT decision
    const acceptRes = await db.query(`
      SELECT public.record_wicr_decision(
        $1::uuid, $2::uuid, 'Related', 0.95, 0.92, true,
        0.8, 4.6, 1.0,
        '{"false_lock": 10.0, "missed_link": 5.0, "review": 1.0}'::jsonb,
        'ACCEPT', null, '1.0', '1.0', '1.0'
      ) AS res;
    `, [comp1, comp2]);
    const acceptData = acceptRes.rows[0].res;
    expect(acceptData.success).toBe(true);
    expect(acceptData.selected_action).toBe('ACCEPT');
    expect(acceptData.review_status).toBe('NOT_REQUIRED');

    // Verify relationship was automatically persisted to complaint_relationships
    const relCheck1 = await db.query(`SELECT * FROM public.complaint_relationships WHERE (source_complaint_id = $1 AND target_complaint_id = $2) OR (source_complaint_id = $2 AND target_complaint_id = $1);`, [comp1, comp2]);
    expect(relCheck1.rows.length).toBe(1);
    expect(relCheck1.rows[0].relationship_type).toBe('Related');

    // Step C: Record second decision for same pair with uncertain score -> REVIEW
    const reviewRes = await db.query(`
      SELECT public.record_wicr_decision(
        $1::uuid, $2::uuid, 'Duplicate', 0.52, 0.49, true,
        5.1, 2.45, 1.0,
        '{"false_lock": 10.0, "missed_link": 5.0, "review": 1.0}'::jsonb,
        'REVIEW', 'MINIMUM_EXPECTED_LOSS_REVIEW', '1.0', '1.0', '1.0'
      ) AS res;
    `, [comp1, comp2]);
    const reviewData = reviewRes.rows[0].res;
    expect(reviewData.success).toBe(true);
    expect(reviewData.selected_action).toBe('REVIEW');
    expect(reviewData.review_status).toBe('PENDING');

    const pendingDecisionId = reviewData.decision_id;

    // Verify versioning: the previous ACCEPT decision is now is_latest = false
    const historyRes = await db.query(`SELECT id, selected_action, is_latest FROM public.wicr_decisions WHERE source_complaint_id = $1 AND target_complaint_id = $2 ORDER BY created_at ASC;`, [comp1, comp2]);
    expect(historyRes.rows.length).toBe(2);
    expect(historyRes.rows[0].selected_action).toBe('ACCEPT');
    expect(historyRes.rows[0].is_latest).toBe(false);
    expect(historyRes.rows[1].selected_action).toBe('REVIEW');
    expect(historyRes.rows[1].is_latest).toBe(true);

    // Step D: Verify view v_pending_wicr_reviews contains the pending item
    const viewRes = await db.query(`SELECT * FROM public.v_pending_wicr_reviews WHERE decision_id = $1;`, [pendingDecisionId]);
    expect(viewRes.rows.length).toBe(1);
    expect(viewRes.rows[0].source_title).toBe('Broken Water Pipe');
    expect(viewRes.rows[0].target_title).toBe('Sinkhole Forming');
    expect(viewRes.rows[0].relationship_type).toBe('Duplicate');
    expect(viewRes.rows[0].review_status).toBe('PENDING');

    // Step E: Officer resolves review as ACCEPT (Duplicate verified)
    const resolveRes = await db.query(`
      SELECT public.resolve_wicr_review(
        $1::uuid, $2::uuid, 'ACCEPT', 'Confirmed identical sinkhole by officer inspection'
      ) AS res;
    `, [pendingDecisionId, reviewerId]);
    const resolveData = resolveRes.rows[0].res;
    expect(resolveData.success).toBe(true);
    expect(resolveData.resolved_action).toBe('ACCEPT');
    expect(resolveData.review_status).toBe('RESOLVED_ACCEPT');

    // Verify decision record updated
    const updatedDec = await db.query(`SELECT review_status, reviewer_notes, reviewer_id FROM public.wicr_decisions WHERE id = $1;`, [pendingDecisionId]);
    expect(updatedDec.rows[0].review_status).toBe('RESOLVED_ACCEPT');
    expect(updatedDec.rows[0].reviewer_notes).toBe('Confirmed identical sinkhole by officer inspection');
    expect(updatedDec.rows[0].reviewer_id).toBe(reviewerId);

    // Verify complaint_relationships updated to Duplicate
    const relCheck2 = await db.query(`SELECT relationship_type, reason FROM public.complaint_relationships WHERE (source_complaint_id = $1 AND target_complaint_id = $2) OR (source_complaint_id = $2 AND target_complaint_id = $1);`, [comp1, comp2]);
    expect(relCheck2.rows.length).toBe(1);
    expect(relCheck2.rows[0].relationship_type).toBe('Duplicate');
    expect(relCheck2.rows[0].reason).toContain('Human verified via WICR Review Queue');

    // Step F: Attempting to resolve already resolved review throws exception
    await expect(
      db.query(`SELECT public.resolve_wicr_review($1::uuid, $2::uuid, 'REJECT');`, [pendingDecisionId, reviewerId])
    ).rejects.toThrow(/already resolved/);

    // Step G: Invalid action throws exception
    await expect(
      db.query(`SELECT public.resolve_wicr_review($1::uuid, $2::uuid, 'MAYBE');`, [pendingDecisionId, reviewerId])
    ).rejects.toThrow(/Invalid review resolution action/);
  });

  it('9. Phase 18: WICR append-only audit log immutability and department-scoped view verification', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Step A: Setup user and complaints with explicit departments
    const userRes = await db.query(`INSERT INTO public.users (name, email, role, department) VALUES ('Officer Dave', 'dave@city.gov', 'officer', 'Roads') RETURNING id;`);
    const reviewerId = userRes.rows[0].id;

    const c1Res = await db.query(`INSERT INTO public.complaints (title, description, category, department_id) VALUES ('Pothole Cluster', 'Severe potholes on Elm St', 'Road Damage', 'Roads') RETURNING id;`);
    const c2Res = await db.query(`INSERT INTO public.complaints (title, description, category, department_id) VALUES ('Street Cave-In', 'Subsidence near Elm St curb', 'Road Damage', 'Roads') RETURNING id;`);
    const comp1 = c1Res.rows[0].id;
    const comp2 = c2Res.rows[0].id;

    // Step B: Record decision (routing to REVIEW)
    const decRes = await db.query(`
      SELECT public.record_wicr_decision(
        $1::uuid, $2::uuid, 'Duplicate', 0.51, 0.48, true,
        5.2, 2.4, 1.0,
        '{"false_lock": 10.0, "missed_link": 5.0, "review": 1.0}'::jsonb,
        'REVIEW', 'MINIMUM_EXPECTED_LOSS_REVIEW', '1.0', '1.0', '1.0'
      ) AS res;
    `, [comp1, comp2]);
    const decId = decRes.rows[0].res.decision_id;

    // Verify initial DECISION_RECORDED event was inserted into wicr_review_events
    const eventRes1 = await db.query(`SELECT * FROM public.wicr_review_events WHERE decision_id = $1;`, [decId]);
    expect(eventRes1.rows.length).toBe(1);
    expect(eventRes1.rows[0].event_type).toBe('DECISION_RECORDED');
    expect(eventRes1.rows[0].new_status).toBe('PENDING');

    // Step C: Verify view v_pending_wicr_reviews contains department fields
    const viewRes = await db.query(`SELECT decision_id, source_department, target_department FROM public.v_pending_wicr_reviews WHERE decision_id = $1;`, [decId]);
    expect(viewRes.rows.length).toBe(1);
    expect(viewRes.rows[0].source_department).toBe('Roads');
    expect(viewRes.rows[0].target_department).toBe('Roads');

    // Step D: Resolve review
    await db.query(`
      SELECT public.resolve_wicr_review($1::uuid, $2::uuid, 'ACCEPT', 'Verified duplicate road hazard');
    `, [decId, reviewerId]);

    // Verify second event RESOLVED_ACCEPT was appended
    const eventRes2 = await db.query(`SELECT * FROM public.wicr_review_events WHERE decision_id = $1 ORDER BY created_at ASC;`, [decId]);
    expect(eventRes2.rows.length).toBe(2);
    expect(eventRes2.rows[1].event_type).toBe('RESOLVED_ACCEPT');
    expect(eventRes2.rows[1].actor_email).toBe('dave@city.gov');
    expect(eventRes2.rows[1].actor_role).toBe('officer');
    expect(eventRes2.rows[1].notes).toBe('Verified duplicate road hazard');

    const firstEventId = eventRes2.rows[0].id;

    // Step E: Verify strictly append-only immutability trigger blocks UPDATE
    await expect(
      db.query(`UPDATE public.wicr_review_events SET notes = 'tampered' WHERE id = $1;`, [firstEventId])
    ).rejects.toThrow(/append-only.*Modification or deletion.*prohibited/);

    // Step F: Verify immutability trigger blocks DELETE
    await expect(
      db.query(`DELETE FROM public.wicr_review_events WHERE id = $1;`, [firstEventId])
    ).rejects.toThrow(/append-only.*Modification or deletion.*prohibited/);
  });

  it('10. Phase 19: Prerequisite recommendations approval, atomic cycle prevention, and verified issue closure', async () => {
    const db = new PGlite();
    const allMigrationsPath = path.join(DB_DOCS_DIR, 'ALL_MIGRATIONS.sql');
    await db.exec(fs.readFileSync(allMigrationsPath, 'utf8'));

    // Step A: Setup user, civic issue, complaints, and workstreams
    const userRes = await db.query(`INSERT INTO public.users (name, email, role, department) VALUES ('Inspector Chloe', 'chloe@city.gov', 'officer', 'Inspection') RETURNING id;`);
    const inspectorId = userRes.rows[0].id;

    const issueRes = await db.query(`INSERT INTO public.civic_issues (title, primary_category) VALUES ('Water Main Burst with Road Subsidence', 'Water Supply') RETURNING id;`);
    const issueId = issueRes.rows[0].id;

    await db.query(`INSERT INTO public.complaints (civic_issue_id, title, description, category, status) VALUES ($1, 'Pipe Leak', '4th Ave', 'Water Supply', 'Pending');`, [issueId]);

    const ws1Res = await db.query(`INSERT INTO public.workstreams (civic_issue_id, department_id) VALUES ($1, 'Water Supply') RETURNING id;`, [issueId]);
    const ws2Res = await db.query(`INSERT INTO public.workstreams (civic_issue_id, department_id) VALUES ($1, 'Roads') RETURNING id;`, [issueId]);
    const ws1Id = ws1Res.rows[0].id;
    const ws2Id = ws2Res.rows[0].id;

    // Step B: Setup tasks: Task 1 (Water Supply - Repair Pipe), Task 2 (Roads - Pave Road)
    const t1Res = await db.query(`
      INSERT INTO public.tasks (civic_issue_id, workstream_id, department_id, issue_type, title, status)
      VALUES ($1, $2, 'Water Supply', 'Water Leakage', 'Excavate and Replace Pipe', 'PENDING')
      RETURNING id;
    `, [issueId, ws1Id]);
    const t2Res = await db.query(`
      INSERT INTO public.tasks (civic_issue_id, workstream_id, department_id, issue_type, title, status)
      VALUES ($1, $2, 'Roads', 'Road Damage', 'Asphalt Paving and Compaction', 'PENDING')
      RETURNING id;
    `, [issueId, ws2Id]);
    const task1 = t1Res.rows[0].id;
    const task2 = t2Res.rows[0].id;

    // Step C: Insert a candidate dependency recommendation (Task 2 depends on Task 1)
    const recRes = await db.query(`
      INSERT INTO public.task_dependency_recommendations (
        task_id, depends_on_task_id, source_civic_issue_id, target_civic_issue_id,
        source_department, target_department, confidence, recommendation_type,
        reason, evidence, rule_version, status
      )
      VALUES (
        $1, $2, $3, $3,
        'Water Supply', 'Roads', 0.88, 'CROSS_DEPARTMENT',
        'Water Supply excavation must complete before Roads Department asphalt restoration.',
        '{"kg_relation": "can_cause", "precedence": "excavation_before_paving"}'::jsonb,
        '1.0', 'PENDING'
      ) RETURNING id;
    `, [task2, task1, issueId]);
    const recId = recRes.rows[0].id;

    // Verify view v_pending_dependency_recommendations
    const viewRes = await db.query(`SELECT * FROM public.v_pending_dependency_recommendations WHERE recommendation_id = $1;`, [recId]);
    expect(viewRes.rows.length).toBe(1);
    expect(viewRes.rows[0].task_title).toBe('Asphalt Paving and Compaction');
    expect(viewRes.rows[0].prerequisite_title).toBe('Excavate and Replace Pipe');
    expect(viewRes.rows[0].confidence).toBe('0.88');

    // Step D: Verify recommendation is NOT in active task_dependencies before approval
    const preCheck = await db.query(`SELECT * FROM public.task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2;`, [task2, task1]);
    expect(preCheck.rows.length).toBe(0);

    // Step E: Authorized officer accepts recommendation
    const acceptRes = await db.query(`
      SELECT public.accept_dependency_recommendation($1::uuid, $2::uuid, 'Approved domain staging order') AS res;
    `, [recId, inspectorId]);
    expect(acceptRes.rows[0].res.success).toBe(true);
    expect(acceptRes.rows[0].res.status).toBe('ACCEPTED');

    // Verify dependency was atomically added to public.task_dependencies
    const postCheck = await db.query(`SELECT * FROM public.task_dependencies WHERE task_id = $1 AND depends_on_task_id = $2;`, [task2, task1]);
    expect(postCheck.rows.length).toBe(1);

    // Step F: Staged execution enforcement — Task 2 is blocked until Task 1 completes
    await expect(
      db.query(`SELECT public.update_task_status_transactional($1::uuid, 'IN_PROGRESS', 'road.crew@city.gov');`, [task2])
    ).rejects.toThrow(/Cannot start task.*is not COMPLETED or VERIFIED/);

    // Step G: Complete Task 1
    await db.query(`SELECT public.update_task_status_transactional($1::uuid, 'IN_PROGRESS', 'water.crew@city.gov');`, [task1]);
    await db.query(`SELECT public.update_task_status_transactional($1::uuid, 'COMPLETED', 'water.crew@city.gov');`, [task1]);

    // Task 2 unblocks!
    await db.query(`SELECT public.update_task_status_transactional($1::uuid, 'IN_PROGRESS', 'road.crew@city.gov');`, [task2]);

    // Step H: Premature Civic Issue resolution rejection
    // One department is COMPLETED (Water), but Roads is still IN_PROGRESS.
    await expect(
      db.query(`SELECT public.verify_civic_issue_resolution($1::uuid, $2::uuid, 'Attempting early closure');`, [issueId, inspectorId])
    ).rejects.toThrow(/Cannot verify Civic Issue resolution.*incomplete task\(s\) remain/);

    // Step I: Complete Task 2
    await db.query(`SELECT public.update_task_status_transactional($1::uuid, 'COMPLETED', 'road.crew@city.gov');`, [task2]);

    // Step J: Authorized municipal inspection verifies resolution
    const verifyRes = await db.query(`
      SELECT public.verify_civic_issue_resolution($1::uuid, $2::uuid, 'Site inspection confirmed complete pipe repair and road restoration') AS res;
    `, [issueId, inspectorId]);
    expect(verifyRes.rows[0].res.success).toBe(true);
    expect(verifyRes.rows[0].res.status).toBe('VERIFIED');

    // Verify issue status and tasks transitioned to VERIFIED, complaints resolved
    const finalIssue = await db.query(`SELECT status, verified_by FROM public.civic_issues WHERE id = $1;`, [issueId]);
    expect(finalIssue.rows[0].status).toBe('VERIFIED');
    expect(finalIssue.rows[0].verified_by).toBe(inspectorId);

    const finalTasks = await db.query(`SELECT status FROM public.tasks WHERE civic_issue_id = $1;`, [issueId]);
    expect(finalTasks.rows.every(t => t.status === 'VERIFIED')).toBe(true);

    const finalComplaints = await db.query(`SELECT status FROM public.complaints WHERE civic_issue_id = $1;`, [issueId]);
    expect(finalComplaints.rows[0].status).toBe('Resolved');
  });

});
