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

// ── Label → Department Mapping ────────────────────────────────────────────────
// Maps the 9 binary flags from the multilabel model to the department
// names used by the existing routing_rules.json system.

const LABEL_TO_DEPARTMENT = {
  road_damage_flag:       'Roads & Transport',
  roadside_flooding_flag: 'Drainage',
  water_leakage_flag:     'Water Supply',
  electric_pole_flag:     'Electricity',
  streetlight_flag:       'Electricity',
  traffic_signal_flag:    'Roads & Transport',
  garbage_flag:           'Waste Management',
  tree_hazard_flag:       'Public Infrastructure',
  drainage_flag:          'Drainage',
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
    return res.status === 200;
  } catch {
    return false;
  }
}

// ── Multi-Label Prediction ────────────────────────────────────────────────────

/**
 * Sends a 384-dim embedding to the Python ML service and returns
 * the predicted issue labels and their per-label probabilities.
 *
 * Falls back gracefully if the Python service is not running —
 * in that case, the rest of the pipeline (Gemini routing) continues
 * without the multi-label flags.
 *
 * @param {number[]} embedding - 384-dimensional MiniLM embedding array
 * @param {string} [text] - Optional original complaint text (for logging)
 * @returns {Promise<{
 *   labels: string[],            // Active issue flags
 *   probabilities: object,       // Per-label probabilities
 *   departments: string[],       // Derived department names (de-duped)
 *   serviceAvailable: boolean
 * }>}
 */
async function predictIssueLabels(embedding, text = '') {
  const fallback = {
    labels: [],
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

    const { labels = [], probabilities = {} } = response.data;

    // Derive unique department names from active labels
    const departments = [
      ...new Set(
        labels
          .map(l => LABEL_TO_DEPARTMENT[l])
          .filter(Boolean)
      )
    ];

    return {
      labels,
      probabilities,
      departments,
      serviceAvailable: true,
    };
  } catch (err) {
    // Python service is not running — degrade gracefully
    // The existing Gemini + routing system will handle the request
    console.warn(
      '[mlService] Python ML service unavailable, skipping multi-label prediction:',
      err.code || err.message
    );
    return fallback;
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
  LABEL_TO_DEPARTMENT,
  LABEL_DESCRIPTIONS,
  ML_SERVICE_URL,
};
