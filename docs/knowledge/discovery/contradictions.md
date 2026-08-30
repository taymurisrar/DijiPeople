---
aliases: [Contradictions]
type: framework-knowledge
last_verified: 2026-08-30
---

# Contradictions

Places where **two parts of the implementation disagree** with each other. Not
gaps ([[known-gaps]]) and not open questions ([[pending-verification]]) — these
are cases where both halves exist, both run, and they do not say the same thing.

Each entry states what was read, where, and what a reader should do about it.
None of these is being fixed by the discovery that found them; recording them is
the deliverable.

---

## Employee draft state is stored twice and each store leads in one direction

**Status:** Confirmed by reading the code. Not yet reproduced against a database.

[[entity-employee|Employee]] carries both `status` (a plain `String`, values in
`modules/employees/employee-lifecycle.constants.ts`) and `isDraftProfile` (a
`Boolean`). They encode the same fact.

- **On write**, `status` leads. `employees.service.ts:3258` — setting
  `status: 'DRAFT'` derives `isDraftProfile = true`, and setting `'ACTIVE'` on a
  previously-draft row derives `false`.
- **On read**, `isDraftProfile` leads. `mapEmployee` at
  `employees.service.ts:3556` overrides the stored `status`, `subStatus` **and**
  `employmentStatus` from it on the way out.

So the API response is not necessarily the row. If the two ever diverge —
a direct write, an import, a seed, a migration — `GET /employees` reports one
thing and anything reading the table reports another.

They already have different consumers. `onboarding.repository.ts:31` and
`dashboard.service.ts:456` both query on `isDraftProfile` directly rather than on
`status`, so a divergence shows up as a dashboard count that disagrees with the
list beside it.

**What to do:** treat `isDraftProfile` as the read authority and `status` as the
write authority, which is what the code does today. Do not add a third consumer
without deciding which one it follows. A durable fix is a single source — but
that is a schema change, not a documentation change, and it needs a record and a
plan of its own.

**Compounding factor:** neither `status` nor `subStatus` is a database enum, so
nothing prevents a value outside the constants file. `employmentStatus` is a real
enum and is the only one of the three the database defends.

**Nearest pattern:** [[divergent-duplicate-guard]] — one rule held in two places
that can drift. Not [[two-writers-one-field]], which is the inverse (two meanings
crammed into one field).

## `SubscriptionStatus` carries two spellings of the same state

**Status:** Confirmed. Latent — currently defended everywhere it is read.

The enum contains both `CANCELLED` and `CANCELED`, and both are written:

- `billing`, the Stripe path — `cancellation.service.ts:118`, `:212` and
  `webhook.service.ts:1414` — writes **`CANCELED`**, mirroring Stripe's spelling.
- `tenant-control-plane.service.ts:509` writes **`CANCELLED`**.

Every other cancelled state in the codebase — `ApprovalRequestStatus`,
`ClaimRequestStatus`, `BusinessTripStatus`, `EmployeeBenefitStatus`,
`PlanChangeStatus`, `SeatChangeStatus`, `AttendanceSessionStatus`,
`DeviceProvisioningStatus` — uses the double-L spelling only.
`SubscriptionStatus` is the sole exception, and it is the one enum an external
system writes into.

**Why nothing is broken today.** Almost every reader filters *positively* —
`status: ACTIVE`, `status: { in: [ACTIVE, TRIALING] }` — so a cancelled
subscription is excluded whichever spelling it holds. The one place that tests
for cancellation explicitly, `tenant-control-plane.service.ts:489-490`, already
checks both. Somebody met this and defended against it locally.

**Why it is still worth recording.** A single `where: { status: 'CANCELLED' }`
written by the next person returns none of the Stripe-cancelled subscriptions,
reports a plausible number, and raises no error. The defence exists in one file
and nothing propagates it.

**What to do:** filter positively, or handle both. Collapsing the two into one
value is a destructive enum change with a data backfill, so it is a decision with
a plan attached — see [[entity-subscription|Subscription]].

**Nearest pattern:** [[two-writers-one-field]] — two writers on one field that do
not know about each other. Here their values do not collide, they fragment.

## `SalaryComponent` is a superseded predecessor of `PayComponent`

**Status:** Confirmed. Low risk today, high risk if somebody wires it up.

Two models describe pay components:

- **`PayComponent`** — live, 17 relation ends, owned by `pay-components`. Carries
  `calculationMethod`, `percentageBaseComponentId`, `formulaExpression`,
  proration basis, rounding, GL debit/credit accounts, `isTaxable`,
  `affectsGrossPay`, `affectsNetPay`, effective dating.
- **`SalaryComponent`** — 13 fields, its own `SalaryComponentType` enum, related
  only to `Tenant`, and **no read or write anywhere in the repository**.

`SalaryComponent` is an earlier, thinner design that `PayComponent` replaced. It
was never removed, and it is the more obvious name — which is the hazard. Anyone
searching the schema for "salary component" finds the dead one first.

**What to do:** all pay-component work goes through `PayComponent`. Treat any
appearance of `SalaryComponent` in new code as a mistake. Removing it is a
destructive schema change needing an ExecPlan, so it is a decision rather than a
tidy-up.

## Emergency contact is denormalised on `Employee` and also modelled separately

**Status:** Confirmed.

[[entity-employee|Employee]] carries `emergencyContactName`,
`emergencyContactPhone`, `emergencyContactAlternatePhone`,
`emergencyContactRelation` and `emergencyContactRelationTypeId` — and an
`EmergencyContact` model exists with a relation to `Employee`, supporting many
contacts per person.

The denormalised fields are the live implementation. `EmergencyContact` has no
call sites. The disagreement is about **cardinality**: the schema says an
employee may have several emergency contacts; the code says exactly one.

`EmployeeDocumentReference` has the same shape against `Employee`'s document
fields.

**What to do:** read and write the denormalised fields. If a requirement for
multiple contacts appears, that is the moment to decide between the two, and it
is a product decision with a migration attached.

## Framework counts in `AGENTS.md` have drifted from the schema

**Status:** Confirmed at `2007fad`. Expected drift, recorded so the next reader
does not trust the number.

`AGENTS.md` states 312 models, 295 enums, 13,703 lines and 210 migrations,
verified at `494c44d`. The schema at `2007fad` holds **318 models, 299 enums,
14,061 lines and 224 migrations**.

The file says explicitly to re-derive rather than trust, and
`validate-framework.mjs` checks the **module** table but not the schema counts.
That asymmetry is why the module table is current and these are not.

**What to do:** re-derive. `npm run knowledge:data-model` prints the live figures
and regenerates [[domain-map]] from them; [[data-model-overview]] carries them in
prose with the same warning attached.

## Related

[[known-gaps]] · [[pending-verification]] · [[discovery-status]] ·
[[data-model-overview]] · [[entity-employee|Employee]] · [[employees]] ·
pattern [[doc-code-drift]]
