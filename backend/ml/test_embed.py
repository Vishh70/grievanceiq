from sentence_transformers import SentenceTransformer
import json

model = SentenceTransformer("all-MiniLM-L6-v2")

emb1 = model.encode("Water pipeline leakage").tolist()
emb2 = model.encode("Road damaged because of water").tolist()

print(json.dumps({
    "emb1": emb1,
    "emb2": emb2
}))
