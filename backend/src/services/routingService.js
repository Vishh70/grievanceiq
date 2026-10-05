const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { generateEmbedding } = require('./embeddingService');
const { applyDependencyRules } = require('./taskDependencyService');
const { LABEL_TO_ISSUE_TYPE } = require('./mlService');

const RULES_PATH = path.join(__dirname, '../../data/routing_rules.json');
let routingRules = null;
let issueTypeEmbeddingsCache = {};

/**
 * Loads the deterministic rules and vocabulary.
 */
function loadRules() {
  if (routingRules) return routingRules;
  try {
    const data = fs.readFileSync(RULES_PATH, 'utf8');
    routingRules = JSON.parse(data);
  } catch (err) {
    console.error('Failed to load routing_rules.json:', err.message);
    routingRules = { issueTypes: [], departmentMapping: {}, taskTemplates: {} };
  }
  return routingRules;
}



/**
 * Extracts issue types directly from the trained ML labels in the complaints.
 *
 * @param {object} civicIssue
 * @param {Array<object>} complaints
 * @returns {Promise<{ issueTypes: Array<{ label: string, confidence: number }> }>}
 */
async function classifyCivicIssue(civicIssue, complaints) {
  const rules = loadRules();
  
  // Extract all ml_labels from all complaints in the issue
  const allLabels = complaints.flatMap(c => c.ml_labels || []);
  
  // Frequency count to determine confidence
  const labelCounts = {};
  let totalLabels = 0;
  for (const rawLabel of allLabels) {
    const canonicalLabel = LABEL_TO_ISSUE_TYPE[rawLabel] || rawLabel;
    labelCounts[canonicalLabel] = (labelCounts[canonicalLabel] || 0) + 1;
    totalLabels++;
  }
  
  const results = [];
  if (totalLabels > 0) {
    for (const [label, count] of Object.entries(labelCounts)) {
      results.push({
        label,
        confidence: Number((count / totalLabels).toFixed(4))
      });
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // If none passed threshold, try to map from primary category
  if (results.length === 0 && civicIssue.primary_category) {
    const fallback = rules.issueTypes.find(t => t.toLowerCase().includes(civicIssue.primary_category.toLowerCase()));
    if (fallback) {
      results.push({ label: fallback, confidence: 1.0 });
    }
  }

  return { issueTypes: results };
}

/**
 * Maps predicted issue types to departments deterministically.
 * 
 * @param {Array<{ label: string, confidence: number }>} issueTypes
 * @returns {{ departments: Array<string>, mappingReasons: Array<object> }}
 */
function mapIssueTypesToDepartments(issueTypes) {
  const rules = loadRules();
  const departmentSet = new Set();
  const mappingReasons = [];

  for (const issue of issueTypes) {
    const dept = rules.departmentMapping[issue.label];
    if (dept) {
      departmentSet.add(dept);
      mappingReasons.push({
        issueType: issue.label,
        department: dept,
        reason: `${issue.label} maps to ${dept}`
      });
    }
  }

  return {
    departments: Array.from(departmentSet),
    mappingReasons
  };
}

/**
 * Orchestrates Phase 5: Routing a Civic Issue.
 * Performs classification, mapping, and creates workstreams/tasks idempotently.
 * 
 * @param {string} civicIssueId
 */
async function routeCivicIssue(civicIssueId) {
  const rules = loadRules();
  
  // 1. Fetch Civic Issue and connected complaints
  const { data: civicIssue, error: issueErr } = await supabase
    .from('civic_issues')
    .select('*')
    .eq('id', civicIssueId)
    .single();

  if (issueErr || !civicIssue) {
    throw new Error(`Civic Issue not found: ${issueErr?.message || civicIssueId}`);
  }

  const { data: complaints, error: compErr } = await supabase
    .from('complaints')
    .select('*')
    .eq('civic_issue_id', civicIssueId);

  if (compErr) {
    throw new Error(`Failed to fetch complaints: ${compErr.message}`);
  }

  // 2. Multi-label classification
  const { issueTypes } = await classifyCivicIssue(civicIssue, complaints || []);
  
  console.log(`[CivicRouting] Issue ${civicIssueId} classified as:`, issueTypes.map(t => t.label).join(', '));

  // 3. Department mapping
  const { departments, mappingReasons } = mapIssueTypesToDepartments(issueTypes);
  
  console.log(`[CivicRouting] Departments:`, departments.join(', '));

  // Store routing result for explainability
  await supabase
    .from('routing_results')
    .upsert({
      civic_issue_id: civicIssueId,
      issue_types: issueTypes,
      departments: mappingReasons,
      updated_at: new Date().toISOString()
    }, { onConflict: 'civic_issue_id' });

  // 4. Create Workstreams (Idempotent)
  let workstreamsCreated = 0;
  let tasksCreated = 0;
  const workstreams = [];

  for (const dept of departments) {
    // Find issue types for this department
    const deptIssueTypes = mappingReasons.filter(m => m.department === dept).map(m => m.issueType);

    // Fetch existing workstream
    const { data: existingWs } = await supabase.from('workstreams').select('id, status').eq('civic_issue_id', civicIssueId).eq('department_id', dept).single();

    // Upsert Workstream
    const wsPayload = {
      civic_issue_id: civicIssueId,
      department_id: dept,
      issue_types: deptIssueTypes,
      updated_at: new Date().toISOString()
    };
    if (!existingWs) wsPayload.status = 'PENDING'; // Only set on insert

    const { data: workstream, error: wsErr } = await supabase
      .from('workstreams')
      .upsert(wsPayload, { onConflict: 'civic_issue_id, department_id' })
      .select()
      .single();

    if (wsErr) {
      console.error(`Failed to create workstream for ${dept}:`, wsErr.message);
      continue;
    }

    workstreams.push(workstream);
    workstreamsCreated++;

    // Fetch existing tasks
    const { data: existingTasks } = await supabase.from('tasks').select('template_id').eq('civic_issue_id', civicIssueId);
    const existingTemplateIds = new Set((existingTasks || []).map(t => t.template_id));

    // 5. Generate Tasks for this workstream
    for (const issueType of deptIssueTypes) {
      const templates = rules.taskTemplates[issueType] || [];
      for (const template of templates) {
        
        // Upsert Task (Idempotent)
        const taskPayload = {
          civic_issue_id: civicIssueId,
          workstream_id: workstream.id,
          department_id: dept,
          issue_type: issueType,
          template_id: template.template_id,
          title: template.title,
          description: template.description,
          priority: civicIssue.priority, // Propagate priority
          updated_at: new Date().toISOString()
        };
        if (!existingTemplateIds.has(template.template_id)) {
          taskPayload.status = 'PENDING';
        }

        const { error: taskErr } = await supabase
          .from('tasks')
          .upsert(taskPayload, { onConflict: 'civic_issue_id, template_id' });

        if (taskErr) {
          console.error(`Failed to create task "${template.title}":`, taskErr.message);
        } else {
          tasksCreated++;
        }
      }
    }
  }

  // Phase 6: Automatically create dependencies based on task templates
  await applyDependencyRules(civicIssueId);

  console.log(`[CivicRouting] Created/Updated ${workstreamsCreated} workstreams`);
  console.log(`[CivicRouting] Created/Updated ${tasksCreated} tasks`);

  return {
    civicIssueId,
    issueTypes,
    departments: mappingReasons,
    workstreams,
    tasksCreated
  };
}

module.exports = {
  loadRules,
  classifyCivicIssue,
  mapIssueTypesToDepartments,
  routeCivicIssue
};
