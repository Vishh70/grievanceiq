/**
 * GrievanceIQ WICR Decision Service (FR06)
 * =========================================
 * Implements the Weighted Incident & Causality Resolution (WICR) decision engine
 * using expected loss minimization over calibrated relationship probabilities.
 * 
 * Expected Loss Equations:
 *   L_accept = (1 - p) * C_false_lock
 *   L_reject = p * C_missed_link
 *   L_review = C_review
 * 
 * Actions:
 *   - 'ACCEPT': Minimum loss is L_accept (outside near-tie tolerance)
 *   - 'REJECT': Minimum loss is L_reject (outside near-tie tolerance)
 *   - 'REVIEW': Minimum loss is L_review, OR near-tie within tolerance, OR uncalibrated/invalid p
 */

const { calibrateProbability } = require('./calibrationService');

const DEFAULT_COST_MATRIX = Object.freeze({
  false_lock: 10.0,
  missed_link: 5.0,
  review: 1.0
});

const DEFAULT_TOLERANCE = 0.05;
const POLICY_VERSION = '1.0';

/**
 * Validates a cost matrix ensuring all costs are positive finite numbers.
 * @param {object} costMatrix 
 * @returns {{ valid: boolean, sanitized: object }}
 */
function validateCostMatrix(costMatrix) {
  if (!costMatrix || typeof costMatrix !== 'object') {
    return { valid: false, sanitized: { ...DEFAULT_COST_MATRIX } };
  }
  const false_lock = Number(costMatrix.false_lock);
  const missed_link = Number(costMatrix.missed_link);
  const review = Number(costMatrix.review);

  if (
    !Number.isFinite(false_lock) || false_lock <= 0 ||
    !Number.isFinite(missed_link) || missed_link <= 0 ||
    !Number.isFinite(review) || review <= 0
  ) {
    return { valid: false, sanitized: { ...DEFAULT_COST_MATRIX } };
  }

  return {
    valid: true,
    sanitized: { false_lock, missed_link, review }
  };
}

/**
 * Core WICR Decision Engine.
 * Evaluates the 3 expected-loss equations and selects optimal action.
 * 
 * @param {object} params
 * @param {number} params.probability - Calibrated probability p in [0, 1]
 * @param {boolean} [params.isCalibrated=true] - Whether the probability has empirical calibration
 * @param {object} [params.costMatrix] - { false_lock, missed_link, review }
 * @param {number} [params.tolerance=0.05] - Near-tie tolerance delta L
 * @param {boolean} [params.requireCalibration=true] - Whether uncalibrated scores force REVIEW
 * @param {object} [params.metadata] - Optional arbitrary tracking metadata
 * @returns {object} Decision result
 */
function evaluateWicrDecision({
  probability,
  isCalibrated = true,
  costMatrix = DEFAULT_COST_MATRIX,
  tolerance = DEFAULT_TOLERANCE,
  requireCalibration = true,
  metadata = {}
}) {
  const costValidation = validateCostMatrix(costMatrix);
  const costs = costValidation.sanitized;
  const tol = (typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance >= 0)
    ? tolerance
    : DEFAULT_TOLERANCE;

  // 1. Validate Probability
  if (
    typeof probability !== 'number' ||
    !Number.isFinite(probability) ||
    probability < 0 ||
    probability > 1
  ) {
    return {
      action: 'REVIEW',
      rawAction: 'REVIEW',
      probability,
      isCalibrated: false,
      expectedLosses: {
        accept: null,
        reject: null,
        review: costs.review
      },
      costMatrix: costs,
      minLoss: costs.review,
      lossGap: 0,
      tolerance: tol,
      routedToReviewReason: 'INVALID_PROBABILITY',
      modelVersion: metadata.modelVersion || '1.0',
      calibrationVersion: metadata.calibrationVersion || null,
      policyVersion: POLICY_VERSION,
      metadata
    };
  }

  // 2. Enforce Probability Calibration Requirement
  if (requireCalibration && !isCalibrated) {
    const lAccept = parseFloat(((1.0 - probability) * costs.false_lock).toFixed(4));
    const lReject = parseFloat((probability * costs.missed_link).toFixed(4));
    const lReview = parseFloat(costs.review.toFixed(4));

    return {
      action: 'REVIEW',
      rawAction: 'REVIEW',
      probability,
      isCalibrated: false,
      expectedLosses: {
        accept: lAccept,
        reject: lReject,
        review: lReview
      },
      costMatrix: costs,
      minLoss: lReview,
      lossGap: 0,
      tolerance: tol,
      routedToReviewReason: 'UNVERIFIED_OR_UNCALIBRATED_CONFIDENCE',
      modelVersion: metadata.modelVersion || '1.0',
      calibrationVersion: null,
      policyVersion: POLICY_VERSION,
      metadata
    };
  }

  // 3. Compute Expected Loss for all three actions
  // L_accept = (1 - p) * C_false_lock
  // L_reject = p * C_missed_link
  // L_review = C_review
  const lAccept = (1.0 - probability) * costs.false_lock;
  const lReject = probability * costs.missed_link;
  const lReview = costs.review;

  const actions = [
    { name: 'ACCEPT', loss: lAccept },
    { name: 'REJECT', loss: lReject },
    { name: 'REVIEW', loss: lReview }
  ];

  // Sort by loss ascending
  actions.sort((a, b) => a.loss - b.loss);

  const bestAction = actions[0];
  const secondAction = actions[1];
  const lossGap = parseFloat((secondAction.loss - bestAction.loss).toFixed(4));

  let finalAction = bestAction.name;
  let routedReason = null;

  // 4. Near-Tie / Ambiguity Rule:
  // If the best action is not REVIEW, but the difference to another action is within tolerance,
  // route conservatively to REVIEW to prevent catastrophic erroneous automated actions.
  if (bestAction.name !== 'REVIEW' && lossGap <= tol) {
    finalAction = 'REVIEW';
    routedReason = `NEAR_TIE_TOLERANCE (gap: ${lossGap} <= ${tol} between ${bestAction.name} and ${secondAction.name})`;
  } else if (bestAction.name === 'REVIEW') {
    routedReason = 'MINIMUM_EXPECTED_LOSS_REVIEW';
  }

  return {
    action: finalAction,
    rawAction: bestAction.name,
    probability,
    isCalibrated: Boolean(isCalibrated),
    expectedLosses: {
      accept: parseFloat(lAccept.toFixed(4)),
      reject: parseFloat(lReject.toFixed(4)),
      review: parseFloat(lReview.toFixed(4))
    },
    costMatrix: costs,
    minLoss: parseFloat(bestAction.loss.toFixed(4)),
    lossGap,
    tolerance: tol,
    routedToReviewReason: routedReason,
    modelVersion: metadata.modelVersion || '1.0',
    calibrationVersion: metadata.calibrationVersion || '1.0',
    policyVersion: POLICY_VERSION,
    metadata
  };
}

/**
 * End-to-end evaluation helper that takes a relationship type and raw probability,
 * performs Platt calibration, and evaluates the WICR decision.
 * 
 * @param {string} relationshipType - 'Duplicate' | 'Related' etc.
 * @param {number} rawProbability - Raw RF tree-vote score
 * @param {object} [options]
 * @returns {object} Full calibration and WICR decision payload
 */
function evaluateRelationshipDecision(relationshipType, rawProbability, options = {}) {
  const calResult = calibrateProbability(rawProbability, relationshipType);

  const wicrResult = evaluateWicrDecision({
    probability: calResult.isCalibrated ? calResult.calibratedProbability : rawProbability,
    isCalibrated: calResult.isCalibrated,
    costMatrix: options.costMatrix || DEFAULT_COST_MATRIX,
    tolerance: options.tolerance || DEFAULT_TOLERANCE,
    requireCalibration: options.requireCalibration !== undefined ? options.requireCalibration : true,
    metadata: {
      relationshipType,
      rawProbability,
      calibratedProbability: calResult.calibratedProbability,
      calibrationMethod: calResult.method,
      calibrationVersion: calResult.calibrationVersion,
      modelVersion: calResult.modelVersion,
      ...options.metadata
    }
  });

  return {
    ...wicrResult,
    relationshipType,
    rawProbability,
    calibratedProbability: calResult.calibratedProbability,
    calibrationDetails: calResult
  };
}

module.exports = {
  DEFAULT_COST_MATRIX,
  DEFAULT_TOLERANCE,
  POLICY_VERSION,
  validateCostMatrix,
  evaluateWicrDecision,
  evaluateRelationshipDecision
};

