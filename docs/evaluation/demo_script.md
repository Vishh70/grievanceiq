# Final Project Demo Script

This script provides a reproducible 5–10 minute demonstration sequence for the final-year project presentation.

## Setup
Ensure the local development server is running (`npm run dev` in frontend, `npm start` in backend).
Open the GrievanceIQ application at `http://localhost:5173`.

## Sequence

### 1. Submit Initial Complaint
- **Action**: Navigate to the Citizen Portal.
- **Input**: "Massive water pipe burst outside the college main gate."
- **Talking Point**: Explain that the system instantly generates a semantic embedding for this text using a local Transformer model.

### 2. Show AI Understanding
- **Action**: Open the Admin Dashboard.
- **Talking Point**: Show the complaint in the pending list. Highlight the AI-detected safety hazards (e.g., Water Leakage).

### 3. Submit Related Complaints
- **Action**: Return to Citizen Portal. Submit: "The road is completely flooded near the college."
- **Action**: Submit: "Exposed electrical wires in the floodwater by the college."
- **Talking Point**: We are simulating multiple citizens reacting to the cascading effects of the same root incident.

### 4. Show Duplicate / Relationship Result
- **Action**: Go to the Admin Dashboard and trigger/view the relationship evaluation.
- **Talking Point**: The system uses a hybrid of Haversine GPS distance, time, and semantic cosine similarity to determine these are 'Related' to the original pipe burst, not independent issues.

### 5. Show Civic Issue Grouping
- **Action**: Open the "Civic Issues" panel.
- **Talking Point**: Show that the graph algorithm (Connected Components) has grouped these 3 individual citizen complaints into 1 unified "Civic Issue" to prevent duplicated municipal effort.

### 6. Show Multiple Departments & Tasks
- **Action**: Click "View Routing" on the Civic Issue.
- **Talking Point**: Explain the Multi-Label Zero-Shot classification. The system correctly identifies the need for the **Water Department**, **Road Department**, and **Electrical Department**. Show the deterministically generated tasks for each workstream.

### 7. Show Execution Stages (DAG)
- **Action**: Scroll to the "Execution Plan" view.
- **Talking Point**: Highlight that tasks are not just a flat list. The system built a Directed Acyclic Graph (DAG) and used Kahn's Topological Sort to group them into stages.

### 8. Attempt Blocked Task
- **Action**: Attempt to click "Start Task" on the Road Department's resurfacing task.
- **Talking Point**: The system actively prevents this. It shows `🔒 Blocked (Waiting for: Repair Water Pipe)`. Explain dependency-aware workflows.

### 9. Complete Dependency
- **Action**: Click "Start Task" then "Complete" on the Water Department's pipe repair task.
- **Talking Point**: Explain that a database history record is created for this transition.

### 10. Show Task Becomes Ready
- **Action**: Look at the Road Department task again.
- **Talking Point**: The status dynamically changed to `▶ Ready`. The human operator is now unblocked.

### 11. Complete Final Task
- **Action**: Complete the Electrical and Road tasks.
- **Talking Point**: Watch the progress bar fill up.

### 12. Show Civic Issue Completion
- **Action**: Return to the main Civic Issue list.
- **Talking Point**: The cascading logic has automatically marked the Workstreams and the parent Civic Issue as `COMPLETED`. The entire pipeline from raw citizen text to resolved operational workflow is finished.
