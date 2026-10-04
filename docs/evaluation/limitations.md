# Known Project Limitations

This document objectively outlines the architectural, dataset, and implementation limitations of the GrievanceIQ prototype.

## 1. AI and Machine Learning Limitations
- **Small Prototype Relationship Dataset**: The active relationship classifier (corrected Python Flask model, with legacy Node fallback) was evaluated against a tiny, synthetic held-out dataset rather than a large corpus of real municipal data. Its performance in understanding highly colloquial or ungrammatical citizen reports in a live environment is unproven.
- **Zero-Shot Issue Classification**: The mapping of complaints to official department categories relies on a zero-shot semantic similarity threshold. It is vulnerable to misclassifying issues if the citizen uses vocabulary that does not semantically align with the predefined label names.
- **Prototype Duplicate Thresholds**: The combination of weights for text similarity, Haversine location distance, and the 30-day temporal cutoff are experimental. They have not been scientifically tuned using historical duplicate data.

## 2. Testing and Evaluation
- **Synthetic Evaluation Data**: All E2E validations rely on synthetic, idealized scenarios (e.g., "Water pipe burst"). Real civic data is noisier and more ambiguous.
- **CI-Certified vs. Production-Validated**: While the system is "CI-certified" (the automated backend test suite passes with 94 tests passing and 0 skipped within GitHub Actions infrastructure), it has not been stress-tested on live municipal production workloads. The CI certification proves algorithmic correctness in the prototype environment, not real-world deployment readiness, nor does it guarantee production-level security certification due to unresolved transitive dependencies.

## 3. Workflow and Architecture
- **Equal Task Weighting in Progress**: The Civic Issue progress calculation treats all tasks equally (e.g., "Inspect leakage" is mathematically equal to "Rebuild entire road segment"). True progress tracking would require effort/time estimations per task.
- **No Resource-Aware Scheduling**: The execution plan generates valid dependency stages (DAG) but assumes infinite workers. It does not optimize routing based on actual workforce availability, shifts, or travel time.
- **No Cross-Civic-Issue Dependency Management**: If Civic Issue A and Civic Issue B both require digging up the exact same intersection, the system cannot currently identify that dependency clash. DAGs are isolated per Civic Issue.
- **No External Municipal System Integration**: The platform operates as a closed sandbox. It does not actually dispatch trucks, ping live GPS trackers, or write to external legacy government databases.
- **Task Identifiers**: The dependency logic now relies on template_id to link prerequisite constraints robustly.
- **Transactional Task Updates**: Task execution uses the transactional RPC path currently implemented to prevent desync between audit logs and the underlying task status.
