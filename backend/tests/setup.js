const { connection, complaintQueue } = require('../src/config/queue');

afterAll(async () => {
  if (complaintQueue) {
    await complaintQueue.close();
  }
  if (connection) {
    await connection.quit();
  }
});
