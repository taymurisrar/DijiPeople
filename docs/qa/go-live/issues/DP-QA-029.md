# DP-QA-029 — Leave balance is not updated after an approval, and approvals can overdraw the entitlement

| Field | Value |
|---|---|
| Category | Functional / data integrity |
| Severity / Priority | High / **P2** |
| Status | Open |
| Test | `DPQA-LV-031` (fails) |
| Probe | `e2e/golive/tools/balance-probe2.cjs` |

Setup with real policy objects: type `consumesBalance:true`, policy rule `entitlementDays: 2`, tenant-wide assignment → `LeaveBalance` = allocated 2.00 / used 0 / remaining 2.00. The employee submits **three** one-day requests (all accepted — pending requests do not reserve balance). The owner approves them one after another:

| After | totalUsed | totalRemaining |
|---|---|---|
| approval #1 | **0.00** | 2.00 (row unchanged) |
| approval #2 | 2.00 | 0.00 |
| approval #3 (accepted, 201) | 3.00 | **−1.00** |

So (a) the balance does not reflect an approval until the *next* decision, and (b) a third approval overdraws a 2-day entitlement (the rule does not allow a negative balance). Waiting 10 s after approval #1 does not change the row (the test waits). Cancelling an approved request is impossible ([[DP-QA-019]]), so the overdraft cannot be undone either.

| Run | Result |
|---|---|
| RUN-004 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - LV-031 pass: balance reflects the 1st approval, 2 approvals consume the 2-day entitlement, 3rd refused, never negative (fixture now reads the submitting employee's own balance row) |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - LV-031: pass |
