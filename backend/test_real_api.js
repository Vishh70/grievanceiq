const { createClient } = require('@supabase/supabase-js');
const jwt = require('jsonwebtoken');
const axios = require('axios');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

async function run() {
  const { data: users, error } = await supabase.from('users').select('*').limit(1);
  if (error || !users || users.length === 0) {
    console.error('No users found in database:', error);
    return;
  }
  
  const user = users[0];
  console.log('Using user:', user.id);
  
  const secret = process.env.JWT_SECRET || 'fallback-secret-for-tests';
  const token = jwt.sign({ id: user.id, email: user.email }, secret);
  const headers = { Authorization: 'Bearer ' + token };

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

  await new Promise(r => setTimeout(r, 2000));

  try {
    const res2 = await axios.post('http://localhost:5000/api/complaints', {
      text: "There is water leakage beside the road and the leakage has damaged the road surface.",
      location_lat: 40.7128,
      location_lng: -74.0060
    }, { headers });
    
    console.log('SUCCESS! Response:');
    console.log(JSON.stringify(res2.data, null, 2));
  } catch (err) {
    console.error('Test error:', err.response?.data || err.message);
  }
}
run();
