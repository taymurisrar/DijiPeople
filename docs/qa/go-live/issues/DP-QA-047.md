# DP-QA-047 — Withdrawing a plan by reassigning the subscription does not take effect on the next authorization check: it waits for the 60 s entitlement snapshot TTL (measured 60.01–60.10 s against the 60 s limit)

| Field | Value |
|---|---|
| Category | Entitlement revocation / propagation |
| Severity / Priority | Medium / **P2** (owner decision 9: withdrawal must take effect on the next authorization check, external propagation ≤ 60 s) |
| Status | Open |
| Found | RUN-007 (`98f9b025`), tests DPQA-CUS-012 and DPQA-CUS-020; diagnostic probe `probe-agent-429.mjs`; reproduced on four runs |
| Evidence | measurements below; `e2e/golive-results/run007/results-chromium-p1101.json`, `…-p1102.json` |

**Measurements** (agent route `GET /agent/settings` called with an access token issued before the withdrawal; tenant on its Custom plan with `desktop-agent`, then moved by `PATCH /super-admin/tenants/:id/subscription`):

| Withdrawal path | Time until the issued token is refused | Limit |
|---|---|---|
| Plan feature edit (`PATCH /super-admin/plans/:id`, agent removed) — CUS-010 | **≈ 5 s** (first poll; access 5126 ms, refresh 5499 ms, sign-in 5484 ms) | passes |
| Subscription reassigned to a plan without the agent — CUS-012 | **60 014 ms** | ≤ 60 000 ms: **exceeded** |
| Enterprise → Growth (predefined) — CUS-020 | **60 099 ms** | ≤ 60 000 ms: **exceeded** |
| Probe, same path | 60 s (resolved features already reported the agent gone while the guard still allowed it) | |

The grant direction is slower still: after moving the tenant back to the plan with the agent, sign-in answered 403 `TENANT_FEATURE_NOT_ENTITLED` for 66.8–68 s while the customer-visible feature list already showed the agent.

**Why.** The handoff states the mechanism: a plan edit flushes every tenant snapshot; a tenant-level withdrawal flushes that tenant and revokes agent refresh tokens; "cross-process propagation is bounded by the 60 s snapshot TTL". Reassigning a subscription does neither: the route guard keeps answering from the cached snapshot until it expires, so the *next* authorization check on the same API process still allows the withdrawn feature, and the total is the TTL plus the poll interval (the margin over 60 s is the 2 s poll granularity, so the true value is 58–60 s; QA cannot claim it is below the limit).

**Impact.** A customer moved to a smaller plan (downgrade, contract end, plan change by sales) keeps every withdrawn feature, including the Desktop Agent and white-label, for up to a minute on every path that does not flush. The approved limit is met only by the plan-edit path.

**Suggested resolution.** Flush the tenant's entitlement snapshot in `updateTenantSubscription` (and on any `Subscription` status or plan change), as the plan-edit and tenant-feature paths already do.

| Run | Result |
|---|---|
| RUN-007 (`98f9b025`) | **OPEN** — CUS-012 and CUS-020 fail the 60 000 ms assertion (not weakened); CUS-010 passes |
