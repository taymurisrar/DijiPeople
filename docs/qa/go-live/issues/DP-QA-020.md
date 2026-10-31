# DP-QA-020 — Overlapping leave requests are not prevented under concurrency (3 of 3 accepted)

| Field | Value |
|---|---|
| Category | Functional / data integrity (race condition) |
| Severity / Priority | Medium / **P2** |
| Status | Open |
| Test | `DPQA-CONC-003` (fails); sequential overlap `DPQA-LV-004` passes |
| Env | `qa-prov-a`, employee, production build |

Three simultaneous `POST /api/leave-requests` for the same employee, type and date → **three 201s** (expected at most one). The sequential duplicate is refused, so the overlap check exists but is read-then-write without a lock/unique constraint.
Consequence: double-click or retry storms create duplicate pending requests, and an approver can approve both (double-deducted balance when balances are in use).
Duplicate **employees** under the same race were prevented (`DPQA-CONC-001` passes).

| Run | Result |
|---|---|
| RUN-003 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - CONC-003 pass |
