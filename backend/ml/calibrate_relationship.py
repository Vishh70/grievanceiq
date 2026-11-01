# backend/ml/calibrate_relationship.py
"""
Calibration Script for GrievanceIQ Relationship Classifier.
Fits Platt scaling (Logistic Regression) on held-out validation pairs
and evaluates on held-out test pairs using issue-level non-overlapping splits.
Evaluates Brier Score, Log Loss, and Expected Calibration Error (ECE).
Outputs calibration manifest and model parameters.
"""

import os
import json
import numpy as np
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import brier_score_loss, log_loss

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FEATURES_DATA = os.path.join(BASE_DIR, '..', 'data', 'relationship_features.json')
MODEL_PATH = os.path.join(BASE_DIR, 'models', 'relationship_corrected_rf_10tree.joblib')
OUTPUT_MANIFEST = os.path.join(BASE_DIR, 'models', 'relationship_calibration_manifest.json')
OUTPUT_CALIBRATOR = os.path.join(BASE_DIR, 'models', 'relationship_calibrator.joblib')

def compute_ece(y_true, y_prob, n_bins=10):
    bin_edges = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    n = len(y_true)
    for i in range(n_bins):
        in_bin = (y_prob >= bin_edges[i]) & (y_prob < bin_edges[i+1] if i < n_bins - 1 else y_prob <= bin_edges[i+1])
        bin_size = np.sum(in_bin)
        if bin_size > 0:
            bin_acc = np.mean(y_true[in_bin])
            bin_conf = np.mean(y_prob[in_bin])
            ece += (bin_size / n) * abs(bin_acc - bin_conf)
    return float(ece)

def main():
    print("=" * 60)
    print("  GrievanceIQ — Probability Calibration (Platt Scaling)")
    print("  Evaluating Brier Score, Log Loss, and ECE on Held-out Data")
    print("=" * 60)

    with open(FEATURES_DATA, 'r') as f:
        data = json.load(f)

    # Issue-level non-overlapping split (seed 42, 60/20/20)
    unique_issues = sorted(list(set(r['issue_id_a'] for r in data) | set(r['issue_id_b'] for r in data)))
    np.random.seed(42)
    np.random.shuffle(unique_issues)
    n = len(unique_issues)
    train_end = int(0.6 * n)
    val_end = int(0.8 * n)

    train_issues = set(unique_issues[:train_end])
    val_issues = set(unique_issues[train_end:val_end])
    test_issues = set(unique_issues[val_end:])

    val_data = [r for r in data if r['issue_id_a'] in val_issues and r['issue_id_b'] in val_issues]
    test_data = [r for r in data if r['issue_id_a'] in test_issues and r['issue_id_b'] in test_issues]

    print(f"Validation pairs: {len(val_data)}, Test pairs: {len(test_data)}")

    rf = joblib.load(MODEL_PATH)
    label_map = {'Duplicate': 0, 'Similar': 1, 'Related': 2, 'Independent': 3}

    X_val = np.array([r['features'] for r in val_data], dtype=np.float32)
    y_val = np.array([label_map[r['label']] for r in val_data])
    X_test = np.array([r['features'] for r in test_data], dtype=np.float32)
    y_test = np.array([label_map[r['label']] for r in test_data])

    raw_val_probs = rf.predict_proba(X_val)
    raw_test_probs = rf.predict_proba(X_test)

    eps = 1e-5
    calibration_results = {}
    calibrators = {}

    for label_name, idx in [('Duplicate', 0), ('Related', 2)]:
        y_val_bin = (y_val == idx).astype(int)
        y_test_bin = (y_test == idx).astype(int)

        p_val_raw = raw_val_probs[:, idx]
        p_test_raw = raw_test_probs[:, idx]

        val_feat = np.clip(p_val_raw, eps, 1 - eps).reshape(-1, 1)
        test_feat = np.clip(p_test_raw, eps, 1 - eps).reshape(-1, 1)

        # Fit Platt Scaling (univariate logistic regression on raw probability)
        calibrator = LogisticRegression(C=1.0, solver='lbfgs', random_state=42)
        calibrator.fit(val_feat, y_val_bin)
        calibrators[label_name] = calibrator

        p_test_cal = calibrator.predict_proba(test_feat)[:, 1]

        brier_raw = float(brier_score_loss(y_test_bin, p_test_raw))
        brier_cal = float(brier_score_loss(y_test_bin, p_test_cal))
        ll_raw = float(log_loss(y_test_bin, np.clip(p_test_raw, eps, 1 - eps)))
        ll_cal = float(log_loss(y_test_bin, p_test_cal))
        ece_raw = compute_ece(y_test_bin, p_test_raw)
        ece_cal = compute_ece(y_test_bin, p_test_cal)

        coef = float(calibrator.coef_[0][0])
        intercept = float(calibrator.intercept_[0])

        calibration_results[label_name] = {
            "coef": coef,
            "intercept": intercept,
            "raw_metrics": {
                "brier_score": round(brier_raw, 5),
                "log_loss": round(ll_raw, 5),
                "ece": round(ece_raw, 5)
            },
            "calibrated_metrics": {
                "brier_score": round(brier_cal, 5),
                "log_loss": round(ll_cal, 5),
                "ece": round(ece_cal, 5)
            }
        }

        print(f"\n--- {label_name} Calibration Results ---")
        print(f"  Platt Coefficients: coef={coef:.4f}, intercept={intercept:.4f}")
        print(f"  Brier Score: {brier_raw:.5f} (raw) -> {brier_cal:.5f} (calibrated)")
        print(f"  Log Loss:    {ll_raw:.5f} (raw) -> {ll_cal:.5f} (calibrated)")
        print(f"  ECE:         {ece_raw:.5f} (raw) -> {ece_cal:.5f} (calibrated)")

    manifest = {
        "model_version": "1.0",
        "calibration_version": "1.0",
        "calibration_method": "Platt Scaling (Univariate Logistic Regression)",
        "dataset_identifier": "relationship_features_3000",
        "split_method": "canonical_issue_pair_disjoint",
        "validation_sample_size": len(val_data),
        "test_sample_size": len(test_data),
        "calibration_labels": calibration_results,
        "disclaimer": "Calibrated probabilities derived from held-out empirical evaluation on synthetic and staging data. Uncalibrated predictions must be routed to human review."
    }

    with open(OUTPUT_MANIFEST, 'w') as f:
        json.dump(manifest, f, indent=2)

    joblib.dump(calibrators, OUTPUT_CALIBRATOR)
    print(f"\n[OK] Saved calibration manifest to {OUTPUT_MANIFEST}")
    print(f"[OK] Saved calibrator models to {OUTPUT_CALIBRATOR}")

if __name__ == '__main__':
    main()
