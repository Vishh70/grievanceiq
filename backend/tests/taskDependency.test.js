// tests/taskDependency.test.js
// Phase 6: Task Dependencies & Topological Sort Tests

const { buildGraph, kahnTopologicalSort } = require('../src/services/taskDependencyService');

describe('Phase 6: Task Dependencies & Execution Ordering', () => {

  const runKahn = (tasks, dependencies) => {
    const { graph, inDegree } = buildGraph(tasks, dependencies);
    return kahnTopologicalSort(tasks, graph, inDegree);
  };

  const createDummyTask = (id, priority = 'Medium', created_at = '2023-01-01T00:00:00Z') => ({
    id, priority, created_at, status: 'PENDING'
  });

  it('Test 1 — Simple dependency (A -> B)', () => {
    const tasks = [createDummyTask('B'), createDummyTask('A')];
    // task_id depends on depends_on_task_id meaning A -> B
    const deps = [{ task_id: 'B', depends_on_task_id: 'A' }];
    
    const result = runKahn(tasks, deps);
    expect(result.validDag).toBe(true);
    expect(result.sorted).toEqual(['A', 'B']);
    expect(result.stages.length).toBe(2);
    expect(result.stages[0]).toEqual(['A']);
    expect(result.stages[1]).toEqual(['B']);
  });

  it('Test 2 — Chain (A -> B -> C)', () => {
    const tasks = [createDummyTask('A'), createDummyTask('C'), createDummyTask('B')];
    const deps = [
      { task_id: 'B', depends_on_task_id: 'A' },
      { task_id: 'C', depends_on_task_id: 'B' }
    ];
    
    const result = runKahn(tasks, deps);
    expect(result.sorted).toEqual(['A', 'B', 'C']);
    expect(result.stages.length).toBe(3);
  });

  it('Test 3 — Parallel tasks (A -> C, B -> C)', () => {
    const tasks = [createDummyTask('A'), createDummyTask('B'), createDummyTask('C')];
    const deps = [
      { task_id: 'C', depends_on_task_id: 'A' },
      { task_id: 'C', depends_on_task_id: 'B' }
    ];
    
    const result = runKahn(tasks, deps);
    // A and B have 0 in-degree. Tie-breaker alphabetical by ID: A, then B.
    expect(result.stages[0]).toContain('A');
    expect(result.stages[0]).toContain('B');
    expect(result.stages[1]).toEqual(['C']);
  });

  it('Test 4 — Separate independent tasks', () => {
    const tasks = [createDummyTask('A'), createDummyTask('B'), createDummyTask('C')];
    const result = runKahn(tasks, []);
    expect(result.stages.length).toBe(1);
    expect(result.stages[0].length).toBe(3);
  });

  it('Test 5 — Cycle detection (A -> B -> C -> A)', () => {
    const tasks = [createDummyTask('A'), createDummyTask('B'), createDummyTask('C')];
    const deps = [
      { task_id: 'B', depends_on_task_id: 'A' },
      { task_id: 'C', depends_on_task_id: 'B' },
      { task_id: 'A', depends_on_task_id: 'C' }
    ];
    
    const result = runKahn(tasks, deps);
    expect(result.validDag).toBe(false);
    expect(result.cycle).toContain('A');
    expect(result.cycle).toContain('B');
    expect(result.cycle).toContain('C');
  });

  it('Test 11 — Cross-department dependency (Water -> Road)', () => {
    // Conceptually just another A -> B, but verifies logic holds for arbitrary sets
    const tasks = [createDummyTask('W2_RepairPipe'), createDummyTask('R2_RestoreRoad')];
    const deps = [{ task_id: 'R2_RestoreRoad', depends_on_task_id: 'W2_RepairPipe' }];
    const result = runKahn(tasks, deps);
    expect(result.sorted).toEqual(['W2_RepairPipe', 'R2_RestoreRoad']);
  });

  it('Test 12 — Deterministic ordering (Tie breaker by priority)', () => {
    // Both independent
    const tasks = [
      createDummyTask('TaskMedium', 'Medium'),
      createDummyTask('TaskCritical', 'Critical'),
      createDummyTask('TaskHigh', 'High')
    ];
    
    const result = runKahn(tasks, []);
    // Critical > High > Medium
    expect(result.sorted).toEqual(['TaskCritical', 'TaskHigh', 'TaskMedium']);
  });

  it('Test 13 — Empty task set', () => {
    const result = runKahn([], []);
    expect(result.validDag).toBe(true);
    expect(result.sorted).toEqual([]);
    expect(result.stages).toEqual([]);
  });

});
