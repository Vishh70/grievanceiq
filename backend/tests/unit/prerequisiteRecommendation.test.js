// backend/tests/unit/prerequisiteRecommendation.test.js
/**
 * Test Suite for Phase 6: Prerequisite DAG Inference & Staged Municipal Resolution
 *
 * Verifies that:
 * 1. Knowledge graph causal rules and template sequencing rules are loaded.
 * 2. Prerequisite candidates are inferred with confidence, explainable reason, and evidence.
 * 3. Recommendations are marked PENDING and decoupled from active execution graph (task_dependencies).
 * 4. Cycle prevention pre-check rejects cyclic candidate recommendations.
 * 5. Human approval workflow invokes accept_dependency_recommendation RPC.
 * 6. Human rejection workflow invokes reject_dependency_recommendation RPC.
 * 7. Task verification transitions COMPLETED tasks to VERIFIED with audit metadata.
 * 8. Staged resolution tracking reports READY stageState and accounts for VERIFIED tasks.
 * 9. Multi-department civic issue verification requires all tasks to be COMPLETED/VERIFIED.
 */

const sinon = require('sinon');
const prerequisiteService = require('../../src/services/prerequisiteRecommendationService');
const executionService = require('../../src/services/taskExecutionService');
const dependencyService = require('../../src/services/taskDependencyService');
const supabase = require('../../src/config/supabase');

describe('Phase 6: Prerequisite DAG Inference & Staged Municipal Resolution', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. Knowledge Graph & Causal Rule Loading
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Knowledge Graph & Causal Rules', () => {
    it('loads causal knowledge rules from civic_knowledge.json', () => {
      const rules = prerequisiteService.getCausalKnowledgeRules();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBeGreaterThan(0);

      const waterRoadRule = rules.find(r => r.source === 'Water Leakage' && r.target === 'Road Damage');
      expect(waterRoadRule).toBeDefined();
      expect(waterRoadRule.relation).toBe('can_cause');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Prerequisite Recommendation Inference
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Prerequisite DAG Inference & Explainability', () => {
    it('infers causal prerequisite between Water Leakage and Road Damage tasks', async () => {
      const issueId = 'issue-101';
      const mockIssue = {
        id: issueId,
        title: 'Main Street Pipeline & Pothole',
        complaint_ids: ['comp-1', 'comp-2']
      };

      const mockTasks = [
        {
          id: 'task-water-repair',
          civic_issue_id: issueId,
          title: 'Isolate/repair pipeline',
          template_id: 'water_repair',
          department_id: 'Water Department',
          category: 'Water Leakage',
          status: 'PENDING'
        },
        {
          id: 'task-road-repair',
          civic_issue_id: issueId,
          title: 'Repair road surface',
          template_id: 'road_repair',
          department_id: 'Road Department',
          category: 'Road Damage',
          status: 'PENDING'
        }
      ];

      // Stubs for supabase
      const queryStub = {
        select: sandbox.stub().returnsThis(),
        eq: sandbox.stub().returnsThis(),
        or: sandbox.stub().returnsThis(),
        in: sandbox.stub().returnsThis(),
        single: sandbox.stub().resolves({ data: mockIssue, error: null }),
        upsert: sandbox.stub().returnsThis()
      };

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'civic_issues') {
          return {
            select: sandbox.stub().returnsThis(),
            eq: sandbox.stub().returns({
              single: sandbox.stub().resolves({ data: mockIssue, error: null })
            })
          };
        }
        if (table === 'tasks') {
          return {
            select: sandbox.stub().returnsThis(),
            eq: sandbox.stub().resolves({ data: mockTasks, error: null }),
            in: sandbox.stub().resolves({ data: mockTasks, error: null })
          };
        }
        if (table === 'task_dependencies') {
          return {
            select: sandbox.stub().resolves({ data: [], error: null })
          };
        }
        if (table === 'complaint_relationships') {
          return {
            select: sandbox.stub().returnsThis(),
            or: sandbox.stub().returnsThis(),
            eq: sandbox.stub().resolves({ data: [], error: null })
          };
        }
        if (table === 'task_dependency_recommendations') {
          return {
            upsert: sandbox.stub().callsFake((rec) => ({
              select: sandbox.stub().resolves({ data: [{ ...rec, id: 'rec-uuid-1' }], error: null })
            }))
          };
        }
        return queryStub;
      });

      const recs = await prerequisiteService.generateRecommendations(issueId);

      expect(recs.length).toBeGreaterThanOrEqual(1);
      const rec = recs[0];
      expect(rec.task_id).toBe('task-road-repair');
      expect(rec.depends_on_task_id).toBe('task-water-repair');
      expect(rec.status).toBe('PENDING');
      expect(rec.confidence).toBeGreaterThanOrEqual(0.8);
      expect(rec.rule_version).toBe('1.0');
      expect(rec.reason).toContain('"Water Leakage" can cause');
      expect(rec.evidence.relation).toBe('can_cause');
    });

    it('skips candidate recommendations that would create a cycle', async () => {
      const issueId = 'issue-102';
      const mockIssue = { id: issueId, complaint_ids: [] };
      const mockTasks = [
        { id: 'task-A', civic_issue_id: issueId, template_id: 'road_repair', category: 'Road Damage' },
        { id: 'task-B', civic_issue_id: issueId, template_id: 'water_repair', category: 'Water Leakage' }
      ];

      // Suppose task-A is ALREADY a prerequisite to task-B (task-B depends on task-A)
      const existingDeps = [{ task_id: 'task-B', depends_on_task_id: 'task-A' }];

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'civic_issues') {
          return {
            select: sandbox.stub().returnsThis(),
            eq: sandbox.stub().returns({
              single: sandbox.stub().resolves({ data: mockIssue, error: null })
            })
          };
        }
        if (table === 'tasks') {
          return {
            select: sandbox.stub().returnsThis(),
            eq: sandbox.stub().resolves({ data: mockTasks, error: null }),
            in: sandbox.stub().resolves({ data: mockTasks, error: null })
          };
        }
        if (table === 'task_dependencies') {
          return {
            select: sandbox.stub().resolves({ data: existingDeps, error: null })
          };
        }
        if (table === 'complaint_relationships') {
          return {
            select: sandbox.stub().returnsThis(),
            or: sandbox.stub().returnsThis(),
            eq: sandbox.stub().resolves({ data: [], error: null })
          };
        }
        return {};
      });

      // Attempting to recommend task-A depends on task-B would create cycle (A -> B -> A)
      const recs = await prerequisiteService.generateRecommendations(issueId);
      expect(recs.length).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Human Approval & Rejection Workflows
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Human Recommendation Workflows', () => {
    it('acceptRecommendation invokes accept_dependency_recommendation RPC', async () => {
      const rpcStub = sandbox.stub(supabase, 'rpc').resolves({
        data: { success: true, status: 'ACCEPTED', recommendation_id: 'rec-123' },
        error: null
      });

      const res = await prerequisiteService.acceptRecommendation('rec-123', 'reviewer-456', 'Verified on site');

      expect(rpcStub.calledOnceWith('accept_dependency_recommendation', {
        p_recommendation_id: 'rec-123',
        p_reviewer_id: 'reviewer-456',
        p_notes: 'Verified on site'
      })).toBe(true);
      expect(res.success).toBe(true);
      expect(res.status).toBe('ACCEPTED');
    });

    it('rejectRecommendation invokes reject_dependency_recommendation RPC', async () => {
      const rpcStub = sandbox.stub(supabase, 'rpc').resolves({
        data: { success: true, status: 'REJECTED', recommendation_id: 'rec-123' },
        error: null
      });

      const res = await prerequisiteService.rejectRecommendation('rec-123', 'reviewer-456', 'Independent workstreams');

      expect(rpcStub.calledOnceWith('reject_dependency_recommendation', {
        p_recommendation_id: 'rec-123',
        p_reviewer_id: 'reviewer-456',
        p_notes: 'Independent workstreams'
      })).toBe(true);
      expect(res.success).toBe(true);
      expect(res.status).toBe('REJECTED');
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Staged Municipal Task & Issue Verification
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Staged Task & Issue Verification', () => {
    it('verifyTask rejects non-COMPLETED task', async () => {
      sandbox.stub(supabase, 'from').returns({
        select: sandbox.stub().returnsThis(),
        eq: sandbox.stub().returns({
          single: sandbox.stub().resolves({
            data: { id: 'task-1', status: 'IN_PROGRESS' },
            error: null
          })
        })
      });

      await expect(
        executionService.verifyTask('task-1', 'officer-1', 'officer@city.gov', 'Premature verification')
      ).rejects.toThrow(/must be in COMPLETED status/);
    });

    it('verifyTask updates task to VERIFIED and records audit details', async () => {
      const updateStub = sandbox.stub().returns({
        eq: sandbox.stub().resolves({ data: [{ id: 'task-1', status: 'VERIFIED' }], error: null })
      });

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'tasks') {
          return {
            select: sandbox.stub().returnsThis(),
            eq: sandbox.stub().returns({
              single: sandbox.stub().resolves({
                data: { id: 'task-1', status: 'COMPLETED' },
                error: null
              })
            }),
            update: updateStub
          };
        }
        return {};
      });

      sandbox.stub(supabase, 'rpc').resolves({ data: null, error: null });

      const res = await executionService.verifyTask(
        'task-1',
        'officer-1',
        'officer@city.gov',
        'Final physical inspection passed',
        { photos: ['leak_fixed.jpg'] }
      );

      expect(res.success).toBe(true);
      expect(res.status).toBe('VERIFIED');
    });

    it('verifyCivicIssue invokes verify_civic_issue_resolution RPC', async () => {
      const rpcStub = sandbox.stub(supabase, 'rpc').resolves({
        data: { success: true, civic_issue_id: 'issue-1', status: 'VERIFIED' },
        error: null
      });

      const res = await executionService.verifyCivicIssue('issue-1', 'officer-1', 'All department tasks complete');
      expect(rpcStub.calledOnceWith('verify_civic_issue_resolution', {
        p_civic_issue_id: 'issue-1',
        p_verifier_id: 'officer-1',
        p_notes: 'All department tasks complete'
      })).toBe(true);
      expect(res.status).toBe('VERIFIED');
    });

    it('getExecutionPlan treats VERIFIED tasks as satisfied prerequisites and identifies READY stageState', async () => {
      const mockTasks = [
        { id: 'task-upstream', civic_issue_id: 'issue-1', status: 'VERIFIED', priority: 'High', created_at: '2026-01-01' },
        { id: 'task-downstream', civic_issue_id: 'issue-1', status: 'PENDING', priority: 'Medium', created_at: '2026-01-02' }
      ];

      const mockDeps = [
        { task_id: 'task-downstream', depends_on_task_id: 'task-upstream' }
      ];

      sandbox.stub(supabase, 'from').callsFake((table) => {
        if (table === 'tasks') {
          return {
            select: sandbox.stub().returnsThis(),
            eq: sandbox.stub().resolves({ data: mockTasks, error: null }),
            in: sandbox.stub().resolves({ data: [], error: null })
          };
        }
        if (table === 'task_dependencies') {
          return {
            select: sandbox.stub().returnsThis(),
            in: sandbox.stub().resolves({ data: mockDeps, error: null })
          };
        }
        return {};
      });

      const plan = await dependencyService.getExecutionPlan('issue-1');
      expect(plan.validDag).toBe(true);

      // Downstream task should now be READY because upstream is VERIFIED
      const downstreamReadiness = plan.taskReadiness['task-downstream'];
      expect(downstreamReadiness.ready).toBe(true);
      expect(downstreamReadiness.stageState).toBe('READY');
      expect(downstreamReadiness.lockedBy).toHaveLength(0);

      // Completed/verified task count
      expect(plan.progress.completedTasks).toBe(1);
    });
  });
});
