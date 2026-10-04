const axios = require('axios');
const {
  multiHotCategory,
  extractCorrectedRelationshipFeatures,
  predictRelationshipCorrected,
  predictRelationship
} = require('../../src/services/relationshipService');
const { CATEGORIES } = require('../../src/services/relationshipService');

jest.mock('axios');

describe('Phase 2B: Corrected Relationship Inference Integration', () => {
  const dummyComplaintA = {
    text: 'Pothole on Main St',
    category: 'Roads',
    ml_labels: ['Road Damage', 'Water Leakage'],
    location_lat: 40.7128,
    location_lng: -74.0060,
    created_at: new Date().toISOString(),
    embedding_vector: new Array(384).fill(0.1)
  };

  const dummyComplaintB = {
    text: 'Large pothole and broken pipe',
    category: 'Other',
    ml_labels: ['Road Flooding'],
    location_lat: 40.7129,
    location_lng: -74.0061,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    embedding_vector: new Array(384).fill(0.12)
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('G. validates true multi-hot category encoding', () => {
    const multiHot = multiHotCategory(['Road Damage', 'Water Leakage']);
    const roadsIdx = CATEGORIES.indexOf('Roads');
    const waterIdx = CATEGORIES.indexOf('Water Supply');
    
    expect(multiHot[roadsIdx]).toBe(1);
    expect(multiHot[waterIdx]).toBe(1);
    
    const sum = multiHot.reduce((a, b) => a + b, 0);
    expect(sum).toBe(2);
  });

  it('H. handles multi-category complaint extraction accurately', () => {
    const features = extractCorrectedRelationshipFeatures(dummyComplaintA, dummyComplaintB);
    expect(features.length).toBe(20);
    
    // category_a offset is 6. Roads is index 0 -> 6. Water Supply is 1 -> 7.
    expect(features[6]).toBe(1); // Roads A
    expect(features[7]).toBe(1); // Water Supply A
    
    // category_b offset is 13. Roads is index 0 -> 13.
    expect(features[13]).toBe(1); // Roads B
  });

  it('I. Node -> Python relationship request succeeds with 20 features', async () => {
    axios.post.mockResolvedValueOnce({
      data: {
        relationship: 'Related',
        class_id: 2,
        features_used: 20,
        probabilities: { Duplicate: 0.1, Similar: 0.2, Related: 0.6, Independent: 0.1 }
      }
    });

    const result = await predictRelationshipCorrected(dummyComplaintA, dummyComplaintB);
    
    expect(axios.post).toHaveBeenCalledTimes(1);
    const requestData = axios.post.mock.calls[0][1];
    expect(requestData.features).toHaveLength(20);
    
    expect(result.relationship).toBe('Related');
    expect(result.confidence).toBe(0.6);
  });

  it('J. Python offline fallback triggers old Node model', async () => {
    axios.post.mockRejectedValueOnce(new Error('Network Error'));
    
    const result = await predictRelationshipCorrected(dummyComplaintA, dummyComplaintB);
    
    // Because the old Node model returns "Unknown" if not loaded, or a valid label.
    // It should not throw.
    expect(result).toHaveProperty('relationship');
    expect(result).toHaveProperty('confidence');
  });

  it('K. old Node model still works directly', async () => {
    const result = await predictRelationship(dummyComplaintA, dummyComplaintB);
    expect(result).toHaveProperty('relationship');
  });
});
