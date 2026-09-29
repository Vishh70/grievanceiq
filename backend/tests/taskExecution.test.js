// tests/taskExecution.test.js
const request = require('supertest');
const crypto = require('crypto');
const supabase = require('../src/config/supabase');
const createApp = require('../src/app');
const executionService = require('../src/services/taskExecutionService');
const dependencyService = require('../src/services/taskDependencyService');

const app = createApp();


const mockTasks = [
  { id: 'T1', civic_issue_id: 'issue-1', workstream_id: 'ws-1', title: 'T1 Inspect', status: 'PENDING' },
  { id: 'T2', civic_issue_id: 'issue-1', workstream_id: 'ws-1', title: 'T2 Repair', status: 'PENDING' },
  { id: 'T3', civic_issue_id: 'issue-1', workstream_id: 'ws-1', title: 'T3 Verify', status: 'PENDING' }
];

const mockDependencies = [
  { task_id: 'T2', depends_on_task_id: 'T1' },
  { task_id: 'T3', depends_on_task_id: 'T2' }
];

// Provide mocks for executionService internal calls
jest.mock('../src/services/taskDependencyService', () => ({
  getExecutionPlan: jest.fn(async () => {
    return {
      taskReadiness: {
        'T1': { ready: mockTasks[0].status === 'PENDING' },
        'T2': { ready: mockTasks[1].status === 'PENDING' && mockTasks[0].status === 'COMPLETED', blockedBy: mockTasks[0].status !== 'COMPLETED' ? ['T1'] : [] },
        'T3': { ready: mockTasks[2].status === 'PENDING' && mockTasks[1].status === 'COMPLETED', blockedBy: mockTasks[1].status !== 'COMPLETED' ? ['T2'] : [] },
      }
    };
  })
}));

jest.mock('../src/config/supabase', () => {
  return {
    from: jest.fn().mockImplementation((table) => {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        update: jest.fn((updates) => {
          if (table === 'tasks') {
            const taskId = updates.id || 'T1';
            const task = mockTasks.find(t => t.id === taskId);
            if (task) Object.assign(task, updates);
          }
          return { eq: jest.fn().mockReturnValue({ error: null }), error: null };
        }),
        single: jest.fn().mockImplementation(() => {
          if (table === 'tasks') return { data: mockTasks[0], error: null };
          if (table === 'workstreams') return { data: { status: 'PENDING' }, error: null };
          if (table === 'civic_issues') return { data: { status: 'PENDING' }, error: null };
          return { data: null, error: null };
        })
      };
    })
  };
});



describe('Phase 7: Task Execution & Progress Tracking', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Test 2 — Cannot start blocked task', async () => {
    // Override single() mock for T2
    const supabase = require('../src/config/supabase');
    supabase.from.mockImplementationOnce(() => ({
      select: () => ({
        eq: () => ({
          single: () => ({ data: mockTasks[1], error: null })
        })
      })
    }));

    await expect(
      executionService.updateTaskStatus('T2', 'IN_PROGRESS', 'test@user.com')
    ).rejects.toThrow(/Blocked by/);
  });

  it('Test 1 — Start ready task & Test 11 — Timestamp tracking', async () => {
    const supabase = require('../src/config/supabase');
    supabase.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ single: () => ({ data: mockTasks[0], error: null }) }) })
    })).mockImplementationOnce(() => ({
      update: () => ({ eq: () => ({ error: null }) })
    })).mockImplementationOnce(() => ({
      insert: () => ({ error: null })
    })).mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ data: mockTasks }) })
    })).mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ data: [{ id: 'ws-1' }] }) })
    }));

    const res = await executionService.updateTaskStatus('T1', 'IN_PROGRESS', 'test@user.com');
    expect(res.status).toBe('IN_PROGRESS');
    expect(res.started_at).toBeDefined();
  });

  it('Test 4 — Invalid transition', async () => {
    mockTasks[0].status = 'IN_PROGRESS';
    const supabase = require('../src/config/supabase');
    supabase.from.mockImplementationOnce(() => ({
      select: () => ({ eq: () => ({ single: () => ({ data: mockTasks[0], error: null }) }) })
    }));

    await expect(
      executionService.updateTaskStatus('T1', 'PENDING', 'test@user.com')
    ).rejects.toThrow(/Invalid status transition/);
  });
});
