# Gate 1: Supabase staging permission assessment

Date: 2026-11-01. Source baseline: `d7c239777a635013363a1a58e340785139adcfea`.
User-selected staging project: `supabase-red-cable` (`bvyyeefapmdisxzuttds`).
Status: **NOT APPROVED**. Live access was read-only metadata inspection; no migrations, row changes, credential retrieval or production actions were performed.

## Confirmed findings

| Surface | Evidence | Assessment |
| --- | --- | --- |
| users, complaints, departments | RLS enabled; anon/authenticated have SELECT; policy named `Enable all access for service_role` actually uses `TO public`, `ALL`, `USING (true)`, `WITH CHECK (true)` | Critical: these policies permit every database role with the corresponding table grants. Their name does not restrict them to service_role. |
| Seven other existing public application tables | RLS enabled, no policies, anon/authenticated SELECT grants | RLS denies rows to non-bypass roles; grants alone do not prove readable data. Backend-only access should also be restricted by grants. |
| update_task_status_transactional(uuid,text,text,text) | Invoker function; anon/authenticated/service_role EXECUTE allowed | Restrict direct invocation to backend; fix mutable search_path reported by security advisor. |
| Three review/relationship views | Absent from live schema; source definitions use owner permissions | Must be secured when installed. Current source uses these through the backend, not a frontend Supabase client. |
| WICR and recommendations schema | Not yet installed on staging | Live end-to-end review functionality remains unverified. |
| Frontend credentials | Source uses Express API; no service-role key references found in frontend source | Source inspection only. Deployed environment and built assets have not been audited; absence of a deployed leak is not certified. |

The views are `v_pending_wicr_reviews`, `v_pending_dependency_recommendations`, and `v_civic_issue_related_links`. Relevant backend consumers include `reviewQueueService.js` and `prerequisiteRecommendationService.js`. The application uses custom Express JWT authorization; Supabase authenticated users are not equivalent to application administrators.

Existing columns indicate a schema through processing-status changes, without phase 14 lease columns. This is an existing database, not an empty staging schema. Do not run the complete initial-install script over it: earlier constraint creation is not universally repeatable.

## Prepared local fix

Canonical migration: `supabase/migrations/20261101131302_gate1_database_permissions.sql`.

- Enables RLS on application tables and removes the three misleading unrestricted legacy policies.
- Revokes PUBLIC, anon and authenticated access to application tables and the three backend views; grants required service-role operations.
- Sets views to security_invoker and restricts sensitive application RPC execution to service_role.
- Keeps functions SECURITY INVOKER and fixes their search_path; source queries use qualified application tables.
- Removes permissive default table/function grants for objects created by the migration owner. Other object creators need a separate default-privilege audit.
- Skips not-yet-installed objects, so it can protect existing objects before feature upgrades and be reapplied afterward.
- Includes the same hardening at the end of ALL_MIGRATIONS.sql for fresh installations.

No existing application rows are changed. Backend access depends on a correctly configured privileged service-role/secret key; an anon-key fallback will stop working after hardening. Confirm backend credential type securely before applying. Do not print or put backend secrets in VITE variables.

## Verification actually executed

From `backend`:

```powershell
node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.integration.config.js --runInBand --forceExit --runTestsByPath tests/integration/dataApiPermissions.test.js tests/integration/migration.test.js
```

Result: **2 suites, 17 tests passed, zero skipped**. These use isolated PGlite, not hosted Supabase or PostgREST. Coverage includes fresh schema application, repeatable permission patch, simulated legacy exposure, denial for anon/authenticated SELECT and sensitive RPC calls, service-role view access/function privileges, invoker settings, and future-object default permissions. This does not verify successful live workflow writes. Jest was force-exited; clean process shutdown was not established by this command.

Live metadata queries and security advisors ran successfully. Advisors reported missing policies on seven RLS-enabled tables and a mutable search_path on the existing status RPC. No live HTTP denial probes or live integration suites ran.

## Remaining gate steps

1. Review and apply the permission migration to the selected staging project after confirming backend privileged credentials. Preserve an ACL/policy snapshot for diagnosis. Do not roll back by restoring unrestricted public policies; fix missing legitimate backend grants instead.
2. Recheck catalog grants, policies, function search_path and security advisors. Confirm service-role backend reads/writes still work.
3. Reconcile installed schema and migration history, then apply the missing phase 14–19 upgrades in order and reapply permissions. Do not rerun the entire initial schema on this database.
4. Configure staging test credentials locally, isolated from production. Run `npm run test:integration` and record executed/skipped counts by suite. Missing credentials or skipped live suites cannot pass Gate 1.
5. Test direct REST reads and RPC calls with both anon and a genuine Supabase authenticated test token. Expect permission denial on backend-only resources; also verify service-role success. App JWTs are not a substitute for a Supabase authenticated token.
6. Audit frontend build/deployment variables and assets without printing secrets. Complete live complaint/review/dependency transactions before proceeding to Redis Gate 2.

Selecting this project identifies the staging target; it does not independently prove isolation from production integrations or authorize treating pending checks as passed.

## Conditional-approval preflight (2026-11-01)

Migration execution: **NOT ATTEMPTED**. The user's conditional approval requires stopping if any precondition cannot be confirmed.

- Target rechecked through Supabase: `supabase-red-cable`, `bvyyeefapmdisxzuttds`, ACTIVE_HEALTHY, PostgreSQL 17.
- Captured live public-schema relation grants, RLS settings and policies, function definitions/ACLs/settings, view definitions, default ACLs and schema ACL to `gate1-pre-migration-snapshot.json`. No application row contents were queried.
- Re-read exact authorized SQL: permission changes, RLS enablement, removal of the named unrestricted policy, function invoker/search_path settings, default privileges and schema reload only. No row DML or destructive table operations.
- Migration file SHA256: `E19756E523539271CC75F06C1E7602987DE47E453270A03C5B1117F8DDD8E457`.
- **Unconfirmed:** absence of production integrations and real citizen records requiring uninterrupted access. Project name and healthy status do not establish this.
- **Unconfirmed:** active backend privileged credential and connectivity. This checkout has only `.env.example`; current process has no SUPABASE_URL or any of the supported Supabase key variables. Source supports privileged keys but still permits anon-key fallback. No secret values were printed.
- Asked the owner to confirm isolation and identify the staging backend runtime. Existing approval remains valid once its prerequisites are satisfied; no new approval is needed for the same exact scope.
- No migration, rollback, phase 14–19 upgrade, post-migration check or live integration suite was executed. Previously observed exposures remain unresolved. Gate 1 stays pending.

## References

- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [RLS and view permissions](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Function search_path advisory](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable)
