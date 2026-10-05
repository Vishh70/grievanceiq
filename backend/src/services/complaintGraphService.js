// src/services/complaintGraphService.js

/**
 * Service to manage the Complaint Relationship Graph and find Connected Components
 * for grouping complaints into Civic Issues.
 */
class ComplaintGraphService {
  constructor() {
    this.nodes = new Map(); // Map<complaintId, complaintData>
    this.adjList = new Map(); // Map<complaintId, Array<{ target: complaintId, type: string }>>
  }

  /**
   * Adds a complaint node to the graph.
   * 
   * @param {string} id - Complaint ID
   * @param {object} data - Complaint data
   */
  addComplaintNode(id, data) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, data);
      this.adjList.set(id, []);
    }
  }

  /**
   * Adds a meaningful relationship edge between two complaints.
   * Only adds 'Duplicate' or 'Related' edges for grouping.
   * 'Similar' edges are ignored here to prevent blind merging.
   *
   * @param {string} sourceId 
   * @param {string} targetId 
   * @param {string} relationshipType - "Duplicate", "Related", "Similar", "Independent"
   */
  addRelationshipEdge(sourceId, targetId, relationshipType) {
    // Only group by Duplicate and Related
    if (relationshipType !== 'Duplicate' && relationshipType !== 'Related') {
      return;
    }

    if (!this.nodes.has(sourceId) || !this.nodes.has(targetId)) {
      return; // Both nodes must exist in the graph
    }

    // Add undirected edge
    this.adjList.get(sourceId).push({ target: targetId, type: relationshipType });
    this.adjList.get(targetId).push({ target: sourceId, type: relationshipType });
  }

  /**
   * Helper to build graph from a list of complaints and pairs
   * 
   * @param {Array} complaints - List of complaint objects
   * @param {Array} edges - List of objects { sourceId, targetId, relationship }
   */
  buildGraph(complaints, edges) {
    this.nodes.clear();
    this.adjList.clear();

    for (const c of complaints) {
      this.addComplaintNode(c.id, c);
    }

    for (const edge of edges) {
      this.addRelationshipEdge(edge.sourceId, edge.targetId, edge.relationship);
    }
  }

  /**
   * Finds connected components in the graph using DFS.
   * 
   * @returns {Array<Array<string>>} An array of components, where each component is an array of complaint IDs.
   */
  findConnectedComponents() {
    const visited = new Set();
    const components = [];

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        const component = [];
        this._dfs(nodeId, visited, component);
        if (component.length > 0) {
          components.push(component);
        }
      }
    }

    return components;
  }

  /**
   * Internal Depth-First Search for connected components.
   */
  _dfs(nodeId, visited, component) {
    visited.add(nodeId);
    component.push(nodeId);

    const neighbors = this.adjList.get(nodeId) || [];
    for (const edge of neighbors) {
      if (!visited.has(edge.target)) {
        this._dfs(edge.target, visited, component);
      }
    }
  }
}

module.exports = { ComplaintGraphService };
