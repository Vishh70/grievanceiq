# GrievanceIQ — Production & Cloud Staging Deployment Checklist

**Project**: GrievanceIQ  
**Academic Target**: SPPU Academic Project 2026–27  
**Current Verification Tier**: **LOCAL STAGING READY**  
**Target Milestone**: Cloud Staging & Production Certification  

---

## 1. Scope & Purpose

This checklist bridges the gap between **Local Staging Readiness** (fully verified across 254 unit tests, 11 PGlite integration tests, 7 Python ML tests, and production frontend builds) and **Cloud Production Deployment**.

Production certification must not be claimed until the live operational checks in this document are completed against real multi-node infrastructure.

---

## 2. Pre-Deployment Operational Verification Gates

### Gate 1: Live Supabase Staging Environment
- [ ] **Provision Isolated Project**: Dedicated Supabase project provisioned (e.g. `grievanceiq-staging`), completely isolated from production.
- [ ] **Sequential Migration Execution**: Apply [`ALL_MIGRATIONS.sql`](file:///e:/new%20project/docs/database/ALL_MIGRATIONS.sql) (Steps 0 through 17) via Supabase CLI or SQL Editor.
- [ ] **Verify Stored Procedures & Triggers**:
  - `acquire_complaint_lease` and `commit_complaint_processing` (Phase 14)
  - `v_civic_issue_related_links` and `get_related_civic_issues` (Phase 15)
  - `add_task_dependency_transactional` and `trg_prevent_task_dependency_cycles` (Phase 16)
  - `record_wicr_decision` and `resolve_wicr_review` (Phase 17)
  - `trg_prevent_wicr_event_mutation` on `public.wicr_review_events` (Phase 18)
  - `accept_dependency_recommendation` and `verify_civic_issue_resolution` (Phase 19)
- [ ] **Credential Security**:
  - Set `SUPABASE_SERVICE_ROLE_KEY` exclusively on backend server environment variables.
  - Set `SUPABASE_ANON_KEY` for client/public reads.
  - Never commit service role keys to Git.

### Gate 2: Live Redis Cluster & Background Workers
- [ ] **Dedicated Redis Instance**: Provision managed Redis cluster (e.g. Upstash direct connection or Redis Cloud) with TLS enabled.
- [ ] **Connection Verification**: Confirm backend reaches Redis via `REDIS_URL=rediss://...` with successful `PING` / `PONG`.
- [ ] **BullMQ Queue Testing**:
  - Submit test complaints and verify background worker consumption.
  - Test lease renewal (`renew_complaint_lease`) on long-running jobs.
  - Verify expired lease reclamation by a secondary worker instance.
  - Test duplicate queue delivery idempotency (worker acquires lease only once).

### Gate 3: Live End-to-End Workflow Testing
- [ ] **Live Service Mesh**:
  - Backend running on Node.js 22 (`server.js`).
  - Embedded Python ML service supervised on `http://127.0.0.1:5001`.
  - Frontend served from CDN / Vercel with HTTPS.
- [ ] **Full Incident Walkthrough**:
  1. Citizen submits complaint via public portal.
  2. MiniLM extracts embedding; multi-label classifier tags issue categories.
  3. Spatial-semantic relationship engine scores candidate pairs.
  4. Platt scaling outputs calibrated relationship prediction; WICR evaluates expected loss.
  5. Officer reviews ambiguous pairs in `/admin?tab=wicr-reviews`.
  6. Verified duplicate complaints merge; related complaints maintain distinct incidents.
  7. Workstreams route to responsible departments (Water, Road, Electrical, Drainage).
  8. Causal engine recommends cross-department prerequisites (`can_cause`).
  9. Inspector accepts recommendation; advisory-locked cycle check confirms acyclicity.
  10. Staged execution enforces that dependent tasks are blocked until prerequisites finish.
  11. Multi-department closure verified by inspector; linked citizen complaints set to `Resolved`.

### Gate 4: Production Hardening, Security & Operations
- [ ] **Mandatory Environment Variables**:
  - `NODE_ENV=production` and `APP_ENV=production`
  - High-entropy `JWT_SECRET` ($\ge 32$ random characters)
  - Explicit `ADMIN_PASSWORD` (startup verification seeds admin only if missing; never resets existing)
  - `ALLOWED_ORIGINS` configured with exact production frontend domains (rejects unauthorized origins)
- [ ] **Security Controls**:
  - Public registration strictly forces `role: 'citizen'` (prevents privilege escalation).
  - Municipal review and task verification endpoints require `restrictTo('admin', 'officer')` (returns 403 Forbidden to citizens).
  - Database trigger strictly blocks `UPDATE` or `DELETE` on `public.wicr_review_events`.
- [ ] **Logging & Monitoring**:
  - Structured application logs configured for external aggregator (e.g. Datadog, CloudWatch).
  - Health check endpoint `/api/health` monitored by external uptime ping.
- [ ] **Disaster Recovery & Rollback Plan**:
  - Automated daily point-in-time PostgreSQL database backups enabled.
  - Review [`ROLLBACK_MIGRATIONS.sql`](file:///e:/new%20project/docs/database/ROLLBACK_MIGRATIONS.sql) carefully. **Never execute rollback scripts against production databases containing real citizen records.**

---

## 3. Scientific & Algorithmic Terminology Precision

When presenting or documenting GrievanceIQ for academic or municipal stakeholder review:
1. **Relationship Inference**:
   - Scores produced by the Random Forest classifier and transformed via Platt scaling are **calibrated relationship predictions** (posterior likelihoods $P(\text{Duplicate} \mid x)$ and $P(\text{Related} \mid x)$), NOT "proven causal probabilities".
2. **Prerequisite DAG Recommendations**:
   - Confidence scores ($0.80 - 0.95$) generated by `prerequisiteRecommendationService` are **heuristic candidate recommendations** derived from domain knowledge graphs (`civic_knowledge.json`) and template sequencing rules.
   - Candidate recommendations are strictly decoupled from active execution until human municipal officer inspection and approval.

