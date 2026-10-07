const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

let RedisClass = Redis;
if (process.env.NODE_ENV === 'test') {
  RedisClass = require('ioredis-mock');
}

const connection = new RedisClass(process.env.REDIS_URL || 'redis://localhost:6379', { 
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    if (times > 3) {
      console.error('[Redis] Connection failed. Giving up to prevent log spam.');
      return null; // Stop retrying after 3 attempts
    }
    return Math.min(times * 50, 2000);
  }
});

const complaintQueue = new Queue('ComplaintProcessing', { connection });

module.exports = { complaintQueue, connection };
