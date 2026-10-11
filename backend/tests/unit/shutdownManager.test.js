// tests/unit/shutdownManager.test.js
// Unit tests for coordinated graceful shutdown manager with strict execution ordering

const {
  executeGracefulShutdown,
  resetShutdownState,
  isShuttingDown
} = require('../../src/services/shutdownManager');

describe('Coordinated Graceful Shutdown Manager', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetShutdownState();
  });

  afterEach(() => {
    resetShutdownState();
    jest.useRealTimers();
  });

  test('Enforces strict shutdown order: Server -> Worker -> ML Supervisor -> Redis/Queues -> Exit', async () => {
    const callOrder = [];

    const mockServer = {
      close: jest.fn((cb) => {
        callOrder.push('server.close');
        cb();
      })
    };

    const mockWorker = {
      close: jest.fn(async () => {
        callOrder.push('worker.close');
      })
    };

    const mockSupervisor = {
      stop: jest.fn(async () => {
        callOrder.push('supervisor.stop');
      })
    };

    const mockQueueConfig = {
      complaintQueue: {
        close: jest.fn(async () => {
          callOrder.push('complaintQueue.close');
        })
      },
      connection: {
        quit: jest.fn(async () => {
          callOrder.push('redis.quit');
          return 'OK';
        })
      }
    };

    const mockExit = jest.fn();
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const shutdownPromise = executeGracefulShutdown({
      signal: 'SIGTERM',
      server: mockServer,
      worker: mockWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      timeoutMs: 10000,
      exitFn: mockExit,
      logger: mockLogger
    });

    await shutdownPromise;

    // Verify exact call counts
    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockWorker.close).toHaveBeenCalledTimes(1);
    expect(mockSupervisor.stop).toHaveBeenCalledTimes(1);
    expect(mockQueueConfig.complaintQueue.close).toHaveBeenCalledTimes(1);
    expect(mockQueueConfig.connection.quit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(0);

    // Verify strict sequential lifecycle ordering
    expect(callOrder).toEqual([
      'server.close',
      'worker.close',
      'supervisor.stop',
      'complaintQueue.close',
      'redis.quit'
    ]);

    // Explicit ordering assertions: Worker finishes BEFORE Redis or Queues disconnect
    expect(callOrder.indexOf('server.close')).toBeLessThan(callOrder.indexOf('worker.close'));
    expect(callOrder.indexOf('worker.close')).toBeLessThan(callOrder.indexOf('supervisor.stop'));
    expect(callOrder.indexOf('supervisor.stop')).toBeLessThan(callOrder.indexOf('complaintQueue.close'));
    expect(callOrder.indexOf('worker.close')).toBeLessThan(callOrder.indexOf('redis.quit'));
    expect(callOrder.indexOf('supervisor.stop')).toBeLessThan(callOrder.indexOf('redis.quit'));
  });

  test('Shutdown is idempotent: repeated signals do not duplicate cleanup', async () => {
    let serverCloseCallback;
    const mockServer = {
      close: jest.fn((cb) => {
        serverCloseCallback = cb;
      })
    };
    const mockWorker = {
      close: jest.fn().mockResolvedValue()
    };
    const mockSupervisor = {
      stop: jest.fn().mockResolvedValue()
    };
    const mockQueueConfig = {
      connection: {
        quit: jest.fn().mockResolvedValue('OK')
      }
    };
    const mockExit = jest.fn();
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    // First signal
    const p1 = executeGracefulShutdown({
      signal: 'SIGTERM',
      server: mockServer,
      worker: mockWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      exitFn: mockExit,
      logger: mockLogger
    });

    // Second signal arriving while first is still pending
    const p2 = executeGracefulShutdown({
      signal: 'SIGINT',
      server: mockServer,
      worker: mockWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      exitFn: mockExit,
      logger: mockLogger
    });

    expect(mockServer.close).toHaveBeenCalledTimes(1);
    expect(mockLogger.log).toHaveBeenCalledWith(expect.stringMatching(/Shutdown already in progress/));

    // Resolve server close
    serverCloseCallback();
    await p1;
    await p2;

    expect(mockWorker.close).toHaveBeenCalledTimes(1);
    expect(mockSupervisor.stop).toHaveBeenCalledTimes(1);
    expect(mockQueueConfig.connection.quit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledTimes(1);
  });

  test('Successful worker close clears its timeout and prevents late timer execution', async () => {
    const mockServer = { close: jest.fn((cb) => cb()) };
    const mockWorker = {
      close: jest.fn().mockResolvedValue()
    };
    const mockSupervisor = { stop: jest.fn().mockResolvedValue({ status: 'stopped', terminated: true }) };
    const mockQueueConfig = { connection: { quit: jest.fn().mockResolvedValue('OK') } };
    const mockExit = jest.fn();
    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const shutdownPromise = executeGracefulShutdown({
      signal: 'SIGTERM',
      server: mockServer,
      worker: mockWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      workerTimeoutMs: 2000,
      exitFn: mockExit,
      logger: mockLogger
    });

    const result = await shutdownPromise;

    expect(result.success).toBe(true);
    expect(mockExit).toHaveBeenCalledWith(0);
    expect(mockLogger.log).toHaveBeenCalledWith(expect.stringMatching(/BullMQ worker closed successfully \(active jobs drained\)/));

    // Fast-forward time past worker timeout; verify timeout never fires
    jest.advanceTimersByTime(5000);
    expect(mockExit).toHaveBeenCalledTimes(1);
    expect(mockLogger.error).not.toHaveBeenCalled();
  });

  test('Worker close timeout results in nonzero overall shutdown outcome without abandoning remaining teardown', async () => {
    const mockServer = {
      close: jest.fn((cb) => cb())
    };
    // Worker close hangs indefinitely
    const hangingWorker = {
      close: jest.fn(() => new Promise(() => {}))
    };
    const mockSupervisor = {
      stop: jest.fn().mockResolvedValue({ status: 'stopped', terminated: true })
    };
    const mockQueueConfig = {
      connection: {
        quit: jest.fn().mockResolvedValue('OK')
      }
    };
    const mockExit = jest.fn();
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const shutdownPromise = executeGracefulShutdown({
      signal: 'SIGTERM',
      server: mockServer,
      worker: hangingWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      workerTimeoutMs: 1000,
      timeoutMs: 5000,
      exitFn: mockExit,
      logger: mockLogger
    });

    // Yield microtask to allow server.close promise resolution before timer advance
    await Promise.resolve();

    // Advance past worker timeout
    jest.advanceTimersByTime(1100);
    const result = await shutdownPromise;

    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringMatching(/Worker close exceeded 1000ms limit/));
    // Supervisor and Redis shutdown still execute (bounded fallback)
    expect(mockSupervisor.stop).toHaveBeenCalledTimes(1);
    expect(mockQueueConfig.connection.quit).toHaveBeenCalledTimes(1);
    // Nonzero overall outcome because active jobs may not have drained
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/BullMQ worker: Worker close exceeded 1000ms limit/)]));
    expect(mockLogger.log).not.toHaveBeenCalledWith(expect.stringMatching(/Coordinated graceful shutdown completed cleanly/));
  });

  test('ML termination failure is reported accurately and results in nonzero exit code 1', async () => {
    const mockServer = { close: jest.fn((cb) => cb()) };
    const mockWorker = { close: jest.fn().mockResolvedValue() };
    const mockSupervisor = {
      stop: jest.fn().mockResolvedValue({
        status: 'termination_unconfirmed',
        terminated: false,
        error: new Error('Child process refused SIGKILL')
      })
    };
    const mockQueueConfig = { connection: { quit: jest.fn().mockResolvedValue('OK') } };
    const mockExit = jest.fn();
    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const result = await executeGracefulShutdown({
      signal: 'SIGTERM',
      server: mockServer,
      worker: mockWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      exitFn: mockExit,
      logger: mockLogger
    });

    expect(mockSupervisor.stop).toHaveBeenCalledTimes(1);
    // Redis cleanup still proceeds
    expect(mockQueueConfig.connection.quit).toHaveBeenCalledTimes(1);
    // Outcome must be nonzero
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(result.success).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringMatching(/ML supervisor process termination could not be confirmed/));
    expect(mockLogger.log).not.toHaveBeenCalledWith(expect.stringMatching(/Coordinated graceful shutdown completed cleanly/));
  });

  test('Cleanup proceeds safely after HTTP server close error and finishes with exit code 1', async () => {
    const failingServer = {
      close: jest.fn((cb) => cb(new Error('Server close socket error')))
    };
    const mockWorker = { close: jest.fn().mockResolvedValue() };
    const mockSupervisor = { stop: jest.fn().mockResolvedValue({ status: 'stopped', terminated: true }) };
    const mockQueueConfig = { connection: { quit: jest.fn().mockResolvedValue('OK') } };
    const mockExit = jest.fn();
    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const result = await executeGracefulShutdown({
      signal: 'SIGTERM',
      server: failingServer,
      worker: mockWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      exitFn: mockExit,
      logger: mockLogger
    });

    expect(mockWorker.close).toHaveBeenCalledTimes(1);
    expect(mockSupervisor.stop).toHaveBeenCalledTimes(1);
    expect(mockQueueConfig.connection.quit).toHaveBeenCalledTimes(1);
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(result.success).toBe(false);
  });

  test('Cleanup proceeds safely after Redis disconnect error and finishes with exit code 1', async () => {
    const mockServer = { close: jest.fn((cb) => cb()) };
    const mockWorker = { close: jest.fn().mockResolvedValue() };
    const mockSupervisor = { stop: jest.fn().mockResolvedValue({ status: 'stopped', terminated: true }) };
    const mockQueueConfig = {
      complaintQueue: {
        close: jest.fn().mockResolvedValue()
      },
      connection: {
        quit: jest.fn().mockRejectedValue(new Error('Main Redis connection aborted'))
      }
    };
    const mockExit = jest.fn();
    const mockLogger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const result = await executeGracefulShutdown({
      signal: 'SIGTERM',
      server: mockServer,
      worker: mockWorker,
      supervisor: mockSupervisor,
      queueConfig: mockQueueConfig,
      exitFn: mockExit,
      logger: mockLogger
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(result.success).toBe(false);
    expect(result.errors).toEqual(expect.arrayContaining([
      expect.stringMatching(/Main Redis disconnect/)
    ]));
  });

  test('BullMQ lifecycle contract (real library): Worker and Queue close cleanly without workerConnection', async () => {
    // Explicitly load the real installed BullMQ package rather than unit test mocks
    const actualBullMQ = jest.requireActual('bullmq');
    expect(actualBullMQ.Worker).toBeDefined();
    expect(actualBullMQ.Queue).toBeDefined();

    // Instantiate real BullMQ Worker and Queue with connection configuration options
    const testQueue = new actualBullMQ.Queue('LifecycleContractTestQueue', {
      connection: { url: 'redis://127.0.0.1:6379', maxRetriesPerRequest: null }
    });
    const testWorker = new actualBullMQ.Worker('LifecycleContractTestQueue', async () => {}, {
      connection: { url: 'redis://127.0.0.1:6379', maxRetriesPerRequest: null }
    });

    // Verify public API contracts
    expect(typeof testWorker.close).toBe('function');
    expect(typeof testQueue.close).toBe('function');
    // worker.workerConnection is NOT a supported public property of BullMQ Worker
    expect(testWorker.workerConnection).toBeUndefined();

    // Verify both supported close methods resolve cleanly as Promises without requiring ad-hoc connection properties
    await expect(testWorker.close()).resolves.not.toThrow();
    await expect(testQueue.close()).resolves.not.toThrow();
  });

  test('Bounded timeout forces exit(1) if entire shutdown hangs past timeoutMs', async () => {
    const hangingServer = {
      close: jest.fn((_cb) => {
        // Deliberately never invokes callback
      })
    };
    const mockExit = jest.fn();
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    executeGracefulShutdown({
      signal: 'SIGTERM',
      server: hangingServer,
      timeoutMs: 3000,
      exitFn: mockExit,
      logger: mockLogger
    });

    expect(mockExit).not.toHaveBeenCalled();

    // Fast-forward past the 3000ms bounded timeout
    jest.advanceTimersByTime(3100);

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringMatching(/exceeded 3000ms limit/));
  });

  test('Handles unexpected exception gracefully and exits with code 1', async () => {
    const failingServer = {
      close: jest.fn(() => {
        throw new Error('Fatal socket failure during close');
      })
    };
    const mockExit = jest.fn();
    const mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    await executeGracefulShutdown({
      signal: 'SIGTERM',
      server: failingServer,
      exitFn: mockExit,
      logger: mockLogger
    });

    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockLogger.error).toHaveBeenCalledWith(expect.stringMatching(/Fatal socket failure/));
  });
});
