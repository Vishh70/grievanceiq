const { predictRelationship } = require('./src/services/relationshipService');

async function test() {
  const compA = {
    text: "There is water leakage beside the road and the leakage has damaged the road surface.",
    category: "Roads",
    ml_labels: ["road_damage_flag", "roadside_flooding_flag", "water_leakage_flag"],
    location_lat: 40.7128,
    location_lng: -74.0060,
    created_at: new Date().toISOString()
  };
  const compB = {
    text: "Road damaged due to water",
    category: "Roads",
    ml_labels: ["road_damage_flag"],
    location_lat: 40.7129,
    location_lng: -74.0061,
    created_at: new Date(Date.now() - 3600000).toISOString()
  };
  
  const result = await predictRelationship(compA, compB);
  console.log("RELATIONSHIP RESULT:", JSON.stringify(result, null, 2));
}

test().then(() => process.exit(0));
