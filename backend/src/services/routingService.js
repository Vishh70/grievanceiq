const fs = require('fs');
const path = require('path');
const supabase = require('../config/supabase');
const { generateEmbedding, cosineSimilarity } = require('./embeddingService');
const { applyDependencyRules } = require('./taskDependencyService');

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
 * Pre-computes embeddings for the controlled vocabulary of issue types.
 */
async function getIssueTypeEmbeddings() {
  const rules = loadRules();
  if (Object.keys(issueTypeEmbeddingsCache).length === rules.issueTypes.length) {
    return issueTypeEmbeddingsCache;
  }

  for (const type of rules.issueTypes) {
    if (!issueTypeEmbeddingsCache[type]) {
      try {
        issueTypeEmbeddingsCache[type] = await generateEmbedding(type);
      } catch (err) {
        console.warn(`Failed to embed issue type "${type}":`, err.message);
      }
    }
  }
  return issueTypeEmbeddingsCache;
}

/**
 * Multi-label classification using zero-shot semantic matching.
 * Compares the aggregated issue text with the controlled issue types.
 *
 * @param {object} civicIssue
 * @param {Array<object>} complaints
 * @returns {Promise<{ issueTypes: Array<{ label: string, confidence: number }> }>}
 */
async function classifyCivicIssue(civicIssue, complaints) {
  const rules = loadRules();
  const typeEmbeddings = await getIssueTypeEmbeddings();

  // Aggregate evidence
  const texts = complaints.map(c => c.description || c.text || '').filter(Boolean);
  const categories = complaints.map(c => c.category).filter(Boolean);
  const aggregatedText = `${civicIssue.title}. ${categories.join(', ')}. ${texts.join(' ')}`.substring(0, 1000);

  let issueEmbedding = [];
  try {
    issueEmbedding = await generateEmbedding(aggregatedText);
  } catch (err) {
    console.error('Embedding failed for civic issue:', err.message);
    return { issueTypes: [] };
  }

  const results = [];
  const SIMILARITY_THRESHOLD = 0.5; // Threshold for assigning a label

  for (const [label, emb] of Object.entries(typeEmbeddings)) {
    if (emb && emb.length > 0 && issueEmbedding.length > 0) {
      const similarity = cosineSimilarity(issueEmbedding, emb);
      // Fallback: If category exactly matches the label, boost it
      const categoryBoost = categories.some(c => c.toLowerCase() === label.toLowerCase()) ? 0.3 : 0;
      const finalConfidence = Math.min(1.0, similarity + categoryBoost);

      if (finalConfidence >= SIMILARITY_THRESHOLD) {
        results.push({
          label,
          confidence: Number(finalConfidence.toFixed(4))
        });
      }
    }
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  // If none passed threshold, try to map from primary category
  if (results.length === 0 && civicIssue.primary_category) {
    const fallback = rules.issueTypes.find(t => t.toLowerCase().includes(civicIssue.primary_category.toLowerCase()));
    if (fallback) {
      results.push({ label: fallback, confidence: 0.8 });
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

    // Upsert Workstream
    const { data: workstream, error: wsErr } = await supabase
      .from('workstreams')
      .upsert({
        civic_issue_id: civicIssueId,
        department_id: dept,
        issue_types: deptIssueTypes,
        status: 'PENDING',
        updated_at: new Date().toISOString()
      }, { onConflict: 'civic_issue_id, department_id' })
      .select()
      .single();

    if (wsErr) {
      console.error(`Failed to create workstream for ${dept}:`, wsErr.message);
      continue;
    }

    workstreams.push(workstream);
    workstreamsCreated++;

    // 5. Generate Tasks for this workstream
    for (const issueType of deptIssueTypes) {
      const templates = rules.taskTemplates[issueType] || [];
      for (const template of templates) {
        
        // Upsert Task (Idempotent)
        const { error: taskErr } = await supabase
          .from('tasks')
          .upsert({
            civic_issue_id: civicIssueId,
            workstream_id: workstream.id,
            department_id: dept,
            issue_type: issueType,
            title: template.title,
            description: template.description,
            priority: civicIssue.priority, // Propagate priority
            status: 'PENDING',
            updated_at: new Date().toISOString()
          }, { onConflict: 'civic_issue_id, issue_type, title' });

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
