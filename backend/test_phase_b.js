require('dotenv').config();
const { predictRelationship } = require('./src/services/relationshipService');

const a = {
  category: 'Roads',
  ml_labels: ['Road Damage', 'Water Leakage'],
  embedding_vector: new Array(384).fill(0.1),
  location_lat: 40.71,
  location_lng: -74.00,
  created_at: new Date().toISOString()
};

const b = {
  category: 'Water Supply',
  ml_labels: ['Water Leakage'],
  embedding_vector: new Array(384).fill(0.12),
  location_lat: 40.71,
  location_lng: -74.00,
  created_at: new Date().toISOString()
};

console.log('RELATIONSHIP_MODEL_PROVIDER =', process.env.RELATIONSHIP_MODEL_PROVIDER || 'default');
console.log('ML_SERVICE_URL =', process.env.ML_SERVICE_URL || 'http://localhost:5001');

predictRelationship(a, b).then(result => {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
