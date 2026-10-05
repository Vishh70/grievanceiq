const axios = require('axios');
const jwt = require('jsonwebtoken');
require('dotenv').config();

async function runRealApiTest() {
  const secret = process.env.JWT_SECRET || 'fallback-secret-for-tests';
  const token = jwt.sign({ id: '550e8400-e29b-41d4-a716-446655440000', email: 'test@example.com' }, secret);
  const headers = { Authorization: `Bearer ${token}` };

  console.log('--- SEEDING CANDIDATE IN DATABASE ---');
  try {
    const res1 = await axios.post('http://localhost:5000/api/complaints', {
      text: "Water is constantly leaking near the main road causing severe potholes.",
      location_lat: 40.7129,
      location_lng: -74.0061
    }, { headers });
    console.log('Seeded candidate ID:', res1.data.complaint.id);
  } catch (err) {
    console.error('Seed error:', err.response?.data || err.message);
  }

  // Sleep slightly
  await new Promise(r => setTimeout(r, 2000));

  console.log('\n--- TESTING REAL APPLICATION FLOW ---');
  try {
    const res2 = await axios.post('http://localhost:5000/api/complaints', {
      text: "There is water leakage beside the road and the leakage has damaged the road surface.",
      location_lat: 40.7128,
      location_lng: -74.0060
    }, { headers });
    
    console.log('SUCCESS! Response:');
    console.log(JSON.stringify(res2.data, null, 2));
    
    if (res2.data.complaint && res2.data.complaint.id) {
      console.log(`\nTo view frontend presentation, open UI at /complaint/${res2.data.complaint.id}`);
    }
  } catch (err) {
    console.error('Test error:', err.response?.data || err.message);
  }
}

runRealApiTest().then(() => process.exit(0));
