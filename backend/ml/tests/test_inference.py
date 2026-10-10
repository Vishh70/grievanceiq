import pytest
import sys
import os
import json
import numpy as np

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from inference.grievanceiq_inference import app, LABELS, THRESHOLDS, classifier

@pytest.fixture
def client():
    app.config['TESTING'] = True
    # Ensure auth is disabled for tests
    os.environ['ML_SERVICE_SECRET'] = ''
    with app.test_client() as client:
        yield client

def test_health_endpoint(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'ok'
    assert data['model_loaded'] is True

def mock_predict_proba_high(X):
    # Returns a high probability (0.99) for the positive class (index 1)
    return np.array([[0.01, 0.99]])

def mock_predict_proba_low(X):
    # Returns a low probability (0.10) for the positive class (index 1)
    return np.array([[0.90, 0.10]])

def mock_predict_proba_mixed(label):
    # Different probabilities for different labels to test max extraction
    def _mock(X):
        # We know LABELS contains "road_damage_flag", "water_leakage_flag", etc.
        # Let's give road_damage_flag a 0.2 and water_leakage_flag a 0.4.
        # All below 0.5 default thresholds.
        if label == "water_leakage_flag":
            return np.array([[0.6, 0.4]])
        elif label == "road_damage_flag":
            return np.array([[0.8, 0.2]])
        else:
            return np.array([[0.9, 0.1]])
    return _mock

def test_predict_endpoint_high_confidence(client, monkeypatch):
    # Mock all models to return high confidence
    for label in LABELS:
        monkeypatch.setattr(classifier[label], "predict_proba", mock_predict_proba_high)
        
    response = client.post('/predict', json={"embedding": [0.1] * 384})
    assert response.status_code == 200
    data = response.get_json()
    assert len(data['labels']) == len(LABELS)
    assert data['fallback_used'] is False
    assert 'fallback_metadata' not in data

def test_predict_endpoint_fallback(client, monkeypatch):
    # Mock all models to return varying LOW confidences
    for label in LABELS:
        # We need to capture the label in the closure
        monkeypatch.setattr(classifier[label], "predict_proba", mock_predict_proba_mixed(label))
        
    response = client.post('/predict', json={"embedding": [0.1] * 384})
    assert response.status_code == 200
    data = response.get_json()
    
    # It should have exactly one label: water_leakage_flag (0.4)
    assert len(data['labels']) == 1
    assert data['labels'][0] == "water_leakage_flag"
    assert data['fallback_used'] is True
    assert 'fallback_metadata' in data
    assert data['fallback_metadata']['selected_label_probability'] == 0.4
    assert data['fallback_metadata']['requires_review'] is True

def test_predict_batch_endpoint_fallback(client, monkeypatch):
    for label in LABELS:
        monkeypatch.setattr(classifier[label], "predict_proba", mock_predict_proba_mixed(label))
        
    response = client.post('/predict/batch', json={"embeddings": [[0.1] * 384, [0.2] * 384]})
    assert response.status_code == 200
    data = response.get_json()
    
    assert len(data['results']) == 2
    for res in data['results']:
        assert len(res['labels']) == 1
        assert res['labels'][0] == "water_leakage_flag"
        assert res['fallback_used'] is True
        assert res['fallback_metadata']['selected_label_probability'] == 0.4

def test_predict_invalid_embedding(client):
    response = client.post('/predict', json={"embedding": [0.1] * 10}) # Wrong dimension
    assert response.status_code == 400
    
    response = client.post('/predict', json={"embedding": [float('inf')] * 384}) # Non-finite
    assert response.status_code == 400

def test_predict_relationship_valid_request(client):
    response = client.post('/predict-relationship', json={
        "features": [0.5] * 20
    })
    if response.status_code == 200:
        data = response.get_json()
        assert 'relationship' in data
        assert 'probabilities' in data
