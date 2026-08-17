// src/config/db.js
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

async function connectDB() {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.warn('⚠️ Could not connect to external MongoDB. Starting In-Memory MongoDB instead...');
    try {
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      const conn = await mongoose.connect(mongoUri);
      console.log(`✅ In-Memory MongoDB connected: ${conn.connection.host}`);
    } catch (memErr) {
      console.error('❌ In-Memory MongoDB connection error:', memErr.message);
      process.exit(1);
    }
  }
}

module.exports = connectDB;
