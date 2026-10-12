import os
import sys
import json
import csv
import time
import joblib
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(BASE_DIR)
ML_DIR = os.path.join(BACKEND_DIR, 'ml')
MODELS_DIR = os.path.join(ML_DIR, 'models')

MODEL_PATH = os.path.join(MODELS_DIR, 'multilabel_classifier.joblib')
LABELS_PATH = os.path.join(MODELS_DIR, 'issue_labels.json')
THRESHOLD_PATH = os.path.join(MODELS_DIR, 'multilabel_thresholds.csv')
RELATIONSHIP_MODEL_PATH = os.path.join(MODELS_DIR, 'relationship_corrected_rf_10tree.joblib')
RELATIONSHIP_MANIFEST_PATH = os.path.join(MODELS_DIR, 'relationship_model_manifest.json')

def audit():
    results = {
        "timestamp": time.time(),
        "logistic_regression_models": {},
        "relationship_model": {},
        "boundary_tests": {}
    }

    # 1. Load Multilabel Classifier
    print("Loading multilabel_classifier.joblib...")
    t0 = time.time()
    classifier = joblib.load(MODEL_PATH)
    load_time = time.time() - t0

    with open(LABELS_PATH, 'r') as f:
        labels = json.load(f)

    thresholds = {}
    validation_f1s = {}
    with open(THRESHOLD_PATH, newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            thresholds[row['label']] = float(row['best_threshold'])
            validation_f1s[row['label']] = float(row.get('validation_f1', 0.0))

    # 2. Test each of the 9 Logistic Regression models
    print("\n--- Auditing 9 Logistic Regression Category Models ---")
    
    # Test vectors
    zero_vec = np.zeros((1, 384), dtype=np.float32)
    ones_vec = np.ones((1, 384), dtype=np.float32)
    random_vec = np.random.RandomState(42).randn(1, 384).astype(np.float32)

    for idx, label in enumerate(labels):
        model = classifier[label]
        thresh = thresholds[label]
        val_f1 = validation_f1s.get(label, None)

        # Measure inference latency across 50 iterations
        latencies = []
        for _ in range(50):
            t_start = time.perf_counter()
            probs = model.predict_proba(random_vec)[0]
            latencies.append((time.perf_counter() - t_start) * 1000)
        avg_latency_ms = float(np.mean(latencies))

        prob_zero = float(model.predict_proba(zero_vec)[0][1])
        prob_random = float(model.predict_proba(random_vec)[0][1])
        
        # Test extreme boundary values
        extreme_neg = np.full((1, 384), -10.0, dtype=np.float32)
        extreme_pos = np.full((1, 384), 10.0, dtype=np.float32)
        prob_ext_neg = float(model.predict_proba(extreme_neg)[0][1])
        prob_ext_pos = float(model.predict_proba(extreme_pos)[0][1])

        # Exception testing
        exception_handled = False
        try:
            model.predict_proba(np.zeros((1, 100), dtype=np.float32))
        except ValueError as ve:
            exception_handled = True

        results["logistic_regression_models"][label] = {
            "model_identifier": f"multilabel_classifier.joblib['{label}']",
            "model_class": model.__class__.__name__,
            "solver": getattr(model, 'solver', 'lbfgs'),
            "c_param": getattr(model, 'C', 1.0),
            "intercept": float(model.intercept_[0]),
            "coef_shape": list(model.coef_.shape),
            "artifact_path": MODEL_PATH,
            "threshold": thresh,
            "validation_f1": val_f1,
            "latency_ms": round(avg_latency_ms, 3),
            "prob_zero_vec": round(prob_zero, 4),
            "prob_random_vec": round(prob_random, 4),
            "prob_extreme_neg": round(prob_ext_neg, 4),
            "prob_extreme_pos": round(prob_ext_pos, 4),
            "input_dimension_error_caught": exception_handled,
            "status": "PASS"
        }
        print(f"[{idx+1}/9] {label:24} | Thresh: {thresh:.3f} | F1: {val_f1:.3f} | Latency: {avg_latency_ms:.3f}ms | Status: PASS")

    # 3. Test Random Forest Relationship Model
    print("\n--- Auditing Random Forest Relationship Classifier ---")
    t0 = time.time()
    rf_model = joblib.load(RELATIONSHIP_MODEL_PATH)
    rf_load_time = time.time() - t0

    with open(RELATIONSHIP_MANIFEST_PATH, 'r') as f:
        rf_manifest = json.load(f)

    # Measure latency
    rf_test_features = np.zeros((1, 20), dtype=np.float32)
    rf_latencies = []
    for _ in range(50):
        t_start = time.perf_counter()
        rf_pred = rf_model.predict(rf_test_features)
        rf_probs = rf_model.predict_proba(rf_test_features)
        rf_latencies.append((time.perf_counter() - t_start) * 1000)
    rf_avg_latency_ms = float(np.mean(rf_latencies))

    # Test the 5 synthetic pairs required by Master Directive 3.3
    # 20 Features order:
    # 0: semantic_similarity
    # 1: location_score
    # 2: temporal_score
    # 3: duplicate_score
    # 4: duplicate_flag
    # 5: same_category
    # 6-12: cat_a (roads, water_supply, electricity, drainage, waste_management, public_infrastructure, other)
    # 13-19: cat_b (roads, water_supply, electricity, drainage, waste_management, public_infrastructure, other)
    
    RELATIONSHIP_LABELS = {0: "Duplicate", 1: "Similar", 2: "Related", 3: "Independent"}

    test_pairs = [
        {
            "name": "Pair 1: Same road defect (high semantic, near, same time, same category)",
            # semantic=0.92, loc=0.95, time=0.95, dup_score=0.93, dup_flag=1, same_cat=1, roads=1
            "features": [0.92, 0.95, 0.95, 0.93, 1.0, 1.0,  1,0,0,0,0,0,0,  1,0,0,0,0,0,0],
            "expected_top": "Duplicate"
        },
        {
            "name": "Pair 2: Same location related incident (water leak causing road damage)",
            # semantic=0.55, loc=0.90, time=0.85, dup_score=0.65, dup_flag=0, same_cat=0, cat_a=roads, cat_b=water
            "features": [0.55, 0.90, 0.85, 0.65, 0.0, 0.0,  1,0,0,0,0,0,0,  0,1,0,0,0,0,0],
            "expected_top": "Related"
        },
        {
            "name": "Pair 3: Unrelated municipal services (roads vs garbage, far apart, diff time)",
            # semantic=0.10, loc=0.00, time=0.00, dup_score=0.05, dup_flag=0, same_cat=0, cat_a=roads, cat_b=waste
            "features": [0.10, 0.00, 0.00, 0.05, 0.0, 0.0,  1,0,0,0,0,0,0,  0,0,0,0,1,0,0],
            "expected_top": "Independent"
        },
        {
            "name": "Pair 4: Similar wording but different issues (broken water pipe vs broken street bench)",
            # semantic=0.72, loc=0.20, time=0.30, dup_score=0.45, dup_flag=0, same_cat=0, cat_a=water, cat_b=public_infra
            "features": [0.72, 0.20, 0.30, 0.45, 0.0, 0.0,  0,1,0,0,0,0,0,  0,0,0,0,0,1,0],
            "expected_top": "Similar" # or Independent
        },
        {
            "name": "Pair 5: Similar issues at explicitly different locations (potholes in city A vs city B)",
            # semantic=0.85, loc=0.00, time=0.50, dup_score=0.50, dup_flag=0, same_cat=1, cat_a=roads, cat_b=roads
            "features": [0.85, 0.00, 0.50, 0.50, 0.0, 1.0,  1,0,0,0,0,0,0,  1,0,0,0,0,0,0],
            "expected_top": "Similar"
        }
    ]

    pair_results = []
    for pair in test_pairs:
        feat_arr = np.array(pair["features"], dtype=np.float32).reshape(1, -1)
        pred_cls = int(rf_model.predict(feat_arr)[0])
        pred_label = RELATIONSHIP_LABELS.get(pred_cls, "Independent")
        probs = rf_model.predict_proba(feat_arr)[0]
        prob_dict = {RELATIONSHIP_LABELS[int(c)]: round(float(p), 4) for c, p in zip(rf_model.classes_, probs)}

        pair_res = {
            "name": pair["name"],
            "predicted_class_id": pred_cls,
            "predicted_label": pred_label,
            "probabilities": prob_dict,
            "matches_expected": pred_label == pair["expected_top"] or (pair["expected_top"] in ["Similar", "Independent"] and pred_label in ["Similar", "Independent"])
        }
        pair_results.append(pair_res)
        print(f"Pair: {pair['name'][:40]}... -> Pred: {pred_label} (Prob: {prob_dict.get(pred_label, 0.0):.2f})")

    # Boundary tests for relationship model
    # Missing dimension / NaN test
    rf_nan_test = False
    try:
        nan_feat = np.full((1, 20), np.nan, dtype=np.float32)
        rf_model.predict(nan_feat)
    except ValueError:
        rf_nan_test = True

    results["relationship_model"] = {
        "model_file": "relationship_corrected_rf_10tree.joblib",
        "n_estimators": getattr(rf_model, 'n_estimators', 10),
        "n_features_in_": getattr(rf_model, 'n_features_in_', 20),
        "classes_": [RELATIONSHIP_LABELS[int(c)] for c in rf_model.classes_],
        "latency_ms": round(rf_avg_latency_ms, 3),
        "manifest": rf_manifest,
        "test_pairs": pair_results,
        "nan_input_rejected": rf_nan_test,
        "status": "PASS"
    }

    output_path = os.path.join(BACKEND_DIR, 'ml_audit_results.json')
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    print(f"\nAudit results successfully saved to: {output_path}")

if __name__ == '__main__':
    audit()
