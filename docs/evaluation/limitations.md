# Known Project Limitations

This document objectively outlines the architectural, dataset, and implementation limitations of the GrievanceIQ prototype.

## 1. AI and Machine Learning Limitations
- **Small Prototype Relationship Dataset**: The relationship classifier was validated against a tiny, synthetic test dataset rather than a large corpus of real municipal data. Its performance in understanding highly colloquial or ungrammatical citizen reports in a live environment is unproven.
- **Zero-Shot Issue Classification**: The mapping of complaints to official department categories relies on a zero-shot semantic similarity threshold. It is vulnerable to misclassifying issues if the citizen uses vocabulary that does not semantically align with the predefined label names.
- **Prototype Duplicate Thresholds**: The combination of weights for text similarity, Haversine location distance, and the 30-day temporal cutoff are experimental. They have not been scientifically tuned using historical duplicate data.

## 2. Testing and Evaluation
- **Synthetic Evaluation Data**: All E2E validations rely on synthetic, idealized scenarios (e.g., "Water pipe burst"). Real civic data is noisier and more ambiguous.
- **Windows Jest / Transformer VM Teardown**: There is an unresolved upstream issue with running Node.js experimental VM modules containing local ONNX Transformers on Windows. This causes hanging teardowns in Jest (`Jest did not exit one second after the test run has completed`). It is an environment/test-runner warning and does not affect production execution.

## 3. Workflow and Architecture
- **Equal Task Weighting in Progress**: The Civic Issue progress calculation treats all tasks equally (e.g., "Inspect leakage" is mathematically equal to "Rebuild entire road segment"). True progress tracking would require effort/time estimations per task.
- **No Resource-Aware Scheduling**: The execution plan generates valid dependency stages (DAG) but assumes infinite workers. It does not optimize routing based on actual workforce availability, shifts, or travel time.
- **No Cross-Civic-Issue Dependency Management**: If Civic Issue A and Civic Issue B both require digging up the exact same intersection, the system cannot currently identify that dependency clash. DAGs are isolated per Civic Issue.
- **No External Municipal System Integration**: The platform operates as a closed sandbox. It does not actually dispatch trucks, ping live GPS trackers, or write to external legacy government databases.
