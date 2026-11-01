// tests/unit/complaintWorkerStages.test.js

const mockUpdates = [];

function createChainableQuery() {
  const updateChain = {
    eq: jest.fn(),
    in: jest.fn(),
    select: jest.fn(),
    single: jest.fn().mockImplementation(() => Promise.resolve({
      data: { id: 'test-complaint-uuid-1234' },
      error: null
    }))
  };
  updateChain.eq.mockReturnValue(updateChain);
  updateChain.in.mockReturnValue(updateChain);
  updateChain.select.mockReturnValue(updateChain);

  const query = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    not: jest.fn().mockReturnThis(),
    or: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({
      data: {
        id: 'test-complaint-uuid-1234',
        description: 'Massive pothole causing car damage on Main St',
        category: null,
        priority: 'Medium',
        severity_score: null,
        processing_status: 'PENDING'
      },
      error: null
    }),
    update: jest.fn((fields) => {
      mockUpdates.push(fields);
      updateChain.single = jest.fn().mockResolvedValue({
        data: { id: 'test-complaint-uuid-1234', ...fields },
        error: null
      });
      return updateChain;
    })
  };
  return query;
}

const mockSupabase = {
  from: jest.fn(() => createChainableQuery())
};

jest.mock('../../src/config/supabase', () => mockSupabase);
jest.mock('../../src/services/aiService');
jest.mock('../../src/services/embeddingService');
jest.mock('../../src/services/mlService');
jest.mock('../../src/services/duplicateDetectionService');
jest.mock('../../src/services/civicIssueService');

const { analyzeComplaint } = require('../../src/services/aiService');
const { generateEmbedding } = require('../../src/services/embeddingService');
const { predictIssueLabels } = require('../../src/services/mlService');
const { findBestDuplicate } = require('../../src/services/duplicateDetectionService');
const { processCivicIssueGrouping } = require('../../src/services/civicIssueService');
const { processComplaintLogic } = require('../../src/workers/complaintWorker');

describe('Complaint Worker Multi-Stage Resilience & Persistence', () => {
  beforeEach(() => {
    mockUpdates.length = 0;
    jest.clearAllMocks();

    findBestDuplicate.mockReturnValue({ bestMatch: null });
    processCivicIssueGrouping.mockResolvedValue({ civicIssueId: null, isNew: false });
  });

  it('Stage 2 persists AI triage immediately, and Stage 3 records FAILED if embedding fails without setting ai_processed=true', async () => {
    analyzeComplaint.mockResolvedValue({
      category: 'Roads',
      priority: 'High',
      severityScore: 8,
      safetyHazards: ['Traffic disruption', 'Vehicle rim damage'],
      suggestedAction: 'Fill pothole with hot mix asphalt',
      recommendedDepartment: 'Road Department'
    });

    generateEmbedding.mockRejectedValue(new Error('Hugging Face Router returned HTTP 429: Rate limit exceeded'));

    await expect(processComplaintLogic({
      complaintId: 'test-complaint-uuid-1234',
      text: 'Massive pothole causing car damage on Main St'
    })).rejects.toThrow('Embedding generation failed');

    // Check Stage 0/1 lease & processing state
    expect(mockUpdates[0]).toMatchObject({
      processing_status: 'PROCESSING',
      processing_error: null
    });

    // Check Stage 2 persisted triage
    expect(mockUpdates[1]).toMatchObject({
      category: 'Roads',
      priority: 'High',
      severity_score: 8,
      safety_hazards: expect.arrayContaining(['Traffic disruption']),
      suggested_action: expect.any(String)
    });

    // Check Stage 3 failure recording
    const failureUpdate = mockUpdates.find(u => u.processing_status === 'FAILED');
    expect(failureUpdate).toBeDefined();
    expect(failureUpdate.processing_error).toContain('Embedding generation failed');
    expect(failureUpdate.ai_processed).toBe(false);
  });

  it('completes all stages and marks PROCESSED with ai_processed=true when all services succeed', async () => {
    analyzeComplaint.mockResolvedValue({
      category: 'Roads',
      priority: 'High',
      severityScore: 8,
      safetyHazards: [],
      suggestedAction: 'Repair pavement',
      recommendedDepartment: 'Road Department'
    });

    generateEmbedding.mockResolvedValue(new Array(384).fill(0.05));

    predictIssueLabels.mockResolvedValue({
      labels: ['Road Damage'],
      probabilities: { 'Road Damage': 0.88 },
      departments: ['Road Department']
    });

    await processComplaintLogic({
      complaintId: 'test-complaint-uuid-1234',
      text: 'Massive pothole causing car damage on Main St'
    });

    const finalUpdate = mockUpdates.find(u => u.processing_status === 'PROCESSED');
    expect(finalUpdate).toBeDefined();
    expect(finalUpdate.ai_processed).toBe(true);
    expect(finalUpdate.processing_error).toBeNull();
  });
});
