const { Queue, Worker } = require('bullmq');
const Redis = require('ioredis');
require('dotenv').config();

const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null });

const complaintQueue = new Queue('ComplaintProcessing', { connection });

module.exports = { complaintQueue, connection };
