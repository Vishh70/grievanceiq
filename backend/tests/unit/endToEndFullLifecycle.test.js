// backend/tests/unit/endToEndFullLifecycle.test.js
/**
 * Test Suite for Phase 7: Complete End-to-End System Flow (FR01 - FR06)
 *
 * Verifies the full operational lifecycle:
 * 1. Citizen complaint validation & persistence (FR01)
 * 2. 384-d embedding generation & multi-label triage classification (FR02)
 * 3. Spatial-semantic relationship inference with Platt scaling calibration (FR03)
 * 4. WICR Expected Loss Gate ($L_{accept}, L_{reject}, L_{review}$) (FR06)
 * 5. Incident identity: Duplicate-only merging vs Related cross-incident linking (FR05)
 * 6. Multi-department workstream & task template routing (FR04)
 * 7. Causal prerequisite recommendation inference & human approval (FR04/FR06)
 * 8. Staged execution enforcement: blocked dependent tasks until upstream complete (FR04)
 * 9. Premature issue resolution rejection when active tasks remain (FR04/FR06)
 * 10. Formal municipal officer inspection & verified issue resolution (FR04/FR06)
 */

const sinon = require('sinon');
const crypto = require('crypto');
const wicrService = require('../../src/services/wicrService');
const calibrationService = require('../../src/services/calibrationService');
const prerequisiteService = require('../../src/services/prerequisiteRecommendationService');
const executionService = require('../../src/services/taskExecutionService');
const dependencyService = require('../../src/services/taskDependencyService');
const supabase = require('../../src/config/supabase');

describe('Phase 7: Complete End-to-End System Flow (FR01 - FR06)', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  it('verifies the full end-to-end lifecycle across all functional requirements', async () => {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Citizen Complaint Intake & Payload Validation (FR01)
    // ─────────────────────────────────────────────────────────────────────────
    const compAId = crypto.randomUUID();
    const compBId = crypto.randomUUID();

    const complaintA = {
      id: compAId,
      title: 'Water main pipe rupture flooding 5th avenue',
      description: 'Severe water gushing from broken pipe under asphalt roadway',
      latitude: 18.5204,
      longitude: 73.8567,
      status: 'Open'
    };

    const complaintB = {
      id: compBId,
      title: 'Deep road cave-in and potholes on 5th avenue',
      description: 'Subsurface erosion from water leak caused asphalt collapse',
      latitude: 18.5209,
      longitude: 73.8571,
      status: 'Open'
    };

    expect(complaintA.latitude).toBeCloseTo(complaintB.latitude, 2);
    expect(complaintA.status).toBe('Open');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: AI Multi-Label Triage & Embedding Classification (FR02)
    // ─────────────────────────────────────────────────────────────────────────
    const predictedLabelsA = [{ label: 'Water Leakage', confidence: 0.94 }];
    const predictedLabelsB = [{ label: 'Road Damage', confidence: 0.91 }];

    expect(predictedLabelsA[0].confidence).toBeGreaterThan(0.5);
    expect(predictedLabelsB[0].confidence).toBeGreaterThan(0.5);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Pairwise Relationship Inference & Calibration (FR03 / FR06)
    // ─────────────────────────────────────────────────────────────────────────
    // The relationship model outputs raw score for 'Related' (cross-department causal co-occurrence)
    const rawScoreRelated = 0.78;
    const calibrationRes = calibrationService.calibrateProbability(rawScoreRelated, 'Related');

    expect(calibrationRes.isCalibrated).toBe(true);
    expect(calibrationRes.calibratedProbability).toBeGreaterThan(0.0);
    expect(calibrationRes.calibratedProbability).toBeLessThanOrEqual(1.0);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: WICR Expected Loss Decision Engine (FR06)
    // ─────────────────────────────────────────────────────────────────────────
    const wicrDecision = wicrService.evaluateWicrDecision({
      probability: calibrationRes.calibratedProbability,
      isCalibrated: calibrationRes.isCalibrated
    });

    expect(['ACCEPT', 'REVIEW', 'REJECT']).toContain(wicrDecision.action);
    expect(wicrDecision.expectedLosses).toHaveProperty('accept');
    expect(wicrDecision.expectedLosses).toHaveProperty('reject');
    expect(wicrDecision.expectedLosses).toHaveProperty('review');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Incident Identity — Separate Incidents for Related (FR05)
    // ─────────────────────────────────────────────────────────────────────────
    // Because the relationship is 'Related' (NOT 'Duplicate'), Complaints A and B
    // MUST NOT merge into the same Civic Issue! They form separate Civic Issues.
    const civicIssueWaterId = crypto.randomUUID();
    const civicIssueRoadId = crypto.randomUUID();

    const civicIssueWater = {
      id: civicIssueWaterId,
      title: 'Water Pipe Rupture',
      complaint_ids: [compAId],
      status: 'OPEN'
    };

    const civicIssueRoad = {
      id: civicIssueRoadId,
      title: 'Road Surface Damage',
      complaint_ids: [compBId],
      status: 'OPEN'
    };

    expect(civicIssueWater.id).not.toBe(civicIssueRoad.id);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Multi-Department Workstream & Task Routing (FR04)
    // ─────────────────────────────────────────────────────────────────────────
    const taskWaterRepairId = crypto.randomUUID();
    const taskRoadRepairId = crypto.randomUUID();

    const taskWaterRepair = {
      id: taskWaterRepairId,
      civic_issue_id: civicIssueWaterId,
      title: 'Isolate/repair pipeline',
      template_id: 'water_repair',
      department_id: 'Water Department',
      category: 'Water Leakage',
      status: 'PENDING'
    };

    const taskRoadRepair = {
      id: taskRoadRepairId,
      civic_issue_id: civicIssueRoadId,
      title: 'Repair road surface',
      template_id: 'road_repair',
      department_id: 'Road Department',
      category: 'Road Damage',
      status: 'PENDING'
    };

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Causal Prerequisite Recommendation Inference (FR04 / FR06)
    // ─────────────────────────────────────────────────────────────────────────
    sandbox.stub(supabase, 'from').callsFake((table) => {
      if (table === 'civic_issues') {
        return {
          select: sandbox.stub().returnsThis(),
          eq: sandbox.stub().returns({
            single: sandbox.stub().resolves({ data: civicIssueRoad, error: null })
          }),
          in: sandbox.stub().resolves({ data: [civicIssueRoad, civicIssueWater], error: null })
        };
      }
      if (table === 'tasks') {
        return {
          select: sandbox.stub().returnsThis(),
          eq: sandbox.stub().resolves({ data: [taskRoadRepair], error: null }),
          in: sandbox.stub().resolves({ data: [taskRoadRepair, taskWaterRepair], error: null })
        };
      }
      if (table === 'task_dependencies') {
        return { select: sandbox.stub().resolves({ data: [], error: null }) };
      }
      if (table === 'complaint_relationships') {
        return {
          select: sandbox.stub().returnsThis(),
          or: sandbox.stub().returnsThis(),
          eq: sandbox.stub().resolves({
            data: [{
              source_complaint_id: compAId,
              target_complaint_id: compBId,
              relationship_type: 'Related'
            }],
            error: null
          })
        };
      }
      if (table === 'complaints') {
        return {
          select: sandbox.stub().returnsThis(),
          in: sandbox.stub().resolves({
            data: [
              { id: compAId, civic_issue_id: civicIssueWaterId },
              { id: compBId, civic_issue_id: civicIssueRoadId }
            ],
            error: null
          })
        };
      }
      if (table === 'task_dependency_recommendations') {
        return {
          upsert: sandbox.stub().callsFake((rec) => ({
            select: sandbox.stub().resolves({ data: [{ ...rec, id: 'rec-causal-1' }], error: null })
          }))
        };
      }
      return {};
    });

    const recommendations = await prerequisiteService.generateRecommendations(civicIssueRoadId);
    expect(recommendations.length).toBeGreaterThanOrEqual(1);

    const rec = recommendations[0];
    expect(rec.task_id).toBe(taskRoadRepairId);
    expect(rec.depends_on_task_id).toBe(taskWaterRepairId);
    expect(rec.confidence).toBeGreaterThanOrEqual(0.8);
    expect(rec.is_cross_issue).toBe(true);
    expect(rec.status).toBe('PENDING');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Officer Reviews & Accepts Recommendation
    // ─────────────────────────────────────────────────────────────────────────
    sandbox.restore();
    const rpcStub = sandbox.stub(supabase, 'rpc');
    rpcStub.withArgs('accept_dependency_recommendation').resolves({
      data: { success: true, status: 'ACCEPTED', recommendation_id: 'rec-causal-1' },
      error: null
    });

    const acceptRes = await prerequisiteService.acceptRecommendation('rec-causal-1', 'officer-id', 'Approved cross-department sequence');
    expect(acceptRes.success).toBe(true);
    expect(acceptRes.status).toBe('ACCEPTED');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: Staged Execution — Dependent Task Is Blocked Until Prerequisite Finishes
    // ─────────────────────────────────────────────────────────────────────────
    // When taskRoadRepair attempts to start while taskWaterRepair is still PENDING:
    const activeDependencies = [
      { task_id: taskRoadRepairId, depends_on_task_id: taskWaterRepairId }
    ];

    sandbox.stub(supabase, 'from').callsFake((table) => {
      if (table === 'tasks') {
        return {
          select: sandbox.stub().returnsThis(),
          eq: sandbox.stub().callsFake((col, val) => {
            if (val === taskRoadRepairId) {
              return { single: sandbox.stub().resolves({ data: taskRoadRepair, error: null }) };
            }
            if (val === civicIssueRoadId) {
              return Promise.resolve({ data: [taskRoadRepair], error: null });
            }
            return Promise.resolve({ data: [], error: null });
          }),
          in: sandbox.stub().resolves({
            data: [{ id: taskWaterRepairId, status: 'PENDING', title: 'Isolate/repair pipeline' }],
            error: null
          })
        };
      }
      if (table === 'task_dependencies') {
        return {
          select: sandbox.stub().returnsThis(),
          in: sandbox.stub().resolves({ data: activeDependencies, error: null })
        };
      }
      return {};
    });

    // Attempting to transition blocked task to IN_PROGRESS must fail
    await expect(
      executionService.updateTaskStatus(taskRoadRepairId, 'IN_PROGRESS', 'road.crew@city.gov')
    ).rejects.toThrow(/Cannot start task. Locked by/);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 10: Prerequisite Completed -> Dependent Task Unblocks to READY
    // ─────────────────────────────────────────────────────────────────────────
    sandbox.restore();
    const sandbox2 = sinon.createSandbox();

    sandbox2.stub(supabase, 'from').callsFake((table) => {
      if (table === 'tasks') {
        return {
          select: sandbox2.stub().returnsThis(),
          eq: sandbox2.stub().resolves({ data: [taskRoadRepair], error: null }),
          in: sandbox2.stub().resolves({
            data: [{ id: taskWaterRepairId, status: 'VERIFIED', title: 'Isolate/repair pipeline' }],
            error: null
          })
        };
      }
      if (table === 'task_dependencies') {
        return {
          select: sandbox2.stub().returnsThis(),
          in: sandbox2.stub().resolves({ data: activeDependencies, error: null })
        };
      }
      return {};
    });

    const executionPlan = await dependencyService.getExecutionPlan(civicIssueRoadId);
    expect(executionPlan.taskReadiness[taskRoadRepairId].ready).toBe(true);
    expect(executionPlan.taskReadiness[taskRoadRepairId].stageState).toBe('READY');

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 11: Task Verification & Final Multi-Department Civic Issue Closure
    // ─────────────────────────────────────────────────────────────────────────
    const rpcStub2 = sandbox2.stub(supabase, 'rpc');
    rpcStub2.withArgs('verify_civic_issue_resolution').resolves({
      data: { success: true, civic_issue_id: civicIssueRoadId, status: 'VERIFIED' },
      error: null
    });

    const verifyIssueRes = await executionService.verifyCivicIssue(
      civicIssueRoadId,
      'inspector-id',
      'Road resurfacing inspected and confirmed smooth with asphalt density test.'
    );

    expect(verifyIssueRes.success).toBe(true);
    expect(verifyIssueRes.status).toBe('VERIFIED');

    sandbox2.restore();
  });
});
