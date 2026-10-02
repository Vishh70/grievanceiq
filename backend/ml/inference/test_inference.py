import os
import sys
import json
import csv
import joblib
import numpy as np

def run_test():
    print("Running final model load test...")
    
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ML_DIR = os.path.dirname(BASE_DIR)
    MODELS_DIR = os.path.join(ML_DIR, 'models')

    MODEL_PATH = os.path.join(MODELS_DIR, 'multilabel_classifier.joblib')
    LABELS_PATH = os.path.join(MODELS_DIR, 'issue_labels.json')
    THRESHOLD_PATH = os.path.join(MODELS_DIR, 'multilabel_thresholds.csv')
    
    # 1. Load multilabel_classifier.joblib
    assert os.path.exists(MODEL_PATH), f"Model not found at {MODEL_PATH}"
    clf = joblib.load(MODEL_PATH)
    
    # 2. Load issue_labels.json
    assert os.path.exists(LABELS_PATH), f"Labels not found at {LABELS_PATH}"
    with open(LABELS_PATH, 'r') as f:
        labels = json.load(f)
        
    # 4. Confirm exactly 9 labels
    assert len(labels) == 9, f"Expected 9 labels, got {len(labels)}"
    
    # 3. Load multilabel_thresholds.csv
    # 5. Confirm thresholds come from best_threshold
    assert os.path.exists(THRESHOLD_PATH), f"Thresholds not found at {THRESHOLD_PATH}"
    thresholds = {}
    with open(THRESHOLD_PATH, newline='') as f:
        reader = csv.DictReader(f)
        assert 'best_threshold' in reader.fieldnames, "best_threshold column missing"
        for row in reader:
            thresholds[row['label']] = float(row['best_threshold'])
            
    assert len(thresholds) == 9, "Expected 9 thresholds"
    
    # 6. Create a valid 384-dimensional test vector
    test_vector = np.random.rand(1, 384).astype(np.float32)
    
    # 7. Run predict_proba
    proba_list = clf.predict_proba(test_vector)
    
    # 8. Verify all 9 probabilities are produced
    assert len(proba_list) == 9, f"Expected 9 probability arrays, got {len(proba_list)}"
    
    for i, label in enumerate(labels):
        prob = float(proba_list[i][0][1])
        assert 0.0 <= prob <= 1.0, f"Invalid probability {prob} for label {label}"
    
    # 9. Verify no exception occurs (checked by reaching here)
    print("Test passed successfully!")
    sys.exit(0)

if __name__ == '__main__':
    run_test()
