require('dotenv').config();
const { predictIssueLabels, isMLServiceAvailable } = require('./src/services/mlService');

async function testMLIntegration() {
  console.log('Testing Node -> Python ML Integration...');
  
  const isAvailable = await isMLServiceAvailable();
  console.log(`ML Service Available: ${isAvailable}`);
  
  if (!isAvailable) {
    console.log('Python service is offline. Demonstrating graceful fallback...');
  }
  
  // Create a fake 384-dim vector
  const embedding = new Array(384).fill(0.1);
  const text = 'There is a large pothole near the college gate causing accidents.';
  
  const result = await predictIssueLabels(embedding, text);
  
  console.log('ML Service Result:');
  console.log(JSON.stringify(result, null, 2));
  
  if (isAvailable && result.serviceAvailable === false) {
    console.error('Error: Service was reported available but prediction failed!');
    process.exit(1);
  }
  
  console.log('Test completed.');
  process.exit(0);
}

testMLIntegration();
