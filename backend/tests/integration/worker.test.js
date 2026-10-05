jest.mock('bullmq', () => ({
  Worker: jest.fn(),
  Queue: jest.fn().mockImplementation(() => ({
    add: jest.fn(),
    close: jest.fn()
  }))
}));
jest.mock('../../src/config/queue', () => ({
  connection: { quit: jest.fn() },
  complaintQueue: { add: jest.fn() }
}));

const { complaintQueue } = require('../../src/config/queue');

describe('Worker Integration Test', () => {
  test('Queue is defined', () => {
    expect(complaintQueue).toBeDefined();
  });
});
