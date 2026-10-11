// tests/unit/pipelineRegression.test.js
const { resolveDepartmentFromCategory, resolveDisplayDepartment } = require('../../src/utils/departmentResolver');
const { generateEmbedding, cosineSimilarity } = require('../../src/services/embeddingService');
const { mapComplaint } = require('../../src/controllers/complaintController');

describe('GrievanceIQ AI/ML Pipeline & Routing Regression Suite', () => {
  describe('Phase 4: Deterministic Department Resolution Rules', () => {
    it('correctly maps Road Damage category and labels to Road Department', () => {
      expect(resolveDepartmentFromCategory('Road Damage')).toBe('Road Department');
      expect(resolveDepartmentFromCategory('Roads')).toBe('Road Department');
      expect(resolveDisplayDepartment({ category: 'Road Damage' })).toBe('Road Department');
      expect(resolveDisplayDepartment({ mlLabels: ['Road Damage'] })).toBe('Road Department');
    });

    it('correctly maps Garbage category and labels to Sanitation Department', () => {
      expect(resolveDepartmentFromCategory('Garbage')).toBe('Sanitation Department');
      expect(resolveDisplayDepartment({ category: 'Garbage' })).toBe('Sanitation Department');
      expect(resolveDisplayDepartment({ mlLabels: ['Garbage'] })).toBe('Sanitation Department');
    });

    it('correctly maps Streetlight and Electric Pole to Electricity Department', () => {
      expect(resolveDepartmentFromCategory('Streetlight')).toBe('Electricity Department');
      expect(resolveDepartmentFromCategory('Electric Pole')).toBe('Electricity Department');
      expect(resolveDisplayDepartment({ category: 'Streetlight' })).toBe('Electricity Department');
      expect(resolveDisplayDepartment({ mlLabels: ['Electric Pole'] })).toBe('Electricity Department');
    });

    it('correctly maps Traffic Signal to Traffic Department', () => {
      expect(resolveDepartmentFromCategory('Traffic Signal')).toBe('Traffic Department');
      expect(resolveDisplayDepartment({ category: 'Traffic Signal' })).toBe('Traffic Department');
    });

    it('correctly maps Water Leakage and Water Supply to Water Department', () => {
      expect(resolveDepartmentFromCategory('Water Leakage')).toBe('Water Department');
      expect(resolveDepartmentFromCategory('Water Supply')).toBe('Water Department');
      expect(resolveDisplayDepartment({ category: 'Water Supply' })).toBe('Water Department');
    });

    it('correctly maps Drainage and Roadside Flooding to Drainage Department', () => {
      expect(resolveDepartmentFromCategory('Drainage')).toBe('Drainage Department');
      expect(resolveDepartmentFromCategory('Roadside Flooding')).toBe('Drainage Department');
      expect(resolveDisplayDepartment({ category: 'Drainage' })).toBe('Drainage Department');
    });

    it('handles low confidence or unknown categories without inventing arbitrary departments', () => {
      expect(resolveDepartmentFromCategory('Unknown Random Thing')).toBeNull();
      expect(resolveDisplayDepartment({ category: 'General' })).toBeNull();
      expect(resolveDisplayDepartment({})).toBeNull();
    });
  });

  describe('Phase 2: Embedding Generation Robustness & Mathematical Validation', () => {
    it('returns empty array safely for invalid or empty inputs without throwing', async () => {
      expect(await generateEmbedding('')).toEqual([]);
      expect(await generateEmbedding(null)).toEqual([]);
      expect(await generateEmbedding(undefined)).toEqual([]);
      expect(await generateEmbedding(12345)).toEqual([]);
    });

    it('calculates cosine similarity correctly and handles zero vectors', () => {
      const v1 = [1, 0, 0];
      const v2 = [1, 0, 0];
      const v3 = [0, 1, 0];
      expect(cosineSimilarity(v1, v2)).toBeCloseTo(1.0, 4);
      expect(cosineSimilarity(v1, v3)).toBeCloseTo(0.0, 4);
      expect(cosineSimilarity([], [1, 0])).toBe(0);
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0);
      expect(cosineSimilarity([NaN, 1], [1, 1])).toBe(0);
    });
  });

  describe('Phase 3 & 7: Complaint Processing State & Admin Mapping', () => {
    it('truthfully maps processingStatus and processingError without defaulting failed states to Pending', () => {
      const mockComplaint = {
        id: 'comp-12345678-abcd-1111-2222-333344445555',
        title: 'Broken streetlight',
        description: 'Light is flickering and sparking',
        category: 'Streetlight',
        priority: 'High',
        severity_score: 8,
        status: 'Pending',
        processing_status: 'FAILED',
        processing_error: 'Embedding service timed out after 10000ms',
        ai_processed: false,
        created_at: new Date().toISOString()
      };

      const mapped = mapComplaint(mockComplaint);

      expect(mapped.processingStatus).toBe('FAILED');
      expect(mapped.processingError).toBe('Embedding service timed out after 10000ms');
      expect(mapped.aiProcessed).toBe(false);
      expect(mapped.status).toBe('Pending'); // Workflow status remains Pending
      expect(mapped.category).toBe('Streetlight');
      expect(mapped.severityScore).toBe(8);
      expect(mapped.recommendedDepartment).toBe('Electricity Department');
    });

    it('projects PROCESSED status accurately when pipeline completes successfully', () => {
      const mockComplaint = {
        id: 'comp-87654321-abcd-1111-2222-333344445555',
        title: 'Severe road pothole',
        description: 'Large hole causing vehicle damage',
        category: 'Roads',
        priority: 'Critical',
        severity_score: 9,
        status: 'Pending',
        processing_status: 'PROCESSED',
        processing_error: null,
        ai_processed: true,
        ml_labels: ['Road Damage'],
        created_at: new Date().toISOString()
      };

      const mapped = mapComplaint(mockComplaint);

      expect(mapped.processingStatus).toBe('PROCESSED');
      expect(mapped.processingError).toBeNull();
      expect(mapped.aiProcessed).toBe(true);
      expect(mapped.recommendedDepartment).toBe('Road Department');
    });
  });
});
