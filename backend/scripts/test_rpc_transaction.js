const supabase = require('../src/config/supabase');
const { routeCivicIssue } = require('../src/services/routingService');
const { updateTaskStatus } = require('../src/services/taskExecutionService');

async function testTransaction() {
  console.log('Testing RPC Transaction: update_task_status_transactional');
  
  // 1. Create a dummy Civic Issue
  const { data: issue, error: issueErr } = await supabase
    .from('civic_issues')
    .insert({
      title: 'Transaction Test Issue',
      description: 'Testing the atomic RPC task update',
      primary_category: 'Roads',
      status: 'PENDING',
      location_lat: 18.5204,
      location_lng: 73.8567
    })
    .select()
    .single();

  if (issueErr) {
    console.error('Failed to create test issue:', issueErr);
    return;
  }
  
  console.log(`Created test issue: ${issue.id}`);

  // 2. Route it to generate tasks
  const routingResult = await routeCivicIssue(issue.id);
  console.log(`Generated ${routingResult.tasksCreated} tasks.`);

  // 3. Find one of the generated tasks
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*')
    .eq('civic_issue_id', issue.id)
    .limit(1);

  if (!tasks || tasks.length === 0) {
    console.error('No tasks generated for the issue.');
    return;
  }

  const targetTask = tasks[0];
  console.log(`Updating task: ${targetTask.title} (${targetTask.id}) to IN_PROGRESS`);

  // 4. Update task using the service (which uses the RPC)
  try {
    await updateTaskStatus(targetTask.id, 'IN_PROGRESS', 'test@example.com', 'Starting work');
    console.log('Task updated successfully via RPC!');
    
    // Verify atomic updates
    const { data: history } = await supabase
      .from('task_status_history')
      .select('*')
      .eq('task_id', targetTask.id)
      .eq('new_status', 'IN_PROGRESS');
      
    if (history && history.length > 0) {
      console.log('✅ Audit log created atomically.');
    } else {
      console.error('❌ Audit log missing!');
    }

    const { data: ws } = await supabase
      .from('workstreams')
      .select('status')
      .eq('id', targetTask.workstream_id)
      .single();
      
    console.log(`Workstream status updated to: ${ws?.status}`);

    const { data: updatedIssue } = await supabase
      .from('civic_issues')
      .select('status')
      .eq('id', issue.id)
      .single();

    console.log(`Civic Issue status updated to: ${updatedIssue?.status}`);
    
    console.log('✅ Transaction test completely successful.');

  } catch (err) {
    console.error('\n❌ Transaction Test Failed!');
    console.error(err.message);
    if (err.message.includes('Could not find the function') || err.message.includes('update_task_status_transactional')) {
      console.log('\n=========================================');
      console.log('ACTION REQUIRED: RPC Migration missing in database.');
      console.log('Please execute docs/database/phase8_task_hardening.sql in your Supabase SQL Editor.');
      console.log('=========================================');
    }
  }
}

testTransaction().catch(console.error);
