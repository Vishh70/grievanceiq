// src/services/mlService.js
// GrievanceIQ — Node.js Client for the Python ML Inference Service
//
// The Python service (backend/ml/inference/grievanceiq_inference.py)
// loads the trained multilabel_classifier.joblib and exposes it on
// http://localhost:5001 (configurable via ML_SERVICE_URL env var).
//
// This module is called AFTER Gemini has already produced a
// primary category and priority, so the labels returned here
// supplement — they do not replace — the Gemini result.

const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:5001';
const ML_SERVICE_TIMEOUT_MS = 8000;

// ── Label → Canonical Mappings ───────────────────────────────────────────────
// Maps the 9 binary flags from the multilabel model to the canonical
// issue types and department names used by routing_rules.json.

const LABEL_TO_ISSUE_TYPE = {
  road_damage_flag:       'Road Damage',
  roadside_flooding_flag: 'Roadside Flooding',
  water_leakage_flag:     'Water Leakage',
  electric_pole_flag:     'Electric Pole',
  streetlight_flag:       'Streetlight',
  traffic_signal_flag:    'Traffic Signal',
  garbage_flag:           'Garbage',
  tree_hazard_flag:       'Tree Hazard',
  drainage_flag:          'Drainage',
};

const LABEL_TO_DEPARTMENT = {
  road_damage_flag:       'Road Department',
  roadside_flooding_flag: 'Drainage Department',
  water_leakage_flag:     'Water Department',
  electric_pole_flag:     'Electricity Department',
  streetlight_flag:       'Electricity Department',
  traffic_signal_flag:    'Traffic Department',
  garbage_flag:           'Sanitation Department',
  tree_hazard_flag:       'Garden Department',
  drainage_flag:          'Drainage Department',
};

// ── Health Check ─────────────────────────────────────────────────────────────

/**
 * Checks whether the Python ML inference service is reachable.
 * @returns {Promise<boolean>}
 */
async function isMLServiceAvailable() {
  try {
    const res = await axios.get(`${ML_SERVICE_URL}/health`, {
      timeout: 2000
    });
    return res.status === 200 && res.data.model_loaded === true;
  } catch {
    return false;
  }
}

// ── Multi-Label Prediction ────────────────────────────────────────────────────

/**
 * Sends a 384-dim embedding to the Python ML service and returns
 * the predicted issue labels and their per-label probabilities.
 *
 * @param {number[]} embedding - 384-dimensional MiniLM embedding array
 * @param {string} [text] - Optional original complaint text (for logging)
 * @returns {Promise<{
 *   labels: string[],            // Active ML flags
 *   issueTypes: string[],        // Derived canonical issue types
 *   probabilities: object,       // Per-label probabilities
 *   departments: string[],       // Derived canonical department names
 *   serviceAvailable: boolean
 * }>}
 */
async function predictIssueLabels(embedding, text = '') {
  const fallback = {
    labels: [],
    issueTypes: [],
    probabilities: {},
    departments: [],
    serviceAvailable: false,
  };

  if (!embedding || embedding.length !== 384) {
    return fallback;
  }

  try {
    const response = await axios.post(
      `${ML_SERVICE_URL}/predict`,
      { embedding, text },
      { timeout: ML_SERVICE_TIMEOUT_MS }
    );

    if (response.data.model_loaded !== true) {
        throw new Error('Model not loaded on inference server');
    }

    const { labels = [], probabilities = {} } = response.data;
    
    if (!Array.isArray(labels)) {
        throw new Error('Expected labels array from Python service');
    }

    // Derive canonical application issue types
    const issueTypes = [
      ...new Set(
        labels
          .map(l => LABEL_TO_ISSUE_TYPE[l])
          .filter(Boolean)
      )
    ];

    // Derive canonical department names
    const departments = [
      ...new Set(
        labels
          .map(l => LABEL_TO_DEPARTMENT[l])
          .filter(Boolean)
      )
    ];

    return {
      labels,
      issueTypes,
      probabilities,
      departments,
      serviceAvailable: true,
    };
  } catch (err) {
    console.error(
      '[ML] trained multi-label model unavailable:',
      err.code || err.message
    );
    throw new Error(`ML Service unavailable: ${err.message}`);
  }
}

// ── Label Descriptions (for UI / viva) ───────────────────────────────────────

const LABEL_DESCRIPTIONS = {
  road_damage_flag:       'Road surface damage (potholes, cracks)',
  roadside_flooding_flag: 'Roadside or surface flooding',
  water_leakage_flag:     'Water pipeline leakage',
  electric_pole_flag:     'Electric pole damage or hazard',
  streetlight_flag:       'Streetlight outage or damage',
  traffic_signal_flag:    'Traffic signal malfunction',
  garbage_flag:           'Uncollected garbage or waste',
  tree_hazard_flag:       'Fallen or hazardous tree',
  drainage_flag:          'Drainage blockage or overflow',
};

module.exports = {
  predictIssueLabels,
  isMLServiceAvailable,
  LABEL_TO_ISSUE_TYPE,
  LABEL_TO_DEPARTMENT,
  LABEL_DESCRIPTIONS,
  ML_SERVICE_URL,
};
