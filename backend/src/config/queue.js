const getBullMQ = () => {
  if (process.env.NODE_ENV === 'test' && process.env.MOCK_REDIS !== 'false') {
    return require('../../__mocks__/bullmq');
  }
  return typeof jest !== 'undefined' ? jest.requireActual('bullmq') : require('bullmq');
};

const getRedisClass = () => {
  if (process.env.NODE_ENV === 'test' && process.env.MOCK_REDIS !== 'false') {
    return require('../../__mocks__/ioredis');
  }
  return typeof jest !== 'undefined' ? jest.requireActual('ioredis') : require('ioredis');
};

const redisOptions = { 
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    if (times > 3) {
      console.error('[Redis] Connection failed. Giving up to prevent log spam.');
      return null; // Stop retrying after 3 attempts
    }
    return Math.min(times * 50, 2000);
  }
};

const createConnection = () => {
  const RedisClass = getRedisClass();
  const conn = new RedisClass(process.env.REDIS_URL || 'redis://localhost:6379', redisOptions);
  if (conn && typeof conn.on === 'function') {
    conn.on('error', () => {
      // Handled to prevent unhandled EventEmitter error crashes
    });
  }
  return conn;
};

const { Queue } = getBullMQ();
const connection = createConnection(); // Keep for backward compatibility/generic ops
const complaintQueue = new Queue('ComplaintProcessing', { connection: createConnection() });
if (complaintQueue && typeof complaintQueue.on === 'function') {
  complaintQueue.on('error', () => {});
}

module.exports = { complaintQueue, connection, createConnection };
