// tests/unit/mlSupervisor.test.js
// Unit tests for ML Process Supervisor resilience, error handling, and restart bounds

const path = require('path');
const { EventEmitter } = require('events');
const {
  startMLSupervisor,
  resetSupervisor,
  MAX_RESTARTS
} = require('../../src/services/mlSupervisor');

describe('ML Process Supervisor', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.useFakeTimers();
    process.env = { ...originalEnv };
    resetSupervisor();
  });

  afterEach(() => {
    resetSupervisor();
    jest.useRealTimers();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('Reports missing_binary when Python binary or script does not exist', () => {
    delete process.env.ML_SERVICE_URL;

    const result = startMLSupervisor({
      pythonBin: path.join(__dirname, 'non_existent_python_binary'),
      scriptPath: path.join(__dirname, 'non_existent_script.py')
    });

    expect(result.status).toBe('missing_binary');
    expect(result.getStatus()).toBe('missing_binary');
    expect(result.getLastError()).toMatch(/not found/);
  });

  test('Respects external ML_SERVICE_URL and skips local process spawn', () => {
    process.env.ML_SERVICE_URL = 'https://ml.grievanceiq.com';

    const result = startMLSupervisor({
      pythonBin: path.join(__dirname, 'mock_python'),
      scriptPath: path.join(__dirname, 'mock_script.py')
    });

    expect(result.status).toBe('external');
    expect(result.getStatus()).toBe('external');
  });

  test('Exposes bounded max restarts constant to prevent infinite loops', () => {
    expect(MAX_RESTARTS).toBe(5);
  });

  test('Handles clean process exit (code 0) without triggering unwanted restarts', () => {
    delete process.env.ML_SERVICE_URL;

    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = 12345;
    mockChild.kill = jest.fn();

    const mockSpawn = jest.fn().mockReturnValue(mockChild);

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py'
    });

    expect(supervisor.getStatus()).toBe('running');

    // Simulate child exiting cleanly with code 0
    mockChild.emit('close', 0, null);

    expect(supervisor.getStatus()).toBe('clean_exit_stopped');
    expect(supervisor.getRestartCount()).toBe(0);

    // Fast-forward any timers; ensure no extra spawn was triggered
    jest.advanceTimersByTime(10000);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  test('Handles child spawn errors accurately without looping', () => {
    delete process.env.ML_SERVICE_URL;

    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = undefined;
    mockChild.kill = jest.fn();

    const mockSpawn = jest.fn().mockReturnValue(mockChild);

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py'
    });

    // Simulate spawn error event (e.g. ENOENT or permission denied)
    mockChild.emit('error', new Error('spawn ENOENT'));
    mockChild.emit('close', -1, null);

    expect(supervisor.getStatus()).toBe('spawn_error');
    expect(supervisor.getLastError()).toBe('spawn ENOENT');
    expect(supervisor.getRestartCount()).toBe(0);

    // Fast forward; no further spawn attempts
    jest.advanceTimersByTime(10000);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  test('Restarts on unexpected crash up to bounded limit and then halts', () => {
    delete process.env.ML_SERVICE_URL;

    const children = [];
    const mockSpawn = jest.fn().mockImplementation(() => {
      const child = new EventEmitter();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.pid = 20000 + children.length;
      child.kill = jest.fn();
      children.push(child);
      return child;
    });

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      maxRestarts: 2,
      backoffBase: 100,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py'
    });

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    expect(supervisor.getStatus()).toBe('running');

    // Crash 1
    children[0].emit('close', 1, null);
    expect(supervisor.getStatus()).toBe('restarting');
    expect(supervisor.getRestartCount()).toBe(1);

    // Advance timer to trigger restart 1
    jest.advanceTimersByTime(200);
    expect(mockSpawn).toHaveBeenCalledTimes(2);

    // Crash 2
    children[1].emit('close', 1, null);
    expect(supervisor.getStatus()).toBe('restarting');
    expect(supervisor.getRestartCount()).toBe(2);

    // Advance timer to trigger restart 2
    jest.advanceTimersByTime(400);
    expect(mockSpawn).toHaveBeenCalledTimes(3);

    // Crash 3 (exceeds maxRestarts = 2)
    children[2].emit('close', 1, null);
    expect(supervisor.getStatus()).toBe('failed');
    expect(supervisor.getRestartCount()).toBe(2);

    // Ensure it does not spawn again
    jest.advanceTimersByTime(10000);
    expect(mockSpawn).toHaveBeenCalledTimes(3);
  });

  test('Deliberate application shutdown awaits child exit and prevents restarts', async () => {
    delete process.env.ML_SERVICE_URL;

    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = 999;
    mockChild.kill = jest.fn();

    const mockSpawn = jest.fn().mockReturnValue(mockChild);

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py'
    });

    expect(supervisor.getStatus()).toBe('running');

    // Deliberate shutdown returns an awaitable promise
    let resolved = false;
    const stopPromise = supervisor.stop().then((res) => {
      resolved = true;
      return res;
    });

    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');
    expect(resolved).toBe(false); // Does not report complete merely because signal was sent

    // Child closes after SIGTERM
    mockChild.emit('close', 0, 'SIGTERM');

    const result = await stopPromise;
    expect(result.status).toBe('stopped');
    expect(resolved).toBe(true);
    expect(supervisor.getStatus()).toBe('stopped');

    jest.advanceTimersByTime(10000);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });

  test('Bounded timeout sends SIGKILL if child does not exit in time and confirms exit when child closes', async () => {
    delete process.env.ML_SERVICE_URL;

    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = 888;
    mockChild.kill = jest.fn();

    const mockSpawn = jest.fn().mockReturnValue(mockChild);

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py'
    });

    const stopPromise = supervisor.stop({ timeoutMs: 2000, sigtermTimeoutMs: 1000, sigkillTimeoutMs: 1000 });
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

    // Fast-forward past sigterm timeout; triggers SIGKILL
    jest.advanceTimersByTime(1100);
    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');

    // Child closes following SIGKILL
    mockChild.emit('close', null, 'SIGKILL');

    const result = await stopPromise;
    expect(result.status).toBe('force_killed');
    expect(result.terminated).toBe(true);
    expect(supervisor.getStatus()).toBe('stopped');
  });

  test('Reports termination_unconfirmed if child does not exit even after SIGKILL', async () => {
    delete process.env.ML_SERVICE_URL;

    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = 889;
    mockChild.kill = jest.fn();

    const mockSpawn = jest.fn().mockReturnValue(mockChild);

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py'
    });

    const stopPromise = supervisor.stop({ timeoutMs: 2000, sigtermTimeoutMs: 1000, sigkillTimeoutMs: 1000 });
    expect(mockChild.kill).toHaveBeenCalledWith('SIGTERM');

    // Advance past sigterm timeout (SIGKILL sent)
    jest.advanceTimersByTime(1100);
    expect(mockChild.kill).toHaveBeenCalledWith('SIGKILL');

    // Advance past final timeout without child ever closing
    jest.advanceTimersByTime(1100);

    const result = await stopPromise;
    expect(result.status).toBe('termination_unconfirmed');
    expect(result.terminated).toBe(false);
    expect(supervisor.getStatus()).toBe('failed');
  });

  test('Repeated supervisor.stop() calls are idempotent', async () => {
    delete process.env.ML_SERVICE_URL;

    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = 555;
    mockChild.kill = jest.fn();

    const mockSpawn = jest.fn().mockReturnValue(mockChild);

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py'
    });

    const p1 = supervisor.stop();
    const p2 = supervisor.stop();

    expect(p1).toBe(p2);
    expect(mockChild.kill).toHaveBeenCalledTimes(1);

    mockChild.emit('close', 0, 'SIGTERM');
    await Promise.all([p1, p2]);
  });

  test('Cancels pending restart timer when shutdown is called during backoff delay', () => {
    delete process.env.ML_SERVICE_URL;

    const mockChild = new EventEmitter();
    mockChild.stdout = new EventEmitter();
    mockChild.stderr = new EventEmitter();
    mockChild.pid = 777;
    mockChild.kill = jest.fn();

    const mockSpawn = jest.fn().mockReturnValue(mockChild);

    const supervisor = startMLSupervisor({
      spawn: mockSpawn,
      pythonBin: 'mock_python',
      scriptPath: 'mock_script.py',
      backoffBase: 5000
    });

    // Crash happens; enters backoff delay timer
    mockChild.emit('close', 1, null);
    expect(supervisor.getStatus()).toBe('restarting');
    expect(supervisor.getRestartCount()).toBe(1);

    // Shutdown called before timer fires
    supervisor.stop();
    expect(supervisor.getStatus()).toBe('stopped');

    // Advance time; timer should NOT have fired
    jest.advanceTimersByTime(10000);
    expect(mockSpawn).toHaveBeenCalledTimes(1);
  });
});
