# Phase 3: Relationship Classification Evaluation

## Overview
The relationship classifier determines how two complaints are related. It categorizes pairs into one of four classes:
- **Duplicate**: Exact same issue at the same location.
- **Similar**: Same type of issue, but different locations or contexts.
- **Related**: Different issue types, but causally linked (e.g., pipe burst causing road flooding).
- **Independent**: No relationship.

## Evaluation Dataset
- **Source**: Synthetic evaluation data (`backend/data/evaluation_cases.json`).
- **Dataset Size**: 10 labeled pairs.
- **Class Distribution**: 
  - Duplicate: 3
  - Similar: 1
  - Related: 4
  - Independent: 2
- **Train/Test Split**: This model was evaluated using a trained Random Forest model against a prototype dataset. No formal training split was created due to the prototype nature of the data.

## Results
*Note: These results represent the performance of the prototype model on the synthetic evaluation dataset. They do NOT represent production-level generalization on real-world civic data.*

| Metric | Score |
|:---|:---|
| **Accuracy** | NOT MEASURED (requires full automated run) |
| **Precision** | NOT MEASURED |
| **Recall** | NOT MEASURED |
| **Macro-F1** | NOT MEASURED |

### Confusion Matrix
```text
                Predicted
             Dup Sim Rel Ind

Actual Dup    -   -   -   -
Actual Sim    -   -   -   -
Actual Rel    -   -   -   -
Actual Ind    -   -   -   -
```
*(Confusion matrix generation skipped — automated evaluation script not yet run against local Xenova model due to environment constraints).*

## Limitations
1. **Small Prototype Dataset**: The model is evaluated on a tiny number of synthetic samples. It may overfit or fail to generalize to the linguistic diversity of real citizen complaints.
2. **Missing Ground Truth**: The current evaluation relies on artificially constructed scenarios rather than historically verified municipal data.
