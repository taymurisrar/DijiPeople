# ADR-0005 — Which capability each settings page belongs to

## Status

Accepted — 2026-09-09.

Eight decisions, taken in two rounds by the product owner during SESSION-0094
while
[`BUG-2958`](../bugs/BUG-2958-settings-shows-every-category-group-and-page-regardless-of-t.md)
was being fixed. Recorded together because they are one question seen from eight
angles: what does a plan actually sell, and therefore what disappears when a
tenant has not bought it.

Decisions 1 to 5 are the first round, taken while the fix was being written.
Decisions 6 to 8 are the second, taken after the fix was measured — the audit
showed that 41 of 87 settings pages were still visible on every plan, several of
them free only because no key existed to sell them with.

## Context

Gating the settings tree by plan requires an answer for all 87 settings pages,
not just the obvious ones. Seventeen are plainly payroll. Most are plainly
nothing — users, roles, audit logs. Between those sit pages whose ownership is a
commercial judgement rather than a technical fact, and getting one wrong costs
either a leak (a page a customer did not buy) or an outage (a page a customer
did buy, hidden).

The catalog offered twelve capability keys
(`services/api/src/modules/tenant-settings/tenant-settings.catalog.ts`) and now
offers sixteen. The decisions below are the rows where twelve was not enough,
where more than one key could plausibly claim a page, or where the coarseness of
the catalog was itself the defect.

None of these decisions is encoded as a plan key. Every one is a capability
attribution, so a plan an operator invents tomorrow inherits all eight without a
code change.

## Decision 1 — Data already created under a capability survives losing it

**A tenant that downgrades keeps its rows. Reads and writes are both refused,
and the UI says why. Re-adding the capability restores access exactly.**

Rejected: read-only access to existing records. It is kinder to a customer who
needs last year's payslips, and it roughly doubles the work — every gated
controller grows a read path and a write path, and every screen grows a
read-only mode — for a case that arises at downgrade rather than continuously.

Rejected: a time-limited export after downgrade. Most customer-friendly, most
work, and it needs an export surface that does not exist.

This also answers `ITEM-0110`, which asked whether an unentitled module should
accrue records at all. Under this decision it cannot: writes are refused, so the
only rows an unentitled module holds are ones created while it was entitled.

Nothing is deleted, archived or migrated by the gate. That is worth stating
because "the data is gone" is what a customer will assume the first time a
category disappears, and the copy on the blocked page says otherwise in as many
words.

## Decision 2 — The Desktop Agent is sold separately from Attendance, and gated only where settings resolve

**`desktop-agent` becomes the thirteenth capability key. It gates the Desktop
Agent settings page — installers, enrolment and agent policy. It does not gate
the agent's own sync endpoints, which stay on `attendance`.**

Sold from Growth upward. Starter buys Attendance and clocks in through the web;
the agent is the upgrade.

The split is the whole decision. Agents are already deployed on customer
machines, running a build that cannot be upgraded past a refusal it does not
expect. Gating the `agent` module would stop attendance capture — a capability
those tenants did buy — in order to enforce a packaging boundary about the
client. So the key is registered in `ENTITLEMENT_UNGATED_FEATURE_KEYS` with that
reasoning, and the enforcement lives in the settings resolver alone.

This also corrects `BUG-1952`, which listed "Desktop Agent" among the settings a
Starter tenant should not see while the agent was attributed to a capability
Starter buys. Under this decision that line is right, but for a reason that did
not exist when it was written.

Consequence to accept: on an existing production platform the four seeded plans
gain their `desktop-agent` rows on the next `seed:config`, because
`reconcilePlanFeatures` converges plan features against the catalog. Starter
does not gain one, so existing Starter tenants lose the settings page. That is
the intended effect of making it sellable.

## Decision 3 — Work Management and Business Calendar are core on every plan

**`locations`, `work-calendars`, `holiday-calendars`, `shifts`,
`work-schedules` and `fiscal-years` are attributed CORE.**

Each of the six could be argued into a narrower key. Shifts and work schedules
read as attendance; holiday calendars read as leave; fiscal years read as
payroll. All six are shared master data underneath: a holiday calendar drives
leave accrual on a plan with no attendance, a work site is an employee field
before it is a geofence, and a fiscal year scopes reporting ranges as well as
pay periods.

Attributing them narrowly would hide configuration a Starter tenant genuinely
uses, which is the more expensive of the two errors available here. A page
wrongly left visible costs tidiness; a page wrongly hidden costs a customer the
use of something they paid for.

## Decision 4 — Document Templates belongs to Documents, and moves out of the payroll tree

**`document-templates` is attributed to `documents` and its placement moves from
Payroll & Finance > Operations and Governance to People > Document Rules.**

It reads generic document templating from the settings runtime and has no
payroll dependency. It was the only member of its group, so the group goes with
it and Payroll & Finance loses a section it never earned.

The alternative — leaving it attributed to `payroll` — would have taken generic
document templating away from every plan that buys Documents and not Payroll,
which is every plan below Enterprise.

## Decision 5 — Customization stays free on every plan

**The nine Customization pages — runtime metadata, the form and view designers,
runtime components, packages and publishing — are attributed CORE.**

There is a real commercial case for selling them; they are the most
Enterprise-shaped pages in Settings. This decision is to record that they are
free **deliberately**, rather than to arrive at it by leaving them
unattributed.

If they are ever carved out, two things must ship together: a fourteenth
capability key, and a backfill enabling it for every tenant that has already
built customizations. Without the backfill, a plan without the key hides work
those tenants have already done — a silent removal, not a packaging change. That
is the reason this is a decision and not a default.

## Decision 6 — Attendance hardware is sold apart from Attendance

**`attendance-integrations` becomes a capability key, sold from Growth up. It
carries the seven device and gateway pages plus the installer list. Web and
desktop check-in stay on `attendance`, which every plan holds.**

The eight pages were attributed to `attendance` because that is the module they
serve. The effect was that a Starter tenant at USD 69 per month could configure
ZKTeco terminals, pair an on-premise .NET gateway, provision devices and map
device users to employees. That is enterprise integration machinery riding on a
key every plan holds, and no attribution could fix it — the key itself was
wrong.

Enforced only where settings resolve, exactly as Decision 2. The
`attendance-integrations` *module* stays in `ENTITLEMENT_UNGATED_MODULES` for
the reason already recorded there: two of its controllers carry no
`AuthenticatedUser`, and refusing a gateway already dialling a customer's
network is an integration break rather than a commercial one.

`apps-downloads` follows to `desktop-agent` rather than staying core. It lists
the clients a tenant can install, and once both clients are sold, an Integrations
category offering nothing but a download list for two things the plan does not
include is a worse answer than not offering it. A bespoke plan buying the gateway
without the agent would lose the gateway installer from that page; no shipped
plan produces that, and the row splits if a customer ever asks.

## Decision 7 — Compliance and bulk data movement become capabilities

**`compliance` (audit history, data access history, retention rules, compliance
exports) is sold from Enterprise up. `data-management` (bulk import and export)
is sold from Growth up.**

Both were core only because no key existed to sell them with.

Compliance is one key rather than four pages sold separately: an export is
assembled from the histories, so splitting them would sell a report without its
source. Including audit history is the part most likely to be revisited — it is
arguably table stakes rather than a compliance tier — and if it is, the change is
two lines in the attribution map, not a change to the catalog.

Field security and the advanced workflow pages (policy engine, workflow
templates) were considered and stay free. Approval matrices, delegation and
escalation stay free because Starter buys Leave and leave requests route through
them.

## Decision 8 — Restriction goes on the page, never on a new group

**The group layer describes what a page is. It must not be reshaped to carry an
entitlement boundary.**

A first pass created a "Plan & Billing" group so that `subscription` could sit
outside Payroll & Finance. That is the wrong instinct: a group invented so
something can fall on one side of a paywall makes the information architecture a
copy of the price list, and every future capability adds a container. Restriction
belongs on the item, where `SETTINGS_ITEM_ENTITLEMENTS` already puts it.

`subscription` is placed in the existing Apps & Modules group instead — where a
tenant already sees which capabilities it has. That placement also avoids a
mechanical trap: the `tenant` group key equals the `tenant` item key, so item
resolution wins at `/settings/general-setup/tenant` and that group's own landing
is unreachable. Harmless while the group held one page; it would have hidden
Subscription the moment it held two.

The corollary is that the IA cleanup done alongside this change moves nothing and
renames nothing. A category whose every group holds a single page now renders its
pages directly, and the workspace tile counts pages rather than groups — both
presentation, with the group layer and every URL left intact.

## Consequences

- Four new capability keys — `desktop-agent`, `attendance-integrations`,
  `compliance` and `data-management` — taking the catalog to sixteen. The
  typed mirror in `common/constants/tenant-features.ts` and the web mirror in
  `apps/web/lib/security-keys.ts` both carry it; a spec asserts the first
  matches the catalog in both directions.
- `subscription` is attributed CORE and re-placed under General Setup > Plan &
  Billing. It had fallen through `defaultPlacement` into the payroll category,
  so any of these decisions taken at category level would have hidden a Starter
  tenant's own billing page behind Payroll. Its landing card now links to
  `/settings/subscription` rather than to a derived runtime route.
- Every remaining page is attributed in
  `apps/web/app/(authenticated)/settings/_lib/settings-entitlements.ts`, and
  `settings-entitlements.spec.ts` fails the build when a settings page exists
  with no attribution. A new page cannot ship without answering this ADR's
  question for itself.
- No plan key, plan name or plan id appears anywhere in the gating path.
- A Starter tenant now resolves to 54 settings pages where it resolved to 87
  before any of this work, and 67 after the first round. A tenant entitled to
  nothing resolves to 35.
- Carving four keys out of what was free needs grandfathering for plans the
  catalog does not own. `npm run repair:plan-capabilities` grants the missing
  rows on operator-created plans only, never on the four catalog plans — those
  are converged by `reconcilePlanFeatures`, which is how Starter is meant to lose
  what it was never sold.

## Related

- [`BUG-2958`](../bugs/BUG-2958-settings-shows-every-category-group-and-page-regardless-of-t.md)
  — the defect these decisions were needed to fix.
- [`BUG-1952`](../bugs/BUG-1952-plan-entitlements-gate-nothing-so-a-starter-tenant-can-use-e.md)
  — the API enforcement layer this mirrors, and the record Decision 2 corrects.
- [`PLAN-031`](../plans/EXECPLAN-0031-plan-scoped-settings-visibility.md) — the
  ExecPlan.
