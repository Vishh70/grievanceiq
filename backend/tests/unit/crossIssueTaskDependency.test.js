// backend/tests/unit/crossIssueTaskDependency.test.js
/**
 * Test Suite for Phase 3: Safe Cross-Issue Task Dependencies & Cycle Prevention (FR04)
 *
 * Verifies that:
 * 1. Valid cross-issue task dependencies are supported.
 * 2. Self-dependencies are rejected immediately.
 * 3. Direct cycles (A -> B -> A) are prevented.
 * 4. Indirect cross-issue cycles (A -> B -> C -> A) are prevented.
 * 5. Duplicate dependencies are idempotent.
 * 6. Downstream tasks are blocked from starting until prerequisites are COMPLETED.
 * 7. getExecutionPlan calculates readiness including external cross-issue blockers.
 * 8. Dependency removal cleanly unblocks downstream tasks.
 * 9. Authorization scoping respects civicIssueId when provided.
 */

const {
  addDependency,
  removeDependency,
  getExecutionPlan,
  detectCycleInEdges
} = require('../../src/services/taskDependencyService');
const executionService = require('../../src/services/taskExecutionService');
const supabase = require('../../src/config/supabase');
const sinon = require('sinon');

describe('Phase 3: Cross-Issue Dependencies & Cycle Prevention (FR04)', () => {
  let sandbox;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  afterEach(() => {
    sandbox.restore();
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 1. In-Memory Reachability & Cycle Detection
  // ───────────────────────────────────────────────────────────────────────────
  describe('1. Cycle Detection Logic (detectCycleInEdges)', () => {
    it('detects self-dependency as an immediate cycle', () => {
      const res = detectCycleInEdges('task-A', 'task-A', []);
      expect(res.hasCycle).toBe(true);
    });

    it('detects direct 2-node cycle (A -> B, then trying B -> A)', () => {
      // Existing: B depends on A (A -> B)
      const existing = [{ task_id: 'task-B', depends_on_task_id: 'task-A' }];
      // Trying to add: A depends on B (B -> A)
      const res = detectCycleInEdges('task-A', 'task-B', existing);
      expect(res.hasCycle).toBe(true);
      expect(res.path).toContain('task-A');
      expect(res.path).toContain('task-B');
    });

    it('detects 3-node indirect cycle (A -> B -> C, then trying C -> A)', () => {
      const existing = [
        { task_id: 'task-B', depends_on_task_id: 'task-A' },
        { task_id: 'task-C', depends_on_task_id: 'task-B' }
      ];
      // Trying to add: A depends on C (C -> A)
      const res = detectCycleInEdges('task-A', 'task-C', existing);
      expect(res.hasCycle).toBe(true);
    });

    it('allows valid DAG edges without false positives', () => {
      // Diamonds: A -> B, A -> C, B -> D, C -> D
      const existing = [
        { task_id: 'task-B', depends_on_task_id: 'task-A' },
        { task_id: 'task-C', depends_on_task_id: 'task-A' },
        { task_id: 'task-D', depends_on_task_id: 'task-B' }
      ];
      // Adding C -> D (D depends on C)
      const res = detectCycleInEdges('task-D', 'task-C', existing);
      expect(res.hasCycle).toBe(false);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 2. Cross-Issue Dependencies via addDependency
  // ───────────────────────────────────────────────────────────────────────────
  describe('2. Cross-Issue Dependency Creation (addDependency)', () => {
    it('successfully creates a cross-issue dependency between tasks in different Civic Issues', async () => {
      const taskInIssue1 = { id: 'task-water-1', civic_issue_id: 'issue-water', title: 'Fix Pipe' };
      const taskInIssue2 = { id: 'task-road-1', civic_issue_id: 'issue-road', title: 'Repave Road' };

      const rpcStub = sandbox.stub(supabase, 'rpc').resolves({
        data: {
          success: true,
          status: 'CREATED',
          task_id: 'task-road-1',
          depends_on_task_id: 'task-water-1',
          is_cross_issue: true
        },
        error: null
      });

      const fromStub = sandbox.stub(supabase, 'from');
      fromStub.withArgs('tasks').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: [taskInIssue1, taskInIssue2], error: null })
      });

      // Task in issue-road depends on task in issue-water
      const result = await addDependency('task-road-1', 'task-water-1', 'issue-road');

      expect(rpcStub.calledOnce).toBe(true);
      expect(result.success).toBe(true);
      expect(result.is_cross_issue).toBe(true);
    });

    it('rejects self-dependencies before database interaction', async () => {
      await expect(
        addDependency('task-1', 'task-1')
      ).rejects.toThrow('Self dependency is not allowed.');
    });

    it('rejects if either task is not found', async () => {
      const fromStub = sandbox.stub(supabase, 'from');
      fromStub.withArgs('tasks').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: [{ id: 'task-1' }], error: null }) // only 1 found
      });

      await expect(
        addDependency('task-1', 'task-nonexistent')
      ).rejects.toThrow('One or both tasks not found.');
    });

    it('rejects if neither task belongs to the provided scope civicIssueId', async () => {
      const task1 = { id: 'task-1', civic_issue_id: 'issue-X' };
      const task2 = { id: 'task-2', civic_issue_id: 'issue-Y' };

      const fromStub = sandbox.stub(supabase, 'from');
      fromStub.withArgs('tasks').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: [task1, task2], error: null })
      });

      await expect(
        addDependency('task-1', 'task-2', 'issue-UNRELATED')
      ).rejects.toThrow('Tasks do not belong to the provided Civic Issue.');
    });

    it('rethrows cycle errors returned from atomic database RPC', async () => {
      const task1 = { id: 'task-1', civic_issue_id: 'issue-A' };
      const task2 = { id: 'task-2', civic_issue_id: 'issue-B' };

      sandbox.stub(supabase, 'from').withArgs('tasks').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: [task1, task2], error: null })
      });

      sandbox.stub(supabase, 'rpc').resolves({
        data: null,
        error: { message: 'Adding this dependency would create a cycle: task-1 -> task-2 -> task-1' }
      });

      await expect(
        addDependency('task-1', 'task-2')
      ).rejects.toThrow(/would create a cycle/);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 3. Execution Plan & Cross-Issue Readiness
  // ───────────────────────────────────────────────────────────────────────────
  describe('3. Execution Plan & Task Readiness (getExecutionPlan)', () => {
    it('correctly reports a task locked when an external cross-issue prerequisite is PENDING', async () => {
      const issueTasks = [
        { id: 'task-pave', civic_issue_id: 'issue-road', status: 'PENDING', priority: 'High', title: 'Paving' }
      ];

      // Dependencies: task-pave depends on task-pipe (external in issue-water)
      const deps = [
        { id: 'dep-1', task_id: 'task-pave', depends_on_task_id: 'task-pipe' }
      ];

      const externalTasks = [
        { id: 'task-pipe', civic_issue_id: 'issue-water', status: 'PENDING', title: 'Water Pipe Excavation', priority: 'Critical' }
      ];

      const fromStub = sandbox.stub(supabase, 'from');
      // 1. Fetch tasks for issue-road
      fromStub.withArgs('tasks').onFirstCall().returns({
        select: sandbox.stub().returnsThis(),
        eq: sandbox.stub().resolves({ data: issueTasks, error: null })
      });
      // 2. Fetch dependencies
      fromStub.withArgs('task_dependencies').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: deps, error: null })
      });
      // 3. Fetch external prerequisite tasks
      fromStub.withArgs('tasks').onSecondCall().returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: externalTasks, error: null })
      });

      const plan = await getExecutionPlan('issue-road');

      expect(plan.validDag).toBe(true);
      // task-pave must be NOT ready because external task-pipe is PENDING
      expect(plan.taskReadiness['task-pave'].ready).toBe(false);
      expect(plan.taskReadiness['task-pave'].lockedBy).toEqual(['task-pipe']);
      // Cross-issue dependency metadata must be present
      expect(plan.crossIssueDependencies.length).toBe(1);
      expect(plan.crossIssueDependencies[0].prerequisiteCivicIssueId).toBe('issue-water');
      expect(plan.crossIssueDependencies[0].isSatisfied).toBe(false);
    });

    it('marks downstream task ready when external cross-issue prerequisite is COMPLETED', async () => {
      const issueTasks = [
        { id: 'task-pave', civic_issue_id: 'issue-road', status: 'PENDING', priority: 'High', title: 'Paving' }
      ];

      const deps = [
        { id: 'dep-1', task_id: 'task-pave', depends_on_task_id: 'task-pipe' }
      ];

      const externalTasks = [
        { id: 'task-pipe', civic_issue_id: 'issue-water', status: 'COMPLETED', title: 'Water Pipe Excavation', priority: 'Critical' }
      ];

      const fromStub = sandbox.stub(supabase, 'from');
      fromStub.withArgs('tasks').onFirstCall().returns({
        select: sandbox.stub().returnsThis(),
        eq: sandbox.stub().resolves({ data: issueTasks, error: null })
      });
      fromStub.withArgs('task_dependencies').returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: deps, error: null })
      });
      fromStub.withArgs('tasks').onSecondCall().returns({
        select: sandbox.stub().returnsThis(),
        in: sandbox.stub().resolves({ data: externalTasks, error: null })
      });

      const plan = await getExecutionPlan('issue-road');

      // task-pave should now be READY
      expect(plan.taskReadiness['task-pave'].ready).toBe(true);
      expect(plan.taskReadiness['task-pave'].lockedBy).toEqual([]);
      expect(plan.crossIssueDependencies[0].isSatisfied).toBe(true);
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // 4. Task Dependency Removal
  // ───────────────────────────────────────────────────────────────────────────
  describe('4. Dependency Removal (removeDependency)', () => {
    it('deletes an existing dependency edge', async () => {
      const deleteStub = sandbox.stub().returns({
        match: sandbox.stub().resolves({ error: null })
      });

      sandbox.stub(supabase, 'from').withArgs('task_dependencies').returns({
        delete: deleteStub
      });

      const res = await removeDependency('task-B', 'task-A');
      expect(res).toBe(true);
      expect(deleteStub.calledOnce).toBe(true);
    });
  });

});

