# GrievanceIQ — Corrected Relationship Classification Experiment

## Dataset

Original relationship pairs: 16000

Usable relationship pairs: 10555

Excluded cross-split pairs: 5445

Training pairs: 8818

Validation pairs: 901

Test pairs: 836

## Split Method

Underlying issue-ID disjoint split.

Random state: 42

Train issue IDs: 1049

Validation issue IDs: 226

Test issue IDs: 225

Issue-ID overlap across splits: 0

## Feature Engineering

Feature count: 20

Category encoding: True multi-hot

Category A: Multi-hot

Category B: Multi-hot

Same-category definition: Any shared coarse category

Excluded leakage fields:

- same_issue
- relationship_label
- kg_relation_exists
- category_overlap

## Random Forest

Model: sklearn RandomForestClassifier

Trees: 10

Max features: 0.5

Bootstrap: True

Random state: 42

## Test Performance

Accuracy: 0.9330

Macro Precision: 0.8686

Macro Recall: 0.9476

Macro F1: 0.8999

## Per-Class F1

Duplicate: 0.9576

Similar: 0.9333

Related: 0.7368

Independent: 0.9717

## Evaluation Scope

Synthetic held-out test set only.

The results do not establish real-world generalization.

## Methodological Note

Relationship pairs crossing different issue-ID splits were excluded
rather than reassigned. This preserves complete disjointness of
underlying issue IDs between train, validation, and test sets.