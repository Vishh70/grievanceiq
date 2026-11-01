// backend/tests/unit/duplicateOnlyIncidentGrouping.test.js
/**
 * Test Matrix for FR05: Duplicate-Only Incident Identity
 *
 * Verifies that:
 * 1. Duplicate + Duplicate -> Same Civic Issue
 * 2. Duplicate + Related -> Separate Civic Issues
 * 3. Related + Related -> No merging
 * 4. Mixed connected graphs -> Only verified Duplicate edges determine identity
 * 5. Repeated processing -> No duplicate issue creation (idempotent)
 * 6. Historical repair -> Non-destructive dry-run and auditable repair with no data loss
 * 7. Related-issue queryability -> Preserves cross-incident links for investigation
 */

const { ComplaintGraphService } = require('../../src/services/complaintGraphService');
const {
  createOrUpdateCivicIssue,
  processCivicIssueGrouping,
  getRelatedCivicIssues
} = require('../../src/services/civicIssueService');
const historicalRepairService = require('../../src/services/historicalGroupingRepairService');
const relationshipPersistenceService = require('../../src/services/relationshipPersistenceService');
const relationshipService = require('../../src/services/relationshipService');
const routingService = require('../../src/services/routingService');
const supabase = require('../../src/config/supabase');
const sinon = require('sinon');

describe('FR05: Duplicate-Only Incident Identity', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Graph DFS Level Checks
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. ComplaintGraphService Edge Filtering', () => {
    it('Scenario 1: Duplicate + Duplicate merges into one component', () => {
      const graph = new ComplaintGraphService();
      graph.buildGraph(
        [{ id: 'c1' }, { id: 'c2' }],
        [{ sourceId: 'c1', targetId: 'c2', relationship: 'Duplicate' }]
      );
      const components = graph.findConnectedComponents();
      expect(components).toEqual([['c1', 'c2']]);
    });

    it('Scenario 2: Duplicate + Related keeps Related complaint in a separate component', () => {
      const graph = new ComplaintGraphService();
      graph.buildGraph(
        [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }],
        [
          { sourceId: 'c1', targetId: 'c2', relationship: 'Duplicate' },
          { sourceId: 'c2', targetId: 'c3', relationship: 'Related' }
        ]
      );
      const components = graph.findConnectedComponents();
      expect(components).toEqual([['c1', 'c2'], ['c3']]);
    });

    it('Scenario 3: Related + Related never merges into a single component', () => {
      const graph = new ComplaintGraphService();
      graph.buildGraph(
        [{ id: 'c1' }, { id: 'c2' }],
        [{ sourceId: 'c1', targetId: 'c2', relationship: 'Related' }]
      );
      const components = graph.findConnectedComponents();
      expect(components).toEqual([['c1'], ['c2']]);
    });

    it('Scenario 4: Mixed connected graph isolates non-duplicate edges', () => {
      // Graph:
      // A <-> B (Duplicate)
      // B <-> C (Related)
      // C <-> D (Duplicate)
      // D <-> E (Similar)
      // E <-> F (Independent)
      const graph = new ComplaintGraphService();
      graph.buildGraph(
        [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }, { id: 'E' }, { id: 'F' }],
        [
          { sourceId: 'A', targetId: 'B', relationship: 'Duplicate' },
          { sourceId: 'B', targetId: 'C', relationship: 'Related' },
          { sourceId: 'C', targetId: 'D', relationship: 'Duplicate' },
          { sourceId: 'D', targetId: 'E', relationship: 'Similar' },
          { sourceId: 'E', targetId: 'F', relationship: 'Independent' }
        ]
      );

      const components = graph.findConnectedComponents();
      // Only A-B and C-D form multi-node components; E and F remain isolated
      expect(components).toEqual([
        ['A', 'B'],
        ['C', 'D'],
        ['E'],
        ['F']
      ]);
    });

    it('Scenario 5: Case-insensitive "duplicate" relationship is accepted', () => {
      const graph = new ComplaintGraphService();
      graph.buildGraph(
        [{ id: 'x1' }, { id: 'x2' }],
        [{ sourceId: 'x1', targetId: 'x2', relationship: 'duplicate' }]
      );
      const components = graph.findConnectedComponents();
      expect(components).toEqual([['x1', 'x2']]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. High-Level Pipeline Grouping & Service Level Checks
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Pipeline Grouping (processCivicIssueGrouping)', () => {
    it('creates a single Civic Issue for verified Duplicates and repoints complaints', async () => {
      const newComplaint = {
        id: 'comp-dup-2',
        text: 'Pothole on Main St',
        category: 'Road Damage',
        civic_issue_id: null
      };

      const existingCandidate = {
        id: 'comp-dup-1',
        text: 'Deep pothole on Main St',
        category: 'Road Damage',
        civic_issue_id: 'issue-100'
      };

      // Mock prediction to return Duplicate
      sandbox.stub(relationshipService, 'predictRelationship').resolves({
        relationship: 'Duplicate',
        confidence: 0.94
      });

      // Stub persistence
      sandbox.stub(relationshipPersistenceService, 'upsertRelationship').resolves({});
      sandbox.stub(routingService, 'routeCivicIssue').resolves({});

      // Mock Supabase
      const updateStub = sandbox.stub().returnsThis();
      const inStub = sandbox.stub().resolves({});
      const eqStub = sandbox.stub().returnsThis();
      const selectStub = sandbox.stub().returnsThis();
      const singleStub = sandbox.stub().resolves({
        data: { id: 'issue-100', complaint_ids: ['comp-dup-1', 'comp-dup-2'] }
      });

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'civic_issues') {
          return {
            update: updateStub,
            eq: eqStub,
            select: selectStub,
            single: singleStub
          };
        }
        if (table === 'complaints') {
          return {
            update: updateStub,
            in: inStub
          };
        }
        return {};
      });

      const result = await processCivicIssueGrouping(newComplaint, [existingCandidate]);

      expect(result.civicIssueId).toBe('issue-100');
      expect(result.components).toEqual([['comp-dup-2', 'comp-dup-1']]);
    });

    it('creates a separate Civic Issue when candidate is Related (does not merge)', async () => {
      const newWaterLeak = {
        id: 'comp-water-1',
        text: 'Broken pipe leaking water',
        category: 'Water Leakage',
        civic_issue_id: null
      };

      const existingRoadDamage = {
        id: 'comp-road-1',
        text: 'Asphalt collapse near hydrant',
        category: 'Road Damage',
        civic_issue_id: 'issue-road-999'
      };

      // Mock prediction to return Related
      sandbox.stub(relationshipService, 'predictRelationship').resolves({
        relationship: 'Related',
        confidence: 0.87
      });

      const upsertStub = sandbox.stub(relationshipPersistenceService, 'upsertRelationship').resolves({});
      sandbox.stub(routingService, 'routeCivicIssue').resolves({});

      // Mock Supabase to insert a new civic issue for the water leak
      const insertStub = sandbox.stub().returnsThis();
      const selectStub = sandbox.stub().returnsThis();
      const singleStub = sandbox.stub().resolves({
        data: { id: 'issue-water-new', complaint_ids: ['comp-water-1'] }
      });
      const updateComplaintStub = sandbox.stub().returnsThis();
      const inStub = sandbox.stub().resolves({});

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'civic_issues') {
          return {
            insert: insertStub,
            select: selectStub,
            single: singleStub
          };
        }
        if (table === 'complaints') {
          return {
            update: updateComplaintStub,
            in: inStub
          };
        }
        return {};
      });

      const result = await processCivicIssueGrouping(newWaterLeak, [existingRoadDamage]);

      // Result should be the new issue for the water leak, NOT issue-road-999!
      expect(result.civicIssueId).toBe('issue-water-new');
      expect(result.civicIssueId).not.toBe('issue-road-999');

      // The connected components must separate water and road complaints
      expect(result.components).toEqual([['comp-water-1'], ['comp-road-1']]);

      // But the 'Related' edge MUST have been persisted for cross-issue operational investigation
      expect(upsertStub.calledOnce).toBe(true);
      expect(upsertStub.firstCall.args[2]).toBe('Related');
    });

    it('Repeated processing: re-processing an already assigned complaint reuses existing Civic Issue', async () => {
      const complaintReprocessed = {
        id: 'comp-dup-1',
        text: 'Deep pothole on Main St',
        category: 'Road Damage',
        civic_issue_id: 'issue-existing-555'
      };

      sandbox.stub(routingService, 'routeCivicIssue').resolves({});

      const updateStub = sandbox.stub().returnsThis();
      const eqStub = sandbox.stub().returnsThis();
      const selectStub = sandbox.stub().returnsThis();
      const singleStub = sandbox.stub().resolves({
        data: { id: 'issue-existing-555', complaint_ids: ['comp-dup-1'] }
      });
      const insertStub = sandbox.stub();

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'civic_issues') {
          return {
            update: updateStub,
            eq: eqStub,
            select: selectStub,
            single: singleStub,
            insert: insertStub
          };
        }
        if (table === 'complaints') {
          return {
            update: sandbox.stub().returnsThis(),
            in: sandbox.stub().resolves({})
          };
        }
        return {};
      });

      const result = await processCivicIssueGrouping(complaintReprocessed, []);

      // No new issue created
      expect(insertStub.called).toBe(false);
      // Existing issue updated and returned
      expect(result.civicIssueId).toBe('issue-existing-555');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Related Civic Issues Queryability
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Cross-Issue Related Links Queryability', () => {
    it('getRelatedCivicIssues finds related issues without merging tickets', async () => {
      const issueId = 'issue-water-1';

      // Mock database calls
      const fromStub = sandbox.stub(supabase, 'from');

      // Step 1: get complaints for this civic issue
      fromStub.withArgs('complaints').onFirstCall().returns({
        select: sandbox.stub().returnsThis(),
        eq: sandbox.stub().resolves({
          data: [{ id: 'comp-water-1' }],
          error: null
        })
      });

      // Step 2: get relationships for this complaint
      fromStub.withArgs('complaint_relationships').returns({
        select: sandbox.stub().returnsThis(),
        eq: sandbox.stub().resolves({
          data: [{
            id: 'rel-1',
            source_complaint_id: 'comp-water-1',
            target_complaint_id: 'comp-road-1',
            relationship_type: 'Related',
            confidence: 0.91,
            reason: 'Water leak eroded road foundation'
          }],
          error: null
        })
      });

      // Step 3: fetch other complaints
      fromStub.withArgs('complaints').onSecondCall().returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({
          data: [{ id: 'comp-road-1', civic_issue_id: 'issue-road-2' }],
          error: null
        })
      });

      // Step 4: fetch related civic issue
      fromStub.withArgs('civic_issues').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({
          data: [{
            id: 'issue-road-2',
            title: 'Road Collapse Issue',
            primary_category: 'Road Damage',
            priority: 'High',
            status: 'Open'
          }],
          error: null
        })
      });

      const relatedIssues = await getRelatedCivicIssues(issueId);

      expect(relatedIssues.length).toBe(1);
      expect(relatedIssues[0].id).toBe('issue-road-2');
      expect(relatedIssues[0].relationshipType).toBe('Related');
      expect(relatedIssues[0].evidence.length).toBe(1);
      expect(relatedIssues[0].evidence[0].reason).toContain('Water leak eroded road foundation');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Historical Data Repair (Dry-Run & Non-Destructive Apply)
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Historical Data Repair (analyzeHistoricalGroupings & applyHistoricalRepair)', () => {
    it('dry-run identifies an issue over-merged via Related edge without modifying DB', async () => {
      const fromStub = sandbox.stub(supabase, 'from');

      // Civic issue that contains 3 complaints
      fromStub.withArgs('civic_issues').returns({
        select: sandbox.stub().returnsThis(),
        neq: sandbox.stub().resolves({
          data: [{
            id: 'issue-overmerged-1',
            title: 'Water Leak and Road Damage Issue',
            complaint_ids: ['c1', 'c2', 'c3'],
            status: 'Open'
          }],
          error: null
        })
      });

      // Complaints: c1, c2 (Water), c3 (Road)
      fromStub.withArgs('complaints').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({
          data: [
            { id: 'c1', category: 'Water Supply', priority: 'High', civic_issue_id: 'issue-overmerged-1' },
            { id: 'c2', category: 'Water Supply', priority: 'Medium', civic_issue_id: 'issue-overmerged-1' },
            { id: 'c3', category: 'Road Damage', priority: 'Critical', civic_issue_id: 'issue-overmerged-1' }
          ],
          error: null
        })
      });

      // Relationships: c1-c2 (Duplicate), c2-c3 (Related)
      fromStub.withArgs('complaint_relationships').returns({
        select: sandbox.stub().resolves({
          data: [
            { source_complaint_id: 'c1', target_complaint_id: 'c2', relationship_type: 'Duplicate' },
            { source_complaint_id: 'c2', target_complaint_id: 'c3', relationship_type: 'Related' }
          ],
          error: null
        })
      });

      const report = await historicalRepairService.analyzeHistoricalGroupings({ dryRun: true });

      expect(report.mode).toBe('DRY_RUN');
      expect(report.issuesNeedingRepairCount).toBe(1);
      const repair = report.repairDetails[0];
      expect(repair.civicIssueId).toBe('issue-overmerged-1');
      expect(repair.duplicateComponentsCount).toBe(2);
      // Retained issue keeps verified duplicates [c1, c2]
      expect(repair.proposedSplit.retainedIssue.complaintIds).toEqual(['c1', 'c2']);
      // Split issue gets [c3]
      expect(repair.proposedSplit.newIssues[0].complaintIds).toEqual(['c3']);
      // Detected the 'Related' edge that caused the incorrect merge
      expect(repair.relatedEdgesFound.length).toBe(1);
      expect(repair.relatedEdgesFound[0].relationship_type).toBe('Related');
    });

    it('applyHistoricalRepair splits over-merged issue into separate issues without data loss', async () => {
      const repairDetails = [{
        civicIssueId: 'issue-overmerged-1',
        proposedSplit: {
          retainedIssue: {
            id: 'issue-overmerged-1',
            complaintIds: ['c1', 'c2']
          },
          newIssues: [{
            complaintIds: ['c3']
          }]
        }
      }];

      const fromStub = sandbox.stub(supabase, 'from');

      // Mock retained complaints query
      const retainedComplaints = [
        { id: 'c1', category: 'Water Supply', priority: 'High', location_lat: 18.52, location_lng: 73.85 },
        { id: 'c2', category: 'Water Supply', priority: 'Medium', location_lat: 18.521, location_lng: 73.851 }
      ];

      // Mock separated complaints query
      const separatedComplaints = [
        { id: 'c3', category: 'Road Damage', priority: 'Critical', location_lat: 18.53, location_lng: 73.86 }
      ];

      const selectStub = sandbox.stub();
      selectStub.onCall(0).returns({ in: sandbox.stub().resolves({ data: retainedComplaints }) });
      selectStub.onCall(1).returns({ in: sandbox.stub().resolves({ data: separatedComplaints }) });

      // Mock civic_issues updates and inserts
      const updateIssueStub = sandbox.stub().returns({ eq: sandbox.stub().resolves({ error: null }) });
      const insertIssueStub = sandbox.stub().returns({
        select: sandbox.stub().returns({
          single: sandbox.stub().resolves({ data: { id: 'issue-new-separated' }, error: null })
        })
      });

      // Mock complaints update
      const updateCompStub = sandbox.stub().returns({ in: sandbox.stub().resolves({ error: null }) });

      fromStub.callsFake((table) => {
        if (table === 'complaints') {
          return {
            select: selectStub,
            update: updateCompStub
          };
        }
        if (table === 'civic_issues') {
          return {
            update: updateIssueStub,
            insert: insertIssueStub
          };
        }
        if (table === 'tasks') {
          return {
            select: sandbox.stub().returns({
              eq: sandbox.stub().returns({
                eq: sandbox.stub().resolves({ data: [] })
              })
            })
          };
        }
        return {};
      });

      const result = await historicalRepairService.applyHistoricalRepair(repairDetails);

      expect(result.success).toBe(true);
      expect(result.repairedCount).toBe(1);
      expect(result.newIssuesCreated).toBe(1);
      expect(result.repointedComplaintsCount).toBe(1);
      // Retained issue was updated
      expect(updateIssueStub.calledOnce).toBe(true);
      // New issue was created
      expect(insertIssueStub.calledOnce).toBe(true);
      // c3 was repointed to the new issue
      expect(updateCompStub.calledOnce).toBe(true);
    });
  });

});

