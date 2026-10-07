"""
GrievanceIQ Multi-Label Issue Classifier — Python Inference Service
====================================================================
Serves the trained multilabel_classifier.joblib model via a lightweight
HTTP API so the Node.js backend can call it.

Architecture:
  Node.js/Express  --POST /predict-->  Python Flask  -->  .joblib  -->  labels

Usage:
  pip install -r requirements.txt
  python grievanceiq_inference.py

The service listens on http://localhost:5001
"""

import os
import json
import csv
import joblib
import numpy as np
from flask import Flask, request, jsonify
from flask_cors import CORS

# ── Paths ────────────────────────────────────────────────────────────────────

BASE_DIR   = os.path.dirname(os.path.abspath(__file__))
ML_DIR     = os.path.dirname(BASE_DIR)
MODELS_DIR = os.path.join(ML_DIR, 'models')

MODEL_PATH      = os.path.join(MODELS_DIR, 'multilabel_classifier.joblib')
LABELS_PATH     = os.path.join(MODELS_DIR, 'issue_labels.json')
THRESHOLD_PATH  = os.path.join(MODELS_DIR, 'multilabel_thresholds.csv')
RELATIONSHIP_MODEL_PATH = os.path.join(MODELS_DIR, 'relationship_corrected_rf_10tree.joblib')

PORT = int(os.environ.get('ML_SERVICE_PORT', 5001))

# ── Load Artifacts ────────────────────────────────────────────────────────────

print("[GrievanceIQ ML] Loading multilabel classifier...")
classifier = joblib.load(MODEL_PATH)

with open(LABELS_PATH, 'r') as f:
    LABELS = json.load(f)

# Load per-label thresholds from CSV (column: label, best_threshold)
THRESHOLDS = {}
with open(THRESHOLD_PATH, newline='') as f:
    reader = csv.DictReader(f)
    for row in reader:
        THRESHOLDS[row['label']] = float(row['best_threshold'])

print(f"[GrievanceIQ ML] Loaded {len(LABELS)} labels: {LABELS}")
print(f"[GrievanceIQ ML] Thresholds: {THRESHOLDS}")

# Validation of classifier structure
if not isinstance(classifier, dict):
    raise TypeError(f"Expected classifier to be a dict, got {type(classifier)}")
if len(classifier) != 9:
    raise ValueError(f"Expected 9 models in classifier dict, got {len(classifier)}")

print("[GrievanceIQ ML] Loading relationship classifier...")
try:
    relationship_classifier = joblib.load(RELATIONSHIP_MODEL_PATH)
    print("[GrievanceIQ ML] Loaded relationship classifier successfully.")
except Exception as e:
    print(f"[GrievanceIQ ML] Failed to load relationship classifier: {e}")
    relationship_classifier = None

# ── Flask App ─────────────────────────────────────────────────────────────────

# SECURITY NOTE (PROTOTYPE LIMITATION):
# This ML service is exposed externally (e.g., on Render) without authentication.
# In a true production environment, this service should be placed within a private network (VPC)
# or require a secure API key / mutual TLS to prevent unauthorized external access.
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:3000", "http://localhost:5000", "https://grievanceiq.onrender.com", "https://grievanceiq-api.onrender.com"]}})

# ── Authentication ─────────────────────────────────────────────────────────────
ML_SERVICE_SECRET = os.environ.get('ML_SERVICE_SECRET')

def check_auth():
    if not ML_SERVICE_SECRET:
        return None
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Unauthorized'}), 401
    token = auth_header.split(' ')[1]
    if token != ML_SERVICE_SECRET:
        return jsonify({'error': 'Unauthorized'}), 401
    return None

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'service': 'GrievanceIQ ML Inference',
        'labels': LABELS,
        'model': 'multilabel_classifier.joblib',
        'model_type': 'dict of 9 individual LogisticRegression models',
        'model_loaded': True
    })

@app.route('/predict', methods=['POST'])
def predict():
    auth_err = check_auth()
    if auth_err:
        return auth_err
        
    try:
        body = request.get_json(force=True)

        if 'embedding' not in body:
            return jsonify({'error': 'Missing required field: embedding'}), 400

        embedding = body['embedding']

        if len(embedding) != 384:
            return jsonify({
                'error': f'Expected 384-dim embedding, got {len(embedding)}'
            }), 400

        # Reshape to (1, 384) for sklearn
        X = np.array(embedding, dtype=np.float32).reshape(1, -1)

        probabilities = {}
        active_labels = []

        # Predict using individual models
        for label in LABELS:
            try:
                model = classifier[label]
                prob_positive = float(model.predict_proba(X)[0][1])
                threshold = THRESHOLDS.get(label, 0.5)
                probabilities[label] = round(prob_positive, 4)
                if prob_positive >= threshold:
                    active_labels.append(label)
            except Exception as exc:
                raise RuntimeError(f"Label model failed for {label}: {exc}")

        return jsonify({
            'labels': active_labels,
            'probabilities': probabilities,
            'thresholds': THRESHOLDS,
            'model_type': '9 individual LogisticRegression models',
            'model_loaded': True
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    auth_err = check_auth()
    if auth_err:
        return auth_err
        
    try:
        body = request.get_json(force=True)

        if 'embeddings' not in body:
            return jsonify({'error': 'Missing required field: embeddings'}), 400

        embeddings = body['embeddings']
        X = np.array(embeddings, dtype=np.float32)

        if X.ndim != 2 or X.shape[1] != 384:
            return jsonify({'error': f'Expected shape (N, 384), got {X.shape}'}), 400

        results = []
        for row_idx in range(len(embeddings)):
            active_labels = []
            probabilities = {}
            row_X = X[row_idx].reshape(1, -1)
            
            for label in LABELS:
                model = classifier[label]
                prob_positive = float(model.predict_proba(row_X)[0][1])
                threshold = THRESHOLDS.get(label, 0.5)
                probabilities[label] = round(prob_positive, 4)
                if prob_positive >= threshold:
                    active_labels.append(label)
                    
            results.append({
                'labels': active_labels, 
                'probabilities': probabilities
            })

        return jsonify({
            'results': results, 
            'thresholds': THRESHOLDS,
            'model_type': '9 individual LogisticRegression models',
            'model_loaded': True
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500

RELATIONSHIP_LABELS = {
    0: "Duplicate",
    1: "Similar",
    2: "Related",
    3: "Independent"
}

@app.route('/predict-relationship', methods=['POST'])
def predict_relationship():
    auth_err = check_auth()
    if auth_err:
        return auth_err

    if not relationship_classifier:
        return jsonify({'error': 'Relationship classifier not loaded'}), 503
    try:
        body = request.get_json(force=True)
        if 'features' not in body:
            return jsonify({'error': 'Missing required field: features'}), 400
        
        features = body['features']
        if len(features) != 20:
            return jsonify({'error': f'Expected exactly 20 features, got {len(features)}'}), 400
            
        # Validate all are numeric and finite
        for val in features:
            if not isinstance(val, (int, float)) or not np.isfinite(val):
                return jsonify({'error': 'All features must be finite numbers'}), 400
                
        X = np.array(features, dtype=np.float32).reshape(1, -1)
        
        # Predict
        pred_class_id = int(relationship_classifier.predict(X)[0])
        relationship_label = RELATIONSHIP_LABELS.get(pred_class_id, "Independent")
        
        response = {
            "relationship": relationship_label,
            "class_id": pred_class_id,
            "features_used": 20,
            "model": "relationship_corrected_rf_10tree"
        }
        
        if hasattr(relationship_classifier, 'predict_proba'):
            probs = relationship_classifier.predict_proba(X)[0]
            classes = relationship_classifier.classes_
            prob_dict = {}
            for cls_val, prob in zip(classes, probs):
                prob_dict[RELATIONSHIP_LABELS.get(int(cls_val), "Independent")] = round(float(prob), 4)
            response["probabilities"] = prob_dict
            
        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print(f"[GrievanceIQ ML] Starting inference service on port {PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
