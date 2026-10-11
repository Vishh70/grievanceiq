// src/services/shutdownManager.js
// Centralized, coordinated graceful shutdown manager for GrievanceIQ
// Coordinates HTTP server, BullMQ worker, Redis connections, and ML supervisor.

let isShuttingDown = false;
let shutdownPromise = null;

async function executeGracefulShutdown({
  signal = 'SIGTERM',
  server = null,
  worker = null,
  supervisor = null,
  queueConfig = null,
  timeoutMs = 10000,
  workerTimeoutMs = 5000,
  mlTimeoutMs = 4000,
  exitFn = process.exit,
  logger = console
} = {}) {
  // Idempotency: prevent concurrent or repeated shutdowns
  if (isShuttingDown) {
    logger.log(`[Shutdown] Shutdown already in progress (${signal} ignored).`);
    return shutdownPromise;
  }

  isShuttingDown = true;
  logger.log(`[Shutdown] ${signal} signal received. Initiating coordinated graceful shutdown...`);

  shutdownPromise = (async () => {
    let hasFailure = false;
    const failures = [];

    // Bounded safety fallback: force exit if graceful cleanup hangs
    const forceTimer = setTimeout(() => {
      logger.error(`[Shutdown] Graceful shutdown exceeded ${timeoutMs}ms limit. Forcing exit.`);
      exitFn(1);
    }, timeoutMs);

    if (forceTimer.unref) forceTimer.unref();

    try {
      // Step 1: Stop accepting new HTTP requests
      if (server && typeof server.close === 'function') {
        logger.log('[Shutdown] 1/4 Closing HTTP server...');
        await new Promise((resolve) => {
          server.close((err) => {
            if (err) {
              hasFailure = true;
              failures.push(`HTTP server close: ${err.message}`);
              logger.error(`[Shutdown] HTTP server close error: ${err.message}`);
            } else {
              logger.log('[Shutdown] HTTP server closed.');
            }
            resolve();
          });
        });
      }

      // Step 2: Close BullMQ Worker gracefully, allowing active jobs to finish
      // Notice: Redis must remain open during this step so the worker can complete in-flight tasks
      if (worker && typeof worker.close === 'function') {
        logger.log('[Shutdown] 2/4 Closing BullMQ worker (draining active jobs)...');
        let workerTimer = null;
        try {
          await new Promise((resolve, reject) => {
            workerTimer = setTimeout(() => {
              reject(new Error(`Worker close exceeded ${workerTimeoutMs}ms limit; active jobs may not have drained`));
            }, workerTimeoutMs);
            if (workerTimer.unref) workerTimer.unref();

            worker.close().then(
              (res) => {
                if (workerTimer) {
                  clearTimeout(workerTimer);
                  workerTimer = null;
                }
                resolve(res);
              },
              (err) => {
                if (workerTimer) {
                  clearTimeout(workerTimer);
                  workerTimer = null;
                }
                reject(err);
              }
            );
          });
          logger.log('[Shutdown] BullMQ worker closed successfully (active jobs drained).');
        } catch (workerErr) {
          if (workerTimer) {
            clearTimeout(workerTimer);
            workerTimer = null;
          }
          hasFailure = true;
          failures.push(`BullMQ worker: ${workerErr.message}`);
          logger.error(`[Shutdown] BullMQ worker close failed/timed out: ${workerErr.message}`);
        }
      }

      // Step 3: Stop embedded ML supervisor and await termination of Python child
      if (supervisor && typeof supervisor.stop === 'function') {
        logger.log('[Shutdown] 3/4 Awaiting ML supervisor process termination...');
        try {
          const mlResult = await supervisor.stop({ timeoutMs: mlTimeoutMs });
          if (mlResult && (mlResult.status === 'termination_unconfirmed' || mlResult.terminated === false)) {
            hasFailure = true;
            failures.push(`ML supervisor termination unconfirmed: ${mlResult.status}`);
            logger.error(`[Shutdown] ML supervisor process termination could not be confirmed (${mlResult.status}).`);
          } else if (mlResult && mlResult.error) {
            hasFailure = true;
            failures.push(`ML supervisor error: ${mlResult.error.message || mlResult.error}`);
            logger.error(`[Shutdown] ML supervisor stop error: ${mlResult.error.message || mlResult.error}`);
          } else {
            logger.log(`[Shutdown] ML supervisor process terminated cleanly (${mlResult ? mlResult.status : 'stopped'}).`);
          }
        } catch (mlErr) {
          hasFailure = true;
          failures.push(`ML supervisor exception: ${mlErr.message}`);
          logger.error(`[Shutdown] ML supervisor stop error: ${mlErr.message}`);
        }
      }

      // Step 4: Close remaining application queue and Redis resources
      logger.log('[Shutdown] 4/4 Closing remaining application queue and Redis resources...');

      // A. Close complaintQueue instance
      if (queueConfig && queueConfig.complaintQueue && typeof queueConfig.complaintQueue.close === 'function') {
        try {
          await queueConfig.complaintQueue.close();
          logger.log('[Shutdown] BullMQ complaintQueue closed.');
        } catch (qCloseErr) {
          hasFailure = true;
          failures.push(`complaintQueue close: ${qCloseErr.message}`);
          logger.error(`[Shutdown] complaintQueue close error: ${qCloseErr.message}`);
        }
      }

      // C. Close main/shared Redis connection
      if (queueConfig && queueConfig.connection) {
        try {
          if (typeof queueConfig.connection.quit === 'function') {
            await queueConfig.connection.quit();
          } else if (typeof queueConfig.connection.disconnect === 'function') {
            queueConfig.connection.disconnect();
          }
          logger.log('[Shutdown] Main Redis connection closed.');
        } catch (qErr) {
          hasFailure = true;
          failures.push(`Main Redis disconnect: ${qErr.message}`);
          logger.error(`[Shutdown] Main Redis disconnect error: ${qErr.message}`);
        }
      }

      clearTimeout(forceTimer);

      if (hasFailure) {
        logger.error(`[Shutdown] Shutdown completed with errors or timeouts (${failures.length} failed components). Exiting with code 1.`);
        logger.error(`[Shutdown] Failures: ${failures.join('; ')}`);
        exitFn(1);
        return { success: false, errors: failures };
      } else {
        logger.log('[Shutdown] Coordinated graceful shutdown completed cleanly.');
        exitFn(0);
        return { success: true };
      }
    } catch (err) {
      clearTimeout(forceTimer);
      logger.error(`[Shutdown] Unhandled error during shutdown: ${err.message}`);
      exitFn(1);
      return { success: false, error: err };
    }
  })();

  return shutdownPromise;
}

function registerSignalHandlers({
  server,
  worker,
  supervisor,
  queueConfig,
  timeoutMs = 10000,
  workerTimeoutMs = 5000,
  mlTimeoutMs = 4000,
  exitFn = process.exit,
  logger = console
}) {
  const handler = (sig) => {
    executeGracefulShutdown({
      signal: sig,
      server,
      worker,
      supervisor,
      queueConfig,
      timeoutMs,
      workerTimeoutMs,
      mlTimeoutMs,
      exitFn,
      logger
    });
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));
}

function resetShutdownState() {
  isShuttingDown = false;
  shutdownPromise = null;
}

module.exports = {
  executeGracefulShutdown,
  registerSignalHandlers,
  resetShutdownState,
  isShuttingDown: () => isShuttingDown
};
