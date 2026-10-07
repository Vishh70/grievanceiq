# Related Work & Differentiation

## Existing Civic Complaint Platforms

Existing civic complaint platforms commonly focus on complaint submission, automated classification, priority estimation, duplicate detection, geospatial clustering, citizen tracking, and routing to an appropriate department. Representative open-source systems such as CivicSense, CivicLens, CivicFlow, JanMitra AI, and Samasya.ai demonstrate combinations of these capabilities, including semantic similarity, hotspot detection, image-assisted classification, department routing, and complaint clustering.

### Capabilities Found in Multiple Public Implementations

| Capability | Public Implementations |
|---|---|
| Citizen complaint portal | ✅ Many |
| Text/image/location input | ✅ Many |
| AI-assisted classification | ✅ Many |
| Priority/urgency scoring | ✅ Many |
| Semantic embeddings | ✅ Many |
| Duplicate detection | ✅ Many |
| Geospatial/temporal clustering | ✅ Existing |
| Hotspot detection | ✅ Existing |
| Single-department routing | ✅ Many |
| Multi-department coordination (concept) | 🟡 Some claims |

### Capabilities Not Found in Inspected Public Civic Repositories

| Capability | Status |
|---|---|
| Typed complaint relationships (Duplicate/Similar/Related/Independent) with trained classifier | 🟡 Partial |
| Complaint relationship graph → Connected Components → Civic Issue entity | 🔴 Not found |
| Multi-department task generation from issue types | 🔴 Not found |
| Sequential/parallel task dependency DAG | 🔴 Not found |
| Kahn's topological sort → execution stages | 🔴 Not found |
| Dependency cycle detection (coordination deadlock) | 🔴 Not found |
| Coordinated multi-department issue closure gate | 🔴 Not found |

## GrievanceIQ Differentiation

GrievanceIQ builds on established civic complaint capabilities but extends the processing pipeline from individual complaint handling to **issue-centric resolution coordination**.

The system first extracts semantic, spatial, temporal, and category-based features from complaint pairs and classifies their relationship as Duplicate, Similar, Related, or Independent using a Random Forest model trained on labelled pairs (`relationship_pairs.csv`). These relationships are then represented as a complaint graph, where meaningful Duplicate and Related edges are used to identify connected components corresponding to broader Civic Issues.

For each Civic Issue, GrievanceIQ performs multi-label issue classification and maps the resulting issue types to **all applicable municipal departments** rather than restricting the issue to a single department. Departmental workstreams are then generated from deterministic task templates.

The resulting workstreams are converted into a dependency-aware **Directed Acyclic Graph (DAG)**. Kahn's topological sorting produces executable stages, allowing independent tasks to proceed in parallel while prerequisite-dependent tasks remain locked until their dependencies are completed. The system validates the graph for cycles via Kahn's residual-node detection: when the sorted node count is smaller than the total task count, the remaining nodes are reported as the cycle set.

Finally, task execution is propagated upward to workstream and Civic Issue status. A Civic Issue is not considered complete merely because one department has finished its task; its overall status reflects the state of **all** required coordinated tasks.

## Core Differentiation Statement

The primary differentiation of GrievanceIQ is not any individual AI capability such as complaint classification or duplicate detection. Rather, it is the integration of relationship intelligence, issue aggregation, multi-department routing, dependency-aware task execution, and issue-level resolution tracking into a single operational pipeline.

In our GitHub landscape audit, we found several public civic systems implementing individual components of this workflow, but we did not identify a public civic implementation that combines the complete chain in the same operational architecture:

```text
Typed Complaint Relationships
        ↓
Complaint Graph
        ↓
Civic Issue (Connected Components)
        ↓
Multi-Department Routing
        ↓
Task DAG
        ↓
Parallel/Sequential Execution Stages
        ↓
Dependency Validation
        ↓
Coordinated Issue Closure
```

GrievanceIQ should therefore be described as an **Issue-Centric Civic Resolution Intelligence** system, rather than simply another AI-powered complaint portal.

## Important Qualifications

- The relationship classifier was trained and validated on a **small, synthetic prototype dataset**, not large-scale verified municipal data. The strongest claim is architectural/operational differentiation, not that the relationship model has been proven superior on real-world municipal data.
- Multi-department coordination exists as a general **product concept** in some civic platforms, but in the public repositories inspected, the data model was typically centered around a single `assignedDepartment` field rather than the full dependency-aware multi-department task workflow implemented here.
- This audit covered the **public GitHub landscape** at the time of the project. It does not constitute a formal systematic literature review and does not claim absolute novelty.
