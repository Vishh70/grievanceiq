# GrievanceIQ: Project Summary

## Problem
Modern municipal departments operate in silos. When a complex civic incident occurs (e.g., a burst water pipe flooding a road), citizens submit uncoordinated, overlapping complaints. Existing platforms lack the intelligence to deduplicate these reports, understand the root relationship between them, or automatically sequence the required cross-departmental repair tasks. This results in duplicated municipal effort, delayed response times, and broken operational dependencies (e.g., repairing the road before fixing the pipe).

## Solution
GrievanceIQ is an end-to-end civic intelligence and operational routing platform. It ingests unstructured citizen reports, uses a hybrid AI architecture (Gemini + Local Transformers) to deduplicate and cluster them into unified Civic Issues, and applies deterministic graph algorithms to construct dependency-aware execution plans for municipal departments.

## Architecture
The system employs a cascading hybrid architecture:
1. **AI/ML Intake**: Understands and clusters unstructured text using Google Gemini and local semantic models.
2. **Deterministic Routing**: Maps AI outputs to strict operational workflows.
3. **Graph Execution**: Enforces chronological safety across municipal tasks.

## AI / ML Components
- **Google Gemini**: Initial complaint understanding, category, priority, hazards, and suggested action.
- **Local Transformers**: Runs `Xenova/all-MiniLM-L6-v2` locally via WebAssembly for embeddings and semantic similarity.
- **Local Random Forest**: Evaluates complaint relationships.
- **Duplicate Detection**: A multi-dimensional heuristic combining semantic cosine similarity, geographic distance (Haversine), and temporal proximity.
- **Multi-Label Zero-Shot Classification**: Evaluates semantic similarity between complaint embeddings and departmental templates to assign multiple required departments to a single root cause.

## Algorithms
- **Connected Components (Graph)**: Traverses localized complaint relationships (Duplicate, Similar, Related) to form a unified, macroscopic `Civic Issue`.
- **Kahn's Topological Sort (DAG)**: Detects circular workflow cycles and flattens a Directed Acyclic Graph of tasks into safe, parallel execution stages.

## Database
- **Supabase / PostgreSQL**: Provides robust relational structure for execution lifecycles while leveraging the `pgvector` extension for high-performance native vector similarity search.

## Frontend
- **React + Vite**: A responsive Single Page Application (SPA) offering a Citizen Submission Portal and an Admin Dashboard that visually models real-time topological execution plans.

## Backend
- **Node.js / Express**: A REST API managing the state machine, invoking hybrid AI pipelines, running graph traversals, and enforcing strict HTTP constraints on task state transitions.

## Evaluation
The intelligent components were validated against synthetic prototype datasets specifically constructed to represent challenging civic ambiguities (e.g., related cascading failures). Deterministic algorithms (Topological Sorting, Graph Traversal, and state transitions) were heavily validated via an isolated end-to-end regression test suite. 

## Limitations
The project relies on a small prototype dataset for its relationship classification model and hard-coded zero-shot thresholds. While the system is fully "CI-certified"—meaning the codebase successfully executes its automated end-to-end regression suite (including real AI model inference and graph traversals) inside GitHub Actions—it has not been validated on real-world municipal production workloads. It successfully calculates logical task dependencies but lacks physical resource-aware scheduling (truck routing, workforce availability) and does not integrate into legacy government dispatch systems.

## Future Work
Subsequent iterations would focus on training the sequence classifier on a massive corpus of verified municipal data, extending the topological sort to support resource-constrained critical path analysis, and providing geospatial dashboards for live worker dispatching.
