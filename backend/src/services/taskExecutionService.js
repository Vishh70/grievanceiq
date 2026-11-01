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
    const allCompletedOrCancelled = wsTasks.every(t => t.status === 'COMPLETED' || t.status === 'VERIFIED' || t.status === 'CANCELLED');
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
  const allTasksFinished = tasks.length > 0 && tasks.every(t => t.status === 'COMPLETED' || t.status === 'VERIFIED' || t.status === 'CANCELLED');
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
    'COMPLETED': ['VERIFIED'],
    'VERIFIED': [],
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
 * Formally verifies a completed task with inspector notes and evidence.
 */
async function verifyTask(taskId, verifierId, userEmail, notes, evidence = {}) {
  const { data: task, error: fetchErr } = await supabase.from('tasks').select('*').eq('id', taskId).single();
  if (fetchErr || !task) throw new Error('Task not found');

  if (task.status !== 'COMPLETED') {
    throw new Error(`Task must be in COMPLETED status before verification (current status: ${task.status})`);
  }

  // Call the transactional RPC to transition to VERIFIED
  const { error: rpcErr } = await supabase.rpc('update_task_status_transactional', {
    p_task_id: taskId,
    p_new_status: 'VERIFIED',
    p_user_email: userEmail,
    p_reason: notes || 'Verified by municipal officer'
  });

  if (rpcErr) {
    throw new Error(`Failed to verify task transactionally: ${rpcErr.message}`);
  }

  // Attach verification metadata
  await supabase.from('tasks').update({
    verified_by: verifierId,
    verified_at: new Date().toISOString(),
    verification_notes: notes || 'Verified inspection',
    verification_evidence: evidence
  }).eq('id', taskId);

  return { success: true, taskId, status: 'VERIFIED' };
}

/**
 * Verifies final Civic Issue resolution across all departments.
 * Rejects resolution if any tasks remain uncompleted or unverified.
 */
async function verifyCivicIssue(civicIssueId, verifierId, notes = null) {
  if (!civicIssueId) throw new Error('Civic Issue ID is required');

  const { data, error } = await supabase.rpc('verify_civic_issue_resolution', {
    p_civic_issue_id: civicIssueId,
    p_verifier_id: verifierId,
    p_notes: notes || 'Verified resolution by municipal inspection'
  });

  if (error) {
    throw new Error(`Failed to verify Civic Issue resolution: ${error.message}`);
  }

  return data;
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
  const verifiedTasks = tasks.filter(t => t.status === 'VERIFIED').length;
  const cancelledTasks = tasks.filter(t => t.status === 'CANCELLED').length;

  const finishedTasks = completedTasks + verifiedTasks;
  let completionPercentage = 0;
  if (totalTasks > 0) {
    completionPercentage = Math.round((finishedTasks / totalTasks) * 100);
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
    verifiedTasks,
    cancelledTasks,
    completionPercentage
  };
}

module.exports = {
  updateTaskStatus,
  verifyTask,
  verifyCivicIssue,
  getCivicIssueProgress,
  updateWorkstreamAndIssueStatus
};
