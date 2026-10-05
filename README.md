<div align="center">

<img src="docs/assets/hero_banner.jpg" width="100%" alt="GrievanceIQ Hero Banner" style="border-radius: 12px; margin-bottom: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);"/>

<br/>

<h1 align="center" style="font-size: 3em; margin-top: 10px; font-weight: 800;">🏛️ GrievanceIQ</h1>

<p align="center" style="font-size: 1.2em; color: #667eea; font-weight: 500;">
  Transforming unstructured citizen complaints into structured Civic Issues,<br/>
  deterministic departmental workstreams, and dependency-aware municipal tasks.
</p>

<br/>

<!-- ANIMATED SHIELDS -->
<a href="https://github.com/Vishh70/grievanceiq/actions/workflows/backend-ci.yml">
  <img src="https://img.shields.io/github/actions/workflow/status/Vishh70/grievanceiq/backend-ci.yml?branch=main&label=Backend%20CI&style=for-the-badge&color=2ea043&logo=githubactions" alt="Backend CI" />
</a>
<a href="https://github.com/Vishh70/grievanceiq/actions/workflows/frontend-ci.yml">
  <img src="https://img.shields.io/github/actions/workflow/status/Vishh70/grievanceiq/frontend-ci.yml?branch=main&label=Frontend%20CI&style=for-the-badge&color=2ea043&logo=githubactions" alt="Frontend CI" />
</a>
<a href="https://github.com/Vishh70/grievanceiq/commits/main">
  <img src="https://img.shields.io/github/last-commit/Vishh70/grievanceiq?style=for-the-badge&color=blue" alt="Last Commit" />
</a>

<br/><br/>

<!-- TECH STACK SHIELDS -->
<img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node" />
<img src="https://img.shields.io/badge/Python-3.10+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python" />
<img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
<img src="https://img.shields.io/badge/Supabase-DB-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
<img src="https://img.shields.io/badge/Redis-Queue-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis" />

<br/>

<!-- ML SHIELDS -->
<img src="https://img.shields.io/badge/Scikit--Learn-Random%20Forest-F7931E?style=for-the-badge&logo=scikitlearn&logoColor=white" alt="Sklearn" />
<img src="https://img.shields.io/badge/ONNX-MiniLM-005CED?style=for-the-badge&logo=onnx&logoColor=white" alt="ONNX" />
<img src="https://img.shields.io/badge/Gemini-AI-4285F4?style=for-the-badge&logo=google&logoColor=white" alt="Gemini" />
<img src="https://img.shields.io/badge/Flask-Inference-000000?style=for-the-badge&logo=flask&logoColor=white" alt="Flask" />

<br/>
<br/>

</div>

## 📑 Table of Contents

<details open>
<summary><b>Show / Hide Menu</b></summary>
<br/>

1. [🎯 The Problem](#-the-problem)
2. [💡 Why GrievanceIQ?](#-why-grievanceiq)
3. [🔭 System Overview](#-system-overview)
4. [🏗️ Architecture](#️-architecture)
   - [High-Level Architecture](#high-level-architecture)
   - [Complaint Processing Flow](#complaint-processing-flow)
   - [Relationship & Task Graphs](#complaint-relationship-graph)
5. [✨ Core Features](#-core-features)
6. [🧠 AI / ML Pipeline](#-ai--ml-pipeline)
7. [📊 Evaluation Results](#-evaluation-results)
8. [🚀 Quick Start](#-quick-start)
9. [🎓 Viva-Ready Reference](#-viva-ready-reference)

</details>

<br/>

---

## 🎯 The Problem

Citizen complaints to municipalities are historically **unstructured**, **duplicated**, **ambiguous**, **multi-issue**, and **geographically scattered**. This makes them incredibly hard to route manually.

GrievanceIQ solves this with an end-to-end intelligent pipeline:

<pre>
📝 Unstructured Complaint
  ↳ 🧠 Semantic Embedding <kbd>MiniLM-L6</kbd>
    ↳ 🏷️ Multi-Label Classification <kbd>9 issue types</kbd>
      ↳ 🔗 Relationship Detection <kbd>Random Forest</kbd>
        ↳ 🏘️ Civic Issue Grouping <kbd>Connected Components</kbd>
          ↳ 🏢 Department Routing <kbd>Deterministic Mapping</kbd>
            ↳ 📋 Task Generation <kbd>DAG + Kahn's Sort</kbd>
              ↳ ✅ Transactional Execution <kbd>PostgreSQL RPC</kbd>
</pre>

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 💡 Why GrievanceIQ?

<table>
  <thead>
    <tr>
      <th width="35%">Problem</th>
      <th width="65%">GrievanceIQ Approach</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>🔄 <b>Duplicate complaints</b></td>
      <td>Hybrid semantic + location + temporal duplicate detection</td>
    </tr>
    <tr>
      <td>🔗 <b>Related complaints</b></td>
      <td>ML relationship classifier + graph-based grouping</td>
    </tr>
    <tr>
      <td>🏷️ <b>Multiple issue types</b></td>
      <td>9-label multi-label classifier (<b>98.53% Micro F1</b>)</td>
    </tr>
    <tr>
      <td>🏢 <b>Unclear responsibility</b></td>
      <td>Deterministic <code>issue-type → department</code> mapping</td>
    </tr>
    <tr>
      <td>📊 <b>Operational sequencing</b></td>
      <td>Dependency DAG + Kahn's topological sort</td>
    </tr>
    <tr>
      <td>🔒 <b>Inconsistent states</b></td>
      <td>Transactional PostgreSQL task execution via RPC</td>
    </tr>
    <tr>
      <td>🧩 <b>Relationship explainability</b></td>
      <td>Knowledge Graph enrichment layer</td>
    </tr>
    <tr>
      <td>📎 <b>Data loss during merges</b></td>
      <td>Deterministic Civic Issue merge policy (Count → Priority → Age → UUID)</td>
    </tr>
  </tbody>
</table>

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 🔭 System Overview

GrievanceIQ is structured into **nine logical layers**:

<div align="center">
<table>
<tr>
<td width="50" align="center"><b>Layer</b></td>
<td><b>Component</b></td>
<td><b>Technology / Algorithm</b></td>
</tr>
<tr><td align="center">1</td><td><b>Presentation</b></td><td>React 19 + Vite + TypeScript</td></tr>
<tr><td align="center">2</td><td><b>Application</b></td><td>Node.js 22 + Express + JWT + Zod</td></tr>
<tr><td align="center">3</td><td><b>Async Processing</b></td><td>BullMQ + Redis</td></tr>
<tr><td align="center">4</td><td><b>AI / ML Intelligence</b></td><td>Gemini + MiniLM + Logistic Regression + Random Forest</td></tr>
<tr><td align="center">5</td><td><b>Relationship Graph</b></td><td>Graph Construction + Knowledge Enrichment</td></tr>
<tr><td align="center">6</td><td><b>Civic Issue Aggregation</b></td><td>Connected Components + Deterministic Merge Policy</td></tr>
<tr><td align="center">7</td><td><b>Deterministic Routing</b></td><td><code>routing_rules.json</code> + Department Mapping</td></tr>
<tr><td align="center">8</td><td><b>Workflow Execution</b></td><td>DAG + Kahn's Sort + Transactional RPC</td></tr>
<tr><td align="center">9</td><td><b>Infrastructure</b></td><td>Supabase PostgreSQL + Redis + Flask Artifacts</td></tr>
</table>
</div>

> [!NOTE]
> The system operates via **near-real-time 5-second polling** and **controlled human operator execution** — not real-time WebSockets or autonomous physical municipal dispatch.

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 🏗️ Architecture

### High-Level Architecture

```mermaid
flowchart TB

    subgraph FE["🖥️ Presentation Layer — React 19 + Vite"]
        Citizen["👤 Citizen"]
        Admin["🔧 Admin / Operator"]
        Submit["Complaint Submission"]
        Poll["Status Polling<br/>5-second interval"]
        Dashboard["Admin Dashboard"]
        Public["Public Complaint Feed"]

        Citizen --> Submit
        Citizen --> Poll
        Admin --> Dashboard
        Public --> Citizen
    end

    subgraph API["⚙️ Application Layer — Node.js + Express"]
        Auth["🔑 JWT Auth / Authorization"]
        ComplaintAPI["Complaint API"]
        CivicAPI["Civic Issue API"]
        TaskAPI["Task API"]
        Controller["Controllers / Routes"]

        Submit --> ComplaintAPI
        Dashboard --> CivicAPI
        Dashboard --> TaskAPI
        ComplaintAPI --> Controller
        CivicAPI --> Controller
        TaskAPI --> Controller
        Auth --> Controller
    end

    subgraph ASYNC["🔄 Asynchronous Processing Layer"]
        Queue["BullMQ Queue"]
        Worker["Complaint Worker"]
        Recovery["Startup Recovery"]

        Controller --> Queue
        Queue --> Worker
        Recovery --> Queue
    end

    subgraph INTEL["🧠 AI / ML Intelligence Layer"]
        Gemini["Gemini<br/>Initial complaint understanding"]
        MiniLM["Xenova/all-MiniLM-L6-v2<br/>384-dim embedding"]
        MultiLabel["9 × Logistic Regression<br/>Multi-label issue classifier"]
        Duplicate["Hybrid Duplicate Detection<br/>Semantic + Location + Temporal"]
        RF["Random Forest<br/>Relationship Classifier"]
        MLAPI["🐍 Python Flask ML Service"]

        Worker --> Gemini
        Worker --> MiniLM
        MiniLM --> MultiLabel
        MiniLM --> Duplicate
        Worker --> MLAPI
        MLAPI --> RF
    end

    subgraph GRAPH["🕸️ Relationship & Knowledge Graph Layer"]
        Relation["Relationship Result"]
        KG["Civic Knowledge Graph<br/>Enrichment / Explainability"]
        Persist["Relationship Persistence"]
        RGraph["Complaint Relationship Graph"]
        CC["Connected Components"]

        RF --> Relation
        Relation --> KG
        Relation --> Persist
        Relation --> RGraph
        RGraph --> CC
    end

    subgraph ISSUE["🏘️ Civic Issue Aggregation"]
        Civic["Civic Issue Creation / Update"]
        Merge["Deterministic Merge Policy<br/>Count → Priority → Age → UUID"]

        CC --> Civic
        Civic --> Merge
    end

    subgraph ROUTE["🏢 Deterministic Routing Layer"]
        Rules["routing_rules.json"]
        Aggregate["Aggregate ML Issue Labels"]
        Department["Issue Type → Department"]
        Workstream["Workstream Generation"]
        Tasks["Task Template Generation"]

        Merge --> Aggregate
        Rules --> Aggregate
        Aggregate --> Department
        Department --> Workstream
        Workstream --> Tasks
        Rules --> Tasks
    end

    subgraph WF["📋 Workflow / Execution Layer"]
        DepRules["Dependency Rules"]
        DAG["Task Dependency DAG"]
        Kahn["Kahn Topological Sort"]
        Ready["Task Readiness"]
        Execute["👷 Human Operator Execution"]
        RPC["Transactional PostgreSQL RPC"]

        Tasks --> DAG
        DepRules --> DAG
        DAG --> Kahn
        Kahn --> Ready
        Ready --> Execute
        Execute --> RPC
    end

    subgraph DATA["💾 Persistence / Infrastructure"]
        DB[("Supabase / PostgreSQL")]
        Redis[("Redis")]
        Models["Trained ML Artifacts"]

        Controller --> DB
        Queue --> Redis
        Worker --> DB
        Persist --> DB
        Civic --> DB
        Workstream --> DB
        Tasks --> DB
        RPC --> DB
        MLAPI --> Models
    end

    Poll --> ComplaintAPI
    ComplaintAPI --> DB
    DB --> Poll
```

### Complaint Relationship Graph

GrievanceIQ distinguishes between **relationship prediction** and **graph grouping**:

```mermaid
flowchart LR

    A["Complaint A"]
    B["Complaint B"]
    C["Complaint C"]
    D["Complaint D"]

    A ---|"✅ Duplicate"| B
    B ---|"✅ Related"| C
    A ---|"❌ Similar — ignored for grouping"| D

    subgraph G["Grouping Graph"]
        A
        B
        C
    end

    G --> CC["Connected Component<br/>{A, B, C} → Civic Issue"]
```

> [!IMPORTANT]
> The relationship classifier predicts `Duplicate`, `Similar`, `Related`, or `Independent`. For Civic Issue formation, **only `Duplicate` and `Related`** create graph edges. `Similar` is intentionally excluded to reduce false merges.

### Task Dependency Graph

<table>
<tr>
<td>

**Single-department pipeline:**
```mermaid
flowchart LR
    I["🔍 Inspect"] --> R["🔧 Repair"] --> V["✅ Verify"]
```

</td>
<td>

**Cross-department dependencies:**
```mermaid
flowchart LR
    E["⚡ Electrical Verify"] --> W["🚰 Water Repair"] --> F["🌊 Flood Restore"]
```

</td>
</tr>
</table>

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## ✨ Core Features

<details>
<summary><b>🧠 Intelligent Complaint Intake</b></summary>
<blockquote>
<p>Complaint persistence with full metadata, asynchronous BullMQ processing, and <code>PROCESSING → PROCESSED / FAILED</code> lifecycle management. Features Gemini-powered initial triage and near-real-time 5-second status polling.</p>
</blockquote>
</details>

<details>
<summary><b>🏷️ Multi-Label Issue Classification</b></summary>
<blockquote>
<p>Utilizes 9 independent Logistic Regression classifiers acting on 384-dimensional embeddings (<code>Xenova/all-MiniLM-L6-v2</code>). Resolves issues like Road damage, Water leakage, and Tree hazards simultaneously.</p>
</blockquote>
</details>

<details>
<summary><b>🔗 Relationship Classification & 🔍 Duplicate Detection</b></summary>
<blockquote>
<p>A scikit-learn Random Forest (10 trees) processes 20 structured features to predict <code>Duplicate</code>, <code>Similar</code>, <code>Related</code>, or <code>Independent</code>. Pre-filtered by a hybrid semantic + location + temporal duplicate detection heuristic.</p>
</blockquote>
</details>

<details>
<summary><b>🏘️ Civic Issue Aggregation & 🏢 Routing</b></summary>
<blockquote>
<p>Undirected graph traversal (Connected Components) merges complaints using a deterministic policy (Count → Priority → Age → UUID). Routing rules map aggregated ML labels directly to departmental workstreams.</p>
</blockquote>
</details>

<details>
<summary><b>📋 Workflow Task Execution</b></summary>
<blockquote>
<p>Dependency DAG processed via Kahn's topological sort ensures execution ordering. Task status transitions are strictly enforced via Transactional PostgreSQL RPC.</p>
</blockquote>
</details>

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 🧠 AI / ML Pipeline

GrievanceIQ utilizes **three distinct intelligence mechanisms** operating in concert:

<div align="center">

| 🤖 **Gemini API** | 🏷️ **Multi-Label Classifier** | 🔗 **Relationship Classifier** |
|:---:|:---:|:---:|
| **Initial Understanding** | **9 Issue Categories** | **Complaint Pairs** |
| External API call for complaint triage and initial categorization. | <code>Text → 384-dim Embedding → Logistic Regression ×9 → 9 Flags</code> | <code>A + B → 20 Structured Features → Random Forest → Dup/Sim/Rel/Ind</code> |

</div>

<br/>

### Relationship Feature Vector (20 Features)

<table>
<tr>
<td>

**6 Scalar Features**
1. `semantic_similarity`
2. `location_score`
3. `temporal_score`
4. `duplicate_score`
5. `duplicate_flag`
6. `same_category`

</td>
<td>

**7 Category Indicators (A)**
7–13. Category flags for Complaint A

</td>
<td>

**7 Category Indicators (B)**
14–20. Category flags for Complaint B

</td>
</tr>
</table>

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 📊 Evaluation Results

> [!CAUTION]
> All ML metrics are based on **synthetic held-out evaluation data** and must not be interpreted as real-world municipal accuracy.

<table>
<tr>
<td width="50%">

### 🔗 Relationship Classifier

| Metric | Value |
|:-------|------:|
| **Test Accuracy** | **93.30%** |
| Macro Precision | 86.86% |
| Macro Recall | 94.76% |
| **Macro F1** | **89.99%** |

| Config | Detail |
|:-------|:-------|
| Dataset | 16,000 → 10,555 usable pairs |
| Split | 8,818 / 901 / 836 |
| Features | 20 |
| Model | Random Forest (10 trees) |

</td>
<td width="50%">

### 🏷️ Multi-Label Classifier

| Metric | Value |
|:-------|------:|
| **Exact Match** | **95.00%** |
| Micro Precision | 97.86% |
| Micro Recall | 99.21% |
| **Micro F1** | **98.53%** |
| Macro F1 | 98.50% |

| Config | Detail |
|:-------|:-------|
| Labels | 9 |
| Embedding | 384 dimensions |
| Split | 4,196 / 904 / 900 |
| Model | 9 × Logistic Regression |

</td>
</tr>
</table>

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 🚀 Quick Start

### 1️⃣ Clone & Install

```bash
git clone https://github.com/Vishh70/grievanceiq.git
cd grievanceiq

npm ci --prefix backend
npm ci --prefix frontend
pip install -r backend/ml/requirements.txt
```

### 2️⃣ Configure Environment

Create `backend/.env`:

```env
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_supabase_anon_key
GEMINI_API_KEY=your_gemini_api_key
ML_SERVICE_URL=http://localhost:5001
NODE_ENV=development
```

### 3️⃣ Start Services

Start all three local services in separate terminal instances:

```bash
python backend/ml/inference/grievanceiq_inference.py  # Terminal 1: Port 5001
npm run dev --prefix backend                          # Terminal 2: Port 5000
npm run dev --prefix frontend                         # Terminal 3: Port 5173
```

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 🎓 Viva-Ready Reference

<details>
<summary><b>📚 Click to expand full technical Q&A</b></summary>

| Question | Answer |
|:---------|:-------|
| Primary embedding model? | `Xenova/all-MiniLM-L6-v2`, 384 dimensions |
| Issue classifier? | 9-label multi-label Logistic Regression classifier |
| Relationship classifier? | scikit-learn Random Forest (10 trees), served by Flask |
| Relationship classes? | Duplicate · Similar · Related · Independent |
| Relationship features? | 20 (6 scalar + 7 category_A + 7 category_B) |
| Relationship test accuracy? | 93.30% on 836 held-out pairs |
| Relationship macro F1? | 89.99% |
| Multi-label test Micro F1? | 98.53% on 900 held-out records |
| How are complaints grouped? | Complaint relationship graph → Connected Components |
| Which edges create groups? | Only `Duplicate` and `Related` — NOT `Similar` |
| How is routing done? | Deterministic `issue-type → department` mapping via `routing_rules.json` |
| Task planning algorithm? | DAG + Kahn's topological sort with cycle detection |
| How is execution consistency ensured? | Transactional Supabase/PostgreSQL RPC |
| What dataset was used? | Synthetic prototype dataset |
| What prevents duplicate Civic Issues? | Deterministic merge policy: count → priority → age → UUID |
| Frontend framework? | React 19 + Vite + TypeScript |
| What queue system? | BullMQ backed by Redis |
| How does the frontend get status? | 5-second polling on `GET /api/complaints/:id/status` |
| What does Gemini do? | Initial complaint understanding — NOT the trained classifier |
| What is the Knowledge Graph? | Enrichment/explainability — NOT the primary relationship classifier |

</details>

<div align="right"><a href="#-table-of-contents">⬆ Back to Top</a></div>

---

## 📜 Research Disclosure

> [!IMPORTANT]
> GrievanceIQ is a **prototype/academic civic intelligence system**. Model results are based on synthetic datasets and controlled evaluation scenarios. They demonstrate the implemented pipeline and experimental performance — not guaranteed real-world municipal deployment performance.

---

<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=gradient&customColorList=6,11,20&height=100&section=footer" width="100%" alt="Footer"/>

</div>
