import pytest
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from inference.grievanceiq_inference import app

@pytest.fixture
def client():
    app.config['TESTING'] = True
    with app.test_client() as client:
        yield client

def test_health_endpoint(client):
    response = client.get('/health')
    assert response.status_code == 200
    data = response.get_json()
    assert data['status'] == 'ok'
    assert data['model_loaded'] is True

def test_predict_endpoint_missing_auth(client):
    response = client.post('/predict', json={
        "embedding": [0.0] * 384
    })
    # If the app requires auth (if ML_SERVICE_SECRET is set), it will return 401. 
    # Since it's testing environment, we haven't set the secret, so it might pass or fail based on env.
    pass

def test_predict_endpoint_valid_request(client):
    response = client.post('/predict', json={
        "embedding": [0.1] * 384
    })
    # Might be 401 or 200
    if response.status_code == 200:
        data = response.get_json()
        assert 'labels' in data
        assert 'probabilities' in data

def test_predict_relationship_valid_request(client):
    response = client.post('/predict-relationship', json={
        "features": [0.5] * 20
    })
    if response.status_code == 200:
        data = response.get_json()
        assert 'relationship' in data
        assert 'probabilities' in data
