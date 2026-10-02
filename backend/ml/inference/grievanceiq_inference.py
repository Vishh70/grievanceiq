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

# ── Flask App ─────────────────────────────────────────────────────────────────

app = Flask(__name__)
CORS(app)   # Allow Node.js backend on a different port to call this

@app.route('/health', methods=['GET'])
def health():
    return jsonify({
        'status': 'ok',
        'service': 'GrievanceIQ ML Inference',
        'labels': LABELS,
        'model': 'multilabel_classifier.joblib'
    })


@app.route('/predict', methods=['POST'])
def predict():
    """
    Accepts a 384-dim embedding vector and returns predicted issue labels.

    Request body (JSON):
    {
        "embedding": [0.123, -0.045, ...],   // 384 floats — MiniLM embedding
        "text": "optional original text"     // for logging only
    }

    Response (JSON):
    {
        "labels": ["road_damage_flag", "water_leakage_flag"],
        "probabilities": {
            "road_damage_flag": 0.87,
            ...
        },
        "thresholds": { ... }
    }
    """
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

        # Get probability estimates for each label
        # classifier is a MultiOutputClassifier; predict_proba returns a list of arrays
        proba_list = classifier.predict_proba(X)

        probabilities = {}
        active_labels = []

        for i, label in enumerate(LABELS):
            # Each element of proba_list is shape (1, 2): [prob_class_0, prob_class_1]
            prob_positive = float(proba_list[i][0][1])
            threshold = THRESHOLDS.get(label, 0.5)
            probabilities[label] = round(prob_positive, 4)
            if prob_positive >= threshold:
                active_labels.append(label)

        return jsonify({
            'labels': active_labels,
            'probabilities': probabilities,
            'thresholds': THRESHOLDS
        })

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/predict/batch', methods=['POST'])
def predict_batch():
    """
    Accepts a list of embeddings and returns predictions for each.

    Request body (JSON):
    {
        "embeddings": [[...384 floats...], [...], ...]
    }
    """
    try:
        body = request.get_json(force=True)

        if 'embeddings' not in body:
            return jsonify({'error': 'Missing required field: embeddings'}), 400

        embeddings = body['embeddings']
        X = np.array(embeddings, dtype=np.float32)

        if X.ndim != 2 or X.shape[1] != 384:
            return jsonify({'error': f'Expected shape (N, 384), got {X.shape}'}), 400

        proba_list = classifier.predict_proba(X)

        results = []
        for row_idx in range(len(embeddings)):
            active_labels = []
            probabilities = {}
            for i, label in enumerate(LABELS):
                prob_positive = float(proba_list[i][row_idx][1])
                threshold = THRESHOLDS.get(label, 0.5)
                probabilities[label] = round(prob_positive, 4)
                if prob_positive >= threshold:
                    active_labels.append(label)
            results.append({'labels': active_labels, 'probabilities': probabilities})

        return jsonify({'results': results, 'thresholds': THRESHOLDS})

    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print(f"[GrievanceIQ ML] Starting inference service on port {PORT}")
    app.run(host='0.0.0.0', port=PORT, debug=False)
