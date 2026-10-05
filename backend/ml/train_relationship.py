import os
import json
import numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix
import joblib

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FEATURES_DATA = os.path.join(BASE_DIR, '..', 'data', 'relationship_features.json')

def main():
    print("Step 1: Loading dataset with features...")
    with open(FEATURES_DATA, 'r') as f:
        data = json.load(f)
        
    print("Step 2: Identifying unique issue IDs to perform issue-level split...")
    
    unique_issue_ids = set()
    for row in data:
        # Some labels might be unexpected. Validate early.
        label = row['label']
        if label not in ["Duplicate", "Similar", "Related", "Independent"]:
            raise ValueError(f"Invalid label encountered: {label}. Allowed labels are Duplicate, Similar, Related, Independent.")
            
        unique_issue_ids.add(row['issue_id_a'])
        unique_issue_ids.add(row['issue_id_b'])
        
    unique_issue_ids = sorted(list(unique_issue_ids))
    n_issues = len(unique_issue_ids)
    print(f"Total unique issue IDs: {n_issues}")
    
    # Shuffle and split unique issues
    np.random.seed(42)
    np.random.shuffle(unique_issue_ids)
    
    train_end = int(0.6 * n_issues)
    val_end = int(0.8 * n_issues)
    
    train_issue_ids = set(unique_issue_ids[:train_end])
    val_issue_ids = set(unique_issue_ids[train_end:val_end])
    test_issue_ids = set(unique_issue_ids[val_end:])
    
    print(f"Train issues: {len(train_issue_ids)}, Val issues: {len(val_issue_ids)}, Test issues: {len(test_issue_ids)}")
    
    # Verify no overlap
    assert len(train_issue_ids.intersection(val_issue_ids)) == 0, "Leakage detected between train and val issues!"
    assert len(train_issue_ids.intersection(test_issue_ids)) == 0, "Leakage detected between train and test issues!"
    assert len(val_issue_ids.intersection(test_issue_ids)) == 0, "Leakage detected between val and test issues!"
    
    train_data, val_data, test_data = [], [], []
    excluded_cross_split = 0
    
    for row in data:
        ida = row['issue_id_a']
        idb = row['issue_id_b']
        
        if ida in train_issue_ids and idb in train_issue_ids:
            train_data.append(row)
        elif ida in val_issue_ids and idb in val_issue_ids:
            val_data.append(row)
        elif ida in test_issue_ids and idb in test_issue_ids:
            test_data.append(row)
        else:
            excluded_cross_split += 1
            
    print(f"Train pairs: {len(train_data)}")
    print(f"Validation pairs: {len(val_data)}")
    print(f"Test pairs: {len(test_data)}")
    print(f"Excluded cross-split pairs: {excluded_cross_split}")
    
    # Format for sklearn
    def get_X_y(subset):
        X = [row['features'] for row in subset]
        label_map = {"Duplicate": 0, "Similar": 1, "Related": 2, "Independent": 3}
        y = [label_map[row['label']] for row in subset]
        return np.array(X), np.array(y)
        
    X_train, y_train = get_X_y(train_data)
    X_val, y_val = get_X_y(val_data)
    X_test, y_test = get_X_y(test_data)
    
    print("Step 3: Training corrected Random Forest...")
    clf = RandomForestClassifier(n_estimators=10, max_features=0.5, bootstrap=True, random_state=42)
    clf.fit(X_train, y_train)
    
    def report_metrics(y_true, y_pred, name):
        if len(y_true) == 0:
            print(f"No {name} data to evaluate.")
            return
            
        print(f"\n--- {name.upper()} SET EVALUATION ---")
        acc = accuracy_score(y_true, y_pred)
        
        # Explicit labels mapped to 0, 1, 2, 3
        # Duplicate=0, Similar=1, Related=2, Independent=3
        target_names = ["Duplicate", "Similar", "Related", "Independent"]
        precision, recall, f1, support = precision_recall_fscore_support(
            y_true, y_pred, labels=[0, 1, 2, 3], zero_division=0
        )
        
        macro_p, macro_r, macro_f1, _ = precision_recall_fscore_support(
            y_true, y_pred, labels=[0, 1, 2, 3], average='macro', zero_division=0
        )
        
        print(f"Accuracy: {acc:.4f}")
        print(f"Macro Precision: {macro_p:.4f}")
        print(f"Macro Recall: {macro_r:.4f}")
        print(f"Macro F1: {macro_f1:.4f}")
        
        print("\nPer-class metrics:")
        for i, class_name in enumerate(target_names):
            print(f"  {class_name} - Precision: {precision[i]:.4f}, Recall: {recall[i]:.4f}, F1: {f1[i]:.4f}, Support: {support[i]}")
            
        print("\nConfusion Matrix:")
        cm = confusion_matrix(y_true, y_pred, labels=[0,1,2,3])
        print(cm)

    print("Step 4: Evaluating...")
    if len(X_val) > 0:
        y_val_pred = clf.predict(X_val)
        report_metrics(y_val, y_val_pred, "validation")
        
    if len(X_test) > 0:
        y_test_pred = clf.predict(X_test)
        report_metrics(y_test, y_test_pred, "test")
        
    # Save model
    models_dir = os.path.join(BASE_DIR, 'models')
    os.makedirs(models_dir, exist_ok=True)
    model_path = os.path.join(models_dir, 'relationship_corrected_rf_10tree.joblib')
    joblib.dump(clf, model_path)
    print(f"\nModel saved to {model_path}")
    
    # Save feature names explicitly for verification
    feature_names = [
        'semantic_similarity',
        'location_score',
        'temporal_score',
        'duplicate_score',
        'duplicate_flag',
        'same_category',
        'category_a_Roads', 'category_a_Water_Supply', 'category_a_Electricity', 'category_a_Drainage', 'category_a_Waste_Management', 'category_a_Public_Infrastructure', 'category_a_Other',
        'category_b_Roads', 'category_b_Water_Supply', 'category_b_Electricity', 'category_b_Drainage', 'category_b_Waste_Management', 'category_b_Public_Infrastructure', 'category_b_Other'
    ]
    with open(os.path.join(models_dir, 'relationship_features_list.txt'), 'w') as f:
        f.write("\n".join(feature_names))

if __name__ == '__main__':
    main()
