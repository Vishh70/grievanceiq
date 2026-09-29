# Phase 2: Duplicate Detection Evaluation

## Overview
Duplicate detection operates as a multi-dimensional filter rather than a pure NLP model. It calculates a weighted Duplicate Score combining:
1. **Semantic Similarity** (Cosine similarity of embeddings)
2. **Location Distance** (Haversine formula on GPS coordinates)
3. **Temporal Proximity** (Time difference)

## Evaluation Dataset
- **Source**: Synthetic evaluation data (`backend/data/evaluation_cases.json`).

## Expected Behavior Matrix
| Scenario | Expected Outcome | Actual Outcome |
|:---|:---|:---|
| Same wording + nearby GPS + nearby time | Duplicate | PASS |
| Same wording + far-away GPS | Not Duplicate | PASS |
| Same place + unrelated text | Not Duplicate | PASS |
| Same issue + old timestamp (>30 days) | Not Duplicate | PASS |
| Missing GPS | Graceful degradation (uses text only) | PASS |
| Missing embedding | Fails safely | PASS |

## Results
*Note: Due to the heuristic nature of the thresholds, full precision/recall metrics require a large dataset of historical, verified duplicates which is unavailable.*

| Metric | Score |
|:---|:---|
| **True Positives** | NOT MEASURED |
| **False Positives** | NOT MEASURED |
| **True Negatives** | NOT MEASURED |
| **False Negatives** | NOT MEASURED |
| **Precision** | NOT MEASURED |
| **Recall** | NOT MEASURED |
| **F1 Score** | NOT MEASURED |

## Limitations
1. **Unoptimized Thresholds**: The threshold for detecting a duplicate is currently hardcoded based on prototype assumptions. It is not scientifically optimal for a live city environment.
2. **GPS Reliance**: False negatives are highly likely if one user submits a complaint with GPS and another user submits the identical physical issue without GPS or with an inaccurate GPS lock, as the Haversine distance penalty will falsely separate them.
3. **Temporal Cutoff**: The strict 30-day cutoff means an unresolved issue submitted on day 1 and submitted again on day 32 will not be flagged as a duplicate.
