# DP-QA-009 — Manager role can read subscription price and billing cycle via `GET /tenant-settings/features`

| Field | Value |
|---|---|
| Category | Security (information exposure, low) |
| Severity / Priority | Low / **P3** (arguably P2 if plan price is considered confidential from non-admin staff) |
| Status | Open — product decision on intent |
| Test | `DPQA-RBAC-2-MANAGER-03` (fails); `DPQA-RBAC-2-EMPLOYEE-03` passes (403) |
| Tenant / role | `qa-prov-a`, `manager` (and presumably other roles that hold some settings read) |

## Actual
`GET /api/tenant-settings/features` as a manager returns 200 including
`subscription: { plan:{key:"starter"}, billingCycle:"MONTHLY", finalPrice:69, currency:"USD", startDate, status }`.
An employee gets 403. The endpoint also feeds module visibility, so some read access is legitimate; the **price and cycle** are not
needed for that.

## Recommended
Return only `{ key, isEnabled }` for non-admin roles (strip `subscription.finalPrice/billingCycle`), or require settings-read for the
billing block.

| Run | Result |
|---|---|
| RUN-002 | FAIL |
| RUN-005 (f47e504c) | **RESOLVED** - RBAC-2-PRICE: plan visible, price/cycle absent for manager; owner still sees them |
| RUN-006 (`17d0dcaf`) | **RESOLVED** - RBAC-2-PRICE: pass |
