// tests/civicGraph.test.js
// Phase 4: Civic Knowledge Graph & Connected Components tests

const complaintGraphService = require('../src/services/complaintGraphService');
const { loadKnowledgeGraph, findRelationship, getRelatedIssueTypes } = require('../src/services/knowledgeGraphService');
const { generateCivicIssueTitle, calculateRepresentativeLocation, aggregatePriority } = require('../src/services/civicIssueService');

describe('Phase 4: Civic Issue Grouping & Graphs', () => {

  describe('Knowledge Graph Service', () => {
    it('loads the civic knowledge JSON', () => {
      const kg = loadKnowledgeGraph();
      expect(Array.isArray(kg)).toBe(true);
      expect(kg.length).toBeGreaterThan(0);
    });

    it('finds existing relationships', () => {
      const rel = findRelationship('Water Leakage', 'Road Damage');
      expect(rel).toBe('can_cause');
    });

    it('returns null for nonexistent relationships', () => {
      const rel = findRelationship('Random Entity', 'Another Random');
      expect(rel).toBeNull();
    });

    it('can find related issue types (both incoming and outgoing)', () => {
      const related = getRelatedIssueTypes('Water Leakage');
      expect(related.some(r => r.type === 'Road Damage')).toBe(true);
    });
  });

  describe('Complaint Graph Service (Connected Components)', () => {

    it('Test 1 — Duplicate grouping', () => {
      complaintGraphService.buildGraph(
        [{ id: 'C001' }, { id: 'C002' }],
        [{ sourceId: 'C001', targetId: 'C002', relationship: 'Duplicate' }]
      );
      const components = complaintGraphService.findConnectedComponents();
      expect(components).toEqual([['C001', 'C002']]);
    });

    it('Test 2 — Related grouping', () => {
      complaintGraphService.buildGraph(
        [{ id: 'C1' }, { id: 'C2' }],
        [{ sourceId: 'C1', targetId: 'C2', relationship: 'Related' }]
      );
      const components = complaintGraphService.findConnectedComponents();
      expect(components).toEqual([['C1', 'C2']]);
    });

    it('Test 3 — Independent complaints remain separate', () => {
      complaintGraphService.buildGraph(
        [{ id: 'C1' }, { id: 'C2' }],
        [{ sourceId: 'C1', targetId: 'C2', relationship: 'Independent' }] // Independent edges are ignored
      );
      const components = complaintGraphService.findConnectedComponents();
      expect(components).toEqual([['C1'], ['C2']]);
    });

    it('Test 4 — Similar but distant issues do not blindly merge', () => {
      complaintGraphService.buildGraph(
        [{ id: 'C1' }, { id: 'C2' }],
        [{ sourceId: 'C1', targetId: 'C2', relationship: 'Similar' }] // Similar edges are ignored
      );
      const components = complaintGraphService.findConnectedComponents();
      expect(components).toEqual([['C1'], ['C2']]);
    });

    it('Test 5 — Connected chain forms one component', () => {
      complaintGraphService.buildGraph(
        [{ id: 'A' }, { id: 'B' }, { id: 'C' }],
        [
          { sourceId: 'A', targetId: 'B', relationship: 'Related' },
          { sourceId: 'B', targetId: 'C', relationship: 'Duplicate' }
        ]
      );
      const components = complaintGraphService.findConnectedComponents();
      expect(components).toEqual([['A', 'B', 'C']]);
    });

    it('Test 6 — Separate components', () => {
      complaintGraphService.buildGraph(
        [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
        [
          { sourceId: 'A', targetId: 'B', relationship: 'Related' },
          { sourceId: 'C', targetId: 'D', relationship: 'Duplicate' }
        ]
      );
      const components = complaintGraphService.findConnectedComponents();
      expect(components).toEqual([['A', 'B'], ['C', 'D']]);
    });

    it('Test 8 — Empty graph', () => {
      complaintGraphService.buildGraph([], []);
      const components = complaintGraphService.findConnectedComponents();
      expect(components).toEqual([]);
    });

  });

  describe('Civic Issue Data Aggregation', () => {
    
    it('Generates a deterministic title', () => {
      const title1 = generateCivicIssueTitle([{ category: 'Water Supply' }]);
      expect(title1).toBe('Water Supply Issue');

      const title2 = generateCivicIssueTitle([{ category: 'Water Supply' }, { category: 'Roads' }]);
      expect(title2).toBe('Water Supply and Roads Issue');
    });

    it('Aggregates highest priority', () => {
      const prio = aggregatePriority([{ priority: 'Low' }, { priority: 'Critical' }, { priority: 'High' }]);
      expect(prio).toBe('Critical');
    });

    it('Test 7 — Calculates representative location ignoring missing GPS', () => {
      const loc = calculateRepresentativeLocation([
        { location_lat: 18.0, location_lng: 73.0 },
        { location_lat: null, location_lng: null },
        { location_lat: 18.2, location_lng: 73.2 }
      ]);
      expect(loc.location_lat).toBeCloseTo(18.1);
      expect(loc.location_lng).toBeCloseTo(73.1);

      const emptyLoc = calculateRepresentativeLocation([{ location_lat: null, location_lng: null }]);
      expect(emptyLoc.location_lat).toBeNull();
    });
  });

});
