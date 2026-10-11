// src/services/mlSupervisor.js
// Supervisor process to manage the embedded Python ML Inference service
// Ensures bounded restart backoff, graceful shutdown, and observable error logging.

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

let mlProcess = null;
let mlRestartCount = 0;
const MAX_RESTARTS = 5;
let isShuttingDown = false;
let supervisorStatus = 'uninitialized';
let lastError = null;
let restartTimer = null;
let shutdownPromise = null;

function getPythonPath() {
  const isWin = os.platform() === 'win32';
  return isWin
    ? path.join(__dirname, '..', '..', '.venv', 'Scripts', 'python.exe')
    : path.join(__dirname, '..', '..', '.venv', 'bin', 'python');
}

function getScriptPath() {
  return path.join(__dirname, '..', '..', 'ml', 'inference', 'grievanceiq_inference.py');
}

function resetSupervisor() {
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }
  if (mlProcess && !mlProcess.killed) {
    try {
      mlProcess.kill('SIGTERM');
    } catch (_e) {}
  }
  mlProcess = null;
  mlRestartCount = 0;
  isShuttingDown = false;
  supervisorStatus = 'uninitialized';
  lastError = null;
  shutdownPromise = null;
}

function shutdownHandler(options = {}) {
  isShuttingDown = true;
  if (restartTimer) {
    clearTimeout(restartTimer);
    restartTimer = null;
  }

  // Idempotent: return existing promise if shutdown already initiated
  if (shutdownPromise) {
    return shutdownPromise;
  }

  // If already stopped, failing, waiting for restart timer, or child not running
  if (
    supervisorStatus === 'restarting' ||
    supervisorStatus === 'stopped' ||
    supervisorStatus === 'failed' ||
    supervisorStatus === 'clean_exit_stopped' ||
    supervisorStatus === 'missing_binary' ||
    supervisorStatus === 'external' ||
    !mlProcess ||
    mlProcess.killed
  ) {
    if (restartTimer) {
      clearTimeout(restartTimer);
      restartTimer = null;
    }
    const previousStatus = supervisorStatus;
    supervisorStatus = 'stopped';
    mlProcess = null;
    shutdownPromise = Promise.resolve({
      status: 'stopped',
      alreadyStopped: true,
      terminated: true,
      previousStatus
    });
    return shutdownPromise;
  }

  shutdownPromise = new Promise((resolve) => {
    console.log('🛑 Terminating Embedded ML Service on application shutdown...');

    const totalTimeoutMs = options.timeoutMs || 4000;
    const sigtermTimeoutMs = options.sigtermTimeoutMs !== undefined
      ? options.sigtermTimeoutMs
      : Math.max(500, Math.floor(totalTimeoutMs * 0.75));
    const sigkillTimeoutMs = options.sigkillTimeoutMs !== undefined
      ? options.sigkillTimeoutMs
      : Math.max(500, totalTimeoutMs - sigtermTimeoutMs);

    let sigtermTimer = null;
    let sigkillTimer = null;
    let wasEscalatedToSigkill = false;

    const cleanupTimers = () => {
      if (sigtermTimer) {
        clearTimeout(sigtermTimer);
        sigtermTimer = null;
      }
      if (sigkillTimer) {
        clearTimeout(sigkillTimer);
        sigkillTimer = null;
      }
    };

    const onExit = (code, signal) => {
      cleanupTimers();
      supervisorStatus = 'stopped';
      console.log(`[ML Supervisor]: Embedded ML Service terminated (code: ${code}, signal: ${signal}).`);
      resolve({
        status: wasEscalatedToSigkill ? 'force_killed' : 'stopped',
        terminated: true,
        code,
        signal
      });
    };

    mlProcess.once('close', onExit);

    try {
      mlProcess.kill('SIGTERM');
    } catch (killErr) {
      cleanupTimers();
      if (killErr.code === 'ESRCH') {
        supervisorStatus = 'stopped';
        return resolve({ status: 'stopped', alreadyStopped: true, terminated: true });
      }
      console.warn(`[ML Supervisor]: kill error: ${killErr.message}`);
      supervisorStatus = 'failed';
      return resolve({ status: 'kill_error', error: killErr, terminated: false });
    }

    // Bounded safety timeout: escalate to SIGKILL if child fails to exit from SIGTERM
    sigtermTimer = setTimeout(() => {
      wasEscalatedToSigkill = true;
      console.warn(`⚠️ Embedded ML Service did not exit within ${sigtermTimeoutMs}ms. Sending SIGKILL...`);
      try {
        mlProcess.kill('SIGKILL');
      } catch (sigkillErr) {
        if (sigkillErr.code === 'ESRCH') {
          cleanupTimers();
          supervisorStatus = 'stopped';
          return resolve({ status: 'force_killed', terminated: true });
        }
        console.warn(`[ML Supervisor]: SIGKILL error: ${sigkillErr.message}`);
      }

      // Wait for child process to actually exit following SIGKILL
      sigkillTimer = setTimeout(() => {
        cleanupTimers();
        if (mlProcess) {
          mlProcess.removeListener('close', onExit);
        }
        supervisorStatus = 'failed';
        console.error(`❌ Embedded ML Service failed to terminate within ${totalTimeoutMs}ms total.`);
        resolve({
          status: 'termination_unconfirmed',
          terminated: false,
          error: new Error(`Process failed to terminate within ${totalTimeoutMs}ms after SIGKILL`)
        });
      }, sigkillTimeoutMs);

      if (sigkillTimer.unref) sigkillTimer.unref();
    }, sigtermTimeoutMs);

    if (sigtermTimer.unref) sigtermTimer.unref();
  });

  return shutdownPromise;
}

function startMLSupervisor(options = {}) {
  const customPython = options.pythonBin || getPythonPath();
  const customScript = options.scriptPath || getScriptPath();
  const maxRestarts = options.maxRestarts !== undefined ? options.maxRestarts : MAX_RESTARTS;
  const spawnFn = options.spawn || spawn;

  const isLocalMl = !process.env.ML_SERVICE_URL ||
    process.env.ML_SERVICE_URL.includes('127.0.0.1') ||
    process.env.ML_SERVICE_URL.includes('localhost');

  if (!isLocalMl) {
    supervisorStatus = 'external';
    console.log(`🧠 External ML Service configured at ${process.env.ML_SERVICE_URL}`);
    return {
      status: 'external',
      getStatus: () => supervisorStatus,
      stop: () => Promise.resolve({ status: 'external' })
    };
  }

  process.env.ML_SERVICE_URL = 'http://127.0.0.1:5001';

  // Check binary and script existence unless a custom mock spawn is injected
  if (!options.spawn && (!fs.existsSync(customPython) || !fs.existsSync(customScript))) {
    supervisorStatus = 'missing_binary';
    lastError = `Binary (${customPython}) or script (${customScript}) not found`;
    console.warn(`⚠️ Embedded ML Service binary (${customPython}) or script (${customScript}) not found. Skipping auto-spawn.`);
    return {
      status: 'missing_binary',
      getStatus: () => supervisorStatus,
      getLastError: () => lastError,
      stop: () => Promise.resolve({ status: 'missing_binary' })
    };
  }

  let spawnFailed = false;

  function spawnProcess() {
    if (isShuttingDown) return;

    try {
      mlProcess = spawnFn(customPython, [customScript], {
        env: { ...process.env, PYTHONUNBUFFERED: '1' }
      });

      supervisorStatus = 'running';

      if (mlProcess.stdout) {
        mlProcess.stdout.on('data', (data) => console.log(`[ML Embedded]: ${data}`));
      }
      if (mlProcess.stderr) {
        mlProcess.stderr.on('data', (data) => console.error(`[ML Embedded ERR]: ${data}`));
      }

      mlProcess.on('error', (err) => {
        lastError = err.message;
        spawnFailed = true;
        supervisorStatus = 'spawn_error';
        console.error(`[ML Supervisor ERR]: Failed to start process: ${err.message}`);
      });

      mlProcess.on('close', (code, signal) => {
        console.warn(`⚠️ Embedded ML Service exited with code ${code}, signal ${signal}`);

        if (isShuttingDown) {
          supervisorStatus = 'stopped';
          return;
        }

        if (code === 0) {
          supervisorStatus = 'clean_exit_stopped';
          console.warn('⚠️ Embedded ML Service exited cleanly (code 0) while host is running. Supervisor halted.');
          return;
        }

        if (spawnFailed) {
          supervisorStatus = 'spawn_error';
          console.error(`❌ Embedded ML Service spawn failed (${lastError}). Halting restarts.`);
          return;
        }

        if (mlRestartCount < maxRestarts) {
          mlRestartCount++;
          supervisorStatus = 'restarting';
          const delay = Math.min(mlRestartCount * (options.backoffBase || 2000), 10000);
          console.log(`🔄 Restarting Embedded ML Service in ${delay}ms (attempt ${mlRestartCount}/${maxRestarts})...`);
          restartTimer = setTimeout(spawnProcess, delay);
        } else {
          supervisorStatus = 'failed';
          console.error(`❌ Embedded ML Service restart limit (${maxRestarts}) reached. Supervisor halted.`);
        }
      });

      console.log(`🧠 Embedded ML Service spawned on ${process.env.ML_SERVICE_URL} (PID: ${mlProcess.pid || 'mock'})`);
    } catch (spawnErr) {
      lastError = spawnErr.message;
      supervisorStatus = 'failed';
      console.error(`[ML Supervisor]: Synchronous spawn error: ${spawnErr.message}`);
    }
  }

  spawnProcess();

  return {
    status: supervisorStatus,
    getStatus: () => supervisorStatus,
    getRestartCount: () => mlRestartCount,
    getLastError: () => lastError,
    getProcess: () => mlProcess,
    stop: shutdownHandler
  };
}

module.exports = {
  startMLSupervisor,
  resetSupervisor,
  getPythonPath,
  getScriptPath,
  getStatus: () => supervisorStatus,
  getLastError: () => lastError,
  stop: shutdownHandler,
  MAX_RESTARTS
};
