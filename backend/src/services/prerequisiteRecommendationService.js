// src/services/prerequisiteRecommendationService.js
const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { detectCycleInEdges } = require('./taskDependencyService');

// Load Knowledge Graph and Routing Rules
let civicKnowledge = [];
let routingRules = { issueTypes: [], departmentMapping: {}, taskTemplates: {}, dependencyRules: [] };

try {
  const KNOWLEDGE_PATH = path.join(__dirname, '../../data/civic_knowledge.json');
  if (fs.existsSync(KNOWLEDGE_PATH)) {
    civicKnowledge = JSON.parse(fs.readFileSync(KNOWLEDGE_PATH, 'utf8'));
  }
} catch (err) {
  console.error('[PrerequisiteService] Error loading civic_knowledge.json:', err.message);
}

try {
  const RULES_PATH = path.join(__dirname, '../../data/routing_rules.json');
  if (fs.existsSync(RULES_PATH)) {
    routingRules = JSON.parse(fs.readFileSync(RULES_PATH, 'utf8'));
  }
} catch (err) {
  console.error('[PrerequisiteService] Error loading routing_rules.json:', err.message);
}

/**
 * Returns the loaded causal knowledge graph rules.
 */
function getCausalKnowledgeRules() {
  return civicKnowledge;
}

/**
 * Maps category name to department name.
 */
function getDepartmentForCategory(category) {
  if (!category) return 'General Administration';
  return routingRules.departmentMapping[category] || `${category} Department`;
}

/**
 * Helper to determine category from task or issue.
 */
function extractCategory(task, issue) {
  if (task.category) return task.category;
  if (issue && issue.category) return issue.category;
  if (task.department_id) {
    for (const [cat, dept] of Object.entries(routingRules.departmentMapping || {})) {
      if (dept.toLowerCase().includes(task.department_id.toLowerCase()) || 
          task.department_id.toLowerCase().includes(dept.toLowerCase())) {
        return cat;
      }
    }
  }
  return null;
}

/**
 * Generates explainable prerequisite recommendations for a Civic Issue
 * (and related Civic Issues) using causal rules and template ordering.
 *
 * All recommendations are created with status = 'PENDING' and are NEVER
 * automatically inserted into the active execution graph.
 *
 * @param {string} civicIssueId - Target Civic Issue UUID
 * @returns {Promise<Array<object>>} - List of newly created or existing pending recommendations
 */
async function generateRecommendations(civicIssueId) {
  if (!civicIssueId) throw new Error('Civic Issue ID is required');

  // 1. Fetch target Civic Issue and its tasks
  const { data: currentIssue, error: issueErr } = await supabase
    .from('civic_issues')
    .select('*')
    .eq('id', civicIssueId)
    .single();

  if (issueErr || !currentIssue) {
    throw new Error(`Civic Issue ${civicIssueId} not found`);
  }

  const { data: currentTasks, error: tasksErr } = await supabase
    .from('tasks')
    .select('*')
    .eq('civic_issue_id', civicIssueId);

  if (tasksErr) throw new Error(`Failed to fetch tasks: ${tasksErr.message}`);
  if (!currentTasks || currentTasks.length === 0) return [];

  // 2. Fetch existing dependencies across all tasks to prevent duplicates & cycles
  const { data: existingDeps } = await supabase
    .from('task_dependencies')
    .select('task_id, depends_on_task_id');

  const activeDepSet = new Set((existingDeps || []).map(d => `${d.task_id}_${d.depends_on_task_id}`));

  // 3. Find related Civic Issues via complaint_relationships (Related links)
  let candidateIssues = [currentIssue];
  let relatedIssueIds = [];

  if (currentIssue.complaint_ids && currentIssue.complaint_ids.length > 0) {
    const { data: relatedEdges } = await supabase
      .from('complaint_relationships')
      .select('source_complaint_id, target_complaint_id, relationship_type')
      .or(`source_complaint_id.in.(${currentIssue.complaint_ids.join(',')}),target_complaint_id.in.(${currentIssue.complaint_ids.join(',')})`)
      .eq('relationship_type', 'Related');

    if (relatedEdges && relatedEdges.length > 0) {
      const relatedCompIds = new Set();
      for (const edge of relatedEdges) {
        if (!currentIssue.complaint_ids.includes(edge.source_complaint_id)) {
          relatedCompIds.add(edge.source_complaint_id);
        }
        if (!currentIssue.complaint_ids.includes(edge.target_complaint_id)) {
          relatedCompIds.add(edge.target_complaint_id);
        }
      }

      if (relatedCompIds.size > 0) {
        const { data: compRecords } = await supabase
          .from('complaints')
          .select('id, civic_issue_id')
          .in('id', [...relatedCompIds]);

        if (compRecords) {
          relatedIssueIds = [...new Set(compRecords.map(c => c.civic_issue_id).filter(id => id && id !== civicIssueId))];
        }
      }
    }
  }

  if (relatedIssueIds.length > 0) {
    const { data: relIssues } = await supabase
      .from('civic_issues')
      .select('*')
      .in('id', relatedIssueIds);
    if (relIssues) candidateIssues.push(...relIssues);
  }

  // 4. Fetch all tasks for candidate issues
  const allCandidateIssueIds = candidateIssues.map(ci => ci.id);
  const { data: allCandidateTasks } = await supabase
    .from('tasks')
    .select('*')
    .in('civic_issue_id', allCandidateIssueIds);

  const candidateTaskList = allCandidateTasks || currentTasks;

  // 5. Causal map from Knowledge Graph: sourceCategory -> targetCategory[]
  const causalMap = new Map();
  for (const rule of civicKnowledge) {
    if (rule.relation === 'can_cause') {
      if (!causalMap.has(rule.source)) causalMap.set(rule.source, []);
      causalMap.get(rule.source).push(rule.target);
    }
  }

  // 6. Template cross-rules from routing_rules.json (e.g. water_repair -> flood_restore)
  const templatePrecedenceMap = new Map();
  for (const depRule of (routingRules.dependencyRules || [])) {
    if (depRule.before && depRule.after) {
      if (!templatePrecedenceMap.has(depRule.after)) {
        templatePrecedenceMap.set(depRule.after, []);
      }
      templatePrecedenceMap.get(depRule.after).push(depRule.before);
    }
  }

  // 7. Evaluate candidate pairs (upstreamTask -> downstreamTask)
  // downstreamTask depends on upstreamTask (upstream must finish before downstream)
  const candidateRecommendations = [];

  for (const downstream of currentTasks) {
    const downstreamIssue = candidateIssues.find(i => i.id === downstream.civic_issue_id) || currentIssue;
    const downstreamCategory = extractCategory(downstream, downstreamIssue);
    const downstreamDept = downstream.department_id || getDepartmentForCategory(downstreamCategory);

    for (const upstream of candidateTaskList) {
      if (upstream.id === downstream.id) continue; // No self loops

      const upstreamIssue = candidateIssues.find(i => i.id === upstream.civic_issue_id) || currentIssue;
      const upstreamCategory = extractCategory(upstream, upstreamIssue);
      const upstreamDept = upstream.department_id || getDepartmentForCategory(upstreamCategory);

      // Check if already an active dependency
      if (activeDepSet.has(`${downstream.id}_${upstream.id}`)) continue;

      let matchedRule = null;
      let confidence = 0.0;
      let reason = '';
      let evidence = {};
      let recommendationType = 'CROSS_DEPARTMENT';

      const isCrossIssue = upstream.civic_issue_id !== downstream.civic_issue_id;
      if (isCrossIssue) {
        recommendationType = 'CROSS_ISSUE';
      } else if (upstreamDept === downstreamDept) {
        recommendationType = 'INTRA_DEPARTMENT';
      }

      // Check Condition 1: Template direct precedence (e.g. water_repair before flood_restore, elec_verify before water_repair)
      const allowedBefores = templatePrecedenceMap.get(downstream.template_id) || [];
      if (upstream.template_id && allowedBefores.includes(upstream.template_id)) {
        matchedRule = 'TEMPLATE_PRECEDENCE';
        confidence = isCrossIssue ? 0.88 : 0.95;
        reason = `Template sequencing rule: Task "${upstream.title}" (${upstream.template_id}) is a standard operational precursor to "${downstream.title}" (${downstream.template_id}).`;
        evidence = {
          rule_source: 'routing_rules.json:dependencyRules',
          upstream_template: upstream.template_id,
          downstream_template: downstream.template_id,
          is_cross_issue: isCrossIssue
        };
      }

      // Check Condition 2: Causal Knowledge Graph relation (can_cause)
      // e.g. Water Leakage can_cause Road Damage => Water repair must precede Road repair
      if (!matchedRule && upstreamCategory && downstreamCategory && causalMap.has(upstreamCategory)) {
        const potentialEffects = causalMap.get(upstreamCategory);
        if (potentialEffects.includes(downstreamCategory)) {
          // Check operational sense: repairing the cause must precede resurfacing/finishing the effect
          matchedRule = 'CAUSAL_KNOWLEDGE_GRAPH';
          confidence = isCrossIssue ? 0.82 : 0.90;
          reason = `Causal precedence: Issue category "${upstreamCategory}" can cause "${downstreamCategory}". Upstream corrective work ("${upstream.title}") must be completed prior to downstream restoration ("${downstream.title}") to prevent recurring damage.`;
          evidence = {
            rule_source: 'civic_knowledge.json',
            relation: 'can_cause',
            source_category: upstreamCategory,
            target_category: downstreamCategory,
            upstream_department: upstreamDept,
            downstream_department: downstreamDept,
            is_cross_issue: isCrossIssue
          };
        }
      }

      // Check Condition 3: Safety / Hazard isolation precedence
      // Tree Hazard / Electrical isolation must precede civil works in the same area
      if (!matchedRule && upstreamCategory === 'Tree Hazard' && downstreamCategory !== 'Tree Hazard') {
        if (upstream.template_id === 'safety_resolve' || upstream.template_id === 'safety_secure') {
          matchedRule = 'SAFETY_CLEARANCE_PRECEDENCE';
          confidence = isCrossIssue ? 0.80 : 0.88;
          reason = `Hazard clearance rule: Tree hazard mitigation ("${upstream.title}") must precede civil and electrical utility work ("${downstream.title}") to ensure site safety.`;
          evidence = {
            rule_source: 'civic_knowledge.json:Tree Hazard',
            relation: 'safety_precedence',
            upstream_category: 'Tree Hazard',
            downstream_category: downstreamCategory,
            is_cross_issue: isCrossIssue
          };
        }
      }

      if (matchedRule) {
        // Cycle prevention pre-check: verify proposed edge does not create a cycle
        const cycleCheck = detectCycleInEdges(downstream.id, upstream.id, existingDeps || []);
        if (cycleCheck.hasCycle) {
          // Skip recommendation if it would introduce an immediate cycle into the task graph
          continue;
        }

        candidateRecommendations.push({
          task_id: downstream.id,
          depends_on_task_id: upstream.id,
          source_civic_issue_id: upstream.civic_issue_id,
          target_civic_issue_id: downstream.civic_issue_id,
          is_cross_issue: isCrossIssue,
          source_department: upstreamDept,
          target_department: downstreamDept,
          confidence,
          recommendation_type: recommendationType,
          reason,
          evidence,
          rule_version: '1.0',
          status: 'PENDING'
        });
      }
    }
  }

  if (candidateRecommendations.length === 0) {
    return [];
  }

  // 8. Persist candidate recommendations into database (idempotent ON CONFLICT DO NOTHING)
  const savedRecords = [];
  for (const rec of candidateRecommendations) {
    const { data: inserted, error: insertErr } = await supabase
      .from('task_dependency_recommendations')
      .upsert(rec, { onConflict: 'task_id,depends_on_task_id', ignoreDuplicates: true })
      .select();

    if (!insertErr && inserted && inserted.length > 0) {
      savedRecords.push(inserted[0]);
    }
  }

  return savedRecords;
}

/**
 * Retrieves pending recommendations with flexible filtering and pagination.
 */
async function getPendingRecommendations(options = {}) {
  const { civicIssueId, departmentId, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('v_pending_dependency_recommendations')
    .select('*')
    .order('confidence', { ascending: false })
    .range(offset, offset + limit - 1);

  if (civicIssueId) {
    query = query.or(`source_civic_issue_id.eq.${civicIssueId},target_civic_issue_id.eq.${civicIssueId}`);
  }

  if (departmentId) {
    query = query.or(`task_department.eq.${departmentId},prerequisite_department.eq.${departmentId}`);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Failed to fetch pending recommendations: ${error.message}`);
  }

  return data || [];
}

/**
 * Approves a prerequisite recommendation.
 * Invokes PostgreSQL stored procedure accept_dependency_recommendation, which
 * applies advisory locks, enforces atomic cycle prevention, adds the edge
 * to task_dependencies, and marks the recommendation ACCEPTED.
 */
async function acceptRecommendation(recommendationId, reviewerId, notes = null) {
  if (!recommendationId) throw new Error('Recommendation ID is required');

  const { data, error } = await supabase.rpc('accept_dependency_recommendation', {
    p_recommendation_id: recommendationId,
    p_reviewer_id: reviewerId,
    p_notes: notes || 'Approved by municipal officer'
  });

  if (error) {
    throw new Error(`Failed to accept recommendation: ${error.message}`);
  }

  return data;
}

/**
 * Rejects a prerequisite recommendation.
 * Invokes PostgreSQL stored procedure reject_dependency_recommendation,
 * which marks the recommendation REJECTED with officer audit notes.
 */
async function rejectRecommendation(recommendationId, reviewerId, notes = null) {
  if (!recommendationId) throw new Error('Recommendation ID is required');

  const { data, error } = await supabase.rpc('reject_dependency_recommendation', {
    p_recommendation_id: recommendationId,
    p_reviewer_id: reviewerId,
    p_notes: notes || 'Rejected by municipal officer'
  });

  if (error) {
    throw new Error(`Failed to reject recommendation: ${error.message}`);
  }

  return data;
}

module.exports = {
  generateRecommendations,
  getPendingRecommendations,
  acceptRecommendation,
  rejectRecommendation,
  getCausalKnowledgeRules
};

