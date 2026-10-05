const { cosineSimilarity } = require('../services/embeddingService');
const {
  haversineDistance,
  normalizeLocationScore,
  normalizeTemporalScore,
  timeDifferenceHours,
  scoreCandidate,
} = require('../services/duplicateDetectionService');

const CATEGORIES = [
  'Roads',
  'Water Supply',
  'Electricity',
  'Drainage',
  'Waste Management',
  'Public Infrastructure',
  'Other',
];

/**
 * Multi-hot encodes an array of fine-grained issue types into the 7 canonical categories.
 */
function multiHotCategory(issueTypes) {
  if (!Array.isArray(issueTypes) || issueTypes.length === 0) {
    issueTypes = ['Other'];
  }
  
  const vec = new Array(CATEGORIES.length).fill(0);
  
  issueTypes.forEach(cat => {
    const c = cat || 'Other';
    let canonical = 'Other';
    const lower = c.toLowerCase();
    
    if (lower.includes('road') || lower.includes('pothole')) canonical = 'Roads';
    else if (lower.includes('water') || lower.includes('pipeline') || lower.includes('leak')) canonical = 'Water Supply';
    else if (lower.includes('electric') || lower.includes('power') || lower.includes('light')) canonical = 'Electricity';
    else if (lower.includes('drain') || lower.includes('sewage')) canonical = 'Drainage';
    else if (lower.includes('garbage') || lower.includes('waste') || lower.includes('trash')) canonical = 'Waste Management';
    else if (lower.includes('public') || lower.includes('safety') || lower.includes('hazard') || lower.includes('tree')) canonical = 'Public Infrastructure';
    else if (CATEGORIES.includes(c)) canonical = c;
    
    const idx = CATEGORIES.indexOf(canonical);
    if (idx !== -1) vec[idx] = 1;
  });
  
  if (!vec.some(v => v === 1)) {
    vec[CATEGORIES.indexOf('Other')] = 1;
  }
  
  return vec;
}

/**
 * Extracts corrected feature vector (multi-hot encoded categories).
 */
function extractCorrectedRelationshipFeatures(complaintA, complaintB) {
  let semanticSimilarity = 0;
  const embA = complaintA.embedding_vector;
  const embB = complaintB.embedding_vector;
  if (Array.isArray(embA) && embA.length > 0 && Array.isArray(embB) && embB.length > 0) {
    semanticSimilarity = cosineSimilarity(embA, embB);
  }

  let locationScore = 0;
  const latA = complaintA.location_lat;
  const lngA = complaintA.location_lng;
  const latB = complaintB.location_lat;
  const lngB = complaintB.location_lng;
  if (latA != null && lngA != null && latB != null && lngB != null) {
    const dist = haversineDistance(Number(latA), Number(lngA), Number(latB), Number(lngB));
    locationScore = normalizeLocationScore(dist);
  }

  let temporalScore = 0;
  if (complaintA.created_at && complaintB.created_at) {
    const diffHours = timeDifferenceHours(complaintA.created_at, complaintB.created_at);
    temporalScore = normalizeTemporalScore(diffHours);
  }

  let duplicateScore = 0;
  let duplicateFlag = 0;
  try {
    const pseudoNew = {
      embedding_vector: embA || [],
      location_lat: latA,
      location_lng: lngA,
      created_at: complaintA.created_at || new Date().toISOString(),
    };
    const pseudoCand = {
      id: 'phase2-pseudo',
      embedding_vector: embB || [],
      location_lat: latB,
      location_lng: lngB,
      created_at: complaintB.created_at || new Date().toISOString(),
      similar_group_id: null,
    };
    const phase2Result = scoreCandidate(pseudoNew, pseudoCand);
    duplicateScore = phase2Result.duplicateScore;
    duplicateFlag = phase2Result.isDuplicate ? 1 : 0;
  } catch (_) {}

  const catA = complaintA.category || 'Other';
  const catB = complaintB.category || 'Other';
  
  const typesA = complaintA.ml_labels && complaintA.ml_labels.length > 0 ? complaintA.ml_labels : [catA];
  const typesB = complaintB.ml_labels && complaintB.ml_labels.length > 0 ? complaintB.ml_labels : [catB];

  const catAVec = multiHotCategory(typesA);
  const catBVec = multiHotCategory(typesB);

  const sameCategory = catAVec.some((v, i) => v === 1 && catBVec[i] === 1) ? 1 : 0;

  return [
    semanticSimilarity,
    locationScore,
    temporalScore,
    duplicateScore,
    duplicateFlag,
    sameCategory,
    ...catAVec,
    ...catBVec,
  ];
}

function getFeatureNames() {
  const catFeaturesA = CATEGORIES.map(c => `category_a_${c.replace(/\s+/g, '_')}`);
  const catFeaturesB = CATEGORIES.map(c => `category_b_${c.replace(/\s+/g, '_')}`);
  return [
    'semantic_similarity',
    'location_score',
    'temporal_score',
    'duplicate_score',
    'duplicate_flag',
    'same_category',
    ...catFeaturesA,
    ...catFeaturesB,
  ];
}

module.exports = {
  CATEGORIES,
  multiHotCategory,
  extractCorrectedRelationshipFeatures,
  getFeatureNames,
};
