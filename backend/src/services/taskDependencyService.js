// src/services/taskDependencyService.js
const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

/**
 * Validates and adds a new dependency.
 * @param {string} taskId 
 * @param {string} dependsOnTaskId 
 * @param {string} civicIssueId 
 */
async function addDependency(taskId, dependsOnTaskId, civicIssueId) {
  if (taskId === dependsOnTaskId) {
    throw new Error('Self dependency is not allowed.');
  }

  // Verify both tasks exist and belong to the same Civic Issue
  const { data: tasks, error: fetchErr } = await supabase
    .from('tasks')
    .select('id, civic_issue_id')
    .in('id', [taskId, dependsOnTaskId]);
    
  if (fetchErr) throw new Error(`Failed to fetch tasks: ${fetchErr.message}`);
  
  if (tasks.length !== 2) {
    throw new Error('One or both tasks not found.');
  }

  if (tasks[0].civic_issue_id !== civicIssueId || tasks[1].civic_issue_id !== civicIssueId) {
    throw new Error('Tasks belong to different Civic Issues or provided ID does not match.');
  }

  // Insert dependency
  const { error: insertErr } = await supabase
    .from('task_dependencies')
    .insert({
      task_id: taskId,
      depends_on_task_id: dependsOnTaskId
    });

  if (insertErr) {
    if (insertErr.code === '23505') { // Unique violation
      return; // Already exists, idempotent
    }
    throw new Error(`Failed to insert dependency: ${insertErr.message}`);
  }

  // Validate cycle after inserting
  const plan = await getExecutionPlan(civicIssueId);
  if (!plan.validDag) {
    // Revert insertion
    await supabase.from('task_dependencies').delete().match({ task_id: taskId, depends_on_task_id: dependsOnTaskId });
    throw new Error(`Adding this dependency would create a cycle: ${plan.cycle.join(' -> ')}`);
  }
}

/**
 * Builds directed graph (adjacency list).
 * graph[A] = [B, C] means B and C depend on A (A -> B, A -> C).
 * This makes Kahn's topological sort easier (calculating in-degrees).
 */
function buildGraph(tasks, dependencies) {
  const graph = {};
  const inDegree = {};

  // Initialize
  for (const task of tasks) {
    graph[task.id] = [];
    inDegree[task.id] = 0;
  }

  // task_id depends on depends_on_task_id
  // Meaning: depends_on_task_id -> task_id
  for (const dep of dependencies) {
    const from = dep.depends_on_task_id;
    const to = dep.task_id;

    if (graph[from] !== undefined && graph[to] !== undefined) {
      graph[from].push(to);
      inDegree[to]++;
    }
  }

  return { graph, inDegree };
}

/**
 * Detects cycles using Kahn's Algorithm and returns topological sort + stages.
 */
function kahnTopologicalSort(tasks, graph, inDegree) {
  const sorted = [];
  const stages = [];
  let currentStageQueue = [];
  
  // Deterministic sorting function (tie-breaker)
  // Priority: Critical > High > Medium > Low
  // Fallback: created_at, then id
  const priorityMap = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
  const sortTasks = (taskIds) => {
    return taskIds.sort((idA, idB) => {
      const a = tasks.find(t => t.id === idA);
      const b = tasks.find(t => t.id === idB);
      const prioDiff = (priorityMap[b.priority] || 0) - (priorityMap[a.priority] || 0);
      if (prioDiff !== 0) return prioDiff;
      
      const timeDiff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (timeDiff !== 0) return timeDiff;
      
      return a.id.localeCompare(b.id);
    });
  };

  // Find initial nodes with 0 in-degree
  for (const taskId of Object.keys(inDegree)) {
    if (inDegree[taskId] === 0) {
      currentStageQueue.push(taskId);
    }
  }

  while (currentStageQueue.length > 0) {
    // Sort current stage deterministically
    currentStageQueue = sortTasks(currentStageQueue);
    
    stages.push([...currentStageQueue]);
    const nextStageQueue = [];

    for (const taskId of currentStageQueue) {
      sorted.push(taskId);
      
      for (const neighbor of graph[taskId]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          nextStageQueue.push(neighbor);
        }
      }
    }
    
    currentStageQueue = nextStageQueue;
  }

  // If sorted doesn't contain all tasks, there's a cycle
  const validDag = sorted.length === tasks.length;
  
  let cycle = [];
  if (!validDag) {
    // Extract the cycle nodes
    cycle = Object.keys(inDegree).filter(id => inDegree[id] > 0);
  }

  return { validDag, cycle, sorted, stages };
}

/**
 * Gets the execution plan (Topological sort and stages) for a Civic Issue.
 */
async function getExecutionPlan(civicIssueId) {
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('civic_issue_id', civicIssueId);

  if (tasksErr) throw new Error('Failed to fetch tasks');
  if (!tasks || tasks.length === 0) {
    return {
      civicIssueId,
      validDag: true,
      totalTasks: 0,
      stages: [],
      topologicalOrder: [],
      taskReadiness: {}
    };
  }

  const { data: deps, error: depsErr } = await supabase
    .from('task_dependencies')
    .select('*')
    .in('task_id', tasks.map(t => t.id));
    
  if (depsErr) throw new Error('Failed to fetch dependencies');

  const { graph, inDegree } = buildGraph(tasks, deps);
  const { validDag, cycle, sorted, stages } = kahnTopologicalSort(tasks, graph, inDegree);

  // Calculate task readiness
  const taskReadiness = {};
  for (const task of tasks) {
    // A task is ready if all its dependencies are COMPLETED
    const blockedBy = deps.filter(d => d.task_id === task.id).map(d => d.depends_on_task_id);
    const blockedByIncomplete = blockedBy.filter(depId => {
      const depTask = tasks.find(t => t.id === depId);
      return depTask && depTask.status !== 'COMPLETED';
    });

    taskReadiness[task.id] = {
      ready: blockedByIncomplete.length === 0 && task.status === 'PENDING',
      blockedBy: blockedByIncomplete
    };
  }

  // Format stages array of objects
  const formattedStages = stages.map((stageTasks, idx) => ({
    stage: idx + 1,
    tasks: stageTasks
  }));

  const completedTasks = tasks.filter(t => t.status === 'COMPLETED').length;
  const progress = {
    totalTasks: tasks.length,
    completedTasks,
    completionPercentage: tasks.length > 0 ? Math.round((completedTasks / tasks.length) * 100) : 0
  };

  return {
    civicIssueId,
    validDag,
    hasCycle: !validDag,
    cycle: !validDag ? cycle : undefined,
    totalTasks: tasks.length,
    stages: formattedStages,
    topologicalOrder: sorted,
    taskReadiness,
    progress
  };
}

/**
 * Automatically applies dependencies based on `routing_rules.json`.
 * Matches existing tasks for this civic issue by `template_id`.
 */
async function applyDependencyRules(civicIssueId) {
  let rules = {};
  try {
    const RULES_PATH = path.join(__dirname, '../../data/routing_rules.json');
    rules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  } catch (err) {
    console.error('Failed to load rules for dependencies:', err);
    throw new Error(`Failed to load rules for dependencies: ${err.message}`);
  }
  const dependencyRules = rules.dependencyRules || [];
  
  if (dependencyRules.length === 0) return;

  const { data: tasks, error } = await supabase
    .from('tasks')
    .select('id, template_id, civic_issue_id')
    .eq('civic_issue_id', civicIssueId);
    
  if (error) {
    throw new Error(`Failed to fetch tasks for dependency generation: ${error.message}`);
  }
  if (!tasks || tasks.length === 0) return;

  const templateToId = {};
  for (const task of tasks) {
    if (task.template_id) {
      templateToId[task.template_id] = task.id; // Map template_id to UUID
    }
  }

  const inserts = [];
  for (const rule of dependencyRules) {
    const beforeId = templateToId[rule.before];
    const afterId = templateToId[rule.after];
    
    // Only apply if both tasks exist in this Civic Issue (handles cross-department gracefully)
    if (beforeId && afterId) {
      inserts.push({
        task_id: afterId,
        depends_on_task_id: beforeId
      });
    }
  }

  if (inserts.length > 0) {
    // Use upsert to prevent duplicates
    const { error: depInsertErr } = await supabase.from('task_dependencies').upsert(inserts, { onConflict: 'task_id, depends_on_task_id' });
    if (depInsertErr) {
      throw new Error(`Failed to upsert task dependencies: ${depInsertErr.message}`);
    }
  }
}

module.exports = {
  addDependency,
  getExecutionPlan,
  applyDependencyRules,
  buildGraph,
  kahnTopologicalSort
};
