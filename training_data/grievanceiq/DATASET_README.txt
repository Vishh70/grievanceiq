GRIEVANCEIQ FINAL DATA PACKAGE
=============================

LOCKED PROJECT ARCHITECTURE
----------------------------
1. Pretrained Sentence Transformer (all-MiniLM-L6-v2) -> embeddings; no training from scratch.
2. Multi-label classifier -> TRAINED on complaint text/embedding -> issue types.
3. Hybrid duplicate detection -> cosine similarity + Haversine + time + optional image signal.
4. Relationship classifier -> TRAINED on complaint pairs + structured features -> Duplicate/Similar/Related/Independent.
5. Civic Knowledge Graph -> domain relation/features; NOT an ML model.
6. Connected Components -> civic issue grouping; NOT an ML model.
7. Department mapping -> deterministic database/rules; NOT an ML model.
8. Workflow rules -> task generation and dependency definition; NOT an ML model.
9. DAG + Topological Sort -> deterministic task sequencing; NOT an ML model.
10. CLIP -> optional pretrained image component; no training in the first version.

FILES (5 core files)
--------------------
1) grievanceiq_complaints_multilabel_6000.csv
   6000 synthetic complaint records.
   Purpose: train the multi-label classifier.
   Key fields:
   - complaint_text
   - issue_types (pipe-separated labels)
   - fine-grained *_flag columns for all 9 issue types
   - location_name, latitude, longitude, timestamp
   - urgency
   - responsible_departments

2) grievanceiq_relationship_pairs_16000.csv
   16000 synthetic complaint pairs.
   Class balance:
   - Duplicate: 4000
   - Similar: 3500
   - Related: 3500
   - Independent: 5000
   Purpose: train the relationship classifier.
   Key features:
   - complaint_a_text / complaint_b_text
   - category_a / category_b
   - distance_km
   - time_difference_hours
   - same_location_name
   - category_overlap
   - kg_relation_type / kg_relation_exists
   - same_issue
   - relationship_label
   IMPORTANT: during training, compute Sentence Transformer cosine similarity
   from the two raw complaint texts. Do NOT fake a semantic similarity value.

3) grievanceiq_knowledge_graph_relations.csv
   Civic-domain graph edges such as:
   Water Leakage -> can_cause -> Road Damage.
   Purpose: domain knowledge and relationship features; not ML training.

4) grievanceiq_department_mapping.csv
   Deterministic mapping:
   issue type -> responsible department.
   Purpose: routing; not ML training.

5) grievanceiq_workflow_task_dependency_rules.csv
   Deterministic task templates and dependencies.
   Covers every single-label and every multi-label combination present in
   grievanceiq_complaints_multilabel_6000.csv.
   Purpose: task generation, parallel-work definition, and dependency graph creation.
   It is NOT an ML training dataset.

OPTIONAL / NOT NEEDED NOW
-------------------------
No separate image-training dataset is required for the first version.
CLIP is pretrained and image similarity is optional.
No separate urgency-training dataset is required initially because priority is a
hybrid rule/scoring engine.

DATA LIMITATION
---------------
All generated records are synthetic. They are suitable for prototyping,
demonstrating the pipeline, and initial model development. Synthetic performance
does not establish real-world generalization. For final evaluation:
- keep a manually reviewed held-out test set;
- split relationship data by issue_id/group to avoid leakage;
- report precision, recall, F1 and confusion matrix;
- do not claim real-world accuracy from synthetic data alone.
