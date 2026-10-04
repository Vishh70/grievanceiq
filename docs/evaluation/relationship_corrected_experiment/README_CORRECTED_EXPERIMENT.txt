GRIEVANCEIQ
CORRECTED RELATIONSHIP CLASSIFICATION EXPERIMENT
=================================================

Package created:
2026-10-04T03:58:46.966465

EXPERIMENT
----------
Model:
sklearn RandomForestClassifier

Estimators:
10

max_features:
0.5

Random state:
42

Category encoding:
True multi-hot

Feature count:
20

DATA SPLIT
----------
Original relationship pairs:
16000

Usable pairs:
10555

Excluded cross-split pairs:
5445

Training pairs:
8818

Validation pairs:
901

Test pairs:
836

Issue-ID overlap:
0

EVALUATION
----------
Test accuracy:
0.9330143541

Macro precision:
0.8685864403

Macro recall:
0.9476362558

Macro F1:
0.8998751676

IMPORTANT RESEARCH LIMITATION
-----------------------------
These metrics are from a synthetic held-out evaluation.
They do not establish real-world generalization.

BACKEND STATUS
--------------
A backend-native Node.js ml-random-forest model was NOT created
in the corrected experiment because the Node training process was
interrupted in the Colab runtime during both attempted runs.

The existing old backend relationship_model.json was NOT overwritten.

Therefore:

- 0.9330 accuracy is the corrected Python Random Forest result.
- 0.8999 macro F1 is the corrected Python Random Forest result.
- These metrics must NOT be described as metrics from a
  successfully trained Node.js backend model.

LEAKAGE CONTROLS
----------------
Issue-ID disjoint split:
YES

Same-issue field excluded:
YES

Relationship label excluded from features:
YES

kg_relation_exists excluded from RF features:
YES

category_overlap excluded from RF features:
YES

True multi-category multi-hot encoding:
YES

PACKAGE CONTENTS
----------------
This package contains the corrected model, evaluation results,
reproducibility record, split metadata, feature metadata, arrays,
label metadata, backend training payload/configuration, backend
training status, and final audit record.

OLD BACKEND ARTIFACTS
---------------------
The old backend relationship_model.json and relationship_predictions.json
are intentionally NOT replaced by this package.

RECOMMENDED REPORTING
---------------------
Use the corrected experiment as the primary corrected relationship
classification result:

Test Accuracy = 93.30%
Macro F1 = 89.99%

Always state that the evaluation is on synthetic held-out data.