---
SCENARIO_ID: QA-SETTINGS-017
aliases: [QA-SETTINGS-017]
TITLE: Settings visibility follows the tenant's plan entitlements
AREA: settings
MODULE: apps/web
TYPE: BROWSER_E2E
RISK: HIGH
AUTOMATION_STATUS: PARTIAL
TEST_REFERENCE: apps/web/app/(authenticated)/settings/_lib/settings-entitlements.spec.ts
RELATED_BUGS: [BUG-2958]
RELATED_REGRESSIONS: [REG-396]
LAST_RUN: 2026-09-09
LAST_RESULT: PASS_WITH_RISKS
CREATED_AT: 2026-09-09
UPDATED_AT: 2026-09-09
---

# QA-SETTINGS-017 — Settings visibility follows the tenant's plan entitlements

## Preconditions

- A tenant subscribed to **Starter**, status `ACTIVE`. Starter entitles
  `employees`, `organization`, `leave`, `attendance`, `documents`,
  `notifications` and `branding`, and withholds `timesheets`, `projects`,
  `recruitment`, `onboarding`, `payroll` and `desktop-agent`.
- A user on that tenant holding `global-admin`. The administrator role is the
  case that matters: it bypasses the tenant's permission model and must not
  bypass the tenant's contract.
- Platform Admin access, to change the tenant's plan in steps 8 to 10.
- No deploy or restart between any two steps. The point of steps 8 and 9 is that
  a plan change takes effect on the next request.

## Steps

1. Sign in to the tenant workspace as the `global-admin` user and open
   `/settings`.
2. Count the category tiles and read their group counts.
3. Open `/settings/regional` and list the group cards.
4. Open `/settings/people/attendance` and list the rows.
5. Open `/settings/general-setup` and list the group cards.
6. Navigate directly to `/settings/payroll/cycles/payroll-periods` by typing the
   URL, not by following a link.
7. Open `/settings/subscription`.
8. In Platform Admin, move the tenant to **Enterprise**. Reload `/settings` in
   the tenant workspace.
9. Move the tenant back to **Starter**. Reload `/settings`. Then query the
   database for the payroll rows created while the tenant was on Enterprise.
10. Create a plan in Platform Admin matching none of the four seeded ones — for
    example `payroll` enabled and `leave` disabled — subscribe the tenant to it,
    and reload `/settings`.

## Expected Result

1-2. **Ten tiles, and no Payroll & Finance.** General Setup shows a Plan &
Billing group and no Apps & Modules group.

3. Regional Operations is present and shows **no Payroll Geography** group. Its
other groups — Countries & States, Localization, Currency, Business Calendar —
are all present.

4. **Attendance Settings is present; Timesheet Settings is absent.** This is the
assertion a category-level fix would fail: the group and its category both
survive, and only the one row goes.

5. General Setup shows Tenant & Company, Organization Structure, Plan & Billing
and Data Management. **Apps & Modules is absent** — it holds only Recruitment
and Desktop Agent, and Starter sells neither.

6. The page renders **"Payroll is not part of your current subscription"**, with
a working link to the subscription screen. Not the configuration page, not a
404, and not an empty table over a failed request.

7. The subscription screen renders. It is core on every plan, and it is where
every blocked page points.

8. **All eleven tiles, Payroll & Finance included, with no deploy and no
restart.**

9. Back to the step 1-2 state. The payroll rows created under Enterprise are
**still in the database** — unreachable, not deleted. This is ADR-0005
Decision 1, and skipping this check would let a data-destroying implementation
pass.

10. The custom plan is honoured: Payroll & Finance appears and Leave
Configuration disappears, with no deploy. This is the only step that proves no
code branches on a plan key — every other step would pass if the four seeded
plans were hardcoded.

## Notes

Steps 1 to 6 are covered by the automated spec in `TEST_REFERENCE`, which runs
the resolver against the Starter and full capability sets and asserts each of the
four leaks separately. Steps 7 to 10 are manual: they need a live Platform
Admin, a real plan change and a database read, and they are the half that proves
the mechanism is entitlement-driven rather than hardcoded.

Run this whenever a settings page is added, a capability key is added, or a plan
definition changes. A settings page with no attribution already fails the build,
but nothing automated checks that the attribution is *right* — that judgement is
ADR-0005's, and this scenario is where it is re-examined against a real plan.

Created 2026-09-09 at `1b020d29`.

## Run — 2026-09-09, production

Driven against `dijipeople-demo.ws.dijipeople.com` as the tenant owner
(`global-admin`), production API `890cd96`, immediately after the deploy went
live. Result: **PARTIAL PASS — steps 1 to 7 passed, steps 8 to 10 were not run.**

| Step | Expected | Observed |
|---|---|---|
| 1-2 | Ten tiles, no Payroll & Finance | **Eight tiles**, no Payroll & Finance, no Integrations, no Audit & Compliance. See note below. |
| 3 | Regional Operations present, no Payroll Geography | Pass — 6 settings, Payroll Geography absent |
| 4 | Attendance Settings present, Timesheet Settings absent | Pass |
| 5 | Apps & Modules absent, Plan & Billing present | Pass — General Setup shows 6 settings |
| 6 | Direct URL renders the plan state | Pass — "Payroll Periods is not part of your current subscription", with a working link to the subscription screen |
| 7 | Subscription screen reachable | Pass |
| 8-10 | Plan change to Enterprise and back; custom plan | **Not run** |

**Why the tile count is eight, not ten.** The scenario's expectation was written
from a resolver test using every settings permission. The real owner does not
hold every Customization permission, so four Customization pages are
permission-filtered before entitlement is considered, and two whole categories —
Integrations and Audit & Compliance — collapse because the capabilities carved
out on 2026-09-09 (`attendance-integrations`, `desktop-agent`, `compliance`) were
added after this scenario was written. Fifty settings pages resolve where the
resolver test predicts 54 for an all-permissions caller. Both numbers are
correct for their caller; the scenario's expectation is the thing that was
stale, and it is corrected above.

**Why steps 8 to 10 were not run.** They change a live tenant's subscription.
Tenant email is live on this platform, so a plan change may send real mail to a
real address, and the demo tenant carries an active Starter subscription with
three others on the same plan. Running them needs either a throwaway tenant or an
explicit decision to accept that. Recorded as not run rather than quietly
dropped: they are the only steps that prove a plan change takes effect with no
deploy, that a custom plan is honoured, and that downgraded data survives.

The database side of step 9 was verified directly instead, which is weaker but
not nothing: each plan's `PlanFeature` rows were read back after the backfill and
match the catalog exactly, and the demo tenant resolves to precisely the seven
Starter capabilities.

**Found during the run, outside this scenario's scope:** [[BUG-3007]],
[[BUG-3020]], [[BUG-3021]] and [[ITEM-0128]] — all on Reports & Analytics and the
account menu, none of which this scenario looks at. See [[ITEM-0130]].

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Test plan — [[PLAN-021]]
- Module — [[settings]]
- Bugs — [[BUG-2958]]
- Regressions — REG-396 (see the regression register)

<!-- GRAPH:END -->
