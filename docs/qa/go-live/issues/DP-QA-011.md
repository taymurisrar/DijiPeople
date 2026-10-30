# DP-QA-011 — Employee and HR cannot list leave types; a freshly provisioned tenant has no leave types, so leave cannot be requested out of the box

| Field | Value |
|---|---|
| Category | Functional (self-service leave) — same permission family as [[DP-QA-002]] |
| Severity / Priority | High / **P1** (core Starter capability unusable for employees without admin work and, for the 403, even with it) |
| Status | Open |
| Tests | `DPQA-LV-001` (fails); LV-002…008 depend on the fixture `DPQA-LV-000` |
| Env | `qa-prov-a`, roles employee and hr, 2026-10-30 |

## Actual (CONFIRMED)
- `GET /api/leave-requests/available-types` → **403 "You do not have permission"** for `employee` and `hr`; `GET /api/leave-types` → 403 for `employee`. (`GET /leave-requests/mine` → 200, `/attendance/mine/today` → 200, `/documents/types` → 200, so it is these two routes, not "everything".)
- **`POST /api/leave-requests/:id/cancel` as the request's own employee → 403** (`DPQA-LV-008`); an admin can cancel it. Employees therefore cannot withdraw a pending request.
- `GET /api/leave-types` as owner on a **real provisioned Starter tenant** returns `[]`. No leave type, policy or default configuration ships with provisioning, so even an admin must configure leave before the first request. (Whether that is acceptable onboarding is a product decision — recorded as observation OBS-008.)
- The request form in the UI needs the types list; with the 403 an employee sees an empty selector (the seed-demo tenant masked this by pre-creating types).

## Suspected cause
The same missing-grant pattern as DP-QA-002: routes are guarded by a permission that no system role other than the admin tier holds.
Verify with the role→privilege matrix before fixing.

| Run | Result |
|---|---|
| RUN-002 | FAIL (LV-001, LV-008) |
