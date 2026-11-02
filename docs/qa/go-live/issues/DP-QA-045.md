# DP-QA-045 — An expired Custom subscription keeps granting every entitlement, including the Desktop Agent (owner decision needed)

| Field | Value |
|---|---|
| Category | Entitlement lifecycle |
| Severity / Priority | Low–Medium / **P3 (owner decision)** |
| Status | Open — owner decision |
| Found | RUN-007 (`98f9b025`), test DPQA-CUS-030; reproduced on three runs |
| Evidence | annotation "expired subscription cut the agent after -1 ms" (no cut within 90 s) |

**Experiment.** Tenant C on a Custom plan that lists `desktop-agent`. `PATCH tenants/:id/subscription` with `status: EXPIRED` and a past `endDate` was accepted (200). The agent sign-in kept answering 201 for the whole 90 s observation window, longer than the 60 s propagation limit.

**Why.** Documented design in `tenant-entitlement.service.ts` `decide()`: a lapsed or missing subscription yields `NO_LIVE_SUBSCRIPTION` with `allowed: true` — "a billing state, not an entitlement one … dunning has its own notice period". The v6 handoff says the same.

**Why it is recorded.** The owner asked that plan changes, expiry and reassignment be tested. Decision 8 covers a plan's *sales availability* expiring: subscriptions stay valid, and CUS-032 passes. This is a different case, the subscription's *own* validity ending. QA expected an ended contract to stop granting contract-only grants such as the agent and white-label; the product does not, and no decision accepts that. CUS-030 stays FAILED (not weakened) until the owner picks: (a) accept fail-open for every entitlement, (b) fail-closed for grant-only features, or (c) fail-closed entirely after a grace period.

| Run | Result |
|---|---|
| RUN-007 (`98f9b025`) | **OPEN (owner decision)** — CUS-030 fails against QA's stated expectation |
