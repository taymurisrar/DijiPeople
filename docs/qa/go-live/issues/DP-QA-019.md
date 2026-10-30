# DP-QA-019 — An approved leave request cannot be cancelled or revoked by anyone (including an admin)

| Field | Value |
|---|---|
| Category | Functional (business rule gap) — **product decision** |
| Severity / Priority | Medium / **P3** (P2 if customers need to reverse approved leave) |
| Status | Open — needs product decision |
| Test | `DPQA-LV-023` (now asserts the explicit refusal; passes) |

`POST /api/leave-requests/:id/cancel` on an APPROVED request → **409 DATABASE_CONSTRAINT_FAILED "Only pending leave requests can be cancelled"**, for the owner/admin as well as for the employee. The status stays APPROVED.
There is no revoke/withdraw route among the leave endpoints (`approve`, `reject`, `cancel`). A mistaken approval — or an employee who no longer needs approved leave — cannot be undone through the product. Also note the error is reported as a *database constraint* failure code for what is a business rule.

| Run | Result |
|---|---|
| RUN-003 | OBSERVED |
