// src/services/taskExecutionService.js
const supabase = require('../config/supabase');
const { getExecutionPlan } = require('./taskDependencyService');

/**
 * Audit logs a status transition.
 */
async function logStatusTransition(taskId, prevStatus, newStatus, userEmail, reason) {
  await supabase.from('task_status_history').insert({
    task_id: taskId,
    previous_status: prevStatus,
    new_status: newStatus,
    changed_by: userEmail || 'system',
    reason: reason || `Transitioned to ${newStatus}`
  });
}

/**
 * Recalculates and updates Workstream and Civic Issue statuses deterministically.
 */
async function updateWorkstreamAndIssueStatus(civicIssueId) {
  const { data: tasks } = await supabase.from('tasks').select('*').eq('civic_issue_id', civicIssueId);
  const { data: workstreams } = await supabase.from('workstreams').select('*').eq('civic_issue_id', civicIssueId);
  
  if (!tasks || !workstreams) return;

  // Update Workstreams
  for (const ws of workstreams) {
    const wsTasks = tasks.filter(t => t.workstream_id === ws.id);
    if (wsTasks.length === 0) continue;

    const allCancelled = wsTasks.every(t => t.status === 'CANCELLED');
    const allCompletedOrCancelled = wsTasks.every(t => t.status === 'COMPLETED' || t.status === 'CANCELLED');
    const noneStarted = wsTasks.every(t => t.status === 'PENDING');

    let newStatus = 'PENDING';
    if (allCancelled) newStatus = 'CANCELLED';
    else if (allCompletedOrCancelled) newStatus = 'COMPLETED';
    else if (!noneStarted) newStatus = 'IN_PROGRESS';

    if (ws.status !== newStatus) {
      await supabase.from('workstreams').update({ status: newStatus }).eq('id', ws.id);
    }
  }

  // Update Civic Issue
  const allTasksCancelled = tasks.length > 0 && tasks.every(t => t.status === 'CANCELLED');
  const allTasksFinished = tasks.length > 0 && tasks.every(t => t.status === 'COMPLETED' || t.status === 'CANCELLED');
  const noTasksStarted = tasks.length === 0 || tasks.every(t => t.status === 'PENDING');

  let newIssueStatus = 'PENDING';
  if (allTasksCancelled) newIssueStatus = 'CANCELLED';
  else if (allTasksFinished) newIssueStatus = 'COMPLETED';
  else if (!noTasksStarted) newIssueStatus = 'IN_PROGRESS';

  await supabase.from('civic_issues').update({ status: newIssueStatus }).eq('id', civicIssueId);
}

/**
 * Main service to update a task's status with dependency safety and transaction safety via RPC.
 */
async function updateTaskStatus(taskId, newStatus, userEmail, reason) {
  const validTransitions = {
    'PENDING': ['IN_PROGRESS', 'CANCELLED'],
    'IN_PROGRESS': ['COMPLETED', 'CANCELLED'],
    'COMPLETED': [],
    'CANCELLED': []
  };

  const { data: task, error: fetchErr } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  
  if (fetchErr || !task) throw new Error('Task not found');
  
  const currentStatus = task.status;
  
  if (!validTransitions[currentStatus]?.includes(newStatus)) {
    throw new Error(`Invalid status transition from ${currentStatus} to ${newStatus}`);
  }

  // Dependency checks for starting
  if (newStatus === 'IN_PROGRESS') {
    const plan = await getExecutionPlan(task.civic_issue_id);
    const readiness = plan.taskReadiness[taskId];
    if (readiness && !readiness.ready) {
      throw new Error(`Cannot start task. Locked by: ${readiness.lockedBy.join(', ')}`);
    }
  }

  // Atomic transaction via Supabase RPC (handles task update, history log, workstream & issue status)
  const { error: rpcErr } = await supabase.rpc('update_task_status_transactional', {
    p_task_id: taskId,
    p_new_status: newStatus,
    p_user_email: userEmail,
    p_reason: reason
  });

  if (rpcErr) {
    throw new Error(`Failed to update task transactionally: ${rpcErr.message}`);
  }

  return { status: newStatus };
}

/**
 * Calculates deterministic progress numbers.
 */
async function getCivicIssueProgress(civicIssueId) {
  const { data: tasks, error } = await supabase.from('tasks').select('*').eq('civic_issue_id', civicIssueId);
  if (error || !tasks) return { error: 'Failed to fetch tasks' };

  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter(t => t.status === 'PENDING').length;
  const inProgressTasks = tasks.filter(t => t.status === 'IN_PROGRESS').length;
  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const cancelledTasks = tasks.filter(t => t.status === 'CANCELLED').length;

  let completionPercentage = 0;
  if (totalTasks > 0) {
    completionPercentage = Math.round((completedTasks / totalTasks) * 100);
  }

  // To find ready tasks we need the dependency plan
  const plan = await getExecutionPlan(civicIssueId);
  let readyTasks = 0;
  if (plan && plan.taskReadiness) {
    readyTasks = Object.values(plan.taskReadiness).filter(r => r.ready).length;
  }

  return {
    totalTasks,
    pendingTasks,
    readyTasks,
    inProgressTasks,
    completedTasks,
    cancelledTasks,
    completionPercentage
  };
}

module.exports = {
  updateTaskStatus,
  getCivicIssueProgress,
  updateWorkstreamAndIssueStatus
};
