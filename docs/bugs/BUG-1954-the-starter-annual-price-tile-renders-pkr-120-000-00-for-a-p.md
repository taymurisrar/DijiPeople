---
ID: BUG-1954
aliases: [BUG-1954]
Title: The Starter annual price tile renders PKR 120,000.00 for a PKR 3,000 annual price
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/admin, services/api/src/modules/super-admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-350
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1954 — The Starter annual price tile renders PKR 120,000.00 for a PKR 3,000 annual price

## Summary

The Starter plan detail in Platform Admin shows an annual price of
**PKR 120,000.00**. The public API reports the plan's PKR annual price as a unit
amount of **3,000** per seat. 120,000 is neither that number nor twelve times the
monthly tile (PKR 300.00 x 12 = 3,600). The screen an operator uses to check
pricing is showing a figure that does not correspond to any stored price.

## Expected Behavior

The annual tile shows the annual price that is actually stored and charged, in
its own currency and units, and the discount caption is computed from the same
two numbers the tiles display.

## Actual Behavior

- Monthly tile: `PKR 300.00`
- Annual tile: `PKR 120,000.00`
- Caption: "No annual discount against monthly billing."

while the public plans API reports the PKR annual price as `unitAmount 3000`,
`ANNUAL`, `PER_SEAT`.

## Reproduction

Target: `https://admin.dijipeople.com`, production API commit `949f461c`,
observed 2026-08-29.

1. Open Platform Admin, go to Plans, open the Starter plan
   (`11111111-1111-4111-8111-111111111111`).
2. Read the pricing tiles on the plan detail: monthly `PKR 300.00`, annual
   `PKR 120,000.00`, caption "No annual discount against monthly billing."
3. Read the same plan's PKR annual price from the public plans API: `unitAmount`
   is `3000`, interval `ANNUAL`, model `PER_SEAT`.

## Evidence

Live observation on the production admin console and the public plans API, as
quoted above. No file:line evidence was collected — the QA run did not trace
which formatter or query produces the tile, so the mechanism (a minor-unit
conversion applied twice, a seat multiplier, or a different price row being
selected) is unresolved.

## Root Cause

Not established. Note only that 120,000 is not 3,000, not 300 x 12, and not
3,000 x 100 (300,000) — so a single minor-units error does not explain it on its
own, and the number should be traced rather than guessed at.

## Impact

This is the screen a platform operator uses to set and check commercial pricing.
A wrong annual figure invites a "correction" that would change a real price, and
the caption compounds it by asserting there is no annual discount when the stored
prices may well encode one. Rated HIGH: it is a money figure shown to the person
who edits money figures, on a production console, with a plausible path to a
wrong price being saved.

## Affected Areas

`apps/admin` plan detail pricing tiles; the `super-admin` plans/pricing read path
that feeds them.

## Proposed Resolution

Trace the annual tile from the stored `PlanPrice` row to the rendered string and
find where the value diverges. Then assert the invariant in a test rather than in
a formatter comment: the tile equals the stored unit amount rendered in its
currency's units, and the discount caption is derived from the same two values.

## Acceptance Criteria

- The annual tile for Starter renders the stored PKR annual unit amount (3,000)
  in PKR.
- The discount caption is consistent with the monthly and annual figures shown
  beside it.
- The same holds for every currency the plan carries, not only PKR.

## Regression Coverage

None yet. A unit test over the tile formatter, fed the stored price rows, would
fail today.

## Dependencies

None identified.

## Related Items

BUG-1133 and BUG-1134 concern plan price rows and their Stripe ids on the same
screens; BUG-1745 concerns money rendered in the wrong currency on the executive
dashboard. This record is a display defect on the plan detail, distinct from all
three.

## Resolution

**Fixed 2026-08-29.** PKR 120,000.00 is a real stored price. It is Starter's
**flat** PKR annual price, and it was being rendered beside Starter's
**per-seat** PKR monthly price. No minor-unit conversion was involved anywhere,
in either direction.

### Where 120,000 comes from

`services/api/src/modules/super-admin/pricing.catalog.ts` holds two schedules
per market. Starter, PK market:

- per-seat: `monthly.PK = 300`, annual = `300 x 10` = **3,000**
- flat: `monthly.PK = 12_000`, annual = `12_000 x 10` = **120,000**

Annual is ten months of monthly by construction (`ANNUAL_MONTHS_CHARGED = 10`),
which is why the record's arithmetic did not land: 120,000 is not 3,000, not
300 x 12 and not 3,000 x 100 — it is 12,000 x 10, a number from the other
schedule. The public plans API reports 3,000 because it sells the per-seat
schedule; flat rows are `SALES_ASSISTED` and a visitor cannot reach them.

### Why the tile paired them

`apps/admin/app/_components/plans/plan-commercial-summary.tsx:37-42`, before
this change, looked each cycle up on its own:

    prices.find((p) => p.billingCycle === "MONTHLY" && p.isActive !== false)
    prices.find((p) => p.billingCycle === "ANNUAL"  && p.isActive !== false)

Nothing tied the two rows to one currency or one billing model.
`PlansRepository` orders prices by `currency asc, billingCycle asc`
(`services/api/src/modules/super-admin/plans.repository.ts:45`), so the first
ANNUAL row is PKR and, within PKR and ANNUAL, the flat and per-seat rows tie —
the two lookups landed on different schedules. Starter carries twelve active
prices (three currencies x two billing models x two cycles), so this was not a
near miss.

The caption followed from the same crossing: 300 x 12 = 3,600 is less than
120,000, the saving clamped to zero, and the tile asserted "No annual discount
against monthly billing" for a schedule that encodes two months free.

`apps/admin/app/(internal)/plans/[planId]/page.tsx` carried the identical pair
of lookups on the legacy `?workspace=legacy-commerce` route and is fixed the
same way.

### The fix

The pair is now selected as a pair:

- `apps/admin/lib/runtime/plan-headline-prices.ts` — `selectPlanHeadlinePrices`
  groups active prices by `(currency, billingModel)` and picks one schedule:
  one that carries both cycles first, per-seat before flat (per-seat is the
  public schedule checkout sells), then first appearance, which follows the
  API's `currency asc` ordering and so agrees with the `startingCurrency`
  `mapPlan` already publishes. It returns the monthly amount, the annual
  amount, the currency, the billing model, the saving and the percentage — all
  from that one schedule — plus `otherScheduleCount`.
- Both tiles and the pricing-posture panel now name the schedule they are
  showing ("Per seat, PKR"), and the monthly caption says how many other
  schedules are configured. A single headline figure for a twelve-price plan is
  lossy whichever row it picks; saying which row it is was the missing half.
- `apps/admin/lib/runtime/plan-headline-prices.spec.ts` — fourteen cases built
  on Starter's real production schedule in the order the API sends it. They
  assert PKR 300 / PKR 3,000 / 17%, assert explicitly that the annual figure is
  never 120,000, and cover QAR whole units, USD fractional units (2.2 and 22),
  a flat-only plan, deactivated rows, duplicate rows and a dearer annual price.

Stored price data was not touched, no seed was run, and nothing was sent to
Stripe. The defect was in the read path only.

### Acceptance criteria

- Starter's annual tile renders the stored PKR annual unit amount, 3,000, in
  PKR — covered by the first spec case.
- The caption is derived from the two figures beside it, and now reads 17%.
- It holds for every currency: the selection is currency-agnostic and the specs
  exercise PKR, QAR and USD, the last with fractional units.

## QA Retest

Not retested against production. Covered by unit tests over the selection and
the arithmetic; the rendered screen still wants an operator to open Starter and
read the two tiles.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — wrong money shown to the operator who sets pricing; cheap, high consequence.
- 2026-08-29 — fixed in SESSION-0076. Not a scaling defect: the monthly and annual tiles were reading two different price schedules. `selectPlanHeadlinePrices` picks one schedule for both, and the tiles now name it.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]

<!-- GRAPH:END -->
