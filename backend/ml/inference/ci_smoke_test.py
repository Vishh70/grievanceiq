import urllib.request
import json
import sys

def run_test():
    url = "http://localhost:5001/predict"
    # Deterministic all-zero 384-d input
    embedding = [0.0] * 384
    
    data = {"embedding": embedding}
    
    import os
    secret = os.environ.get('ML_SERVICE_SECRET', 'test_secret')
    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode('utf-8'),
        headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {secret}'
        },
        method='POST'
    )
    
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            status = response.getcode()
            if status != 200:
                print(f"Error: HTTP {status}")
                sys.exit(1)
                
            res_body = response.read().decode('utf-8')
            res_data = json.loads(res_body)
            
            # Verifies labels is an array
            if 'labels' not in res_data or not isinstance(res_data['labels'], list):
                print("Error: 'labels' is not a list")
                sys.exit(1)
                
            # Verifies probabilities has all 9 labels
            if 'probabilities' not in res_data:
                print("Error: 'probabilities' missing")
                sys.exit(1)
                
            probs = res_data['probabilities']
            if len(probs) != 9:
                print(f"Error: expected 9 probabilities, got {len(probs)}")
                sys.exit(1)
                
            print("Smoke test SUCCESS.")
            sys.exit(0)
            
    except urllib.error.HTTPError as e:
        print(f"HTTPError: {e.code}")
        print(e.read().decode('utf-8'))
        sys.exit(1)
    except Exception as e:
        print(f"Exception: {e}")
        sys.exit(1)

if __name__ == "__main__":
    run_test()
