# Viva Explanation Notes

This document provides concise technical justifications for the architectural decisions made in GrievanceIQ, structured for a final-year project viva/defense.

## 1. Why use semantic embeddings instead of keyword matching?
Keyword matching (like standard SQL `LIKE`) fails when citizens describe the same issue using different vocabulary (e.g., "pothole" vs "broken road"). Semantic embeddings capture the contextual meaning of the text, allowing the system to match complaints that are linguistically different but topically identical.

## 2. Why a Hybrid AI Architecture (Gemini + Xenova/all-MiniLM-L6-v2)?
The system uses Google Gemini for initial complaint analysis (extracting priority, hazards, and categories) because LLMs excel at complex natural language understanding. However, for semantic matching and deduplication, we use `Xenova/all-MiniLM-L6-v2`. It is a highly optimized, lightweight (approx. 80MB) transformer model that runs locally via WebAssembly. This hybrid approach leverages the intelligence of an external LLM for intake while keeping the high-volume embedding and relationship generation entirely local and cost-free.

## 3. Why combine semantic similarity + location + time for duplicate detection?
Semantic similarity alone is insufficient because "Pothole on Main St" and "Pothole on 5th Ave" are semantically identical but physically distinct. By combining text similarity with the Haversine formula (for GPS distance) and a temporal cutoff (e.g., 30 days), we create a robust, multi-dimensional duplicate detection heuristic.

## 4. Why use Graph Connected Components?
Individual relationship predictions (e.g., A is related to B, B is related to C) are localized. A graph traversal algorithm (Connected Components) natively aggregates these transitive edges into a single macroscopic cluster (A-B-C), unifying disparate citizen reports into one holistic `Civic Issue`.

## 5. Why use zero-shot multi-label classification?
A single civic incident (e.g., a burst pipe flooding a street and exposing wires) requires multiple distinct actions. A traditional single-label classifier would only assign "Water Department", neglecting the road and electrical hazards. Our zero-shot embedding approach evaluates the aggregated complaint text against multiple department templates simultaneously, assigning all relevant departments that cross the confidence threshold.

## 6. Why use deterministic department mapping and task templates?
While AI is excellent at understanding natural language, operational execution requires strict predictability. Municipal workflows cannot rely on LLM hallucinations for safety-critical tasks. Deterministic rules ensure that if an "Electrical Hazard" is detected, the "Inspect wiring" task is generated exactly the same way every time.

## 7. Why model tasks as a Directed Acyclic Graph (DAG)?
Tasks cannot be executed in arbitrary order. A road cannot be resurfaced before the underlying water pipe is repaired. A DAG perfectly models these prerequisites while guaranteeing that execution flows strictly in one direction without circular dependencies.

## 8. Why Kahn's Topological Sort?
Kahn's Algorithm inherently detects circular dependencies (cycles) while flattening the DAG. If a cycle exists, Kahn's algorithm detects it; our implementation then reports the unresolved nodes. Crucially, tasks that are processed in the same iteration of Kahn's loop have zero inter-dependencies, meaning they can be executed safely in parallel. This allows the system to generate parallel "Execution Stages".

## 9. Why use Supabase?
Supabase is built on PostgreSQL, allowing us to leverage `pgvector` for native, high-performance vector similarity search (cosine distance) directly alongside our relational data schema, avoiding the complexity of maintaining a separate standalone vector database.

## 10. What are the limitations of the project?
- **Dataset Size**: The ML components (Relationship Classification) were validated against small prototype datasets, not historically verified municipal data.
- **Worker Optimization**: The execution DAG identifies logically parallel tasks but assumes infinite workforce availability. It does not perform resource-aware scheduling (e.g., optimizing truck routing or worker shifts).
- **Physical Dispatching**: The system is a closed loop and does not feature live API integration to physically dispatch municipal fleets.
- **CI-Certified vs. Production-Validated**: While the system is "CI-certified" (the automated backend test suite passes with 81 tests passing and 1 skipped within GitHub Actions infrastructure), it has not been stress-tested on live municipal production workloads. The certification proves functional and algorithmic correctness in the prototype environment, not real-world deployment scale, nor does it imply production-level security certification.
