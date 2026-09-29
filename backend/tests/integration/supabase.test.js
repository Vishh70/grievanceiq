// tests/integration/supabase.test.js
// Phase 8: Real Supabase Integration Test
// This test ONLY runs if valid credentials are provided, verifying the actual network stack.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const hasValidCredentials = supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder');

describe('Phase 8: Real Supabase Integration Test', () => {

  if (!hasValidCredentials) {
    it.skip('SKIPPED — integration environment not configured (missing valid Supabase credentials)', () => {});
    return; // Exit the describe block
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const testRunId = crypto.randomUUID();

  afterAll(async () => {
    // Cleanup generated integration data
    await supabase.from('civic_issues').delete().eq('title', `Integration Test Issue ${testRunId}`);
  });

  it('Verifies end-to-end database operations', async () => {
    // 1. Insert Civic Issue
    const issueId = crypto.randomUUID();
    const { error: issueErr } = await supabase.from('civic_issues').insert({
      id: issueId,
      title: `Integration Test Issue ${testRunId}`,
      status: 'PENDING'
    });
    expect(issueErr).toBeNull();

    // 2. Insert Workstream
    const wsId = crypto.randomUUID();
    const { error: wsErr } = await supabase.from('workstreams').insert({
      id: wsId,
      civic_issue_id: issueId,
      department_id: 'Test Department',
      status: 'PENDING'
    });
    expect(wsErr).toBeNull();

    // 3. Insert Tasks
    const taskId1 = crypto.randomUUID();
    const taskId2 = crypto.randomUUID();
    const { error: tasksErr } = await supabase.from('tasks').insert([
      { id: taskId1, civic_issue_id: issueId, workstream_id: wsId, title: 'Test Task 1', status: 'PENDING' },
      { id: taskId2, civic_issue_id: issueId, workstream_id: wsId, title: 'Test Task 2', status: 'PENDING' }
    ]);
    expect(tasksErr).toBeNull();

    // 4. Insert Dependency (Task 2 depends on Task 1)
    const { error: depErr } = await supabase.from('task_dependencies').insert({
      task_id: taskId2,
      depends_on_task_id: taskId1
    });
    expect(depErr).toBeNull();

    // 5. Update Task Status & verify history
    // We simulate what the service does:
    await supabase.from('tasks').update({ status: 'IN_PROGRESS' }).eq('id', taskId1);
    const { error: historyErr } = await supabase.from('task_status_history').insert({
      task_id: taskId1,
      previous_status: 'PENDING',
      new_status: 'IN_PROGRESS',
      changed_by: 'integration_test'
    });
    expect(historyErr).toBeNull();

    // Verify
    const { data: history } = await supabase.from('task_status_history').select('*').eq('task_id', taskId1);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].new_status).toBe('IN_PROGRESS');
  });

});
