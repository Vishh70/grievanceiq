// src/controllers/civicIssueController.js
const supabase = require('../config/supabase');
const routingService = require('../services/routingService');
const dependencyService = require('../services/taskDependencyService');
const executionService = require('../services/taskExecutionService');

exports.getCivicIssues = async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    const fields = isAdmin ? '*' : 'id, title, description, status, created_at, updated_at, complaint_ids';
    
    const { data: issues, error } = await supabase
      .from('civic_issues')
      .select(fields)
      .order('updated_at', { ascending: false });

    if (error) throw error;

    // Attach complaint counts and ensure DTO shape
    const mappedIssues = (issues || []).map(issue => {
      const dto = {
        id: issue.id,
        title: issue.title,
        description: issue.description,
        status: issue.status,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
        complaint_count: issue.complaint_ids ? issue.complaint_ids.length : 0
      };
      // Only admins get the full array of complaint_ids inside the list response
      if (isAdmin) {
        dto.complaint_ids = issue.complaint_ids;
      }
      return dto;
    });

    res.json(mappedIssues);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getCivicIssueById = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user && req.user.role === 'admin';
    const fields = isAdmin ? '*' : 'id, title, description, status, created_at, updated_at, complaint_ids';

    const { data: issue, error: issueErr } = await supabase
      .from('civic_issues')
      .select(fields)
      .eq('id', id)
      .single();

    if (issueErr) throw issueErr;
    if (!issue) return res.status(404).json({ error: 'Civic Issue not found' });

    // Fetch related complaints
    let complaints = [];
    if (issue.complaint_ids && issue.complaint_ids.length > 0) {
      // Security: Only admins get full complaint details. Citizens get safe, aggregated fields.
      const compFields = isAdmin ? '*' : 'id, category, status, created_at';

      const { data: relatedComplaints, error: compErr } = await supabase
        .from('complaints')
        .select(compFields)
        .in('id', issue.complaint_ids)
        .order('created_at', { ascending: false });
      
      if (!compErr) {
        complaints = relatedComplaints;
      }
    }

    const dto = {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      status: issue.status,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      complaint_count: issue.complaint_ids ? issue.complaint_ids.length : 0,
      complaints
    };

    if (isAdmin) {
      dto.complaint_ids = issue.complaint_ids;
    }

    res.json(dto);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.routeIssue = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await routingService.routeCivicIssue(id);
    res.json({ message: 'Routing successful', data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getRoutingResult = async (req, res) => {
  try {
    const { id } = req.params;
    
    // Fetch routing results
    const { data: routing, error: routingErr } = await supabase
      .from('routing_results')
      .select('*')
      .eq('civic_issue_id', id)
      .single();

    // Fetch workstreams
    const { data: workstreams, error: wsErr } = await supabase
      .from('workstreams')
      .select('*')
      .eq('civic_issue_id', id);

    // Fetch tasks
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('*')
      .eq('civic_issue_id', id)
      .order('created_at', { ascending: true });

    res.json({
      civicIssueId: id,
      issueTypes: routing ? routing.issue_types : [],
      departments: routing ? routing.departments : [],
      workstreams: workstreams || [],
      tasks: tasks || []
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getTasks = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: tasks, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('civic_issue_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json(tasks || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.addDependency = async (req, res) => {
  try {
    const { id } = req.params;
    const { taskId, dependsOnTaskId } = req.body;

    if (!taskId || !dependsOnTaskId) {
      return res.status(400).json({ error: 'taskId and dependsOnTaskId are required.' });
    }

    await dependencyService.addDependency(taskId, dependsOnTaskId, id);
    res.json({ message: 'Dependency added successfully.' });
  } catch (err) {
    if (err.message.includes('cycle')) {
      return res.status(400).json({ error: 'DEPENDENCY_CYCLE', message: err.message });
    }
    if (err.message.includes('not found') || err.message.includes('belong')) {
      return res.status(404).json({ error: 'NOT_FOUND', message: err.message });
    }
    res.status(400).json({ error: err.message });
  }
};

exports.getDependencies = async (req, res) => {
  try {
    const { id } = req.params;
    
    // First verify the tasks belong to this issue, then fetch dependencies
    const { data: tasks, error: tasksErr } = await supabase
      .from('tasks')
      .select('id')
      .eq('civic_issue_id', id);

    if (tasksErr) throw tasksErr;
    if (!tasks || tasks.length === 0) return res.json([]);

    const { data: deps, error } = await supabase
      .from('task_dependencies')
      .select('*')
      .in('task_id', tasks.map(t => t.id));

    if (error) throw error;
    res.json(deps || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getExecutionPlan = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await dependencyService.getExecutionPlan(id);
    res.json(plan);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Phase 7
exports.getTask = async (req, res) => {
  try {
    const { id } = req.params;
    const { data: task, error } = await supabase.from('tasks').select('*').eq('id', id).single();
    if (error || !task) return res.status(404).json({ error: 'TASK_NOT_FOUND' });

    // Also get its readiness from the execution plan
    const plan = await dependencyService.getExecutionPlan(task.civic_issue_id);
    const readiness = plan.taskReadiness[id] || null;

    res.json({ ...task, readiness });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    // Assuming req.user is set by auth middleware
    const userEmail = req.user?.email || req.user?.id || 'anonymous';

    if (!status) {
      return res.status(400).json({ error: 'Status is required' });
    }

    const updated = await executionService.updateTaskStatus(id, status, userEmail, `User manually changed to ${status}`);
    res.json({ message: 'Task updated', updated });
  } catch (err) {
    if (err.message.includes('Task not found')) {
      return res.status(404).json({ error: 'TASK_NOT_FOUND', message: err.message });
    }
    if (err.message.includes('Invalid status transition')) {
      return res.status(400).json({ error: 'INVALID_STATUS_TRANSITION', message: err.message });
    }
    if (err.message.includes('Cannot start task. Locked by')) {
      return res.status(409).json({ error: 'TASK_locked', message: err.message });
    }
    res.status(500).json({ error: err.message });
  }
};

exports.getCivicIssueProgress = async (req, res) => {
  try {
    const { id } = req.params;
    const progress = await executionService.getCivicIssueProgress(id);
    if (progress.error) return res.status(400).json({ error: progress.error });
    res.json(progress);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
