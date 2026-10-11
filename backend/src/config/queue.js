const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

const getRedisClass = () => {
  if (process.env.NODE_ENV === 'test' && process.env.MOCK_REDIS !== 'false') {
    return require('../../__mocks__/ioredis');
  }
  return Redis;
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
  return new RedisClass(process.env.REDIS_URL || 'redis://localhost:6379', redisOptions);
};

const connection = createConnection(); // Keep for backward compatibility/generic ops
const complaintQueue = new Queue('ComplaintProcessing', { connection: createConnection() });

module.exports = { complaintQueue, connection, createConnection };
