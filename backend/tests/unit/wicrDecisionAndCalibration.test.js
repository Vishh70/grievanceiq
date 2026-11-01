/**
 * GrievanceIQ WICR Decision Service & Probability Calibration Tests (FR06)
 * =========================================================================
 * Verifies:
 * 1. Expected-loss equations:
 *      L_accept = (1 - p) * C_false_lock
 *      L_reject = p * C_missed_link
 *      L_review = C_review
 * 2. Minimum-loss action selection ('ACCEPT', 'REJECT', 'REVIEW').
 * 3. Near-tie and tie handling within tolerance (default Delta L <= 0.05).
 * 4. Strict probability validation (rejection/safe review on NaN, < 0, > 1, null).
 * 5. Cost matrix validation and parameter fallback.
 * 6. Calibration enforcement: uncalibrated scores routed to 'REVIEW'.
 * 7. Platt scaling calibration: monotonicity, bounded [0, 1], and metric reporting.
 * 8. Review queue service RPC dispatch and validation.
 */

const {
  DEFAULT_COST_MATRIX,
  DEFAULT_TOLERANCE,
  validateCostMatrix,
  evaluateWicrDecision,
  evaluateRelationshipDecision
} = require('../../src/services/wicrService');

const {
  calibrateProbability,
  getCalibrationManifest,
  isCalibratedType,
  getCalibrationMetrics
} = require('../../src/services/calibrationService');

const reviewQueueService = require('../../src/services/reviewQueueService');
const supabase = require('../../src/config/supabase');

describe('FR06: WICR Decision Service & Probability Calibration', () => {

  describe('1. Cost Matrix Validation', () => {
    it('accepts valid positive cost matrices', () => {
      const custom = { false_lock: 12.5, missed_link: 6.0, review: 1.5 };
      const res = validateCostMatrix(custom);
      expect(res.valid).toBe(true);
      expect(res.sanitized).toEqual(custom);
    });

    it('falls back to default cost matrix on non-positive or missing costs', () => {
      const invalidCases = [
        null,
        undefined,
        {},
        { false_lock: -5, missed_link: 5, review: 1 },
        { false_lock: 10, missed_link: 0, review: 1 },
        { false_lock: 10, missed_link: 5, review: NaN },
        { false_lock: 'invalid', missed_link: 5, review: 1 }
      ];

      for (const inv of invalidCases) {
        const res = validateCostMatrix(inv);
        expect(res.valid).toBe(false);
        expect(res.sanitized).toEqual(DEFAULT_COST_MATRIX);
      }
    });
  });

  describe('2. Expected Loss Computation & Minimum Loss Decision', () => {
    // Default costs: C_false_lock = 10.0, C_missed_link = 5.0, C_review = 1.0

    it('A. High confidence link (p = 0.95) selects ACCEPT', () => {
      // L_accept = (1 - 0.95) * 10 = 0.50
      // L_reject = 0.95 * 5 = 4.75
      // L_review = 1.00
      // min = 0.50 (ACCEPT), gap to second best = 1.00 - 0.50 = 0.50 > 0.05
      const res = evaluateWicrDecision({ probability: 0.95, isCalibrated: true });

      expect(res.action).toBe('ACCEPT');
      expect(res.rawAction).toBe('ACCEPT');
      expect(res.expectedLosses.accept).toBe(0.5);
      expect(res.expectedLosses.reject).toBe(4.75);
      expect(res.expectedLosses.review).toBe(1.0);
      expect(res.minLoss).toBe(0.5);
      expect(res.lossGap).toBe(0.5);
      expect(res.routedToReviewReason).toBeNull();
    });

    it('B. Low confidence link (p = 0.05) selects REJECT', () => {
      // L_accept = (1 - 0.05) * 10 = 9.50
      // L_reject = 0.05 * 5 = 0.25
      // L_review = 1.00
      // min = 0.25 (REJECT), gap to second best = 1.00 - 0.25 = 0.75 > 0.05
      const res = evaluateWicrDecision({ probability: 0.05, isCalibrated: true });

      expect(res.action).toBe('REJECT');
      expect(res.rawAction).toBe('REJECT');
      expect(res.expectedLosses.accept).toBe(9.5);
      expect(res.expectedLosses.reject).toBe(0.25);
      expect(res.expectedLosses.review).toBe(1.0);
      expect(res.minLoss).toBe(0.25);
      expect(res.lossGap).toBe(0.75);
      expect(res.routedToReviewReason).toBeNull();
    });

    it('C. Intermediate / Uncertain link (p = 0.50) selects REVIEW', () => {
      // L_accept = 0.5 * 10 = 5.00
      // L_reject = 0.5 * 5 = 2.50
      // L_review = 1.00
      // min = 1.00 (REVIEW)
      const res = evaluateWicrDecision({ probability: 0.50, isCalibrated: true });

      expect(res.action).toBe('REVIEW');
      expect(res.rawAction).toBe('REVIEW');
      expect(res.expectedLosses.accept).toBe(5.0);
      expect(res.expectedLosses.reject).toBe(2.5);
      expect(res.expectedLosses.review).toBe(1.0);
      expect(res.minLoss).toBe(1.0);
      expect(res.routedToReviewReason).toBe('MINIMUM_EXPECTED_LOSS_REVIEW');
    });
  });

  describe('3. Tolerance & Near-Tie Conservative Routing', () => {
    it('A. Near-tie near accept boundary (p = 0.903) routes to REVIEW', () => {
      // L_accept = (1 - 0.903) * 10 = 0.970
      // L_reject = 0.903 * 5 = 4.515
      // L_review = 1.000
      // Best action: ACCEPT (0.970), second: REVIEW (1.000).
      // Gap: 1.000 - 0.970 = 0.030 <= tolerance (0.05).
      // Conservative near-tie rule MUST override to REVIEW!
      const res = evaluateWicrDecision({ probability: 0.903, isCalibrated: true, tolerance: 0.05 });

      expect(res.rawAction).toBe('ACCEPT');
      expect(res.action).toBe('REVIEW');
      expect(res.routedToReviewReason).toContain('NEAR_TIE_TOLERANCE');
      expect(res.lossGap).toBeLessThanOrEqual(0.05);
    });

    it('B. Near-tie near reject boundary (p = 0.195) routes to REVIEW', () => {
      // L_accept = (1 - 0.195) * 10 = 8.05
      // L_reject = 0.195 * 5 = 0.975
      // L_review = 1.000
      // Best action: REJECT (0.975), second: REVIEW (1.000).
      // Gap: 1.000 - 0.975 = 0.025 <= 0.05.
      // Must route to REVIEW!
      const res = evaluateWicrDecision({ probability: 0.195, isCalibrated: true, tolerance: 0.05 });

      expect(res.rawAction).toBe('REJECT');
      expect(res.action).toBe('REVIEW');
      expect(res.routedToReviewReason).toContain('NEAR_TIE_TOLERANCE');
    });

    it('C. Exact tie between accept and review routes to REVIEW', () => {
      // At p = 0.90:
      // L_accept = (1 - 0.90) * 10 = 1.00
      // L_review = 1.00
      // Gap = 0.00 <= tolerance.
      const res = evaluateWicrDecision({ probability: 0.90, isCalibrated: true, tolerance: 0.05 });

      expect(res.action).toBe('REVIEW');
    });
  });

  describe('4. Strict Probability & Input Validation', () => {
    it('safely routes invalid probabilities to REVIEW with INVALID_PROBABILITY reason', () => {
      const invalidProbabilities = [
        -0.01,
        1.05,
        NaN,
        null,
        undefined,
        '0.8',
        Infinity,
        -Infinity
      ];

      for (const p of invalidProbabilities) {
        const res = evaluateWicrDecision({ probability: p, isCalibrated: true });
        expect(res.action).toBe('REVIEW');
        expect(res.routedToReviewReason).toBe('INVALID_PROBABILITY');
      }
    });

    it('routes uncalibrated probabilities to REVIEW when requireCalibration is true', () => {
      // Even with high raw score 0.95, uncalibrated score MUST NOT be accepted automatically
      const res = evaluateWicrDecision({
        probability: 0.95,
        isCalibrated: false,
        requireCalibration: true
      });

      expect(res.action).toBe('REVIEW');
      expect(res.isCalibrated).toBe(false);
      expect(res.routedToReviewReason).toBe('UNVERIFIED_OR_UNCALIBRATED_CONFIDENCE');
    });

    it('allows uncalibrated probabilities when requireCalibration is explicitly false', () => {
      const res = evaluateWicrDecision({
        probability: 0.95,
        isCalibrated: false,
        requireCalibration: false
      });

      expect(res.action).toBe('ACCEPT');
      expect(res.isCalibrated).toBe(false);
    });
  });

  describe('5. Platt Scaling Probability Calibration Service', () => {
    it('loads the empirical calibration manifest', () => {
      const manifest = getCalibrationManifest();
      expect(manifest).not.toBeNull();
      expect(manifest.model_version).toBe('1.0');
      expect(manifest.calibration_version).toBe('1.0');
      expect(manifest.calibration_labels).toHaveProperty('Duplicate');
      expect(manifest.calibration_labels).toHaveProperty('Related');
    });

    it('identifies calibrated vs uncalibrated relationship types', () => {
      expect(isCalibratedType('Duplicate')).toBe(true);
      expect(isCalibratedType('Related')).toBe(true);
      expect(isCalibratedType('Similar')).toBe(false);
      expect(isCalibratedType('Independent')).toBe(false);
      expect(isCalibratedType('Unknown')).toBe(false);
    });

    it('reports empirical validation metrics (Brier score, Log Loss, ECE)', () => {
      const metrics = getCalibrationMetrics('Duplicate');
      expect(metrics).not.toBeNull();
      expect(metrics.calibrated_metrics).toHaveProperty('brier_score');
      expect(metrics.calibrated_metrics).toHaveProperty('log_loss');
      expect(metrics.calibrated_metrics).toHaveProperty('ece');
      expect(metrics.calibrated_metrics.brier_score).toBeLessThan(0.1);
    });

    it('calibrates Duplicate probabilities monotonically within [0, 1]', () => {
      const testInputs = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
      const results = testInputs.map(p => calibrateProbability(p, 'Duplicate'));

      // Check boundedness
      for (const res of results) {
        expect(res.isCalibrated).toBe(true);
        expect(res.calibratedProbability).toBeGreaterThanOrEqual(0.0);
        expect(res.calibratedProbability).toBeLessThanOrEqual(1.0);
      }

      // Check strict monotonicity
      for (let i = 1; i < results.length; i++) {
        expect(results[i].calibratedProbability).toBeGreaterThanOrEqual(results[i - 1].calibratedProbability);
      }
    });

    it('calibrates Related probabilities monotonically within [0, 1]', () => {
      const testInputs = [0.1, 0.3, 0.5, 0.7, 0.9];
      const results = testInputs.map(p => calibrateProbability(p, 'Related'));

      for (const res of results) {
        expect(res.isCalibrated).toBe(true);
        expect(res.calibratedProbability).toBeGreaterThanOrEqual(0.0);
        expect(res.calibratedProbability).toBeLessThanOrEqual(1.0);
      }

      for (let i = 1; i < results.length; i++) {
        expect(results[i].calibratedProbability).toBeGreaterThanOrEqual(results[i - 1].calibratedProbability);
      }
    });

    it('returns isCalibrated: false for uncalibrated types without modifying probability', () => {
      const res = calibrateProbability(0.75, 'Similar');
      expect(res.isCalibrated).toBe(false);
      expect(res.calibratedProbability).toBe(0.75);
      expect(res.rawProbability).toBe(0.75);
      expect(res.method).toBe('uncalibrated');
    });

    it('rejects invalid numeric inputs gracefully', () => {
      const res = calibrateProbability(-0.5, 'Duplicate');
      expect(res.isCalibrated).toBe(false);
      expect(res.calibratedProbability).toBeNull();
      expect(res.error).toBeDefined();
    });
  });

  describe('6. End-to-End Relationship Calibration & WICR Evaluation', () => {
    it('calibrates raw Duplicate score and evaluates WICR in one call', () => {
      const rawProb = 0.90;
      const res = evaluateRelationshipDecision('Duplicate', rawProb);

      expect(res.relationshipType).toBe('Duplicate');
      expect(res.rawProbability).toBe(rawProb);
      expect(res.calibratedProbability).toBeDefined();
      expect(res.isCalibrated).toBe(true);
      expect(['ACCEPT', 'REJECT', 'REVIEW']).toContain(res.action);
      expect(res.expectedLosses).toHaveProperty('accept');
      expect(res.expectedLosses).toHaveProperty('reject');
      expect(res.expectedLosses).toHaveProperty('review');
    });

    it('routes uncalibrated relationship types through WICR to REVIEW', () => {
      const res = evaluateRelationshipDecision('Similar', 0.85);

      expect(res.relationshipType).toBe('Similar');
      expect(res.isCalibrated).toBe(false);
      expect(res.action).toBe('REVIEW');
      expect(res.routedToReviewReason).toBe('UNVERIFIED_OR_UNCALIBRATED_CONFIDENCE');
    });
  });

  describe('7. ReviewQueueService RPC Interactions', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('A. recordDecision calls PostgreSQL RPC record_wicr_decision', async () => {
      const mockRpc = jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          decision_id: '11111111-2222-3333-4444-555555555555',
          selected_action: 'REVIEW',
          review_status: 'PENDING'
        },
        error: null
      });

      const decisionData = {
        sourceComplaintId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        targetComplaintId: 'ffffffff-gggg-hhhh-iiii-jjjjjjjjjjjj',
        relationshipType: 'Related',
        rawProbability: 0.55,
        calibratedProbability: 0.52,
        isCalibrated: true,
        expectedLosses: { accept: 4.8, reject: 2.6, review: 1.0 },
        costMatrix: DEFAULT_COST_MATRIX,
        action: 'REVIEW',
        routedToReviewReason: 'MINIMUM_EXPECTED_LOSS_REVIEW'
      };

      const result = await reviewQueueService.recordDecision(decisionData);

      expect(mockRpc).toHaveBeenCalledWith('record_wicr_decision', expect.objectContaining({
        p_source_id: decisionData.sourceComplaintId,
        p_target_id: decisionData.targetComplaintId,
        p_relationship_type: 'Related',
        p_selected_action: 'REVIEW'
      }));
      expect(result.success).toBe(true);
      expect(result.review_status).toBe('PENDING');
    });

    it('B. resolveReview validates action and dispatches RPC resolve_wicr_review', async () => {
      const mockRpc = jest.spyOn(supabase, 'rpc').mockResolvedValueOnce({
        data: {
          success: true,
          decision_id: '11111111-2222-3333-4444-555555555555',
          resolved_action: 'ACCEPT',
          review_status: 'RESOLVED_ACCEPT'
        },
        error: null
      });

      const res = await reviewQueueService.resolveReview({
        decisionId: '11111111-2222-3333-4444-555555555555',
        reviewerId: '99999999-8888-7777-6666-555555555555',
        action: 'ACCEPT',
        notes: 'Confirmed ground-truth relationship after inspection'
      });

      expect(mockRpc).toHaveBeenCalledWith('resolve_wicr_review', expect.objectContaining({
        p_decision_id: '11111111-2222-3333-4444-555555555555',
        p_action: 'ACCEPT'
      }));
      expect(res.resolved_action).toBe('ACCEPT');
    });

    it('C. resolveReview throws error on invalid action', async () => {
      await expect(
        reviewQueueService.resolveReview({
          decisionId: '11111111-2222-3333-4444-555555555555',
          reviewerId: '99999999-8888-7777-6666-555555555555',
          action: 'INVALID_ACTION'
        })
      ).rejects.toThrow(/Invalid resolution action/);
    });
  });

});

