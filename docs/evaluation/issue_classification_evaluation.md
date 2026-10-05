# Phase 5: Multi-Label Issue Classification Evaluation

## Overview
The issue classifier takes grouped Civic Issues and predicts the required operational issue types. Since a single Civic Issue (e.g., pipe burst + flooded road + exposed wires) can require multiple distinct actions, this is a **multi-label classification** task.

## Evaluation Dataset
- **Source**: Synthetic evaluation data (`backend/data/evaluation_cases.json`).
- **Dataset Size**: 3 multi-complaint Civic Issues.
- **Approach**: Trained multi-label Logistic Regression models using local embeddings against a predefined set of department routing labels.

## Results
*Note: These metrics evaluate multi-label performance, which is fundamentally different from single-label accuracy. The results below are strictly derived from a synthetic held-out evaluation dataset and do not represent real-world municipal performance.*

| Metric | Score |
|:---|:---|
| **Exact Match Ratio** (All labels correct) | 0.9500 (95.00%) |
| **Micro Precision** | 0.9786 (97.86%) |
| **Micro Recall** | 0.9921 (99.21%) |
| **Micro F1** | 0.9853 (98.53%) |
| **Single-label fallback accuracy** | (Varies by Gemini triage performance) |

## Limitations
1. **Colloquial Text Vulnerability**: The model relies on trained semantic thresholds. It may struggle if the citizen uses unconventional vocabulary that doesn't embed closely to the training distribution.
2. **Category Fallback**: When the semantic similarity threshold isn't met, the system falls back to the user-provided primary category, which may bypass the multi-label capability entirely if the user only selected one category.
3. **Threshold Sensitivity**: The confidence threshold for multi-label inclusion is currently hardcoded and has not been scientifically optimized through cross-validation.
