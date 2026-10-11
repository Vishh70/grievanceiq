// backend/tests/setup.integration.js
// Dedicated integration test setup — Real BullMQ & Redis, NO global mocks
process.env.MOCK_REDIS = 'false';

afterAll(async () => {
  try {
    const queueConfig = require('../src/config/queue');
    if (queueConfig.complaintQueue && typeof queueConfig.complaintQueue.close === 'function') {
      await queueConfig.complaintQueue.close();
    }
    if (queueConfig.connection && typeof queueConfig.connection.quit === 'function') {
      await queueConfig.connection.quit();
    }
  } catch (e) {}
});
