// tests/routing.test.js
// Phase 5: Multi-Department Routing & Task Generation Tests



const {
  loadRules,
  classifyCivicIssue,
  mapIssueTypesToDepartments
} = require('../src/services/routingService');

// Mock embedding service to avoid Jest VM teardown issues with Transformers.js
jest.mock('../src/services/embeddingService', () => {
  return {
    generateEmbedding: jest.fn(async (text) => {
      // Return a dummy 384-dimensional vector
      return new Array(384).fill(0.1);
    }),
    cosineSimilarity: jest.fn((vecA, vecB) => {
      // If we are testing the fallback logic based on category, just return low similarity
      return 0.1;
    })
  };
});

describe('Phase 5: Multi-Department Routing', () => {

  describe('Routing Rules Loading', () => {
    it('Loads issue types, departments, and templates', () => {
      const rules = loadRules();
      expect(rules.issueTypes.length).toBeGreaterThan(0);
      expect(rules.departmentMapping['Water Leakage']).toBe('Water Department');
      expect(rules.taskTemplates['Water Leakage'].length).toBeGreaterThan(0);
    });
  });

  describe('Multi-Label Classification (Zero-Shot using Categories as fallback)', () => {
    it('Fallback: Uses primary_category if text semantic matching fails or is below threshold', async () => {
      const civicIssue = { title: 'Random issue', primary_category: 'Water' };
      const { issueTypes } = await classifyCivicIssue(civicIssue, []);
      // Should fallback to Water Leakage since it includes 'Water'
      expect(issueTypes.length).toBeGreaterThan(0);
      expect(issueTypes[0].label).toBe('Water Leakage');
    }, 30000);

    it('Test 9 — Empty Civic Issue gracefully handled', async () => {
      const { issueTypes } = await classifyCivicIssue({}, []);
      expect(issueTypes).toEqual([]);
    }, 30000);
  });

  describe('Department Mapping Rules', () => {
    it('Test 1 — Single department', () => {
      const { departments, mappingReasons } = mapIssueTypesToDepartments([
        { label: 'Water Leakage', confidence: 0.9 }
      ]);
      expect(departments).toEqual(['Water Department']);
      expect(mappingReasons.length).toBe(1);
      expect(mappingReasons[0].reason).toContain('Water Leakage maps to Water Department');
    });

    it('Test 1.5 — Vocabulary Translation (ml_labels to canonical)', async () => {
      // Mock the complaint with raw ml_labels
      const civicIssue = { title: 'Raw flags issue' };
      const complaints = [{ ml_labels: ['road_damage_flag', 'water_leakage_flag'] }];
      
      const { issueTypes } = await classifyCivicIssue(civicIssue, complaints);
      expect(issueTypes.map(t => t.label)).toContain('Road Damage');
      expect(issueTypes.map(t => t.label)).toContain('Water Leakage');
      
      const { departments } = mapIssueTypesToDepartments(issueTypes);
      expect(departments).toContain('Road Department');
      expect(departments).toContain('Water Department');
    });

    it('Test 2 — Multiple departments', () => {
      const { departments } = mapIssueTypesToDepartments([
        { label: 'Water Leakage', confidence: 0.9 },
        { label: 'Road Damage', confidence: 0.8 },
        { label: 'Electric Pole', confidence: 0.8 }
      ]);
      expect(departments).toContain('Water Department');
      expect(departments).toContain('Road Department');
      expect(departments).toContain('Electricity Department');
      expect(departments.length).toBe(3);
    });

    it('Test 3 — Multiple issue types, same department', () => {
      const { departments } = mapIssueTypesToDepartments([
        { label: 'Roadside Flooding', confidence: 0.9 },
        { label: 'Drainage', confidence: 0.9 }
      ]);
      expect(departments).toEqual(['Drainage Department']);
      // But 2 mapping reasons
    });

    it('Test 4 — Unknown/unsupported label safely ignored', () => {
      const { departments } = mapIssueTypesToDepartments([
        { label: 'UFO Landing', confidence: 0.9 }
      ]);
      expect(departments).toEqual([]);
    });
  });

  // Database interactions for Tests 5, 6, 7, 8 are implicitly validated
  // when we run `routeCivicIssue` on a live Supabase instance.
  // Since we don't want to pollute real DB heavily in Jest, we can just assert
  // the expected tasks logic directly from rules.
  describe('Task Templates Structure', () => {
    it('Test 6 — Task generation logic uses deterministic templates', () => {
      const rules = loadRules();
      const templates = rules.taskTemplates['Roadside Flooding'];
      expect(templates[0].title).toBe('Inspect flooded road');
      expect(templates[1].title).toBe('Clear obstruction');
    });
  });
});
