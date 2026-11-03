# DP-QA-049 — Editing a price's amount runs Stripe price preparation even for a Custom plan price: without Stripe configured it answers a raw 500 `SYSTEM_UNEXPECTED_ERROR`

| Field | Value |
|---|---|
| Category | Pricing / error handling |
| Severity / Priority | Low / **P3** (needs an environment without `STRIPE_SECRET_KEY`; production has one) |
| Status | Open (observation with an unverified consequence) |
| Found | RUN-008 (`4dd29d3a`), test DPQA-PUB-007 (**Blocked**, not passed), `tools/repro-price-edit.mjs` |
| Evidence | API log: `Error: STRIPE_SECRET_KEY is required for Stripe billing. at requireStripeEnv … resolveOrCreateProduct … SuperAdminService.prepareStripePlanPrice … updatePlanPrice (super-admin.service.ts:2531)` |

**Reproduction.** On a stack with no `STRIPE_SECRET_KEY`: create a Custom plan, create a price (`POST /super-admin/plans/:id/prices`, `syncToStripe:false`), then `PATCH /super-admin/plans/:id/prices/:priceId` with `{ "unitAmount": 41 }`. The price may be DRAFT or PUBLISHED; both answer 500. The PATCH DTO has no `syncToStripe` property (sending it is a 400 "property syncToStripe should not exist"), so there is no way to say "do not touch Stripe" on an edit, although creation has one.

**Why it matters.** (1) An operator on an unconfigured environment gets "Unexpected error" with a trace id, not a message that Stripe is required. (2) The edit is coupled to Stripe: in production an amount edit on a Custom plan price will call Stripe whether or not the price was ever synced. That coupling is not described in the v7 handoff, whose Custom-plan lifecycle says an amount edit "supersedes the row (new DRAFT version), so it must be republished".

**What QA could not verify.** The handoff's statement that an amount edit supersedes a published price as a new DRAFT, and that nothing is sellable until it is republished, is **not verified**: PUB-007 is recorded as Blocked (infrastructure), not Passed. It needs a stack with a Stripe test key or a candidate that makes the Stripe step conditional.

**Suggested resolution.** Skip Stripe preparation when the price was created with `syncToStripe:false` (or has no Stripe ids), and map a missing Stripe configuration to a 4xx with a clear message.

| Run | Result |
|---|---|
| RUN-008 (`4dd29d3a`) | **OPEN** — PUB-007 Blocked; supersede-as-DRAFT behaviour unverified |
