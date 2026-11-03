# Owner decisions DP-QA-045 and DP-QA-046 — what the product does today and what each rule would mean

*Prepared by QA for the owner after RUN-008 (application `4dd29d3a`). QA has not chosen a rule, invented a grace period or accepted today's behaviour. Both items stay **open** until the owner approves a rule; the tests that would verify each rule are listed so the retest is ready when the decision arrives.*

## DP-QA-045 — what happens when a subscription is no longer live

**Today (measured, RUN-008 CUS-030).** A subscription that is `CANCELED`, `EXPIRED`, `UNPAID`, `PAUSED`, `INCOMPLETE`, or `PAST_DUE` beyond its grace is reported `NO_LIVE_SUBSCRIPTION`, and the entitlement guard **allows every module**. The customer-visible feature list shows nothing entitled, so the screen and the guard disagree. Setting a Custom subscription to `EXPIRED` with an end date in the past left the Desktop Agent signing in. The behaviour is deliberate in the code (a billing lapse must not lock a tenant out of its own data) but nobody has approved it for plans whose features are contractual.

| Implication | Keep as is (allow everything) | Grace, then baseline only (the handoff's recommendation) | Deny at once |
|---|---|---|---|
| **Security** | Lapsed tenants keep paid modules and the Desktop Agent (data-capture software on employee machines) indefinitely; entitlement checks stop meaning anything after the first lapse. | Access to paid modules ends at a known date; baseline (login, own data, basic import/export) remains for retention and export. | Strongest; also the highest risk of cutting a tenant off from its HR/payroll records. |
| **Billing / revenue** | No pressure to renew or pay; every `UNPAID`/`CANCELED` tenant is a free customer. Contract end has no effect. | Pressure at a defined date; revenue recovered for tenants who renew inside the grace. | Immediate pressure; disputes about billing errors become outages. |
| **Commercial / legal** | A customer can claim they were never told access would end. Contractual features (agent, white-label) outlive the contract. | Needs a stated grace in the terms and a reminder before the cut-off. | Needs notice terms; likely to breach data-access and export promises if applied to `PAST_DUE` within a payment retry. |
| **Operational** | No support load from lock-outs; large silent leakage. | Support must handle "my access went to baseline"; needs an operator override. | Highest support load, most escalations. |

**What QA needs from the owner (none of these is assumed anywhere):**
1. Which rule: keep, grace-then-baseline, or deny at once.
2. If a grace: its length in days and whether it counts from the contractual end date or from the billing failure.
3. Which statuses are a lapse: is `PAUSED` a lapse? is `PAST_DUE` inside the payment-retry window a lapse? is `INCOMPLETE` (checkout never finished)?
4. What "baseline only" means: exactly which modules stay (the handoff names login, read of own data, basic import/export).
5. Whether the tenant administrator is warned before the cut-off, and whether an operator can extend it.
6. Whether the Desktop Agent is cut at the same moment (its refresh tokens are already revoked on a feature withdrawal).

**Verification ready once decided:** CUS-030 (expired Custom subscription), a predefined-plan variant (Growth `EXPIRED`), a `PAUSED` and a `PAST_DUE`-inside-grace case, the day-before / day-after boundary, agent token and refresh cut, baseline import/export still working, restoration on renewal at the first check (the DP-QA-047 cache fix applies), audit rows, tenant isolation.

## DP-QA-046 — features a Custom plan cannot withhold

**Today (RUN-007 CUS-006 observation, unchanged).** `employees`, `organization`, `documents`, `notifications` and `branding` are not gated at the API (`ENTITLEMENT_UNGATED_FEATURE_KEYS`). A Custom plan that omits `documents` still serves the documents route (status 200 on a plan with employees only), and the plan editor offers them as if selectable. Basic import/export is already a locked-on baseline.

| Implication | Declare them part of the mandatory baseline (recommended in the handoff) | Gate them for real |
|---|---|---|
| **Product / UX** | The plan editor shows them locked on, like import/export; what a customer is sold matches what they get. | The editor stays as it is. |
| **Security** | No new risk: access to these modules is already unconditional and is governed by role permissions. | Tenant roles lose access to their own employee directory or notifications on a plan without them, with no meaningful HR product left. |
| **Billing / commercial** | A Custom quote can never exclude them; sales must know that. | A real "employees-only without documents" product becomes possible. |
| **Engineering / risk** | Small change to the editor and its description. | Large: most modules read these features; regressions across the tenant app are likely. |

**What QA needs from the owner:** which of the five are mandatory for every plan (all five, or a subset), and whether any should ever be withdrawable. **Verification ready once decided:** CUS-006 asserts the chosen rule; the plan editor locks the mandatory features (admin UI); plan create/update rejects removing a mandatory feature; resolved features and route behaviour agree.
