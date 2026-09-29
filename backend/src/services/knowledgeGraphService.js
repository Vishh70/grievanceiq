// src/services/knowledgeGraphService.js
const fs = require('fs');
const path = require('path');

const KNOWLEDGE_PATH = path.join(__dirname, '../../data/civic_knowledge.json');

let knowledgeGraph = null;

/**
 * Loads the civic knowledge graph from the JSON seed file.
 */
function loadKnowledgeGraph() {
  if (knowledgeGraph) return knowledgeGraph;

  try {
    if (fs.existsSync(KNOWLEDGE_PATH)) {
      const data = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
      knowledgeGraph = JSON.parse(data);
    } else {
      console.warn('⚠️ Civic knowledge graph not found at', KNOWLEDGE_PATH);
      knowledgeGraph = [];
    }
  } catch (err) {
    console.error('Failed to load knowledge graph:', err.message);
    knowledgeGraph = [];
  }

  return knowledgeGraph;
}

/**
 * Finds a relationship between a source and a target.
 *
 * @param {string} source
 * @param {string} target
 * @returns {string|null} The relationship type (e.g. 'can_cause') or null
 */
function findRelationship(source, target) {
  const kg = loadKnowledgeGraph();
  if (!source || !target) return null;

  const rel = kg.find(edge => 
    edge.source.toLowerCase() === source.toLowerCase() && 
    edge.target.toLowerCase() === target.toLowerCase()
  );

  return rel ? rel.relation : null;
}

/**
 * Gets all related issue types for a given issue type, either as a source or target.
 *
 * @param {string} issueType
 * @returns {Array<{ type: string, relation: string, direction: 'outgoing' | 'incoming' }>}
 */
function getRelatedIssueTypes(issueType) {
  const kg = loadKnowledgeGraph();
  if (!issueType) return [];

  const lowerType = issueType.toLowerCase();
  const related = [];

  for (const edge of kg) {
    if (edge.source.toLowerCase() === lowerType) {
      related.push({ type: edge.target, relation: edge.relation, direction: 'outgoing' });
    } else if (edge.target.toLowerCase() === lowerType) {
      related.push({ type: edge.source, relation: edge.relation, direction: 'incoming' });
    }
  }

  return related;
}

module.exports = {
  loadKnowledgeGraph,
  findRelationship,
  getRelatedIssueTypes
};
