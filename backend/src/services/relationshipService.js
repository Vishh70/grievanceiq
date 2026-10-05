// src/services/relationshipService.js
// Phase 3: Relationship Classification — Inference Service
//
// Classifies a pair of complaints into one of:
//   Duplicate | Similar | Related | Independent
//
// Uses a trained Random Forest model on features from Phase 1 (embeddings)
// and Phase 2 (duplicate scoring).

const path = require('path');
const fs = require('fs');
const axios = require('axios');
const { generateEmbedding, cosineSimilarity } = require('./embeddingService');
const {
  haversineDistance,
  normalizeLocationScore,
  normalizeTemporalScore,
  timeDifferenceHours,
  scoreCandidate,
  DUPLICATE_CONFIG,
} = require('./duplicateDetectionService');

// ── Constants ───────────────────────────────────────────────────────────────

const RELATIONSHIP_LABELS = ['Duplicate', 'Similar', 'Related', 'Independent'];

// Configuration for model provider
const RELATIONSHIP_MODEL_PROVIDER = process.env.RELATIONSHIP_MODEL_PROVIDER || 'corrected-python';

const {
  CATEGORIES,
  multiHotCategory,
  extractCorrectedRelationshipFeatures,
  getFeatureNames,
} = require('../utils/relationshipFeatures');

// ── Feature Extraction ──────────────────────────────────────────────────────

// ── Public API ──────────────────────────────────────────────────────────────

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';

/**
 * Predicts the relationship between two complaints using the corrected Python model.
 * Falls back to the old Node model if Python is offline.
 */
async function predictRelationshipCorrected(complaintA, complaintB) {
  const a = { ...complaintA };
  const b = { ...complaintB };

  if ((!a.embedding_vector || a.embedding_vector.length === 0) && a.text) {
    try {
      a.embedding_vector = await generateEmbedding(a.text);
    } catch (_) {
      a.embedding_vector = [];
    }
  }

  if ((!b.embedding_vector || b.embedding_vector.length === 0) && b.text) {
    try {
      b.embedding_vector = await generateEmbedding(b.text);
    } catch (_) {
      b.embedding_vector = [];
    }
  }

  const features = extractCorrectedRelationshipFeatures(a, b);
  
  const featureNames = getFeatureNames();
  const featureSummary = {};
  featureNames.forEach((name, i) => {
    featureSummary[name] = Number(features[i].toFixed(4));
  });

  try {
    const response = await axios.post(`${ML_SERVICE_URL}/predict-relationship`, { features }, { timeout: 3000 });
    console.log('[RELATIONSHIP MODEL] corrected-python');

    return {
      relationship: response.data.relationship,
      confidence: response.data.probabilities ? response.data.probabilities[response.data.relationship] || 1.0 : 1.0,
      probabilities: response.data.probabilities || {},
      features: featureSummary,
    };
  } catch (err) {
    console.warn(`[RELATIONSHIP MODEL] Python service unavailable (${err.message}).`);
    return {
      relationship: 'UNKNOWN',
      confidence: 0.0,
      probabilities: {},
      features: featureSummary,
      error: 'Relationship model service unavailable'
    };
  }
}

/**
 * Main entry point for relationship prediction.
 * Routes to the corrected Python ML service.
 */
async function predictRelationship(complaintA, complaintB) {
  return predictRelationshipCorrected(complaintA, complaintB);
}

module.exports = {
  // Constants
  RELATIONSHIP_LABELS,
  CATEGORIES,

  // Functions
  multiHotCategory,
  extractCorrectedRelationshipFeatures,
  getFeatureNames,
  predictRelationship,
  predictRelationshipCorrected,
};
