// tests/endToEnd.test.js
// Phase 8: End-to-End Pipeline Evaluation
// Verifies the logical progression of complaints to task execution.

const crypto = require('crypto');
const { classifyCivicIssue, mapIssueTypesToDepartments, loadRules } = require('../src/services/routingService');
const { kahnTopologicalSort } = require('../src/services/taskDependencyService');

describe('Phase 8: End-to-End Pipeline Evaluation', () => {

  it('Evaluates complete flow from Issue Classification to Execution Stages', async () => {
    // 1. Complaints grouped into a Civic Issue
    const civicIssue = {
      id: crypto.randomUUID(),
      title: 'Water Pipe Burst & Flooded Road',
      description: 'Water pipe burst causing flooding on main road and exposed wires.'
    };

    const complaints = [
      { text: 'Water pipe burst' },
      { text: 'Road flooded because of leakage' },
      { text: 'Electrical box exposed in water' }
    ];

    // 2. Issue Classification (Simulating classifier output for the multi-label prompt)
    const mockClassifiedIssueTypes = [
      { label: 'Water Leakage', confidence: 0.9 },
      { label: 'Road Damage', confidence: 0.85 },
      { label: 'Electric Pole', confidence: 0.88 }
    ];

    // 3. Department Routing
    const { departments, mappingReasons } = mapIssueTypesToDepartments(mockClassifiedIssueTypes);
    expect(departments).toContain('Water Department');
    expect(departments).toContain('Road Department');
    expect(departments).toContain('Electricity Department');
    
    // 4. Task Generation (Simulate deterministic rule application)
    const rules = loadRules();
    const tasks = [];
    const workstreams = departments.map(d => ({ id: crypto.randomUUID(), department_id: d }));
    
    mappingReasons.forEach(mapping => {
      const ws = workstreams.find(w => w.department_id === mapping.department);
      const templates = rules.taskTemplates[mapping.issueType] || [];
      templates.forEach(t => {
        tasks.push({ id: crypto.randomUUID(), department_id: mapping.department, workstream_id: ws.id, title: t.title });
      });
    });
    
    expect(workstreams.length).toBe(3);
    
    const waterTasks = tasks.filter(t => t.department_id === 'Water Department');
    const roadTasks = tasks.filter(t => t.department_id === 'Road Department');
    const elecTasks = tasks.filter(t => t.department_id === 'Electricity Department');
    
    expect(waterTasks.length).toBeGreaterThan(0);
    expect(roadTasks.length).toBeGreaterThan(0);
    expect(elecTasks.length).toBeGreaterThan(0);

    // 5. Dependency Generation (Simulated rules application)
    // Assuming predefined rules dictate Water -> Road -> Electrical for safety
    const dependencies = [];
    roadTasks.forEach(rt => {
      waterTasks.forEach(wt => {
        dependencies.push({ task_id: rt.id, depends_on_task_id: wt.id });
      });
    });
    elecTasks.forEach(et => {
      waterTasks.forEach(wt => {
        dependencies.push({ task_id: et.id, depends_on_task_id: wt.id });
      });
    });

    // 6. DAG Topological Sort
    const { buildGraph } = require('../src/services/taskDependencyService');
    const { graph, inDegree } = buildGraph(tasks, dependencies);
    const { sorted, cycle } = kahnTopologicalSort(tasks, graph, inDegree);
    expect(cycle.length).toBe(0);
    expect(sorted.length).toBe(tasks.length);

    // 7. Property-Style DAG Validation
    // For every dependency A -> B, position(A) < position(B)
    dependencies.forEach(dep => {
      const posA = sorted.indexOf(dep.depends_on_task_id);
      const posB = sorted.indexOf(dep.task_id);
      expect(posA).toBeLessThan(posB);
    });

  });
});
