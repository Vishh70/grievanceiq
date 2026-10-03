import json
import os
import sys

try:
    from sentence_transformers import SentenceTransformer
except ImportError:
    print("sentence_transformers not installed yet.")
    sys.exit(1)

model_name = 'all-MiniLM-L6-v2'
try:
    model = SentenceTransformer(model_name)
    print("Model loaded successfully.")
    
    with open('backend/data/real_complaint_pairs.json', 'r', encoding='utf-8') as f:
        pairs = json.load(f)
    
    output_cache = {}
    
    for pair in pairs:
        c1 = pair['complaint_A']['text']
        c2 = pair['complaint_B']['text']
        
        emb1 = model.encode(c1).tolist()
        emb2 = model.encode(c2).tolist()
        
        output_cache[c1] = emb1
        output_cache[c2] = emb2
        
    with open('backend/data/embeddings_cache.json', 'w') as f:
        json.dump(output_cache, f)
        
    print("Saved embeddings to backend/data/embeddings_cache.json")
    
except Exception as e:
    print("Error loading model or generating embeddings:", e)
