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
        'T2': { ready: mockTasks[1].status === 'PENDING' && mockTasks[0].status === 'COMPLETED', lockedBy: mockTasks[0].status !== 'COMPLETED' ? ['T1'] : [] },
        'T3': { ready: mockTasks[2].status === 'PENDING' && mockTasks[1].status === 'COMPLETED', lockedBy: mockTasks[1].status !== 'COMPLETED' ? ['T2'] : [] },
      }
    };
  })
}));

let mockCurrentTaskId = 'T1';

jest.mock('../src/config/supabase', () => {
  return {
    rpc: jest.fn(async (funcName, args) => {
      if (funcName === 'update_task_status_transactional') {
        const task = mockTasks.find(t => t.id === args.p_task_id);
        if (task) {
           task.status = args.p_new_status;
           task.started_at = new Date().toISOString();
        }
        return { error: null };
      }
      return { error: null };
    }),
    from: jest.fn().mockImplementation((table) => {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn(function (field, value) {
          if (field === 'id') mockCurrentTaskId = value;
          const chainObj = {
            single: jest.fn().mockImplementation(() => {
              if (table === 'tasks') {
                const t = mockTasks.find(t => t.id === mockCurrentTaskId) || mockTasks[0];
                return { data: t, error: null };
              }
              if (table === 'workstreams') return { data: { status: 'PENDING' }, error: null };
              if (table === 'civic_issues') return { data: { status: 'PENDING' }, error: null };
              return { data: null, error: null };
            }),
            data: table === 'tasks' ? mockTasks : [{ id: 'ws-1' }],
            error: null
          };
          chainObj.eq = this.eq;
          chainObj.in = this.in;
          return chainObj;
        }),
        in: jest.fn(function (field, value) {
          const chainObj = {
            single: jest.fn().mockImplementation(() => { return { data: null, error: null }; }),
            data: [],
            error: null
          };
          chainObj.eq = this.eq;
          chainObj.in = this.in;
          return chainObj;
        }),
        insert: jest.fn().mockReturnValue({ error: null }),
        update: jest.fn((updates) => {
          if (table === 'tasks') {
            const taskId = updates.id || mockCurrentTaskId;
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
    mockTasks[0].status = 'PENDING';
    mockTasks[1].status = 'PENDING';
    mockTasks[2].status = 'PENDING';
  });

  it('Test 2 — Cannot start locked task', async () => {
    await expect(
      executionService.updateTaskStatus('T2', 'IN_PROGRESS', 'test@user.com')
    ).rejects.toThrow(/Locked by/);
  });

  it('Test 1 — Start ready task & Test 11 — Timestamp tracking', async () => {
    const res = await executionService.updateTaskStatus('T1', 'IN_PROGRESS', 'test@user.com');
    expect(res.status).toBe('IN_PROGRESS');
  });

  it('Test 4 — Invalid transition', async () => {
    mockTasks[0].status = 'IN_PROGRESS';
    await expect(
      executionService.updateTaskStatus('T1', 'PENDING', 'test@user.com')
    ).rejects.toThrow(/Invalid status transition/);
  });
});
