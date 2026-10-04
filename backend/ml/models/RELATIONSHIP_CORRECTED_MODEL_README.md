# Corrected Relationship Model Architecture

**PRIMARY INFERENCE:**
Corrected Python Random Forest (served via `backend/ml/inference/grievanceiq_inference.py`)

**FALLBACK:**
Legacy Node Random Forest (`backend/models/relationship/model.json`)

## Architecture Flow

```text
Complaint Pair
    ↓
20 Corrected Features (including True Multi-Hot Category Encoding)
    ↓
Python ML Service (POST /predict-relationship)
    ↓
Corrected Random Forest (relationship_corrected_rf_10tree.joblib)
    ↓
Relationship Class (Duplicate / Similar / Related / Independent)
```

## Fallback Flow

```text
Python unavailable (timeout / connection refused)
    ↓
Legacy Node Random Forest (ml-random-forest)
    ↓
Relationship result
```

*Note: The corrected model achieved 93.30% accuracy. This is a synthetic held-out research evaluation result, not a live production accuracy metric. The model is a Python `sklearn` Random Forest, NOT a Node.js `ml-random-forest` model.*

---

- **Model type:** sklearn RandomForestClassifier
- **Trees:** 10
- **max_features:** 0.5
- **random_state:** 42
- **Feature count:** 20
- **Category encoding:** true multi-hot
- **Original pairs:** 16000
- **Usable pairs:** 10555
- **Cross-split excluded:** 5445
- **Train:** 8818
- **Validation:** 901
- **Test:** 836
- **Test accuracy:** 0.9330143541
- **Macro precision:** 0.8685864403
- **Macro recall:** 0.9476362558
- **Macro F1:** 0.8998751676

The reported metrics are from the corrected sklearn Python experiment on synthetic held-out data. The corrected .joblib model is the active relationship model through the Python Flask ML service. It is not a native Node.js ml-random-forest model.
