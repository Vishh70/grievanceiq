jest.mock('ioredis');
jest.mock('bullmq');

const { connection, complaintQueue } = require('../src/config/queue');

afterAll(async () => {
  if (complaintQueue) {
    await complaintQueue.close();
  }
  if (connection) {
    connection.disconnect();
  }
});
