const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { 
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
