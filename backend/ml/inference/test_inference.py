import os
import sys
import json
import csv
import joblib
import numpy as np

def run_test():
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    ML_DIR = os.path.dirname(BASE_DIR)
    MODELS_DIR = os.path.join(ML_DIR, 'models')

    MODEL_PATH = os.path.join(MODELS_DIR, 'multilabel_classifier.joblib')
    LABELS_PATH = os.path.join(MODELS_DIR, 'issue_labels.json')
    THRESHOLD_PATH = os.path.join(MODELS_DIR, 'multilabel_thresholds.csv')
    
    # 1. Load the joblib artifact
    classifier = joblib.load(MODEL_PATH)
    
    # 2. Confirm type is dict
    assert isinstance(classifier, dict), f"Expected dict, got {type(classifier)}"
    
    # 3. Confirm exactly 9 models
    assert len(classifier) == 9, f"Expected 9 models, got {len(classifier)}"
    
    # 4. Load issue_labels.json
    with open(LABELS_PATH, 'r') as f:
        labels = json.load(f)
    assert len(labels) == 9, f"Expected 9 labels, got {len(labels)}"
        
    # 5. Load multilabel_thresholds.csv
    # 6. Confirm threshold column is best_threshold
    thresholds = {}
    with open(THRESHOLD_PATH, newline='') as f:
        reader = csv.DictReader(f)
        assert 'best_threshold' in reader.fieldnames, "best_threshold column missing"
        for row in reader:
            thresholds[row['label']] = float(row['best_threshold'])
            
    assert len(thresholds) == 9, "Expected 9 thresholds"
    
    # 7. Create a deterministic 384-dimensional test vector
    # Deterministic vector (e.g., all 0.1s)
    test_vector = np.full((1, 384), 0.1, dtype=np.float32)
    
    active_labels = []
    
    # 8. Run all 9 model predict_proba calls
    for label in labels:
        model = classifier[label]
        prob = float(model.predict_proba(test_vector)[0][1])
        
        # 9. Confirm all 9 probabilities exist (implicit, would crash otherwise)
        # 10. Confirm each probability is between 0 and 1
        assert 0.0 <= prob <= 1.0, f"Invalid probability {prob} for label {label}"
        
        # 11. Apply each validation threshold
        thresh = thresholds.get(label, 0.5)
        if prob >= thresh:
            active_labels.append(label)
    
    print("MODEL TYPE: dict")
    print(f"LABEL MODEL COUNT: {len(classifier)}")
    print(f"FEATURE DIMENSION: {test_vector.shape[1]}")
    print(f"THRESHOLDS: {len(thresholds)}")
    print("INFERENCE: PASS")
    
    sys.exit(0)

if __name__ == '__main__':
    run_test()
