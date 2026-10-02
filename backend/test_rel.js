const { predictRelationship } = require('./src/services/relationshipService');

async function testRel() {
  // We can just monkey patch generateEmbedding
  const embeddingService = require('./src/services/embeddingService');
  const original = embeddingService.generateEmbedding;
  embeddingService.generateEmbedding = async (text) => {
    try {
      return await original(text);
    } catch (e) {
      console.log('Mocking embedding for', text);
      return new Array(384).fill(0.1);
    }
  };

  const result = await predictRelationship(
    {
      text: 'Water pipeline leakage',
      category: 'Water Supply',
      location_lat: 18.6200,
      location_lng: 73.8100,
      created_at: new Date().toISOString(),
    },
    {
      text: 'Road damaged because of water',
      category: 'Roads',
      location_lat: 18.6201,
      location_lng: 73.8101,
      created_at: new Date(Date.now() - 5 * 3600 * 1000).toISOString(),
    }
  );
  console.log(result);
}

testRel();
