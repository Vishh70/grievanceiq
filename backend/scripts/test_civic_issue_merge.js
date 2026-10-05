const { createOrUpdateCivicIssue } = require('../src/services/civicIssueService');
const supabase = require('../src/config/supabase');
const relationshipPersistenceService = require('../src/services/relationshipPersistenceService');
const sinon = require('sinon');
const assert = require('assert');

describe('Civic Issue Merging & Relationship Persistence', () => {
  let supabaseMock;
  
  beforeEach(() => {
    supabaseMock = sinon.stub(supabase, 'from');
  });

  afterEach(() => {
    sinon.restore();
  });

  it('Case 1: New complaint belongs to one existing Civic Issue', async () => {
    const componentComplaints = [
      { id: 'comp-1', civic_issue_id: 'issue-A', category: 'Road Damage' },
      { id: 'comp-2', civic_issue_id: null, category: 'Road Damage' }
    ];

    supabaseMock.withArgs('civic_issues').returns({
      update: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      single: sinon.stub().resolves({ data: { id: 'issue-A' } })
    });
    
    supabaseMock.withArgs('complaints').returns({
      update: sinon.stub().returnsThis(),
      in: sinon.stub().resolves({})
    });

    const result = await createOrUpdateCivicIssue(componentComplaints);
    assert.strictEqual(result.id, 'issue-A');
  });

  it('Case 2: New complaint creates a brand-new isolated Civic Issue', async () => {
    const componentComplaints = [
      { id: 'comp-new', civic_issue_id: null, category: 'Road Damage' }
    ];

    supabaseMock.withArgs('civic_issues').returns({
      insert: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      single: sinon.stub().resolves({ data: { id: 'issue-NEW' } })
    });
    
    supabaseMock.withArgs('complaints').returns({
      update: sinon.stub().returnsThis(),
      in: sinon.stub().resolves({})
    });

    const result = await createOrUpdateCivicIssue(componentComplaints);
    assert.strictEqual(result.id, 'issue-NEW');
  });

  it('Case 3: New complaint connects two existing Civic Issues (Deterministic merge)', async () => {
    const componentComplaints = [
      { id: 'comp-1', civic_issue_id: 'issue-A', category: 'Road Damage' },
      { id: 'comp-2', civic_issue_id: 'issue-B', category: 'Road Damage' },
      { id: 'comp-new', civic_issue_id: null, category: 'Road Damage' }
    ];

    // issue-B has more complaints, so it should survive
    const dbIssues = [
      { id: 'issue-A', complaint_ids: ['comp-1'], priority: 'Medium', created_at: '2023-01-01T00:00:00Z' },
      { id: 'issue-B', complaint_ids: ['comp-2', 'comp-3'], priority: 'High', created_at: '2023-01-01T00:00:00Z' }
    ];

    const inStub = sinon.stub();
    inStub.onCall(0).resolves({ data: dbIssues }); // First call to select
    
    // The second call is to update the merged issue status
    inStub.onCall(1).resolves({});

    supabaseMock.withArgs('civic_issues').returns({
      select: sinon.stub().returnsThis(),
      in: inStub,
      update: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      single: sinon.stub().resolves({ data: { id: 'issue-B' } })
    });
    
    supabaseMock.withArgs('complaints').returns({
      update: sinon.stub().returnsThis(),
      in: sinon.stub().resolves({})
    });

    const result = await createOrUpdateCivicIssue(componentComplaints);
    assert.strictEqual(result.id, 'issue-B'); // issue-B survives
  });

  it('Case 4: Two candidate Civic Issues have equal ranking metrics (Tie-breaker)', async () => {
    const componentComplaints = [
      { id: 'comp-1', civic_issue_id: 'issue-A', category: 'Road Damage' },
      { id: 'comp-2', civic_issue_id: 'issue-B', category: 'Road Damage' },
      { id: 'comp-new', civic_issue_id: null, category: 'Road Damage' }
    ];

    // Both have same complaints length, priority, and created_at. Tie-breaker by ID (issue-A < issue-B).
    const dbIssues = [
      { id: 'issue-B', complaint_ids: ['comp-2'], priority: 'Medium', created_at: '2023-01-01T00:00:00Z' },
      { id: 'issue-A', complaint_ids: ['comp-1'], priority: 'Medium', created_at: '2023-01-01T00:00:00Z' }
    ];

    const inStub = sinon.stub();
    inStub.onCall(0).resolves({ data: dbIssues }); // First call to select
    inStub.onCall(1).resolves({}); // Second call

    supabaseMock.withArgs('civic_issues').returns({
      select: sinon.stub().returnsThis(),
      in: inStub,
      update: sinon.stub().returnsThis(),
      eq: sinon.stub().returnsThis(),
      single: sinon.stub().resolves({ data: { id: 'issue-A' } })
    });
    
    supabaseMock.withArgs('complaints').returns({
      update: sinon.stub().returnsThis(),
      in: sinon.stub().resolves({})
    });

    const result = await createOrUpdateCivicIssue(componentComplaints);
    assert.strictEqual(result.id, 'issue-A'); // issue-A survives because 'issue-A' < 'issue-B'
  });

  it('Relationship Persistence Canonical Ordering', async () => {
    supabaseMock.withArgs('complaint_relationships').returns({
      upsert: sinon.stub().returnsThis(),
      select: sinon.stub().returnsThis(),
      single: sinon.stub().resolves({ data: {} })
    });

    await relationshipPersistenceService.upsertRelationship('uuid-b', 'uuid-a', 'Related', 0.9, 'reason');
    
    // We need to inspect what was passed to upsert
    const upsertArgs = supabaseMock.withArgs('complaint_relationships').returnValues[0].upsert.getCall(0).args[0];
    assert.strictEqual(upsertArgs.source_complaint_id, 'uuid-a'); // uuid-a is lexically smaller
    assert.strictEqual(upsertArgs.target_complaint_id, 'uuid-b');
  });
});
