# DP-QA-008 — Cross-tenant / missing-id DELETE answers HTTP 200 with `success:false`

| Field | Value |
|---|---|
| Category | Functional (API contract) — **tenant isolation itself holds** |
| Severity / Priority | Low / **P3** |
| Status | Open |
| Endpoint | `DELETE /api/employees/:id` (pattern likely shared by other bulk-delete style routes — not yet swept) |
| Test | `DPQA-ISO-004` (asserts `deletedCount = 0` and that the B record still exists) |
| Probe | `e2e/golive/tools/xt-delete-probe.mjs` |

## Actual
Tenant A's owner deleting a tenant B employee id, and deleting a random UUID, both return
`200 {"success":false,"deletedCount":0,"message":"No matching employee records were found."}`. B's record is **unchanged**
(verified through B's own API and the database: `isDeleted=false`).

## Why it is worth a ticket
- **Good:** the response is identical to a non-existent id, so there is no tenant enumeration, and nothing was deleted.
- **Not good:** a "no such record" outcome is reported with a 2xx. Clients that branch on HTTP status (the web app, the desktop agent,
  integrations) will treat it as success; audit/automation may log a deletion that did not happen.
- Recommended: 404 for a single-id delete that matches nothing.

| Run | Result |
|---|---|
| RUN-002 | OBSERVED (isolation PASS) |
| RUN-005 (f47e504c) | **RESOLVED** - ISO-004: foreign and random id both 404 EMPLOYEE_NOT_FOUND with normalised bodies |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - ISO-004: pass |
