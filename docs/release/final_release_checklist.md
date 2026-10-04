# GrievanceIQ Release Checklist

- [x] Backend starts
- [x] Frontend starts
- [x] Supabase configuration documented
- [x] Required migrations documented
- [x] Authentication works
- [x] Complaint submission works
- [x] Embedding service fallback logic works
- [x] Real MiniLM inference physically verified (Fixed Tensor.location on CI by pinning onnxruntime-node@1.14.0 with @xenova/transformers, Windows requires VC++ Redist)
- [x] Duplicate detection works
- [x] Relationship classification works
- [x] Civic Issue grouping works
- [x] Multi-label classification works
- [x] Department routing works
- [x] Workstreams work
- [x] Tasks generate correctly
- [x] Dependencies work
- [x] Cycle detection works
- [x] Execution stages work
- [x] Task blocking works
- [x] Task starting works
- [x] Task completion works
- [x] Progress updates work
- [x] Demo data can be created safely
- [x] Demo can be reset safely
- [x] Error states are understandable
- [x] Responsive viewport checks passed for the tested screens
- [x] README is current
- [x] Architecture documentation is current
- [x] Limitations are documented
- [x] Viva notes exist
- [x] Final regression tests completed
- [x] No secret values are committed
- [x] No unsupported accuracy claims are present

## Final CI Verification Gate
The exact relationship integration commit has already passed:
- [x] Backend CI success
- [x] Frontend CI success
- [x] Backend tests: all discovered tests pass, 0 skipped; Supabase integration executes against the live database; real MiniLM smoke test passes; frontend build passes.
- [x] Production dependency audit: 0 production dependency vulnerabilities; remaining findings are in development dependencies (Verified via `npm audit --omit=dev`)
- [x] Security endpoint checks: PASS (Explicit DTOs and restrictTo('admin') applied)
- [x] Google identity persistence: PASS (Explicit auth_provider/google_id linking in authController)
