/**
 * GrievanceIQ Probability Calibration Service (FR06)
 * ===================================================
 * Implements Platt scaling (univariate logistic regression) to transform
 * raw ensemble tree-vote scores into empirically calibrated posterior
 * probabilities on held-out validation pairs.
 * 
 * Uncalibrated probabilities are strictly flagged as `isCalibrated: false`
 * and must not be treated as calibrated likelihoods by downstream deciders.
 */

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '../../ml/models/relationship_calibration_manifest.json');

let calibrationManifest = null;

function loadCalibrationManifest() {
  try {
    if (fs.existsSync(MANIFEST_PATH)) {
      const data = fs.readFileSync(MANIFEST_PATH, 'utf8');
      calibrationManifest = JSON.parse(data);
      return calibrationManifest;
    }
  } catch (err) {
    console.warn(`[CalibrationService] Warning: Could not read calibration manifest (${err.message}). Defaulting to uncalibrated.`);
  }
  return null;
}

// Initial load
loadCalibrationManifest();

/**
 * Returns the currently loaded calibration manifest.
 */
function getCalibrationManifest() {
  if (!calibrationManifest) {
    loadCalibrationManifest();
  }
  return calibrationManifest;
}

/**
 * Checks if a specific relationship type has an empirical calibrator.
 * @param {string} relationshipType 
 * @returns {boolean}
 */
function isCalibratedType(relationshipType) {
  const manifest = getCalibrationManifest();
  if (!manifest || !manifest.calibration_labels) return false;
  return Boolean(manifest.calibration_labels[relationshipType]);
}

/**
 * Retrieves empirical calibration metrics (Brier score, Log Loss, ECE).
 * @param {string} relationshipType 
 * @returns {object|null}
 */
function getCalibrationMetrics(relationshipType) {
  const manifest = getCalibrationManifest();
  if (!manifest || !manifest.calibration_labels || !manifest.calibration_labels[relationshipType]) {
    return null;
  }
  return manifest.calibration_labels[relationshipType];
}

/**
 * Calibrates a raw probability score for a given relationship type using Platt scaling sigmoid:
 *   P(y=1 | s) = 1 / (1 + exp(-(coef * s + intercept)))
 * 
 * @param {number} rawProbability - Raw tree-vote or confidence score in [0, 1]
 * @param {string} relationshipType - 'Duplicate' | 'Related' | 'Similar' | 'Independent'
 * @returns {object} Calibration result
 */
function calibrateProbability(rawProbability, relationshipType) {
  // 1. Strict numeric validation
  if (
    typeof rawProbability !== 'number' ||
    !Number.isFinite(rawProbability) ||
    rawProbability < 0 ||
    rawProbability > 1
  ) {
    return {
      isCalibrated: false,
      calibratedProbability: null,
      rawProbability,
      relationshipType,
      error: 'Invalid probability: must be a finite number between 0 and 1.',
      method: null,
      calibrationVersion: null
    };
  }

  const manifest = getCalibrationManifest();
  const calConfig = manifest && manifest.calibration_labels ? manifest.calibration_labels[relationshipType] : null;

  // 2. If no calibrator exists for this type, pass through raw with isCalibrated: false
  if (!calConfig || typeof calConfig.coef !== 'number' || typeof calConfig.intercept !== 'number') {
    return {
      isCalibrated: false,
      calibratedProbability: rawProbability,
      rawProbability,
      relationshipType,
      method: 'uncalibrated',
      modelVersion: manifest ? manifest.model_version : '1.0',
      calibrationVersion: null,
      metrics: null
    };
  }

  // 3. Apply Platt scaling logistic sigmoid
  const logit = (calConfig.coef * rawProbability) + calConfig.intercept;
  const calibrated = 1.0 / (1.0 + Math.exp(-logit));
  const roundedCalibrated = parseFloat(calibrated.toFixed(4));

  return {
    isCalibrated: true,
    calibratedProbability: roundedCalibrated,
    rawProbability,
    relationshipType,
    method: manifest.calibration_method || 'Platt Scaling (Univariate Logistic Regression)',
    modelVersion: manifest.model_version || '1.0',
    calibrationVersion: manifest.calibration_version || '1.0',
    metrics: calConfig.calibrated_metrics || null
  };
}

module.exports = {
  getCalibrationManifest,
  isCalibratedType,
  getCalibrationMetrics,
  calibrateProbability,
  loadCalibrationManifest
};

