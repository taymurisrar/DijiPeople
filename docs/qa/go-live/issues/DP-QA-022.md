# DP-QA-022 — An employee can create and cancel an attendance correction request but cannot read it (403)

| Field | Value |
|---|---|
| Category | Functional / RBAC (self-service) — same family as [[DP-QA-002]] and [[DP-QA-011]] |
| Severity / Priority | High / **P2** |
| Status | Open |
| Test | `DPQA-ATT-009` (fails) |
| Env | tenant `qa-starter` (seed-demo), role employee, 2026-10-31 |

`POST /api/attendance/correction-requests` → 201 and `POST …/:id/cancel` → 201 for the employee, but `GET /api/attendance/correction-requests/:id` → **403 ACCESS_DENIED** for the same user and the request they just created.
An employee therefore cannot see the status of their own correction request (approved/rejected) through the API the UI would use. The admin reads it normally (`DPQA-ATT-008`).

| Run | Result |
|---|---|
| RUN-003 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - ATT-009 pass; ATT-020..024 pass on a working day |
