// tests/integration/supabase.test.js
// Phase 8: Real Supabase Integration Test
// This test ONLY runs if valid credentials are provided, verifying the actual network stack.

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;

const hasValidCredentials = supabaseUrl && supabaseKey && !supabaseUrl.includes('placeholder');

describe('Phase 8: Real Supabase Integration Test', () => {

  if (!hasValidCredentials) {
    if (process.env.CI) {
      it('FAILS - missing valid Supabase credentials in CI environment', () => {
        throw new Error('Supabase integration credentials are required in CI environment but are missing.');
      });
      return; // Exit describe
    } else {
      it.skip('SKIPPED — integration environment not configured (missing valid Supabase credentials)', () => {});
      return; // Exit the describe block
    }
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const testRunId = crypto.randomUUID();

  afterAll(async () => {
    // Cleanup generated integration data safely in reverse dependency order
    await supabase.from('task_status_history').delete().eq('changed_by', `integration_test_${testRunId}`);
    
    // We cannot easily delete task_dependencies by testRunId unless we query tasks, so we do that:
    const { data: tasks } = await supabase.from('tasks').select('id').eq('title', `Test Task 1 ${testRunId}`);
    if (tasks && tasks.length > 0) {
       await supabase.from('task_dependencies').delete().eq('depends_on_task_id', tasks[0].id);
    }
    
    await supabase.from('tasks').delete().like('title', `%${testRunId}`);
    await supabase.from('workstreams').delete().eq('department_id', `Integration Test Department ${testRunId}`);
    await supabase.from('routing_results').delete().eq('department_id', `Integration Test Department ${testRunId}`);
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
      department_id: `Integration Test Department ${testRunId}`,
      status: 'PENDING'
    });
    expect(wsErr).toBeNull();

    // 3. Insert Tasks with required schema fields
    const taskId1 = crypto.randomUUID();
    const taskId2 = crypto.randomUUID();
    const { error: tasksErr } = await supabase.from('tasks').insert([
      { 
        id: taskId1, 
        civic_issue_id: issueId, 
        workstream_id: wsId, 
        department_id: `Integration Test Department ${testRunId}`,
        issue_type: 'integration_test',
        title: `Test Task 1 ${testRunId}`, 
        status: 'PENDING' 
      },
      { 
        id: taskId2, 
        civic_issue_id: issueId, 
        workstream_id: wsId, 
        department_id: `Integration Test Department ${testRunId}`,
        issue_type: 'integration_test_2',
        title: `Test Task 2 ${testRunId}`, 
        status: 'PENDING' 
      }
    ]);
    expect(tasksErr).toBeNull();

    // 4. Insert Dependency (Task 2 depends on Task 1)
    const { error: depErr } = await supabase.from('task_dependencies').insert({
      task_id: taskId2,
      depends_on_task_id: taskId1
    });
    expect(depErr).toBeNull();

    // Verify dependency was persisted
    const { data: deps } = await supabase.from('task_dependencies').select('*').eq('task_id', taskId2);
    expect(deps.length).toBe(1);
    expect(deps[0].depends_on_task_id).toBe(taskId1);

    // 5. Update Task Status & verify history using the real RPC
    const { error: rpcErr } = await supabase.rpc('update_task_status_transactional', {
      p_task_id: taskId1,
      p_new_status: 'IN_PROGRESS',
      p_user_email: `integration_test_${testRunId}`,
      p_reason: 'Testing RPC'
    });
    expect(rpcErr).toBeNull();

    // Verify Task
    const { data: updatedTask } = await supabase.from('tasks').select('*').eq('id', taskId1).single();
    expect(updatedTask.status).toBe('IN_PROGRESS');
    expect(updatedTask.started_at).not.toBeNull();

    // Verify History
    const { data: history } = await supabase.from('task_status_history').select('*').eq('task_id', taskId1);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0].new_status).toBe('IN_PROGRESS');
    expect(history[0].changed_by).toBe(`integration_test_${testRunId}`);

    // Verify Workstream state updated by RPC
    const { data: updatedWs } = await supabase.from('workstreams').select('*').eq('id', wsId).single();
    expect(updatedWs.status).toBe('IN_PROGRESS');

    // Verify Civic Issue state updated by RPC
    const { data: updatedIssue } = await supabase.from('civic_issues').select('*').eq('id', issueId).single();
    expect(updatedIssue.status).toBe('IN_PROGRESS');
  });

});
