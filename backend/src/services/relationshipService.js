// src/services/relationshipService.js
// Phase 3: Relationship Classification — Inference Service
//
// Classifies a pair of complaints into one of:
//   Duplicate | Similar | Related | Independent
//
// Uses a trained Random Forest model on features from Phase 1 (embeddings)
// and Phase 2 (duplicate scoring).
//
// Phase 4 additions:
// - Incorporates empirical Platt probability calibration (calibrationService)
// - Integrates WICR expected loss evaluation (wicrService)

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
const { calibrateProbability } = require('./calibrationService');
const { evaluateRelationshipDecision } = require('./wicrService');

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

let ML_SERVICE_URL = process.env.ML_SERVICE_URL;
let ML_SERVICE_STATUS = 'VERIFIED';
if (!ML_SERVICE_URL || !ML_SERVICE_URL.startsWith('http')) {
  if (process.env.NODE_ENV === 'production') {
    console.warn(`⚠️ ML_SERVICE_URL is missing or invalid: "${ML_SERVICE_URL}". Disabling external ML service for relationships.`);
    ML_SERVICE_STATUS = 'NOT_VERIFIED';
    ML_SERVICE_URL = ''; // Clear to prevent axios crash
  } else {
    ML_SERVICE_URL = 'http://localhost:5001';
  }
} else {
  // Ensure no trailing slash
  ML_SERVICE_URL = ML_SERVICE_URL.replace(/\/$/, '');
}

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

  if (ML_SERVICE_STATUS === 'NOT_VERIFIED') {
    return {
      relationship: 'Unknown',
      confidence: 0,
      calibrated_confidence: 0,
      probabilities: {},
      raw_probabilities: {},
      calibrated_probabilities: {},
      is_calibrated: false,
      features: featureSummary,
      status: 'not_verified',
      message: 'External ML service could not be verified in the current environment.'
    };
  }

  try {
    const headers = {};
    if (process.env.ML_SERVICE_SECRET) {
      headers['Authorization'] = `Bearer ${process.env.ML_SERVICE_SECRET}`;
    }

    const response = await axios.post(`${ML_SERVICE_URL}/predict-relationship`, { features }, { timeout: 3000, headers });
    console.log('[RELATIONSHIP MODEL] corrected-python');

    const rel = response.data.relationship;
    const rawProbs = response.data.raw_probabilities || response.data.probabilities || {};
    const rawConfidence = response.data.probabilities ? response.data.probabilities[rel] || 1.0 : 1.0;

    // Check if Python response already supplied calibration; otherwise calibrate locally
    let calibratedProbs = response.data.calibrated_probabilities;
    let isCalibrated = Boolean(response.data.is_calibrated);

    if (!calibratedProbs && rawProbs) {
      calibratedProbs = {};
      for (const [key, val] of Object.entries(rawProbs)) {
        const cal = calibrateProbability(val, key);
        calibratedProbs[key] = cal.isCalibrated ? cal.calibratedProbability : val;
        if (key === rel && cal.isCalibrated) {
          isCalibrated = true;
        }
      }
    }

    const calibratedConfidence = (calibratedProbs && calibratedProbs[rel] !== undefined)
      ? calibratedProbs[rel]
      : rawConfidence;

    return {
      relationship: rel,
      confidence: rawConfidence,
      calibrated_confidence: calibratedConfidence,
      probabilities: response.data.probabilities || {},
      raw_probabilities: rawProbs,
      calibrated_probabilities: calibratedProbs || {},
      is_calibrated: isCalibrated,
      features: featureSummary,
    };
  } catch (err) {
    console.error(`[RELATIONSHIP MODEL] Python service unavailable (${err.message}).`);
    throw new Error(`Relationship model service unavailable: ${err.message}`);
  }
}

/**
 * Main entry point for relationship prediction.
 * Routes to the corrected Python ML service.
 */
async function predictRelationship(complaintA, complaintB) {
  return predictRelationshipCorrected(complaintA, complaintB);
}

/**
 * Evaluates relationship prediction with the WICR decision engine (FR06).
 * Computes minimum expected loss over calibrated probabilities.
 * 
 * @param {object} complaintA 
 * @param {object} complaintB 
 * @param {object} [options]
 * @returns {Promise<object>} Combined inference and WICR decision result
 */
async function evaluateRelationshipWicr(complaintA, complaintB, options = {}) {
  const inference = await predictRelationshipCorrected(complaintA, complaintB);
  const rawProb = inference.confidence;
  const wicrResult = evaluateRelationshipDecision(inference.relationship, rawProb, options);

  return {
    ...inference,
    wicr: wicrResult
  };
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
  evaluateRelationshipWicr,
};
