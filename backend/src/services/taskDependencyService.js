// src/services/taskDependencyService.js
const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

/**
 * Detects whether adding a directed dependency edge (dependsOnTaskId -> taskId)
 * creates a cycle in the task graph using iterative reachability traversal (BFS).
 *
 * @param {string} taskId - The dependent task (downstream)
 * @param {string} dependsOnTaskId - The prerequisite task (upstream)
 * @param {Array<object>} existingDependencies - Array of { task_id, depends_on_task_id }
 * @returns {{ hasCycle: boolean, path?: Array<string> }}
 */
function detectCycleInEdges(taskId, dependsOnTaskId, existingDependencies) {
  if (taskId === dependsOnTaskId) {
    return { hasCycle: true, path: [taskId, taskId] };
  }

  // Build adjacency list: depends_on_task_id -> task_id (directed prerequisite flow)
  const adj = new Map();
  for (const dep of existingDependencies) {
    if (!adj.has(dep.depends_on_task_id)) {
      adj.set(dep.depends_on_task_id, []);
    }
    adj.get(dep.depends_on_task_id).push(dep.task_id);
  }

  // Check if dependsOnTaskId is reachable starting from taskId
  const queue = [[taskId]];
  const visited = new Set([taskId]);

  while (queue.length > 0) {
    const currentPath = queue.shift();
    const currentNode = currentPath[currentPath.length - 1];

    const neighbors = adj.get(currentNode) || [];
    for (const neighbor of neighbors) {
      if (neighbor === dependsOnTaskId) {
        return {
          hasCycle: true,
          path: [...currentPath, neighbor, taskId]
        };
      }
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([...currentPath, neighbor]);
      }
    }
  }

  return { hasCycle: false };
}

/**
 * Validates and atomically adds a new task dependency.
 * Supports both intra-issue and cross-issue task dependencies.
 * Prevents cycles using PostgreSQL advisory-locked recursive traversal.
 *
 * @param {string} taskId - Downstream dependent task
 * @param {string} dependsOnTaskId - Upstream prerequisite task
 * @param {string} [civicIssueId] - Optional Civic Issue ID for authorization scope
 */
async function addDependency(taskId, dependsOnTaskId, civicIssueId = null) {
  if (taskId === dependsOnTaskId) {
    throw new Error('Self dependency is not allowed.');
  }

  // 1. Verify both tasks exist
  const { data: tasks, error: fetchErr } = await supabase
    .from('tasks')
    .select('id, civic_issue_id, title')
    .in('id', [taskId, dependsOnTaskId]);
    
  if (fetchErr) throw new Error(`Failed to fetch tasks: ${fetchErr.message}`);
  
  if (!tasks || tasks.length !== 2) {
    throw new Error('One or both tasks not found.');
  }

  // 2. Authorization scope: if civicIssueId is provided, at least one task must belong to it
  if (civicIssueId) {
    const belongs = tasks.some(t => t.civic_issue_id === civicIssueId);
    if (!belongs) {
      throw new Error('Tasks do not belong to the provided Civic Issue.');
    }
  }

  // 3. Attempt PostgreSQL atomic serialized RPC with advisory lock & recursive cycle check
  try {
    const { data: rpcData, error: rpcErr } = await supabase.rpc('add_task_dependency_transactional', {
      p_task_id: taskId,
      p_depends_on_task_id: dependsOnTaskId
    });

    if (!rpcErr) {
      return rpcData;
    }

    if (rpcErr.message && rpcErr.message.includes('cycle')) {
      throw new Error(rpcErr.message);
    }
    if (rpcErr.message && !rpcErr.message.includes('function') && !rpcErr.message.includes('does not exist')) {
      throw new Error(`Failed to insert dependency: ${rpcErr.message}`);
    }
  } catch (rpcEx) {
    if (rpcEx.message && rpcEx.message.includes('cycle')) {
      throw rpcEx;
    }
    if (rpcEx.message && !rpcEx.message.includes('function') && !rpcEx.message.includes('does not exist')) {
      throw rpcEx;
    }
  }

  // 4. Fallback for mock environments: application-level reachability cycle check before insert
  const { data: allDeps, error: depsQueryErr } = await supabase
    .from('task_dependencies')
    .select('task_id, depends_on_task_id');

  if (!depsQueryErr && allDeps) {
    const cycleCheck = detectCycleInEdges(taskId, dependsOnTaskId, allDeps);
    if (cycleCheck.hasCycle) {
      throw new Error(`Adding this dependency would create a cycle: ${cycleCheck.path.join(' -> ')}`);
    }
  }

  const { error: insertErr } = await supabase
    .from('task_dependencies')
    .insert({
      task_id: taskId,
      depends_on_task_id: dependsOnTaskId
    });

  if (insertErr) {
    if (insertErr.code === '23505') { // Unique violation
      return { success: true, status: 'ALREADY_EXISTS' };
    }
    if (insertErr.message && insertErr.message.includes('cycle')) {
      throw new Error(insertErr.message);
    }
    throw new Error(`Failed to insert dependency: ${insertErr.message}`);
  }
}

/**
 * Removes an existing task dependency edge.
 *
 * @param {string} taskId
 * @param {string} dependsOnTaskId
 */
async function removeDependency(taskId, dependsOnTaskId) {
  const { error } = await supabase
    .from('task_dependencies')
    .delete()
    .match({ task_id: taskId, depends_on_task_id: dependsOnTaskId });

  if (error) {
    throw new Error(`Failed to remove dependency: ${error.message}`);
  }
  return true;
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
 * Gets the execution plan (Topological sort, stages, and cross-issue readiness) for a Civic Issue.
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
      taskReadiness: {},
      crossIssueDependencies: []
    };
  }

  const taskIds = tasks.map(t => t.id);

  // Fetch dependencies where this issue's tasks are either downstream or upstream
  const { data: deps, error: depsErr } = await supabase
    .from('task_dependencies')
    .select('*')
    .in('task_id', taskIds);
    
  if (depsErr) throw new Error('Failed to fetch dependencies');

  // Fetch any external prerequisite tasks that belong to other Civic Issues
  const allPrereqIds = (deps || []).map(d => d.depends_on_task_id);
  const externalPrereqIds = allPrereqIds.filter(id => !taskIds.includes(id));
  let externalTasks = [];

  if (externalPrereqIds.length > 0) {
    const { data: extTasks } = await supabase
      .from('tasks')
      .select('id, status, title, civic_issue_id, priority, created_at')
      .in('id', [...new Set(externalPrereqIds)]);
    if (extTasks) externalTasks = extTasks;
  }

  const allKnownTasks = [...tasks, ...externalTasks];

  // Intra-issue topological graph
  const { graph, inDegree } = buildGraph(tasks, deps || []);
  const { validDag, cycle, sorted, stages } = kahnTopologicalSort(tasks, graph, inDegree);

  // Calculate task readiness considering both intra-issue and cross-issue prerequisites
  const taskReadiness = {};
  for (const task of tasks) {
    const lockedBy = (deps || []).filter(d => d.task_id === task.id).map(d => d.depends_on_task_id);
    const lockedByIncomplete = lockedBy.filter(depId => {
      const depTask = allKnownTasks.find(t => t.id === depId);
      return !depTask || !['COMPLETED', 'VERIFIED'].includes(depTask.status);
    });

    const isReady = lockedByIncomplete.length === 0 && task.status === 'PENDING';
    const stageState = task.status === 'PENDING' ? (isReady ? 'READY' : 'PENDING') : task.status;

    taskReadiness[task.id] = {
      ready: isReady,
      stageState,
      lockedBy: lockedByIncomplete
    };
  }

  // Cross-issue dependency metadata
  const crossIssueDependencies = (deps || [])
    .filter(d => externalPrereqIds.includes(d.depends_on_task_id))
    .map(d => {
      const extTask = externalTasks.find(t => t.id === d.depends_on_task_id);
      return {
        taskId: d.task_id,
        dependsOnTaskId: d.depends_on_task_id,
        prerequisiteTitle: extTask ? extTask.title : 'External Task',
        prerequisiteCivicIssueId: extTask ? extTask.civic_issue_id : null,
        prerequisiteStatus: extTask ? extTask.status : 'UNKNOWN',
        isSatisfied: extTask ? ['COMPLETED', 'VERIFIED'].includes(extTask.status) : false
      };
    });

  // Format stages array of objects
  const formattedStages = stages.map((stageTasks, idx) => ({
    stage: idx + 1,
    tasks: stageTasks
  }));

  const completedTasks = tasks.filter(t => t.status === 'COMPLETED' || t.status === 'VERIFIED').length;
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
    crossIssueDependencies,
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
    for (const item of inserts) {
      try {
        await addDependency(item.task_id, item.depends_on_task_id, civicIssueId);
      } catch (depErr) {
        if (depErr.message && depErr.message.includes('cycle')) {
          console.warn(`[DependencyRules] Skipped cyclic rule dependency: ${depErr.message}`);
        } else {
          throw depErr;
        }
      }
    }
  }
}

module.exports = {
  addDependency,
  removeDependency,
  getExecutionPlan,
  applyDependencyRules,
  buildGraph,
  kahnTopologicalSort,
  detectCycleInEdges
};
