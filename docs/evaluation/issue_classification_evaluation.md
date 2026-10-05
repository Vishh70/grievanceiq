# Phase 5: Multi-Label Issue Classification Evaluation

## Overview
The issue classifier takes grouped Civic Issues and predicts the required operational issue types. Since a single Civic Issue (e.g., pipe burst + flooded road + exposed wires) can require multiple distinct actions, this is a **multi-label classification** task.

## Evaluation Dataset
- **Source**: Synthetic evaluation data (`backend/data/evaluation_cases.json`).
- **Dataset Size**: 3 multi-complaint Civic Issues.
- **Approach**: Trained multi-label Logistic Regression models using local embeddings against a predefined set of department routing labels.

## Results
*Note: These metrics evaluate multi-label performance, which is fundamentally different from single-label accuracy. The results are from a mocked prototype dataset.*

| Metric | Score |
|:---|:---|
| **Exact Match Ratio** (All labels correct) | NOT MEASURED |
| **Micro Precision** | NOT MEASURED |
| **Micro Recall** | NOT MEASURED |
| **Micro F1** | NOT MEASURED |
| **Single-label fallback accuracy** | NOT MEASURED |

## Limitations
1. **Colloquial Text Vulnerability**: The model relies on trained semantic thresholds. It may struggle if the citizen uses unconventional vocabulary that doesn't embed closely to the training distribution.
2. **Category Fallback**: When the semantic similarity threshold isn't met, the system falls back to the user-provided primary category, which may bypass the multi-label capability entirely if the user only selected one category.
3. **Threshold Sensitivity**: The confidence threshold for multi-label inclusion is currently hardcoded and has not been scientifically optimized through cross-validation.
