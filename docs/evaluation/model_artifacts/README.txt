
GRIEVANCEIQ FINAL MODEL PACKAGE
================================

Created: 2026-10-01T16:35:45.663121

MULTI-LABEL MODEL
-----------------
Model:
multilabel_classifier.joblib

Embedding:
sentence-transformers/all-MiniLM-L6-v2

Embedding dimension:
384

Labels:
1. road_damage_flag
2. roadside_flooding_flag
3. water_leakage_flag
4. electric_pole_flag
5. streetlight_flag
6. traffic_signal_flag
7. garbage_flag
8. tree_hazard_flag
9. drainage_flag

Dataset:
6000 synthetic complaints

Train:
4196

Validation:
904

Test:
900


RELATIONSHIP MODEL
------------------
Model:
relationship_model.json

Classes:
1. Duplicate
2. Similar
3. Related
4. Independent

Features:
20

Dataset:
16000 synthetic complaint pairs

Train:
11134

Validation:
2446

Test:
2420

Training:
Random Forest
30 trees
maxFeatures = 0.5
seed = 42


GITHUB INTEGRATION
------------------

Relationship model:

relationship_model.json
    ->
backend/models/relationship/model.json

relationship_model_metadata.json
    ->
backend/models/relationship/metadata.json

IMPORTANT
---------

The multilabel_classifier.joblib file is a Python/scikit-learn
model. It cannot be directly loaded by the existing Node.js
backend using require().

Use a Python inference service or convert/integrate the model
through ONNX before connecting it to the Node.js application.

The relationship Random Forest model is already serialized in
the format used by the current Node.js backend.

Research/evaluation files are included for documentation and
evaluation. Do not treat synthetic test performance as
real-world accuracy.
