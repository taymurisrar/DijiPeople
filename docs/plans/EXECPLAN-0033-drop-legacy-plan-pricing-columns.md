---
ID: PLAN-033
---

CONTEXT_FILES_REQUIRED:
  - services/api/prisma/AGENTS.md                (destructive-change rules, expand/backfill/contract)
  - PLANS.md                                      (this template)
  - docs/bugs/BUG-0027-*.md                       (the original defect — read in full before touching any of this)

SPECIALIST_AGENTS_REQUIRED:
  - database    — schema/migration, the contract-phase drop itself
  - backend-api — DTOs, services, catalog, bootstrap, billing read paths
  - frontend    — apps/admin plan-form.tsx, subscription-form.tsx, and every
                  component below that still reads the legacy fields
  - reviewer    — this is commercial pricing data; every removed read/write
                  must be independently re-verified against Requirement 1

DELIBERATELY_NOT_USED:
  - integration — Stripe sync reads `PlanPrice`, not the legacy columns
    already (verify in Task 1); no gateway/device contract involved

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma
  - services/api/prisma/migrations/**
  - packages/config/platform-runtime-schema.generated.json (regenerated, not hand-edited)

QA_REQUIRED: yes — commercial pricing correctness (P0-adjacent; this is BUG-0027's own defect class). Before/after assertion on every existing subscription's rendered price is mandatory, not optional.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - BUG-0027 (CRITICAL) — the original defect this whole migration exists to
    close: `Plan.monthlyBasePrice`/`annualBasePrice` silently priced
    operator-created subscriptions instead of `PlanPrice`. Every consumer this
    plan removes must be re-verified as already reading `PlanPrice`
    exclusively — removing a *display* fallback that a *pricing* path
    secretly still depended on would resurrect BUG-0027 in a different file.

REGRESSION_ENTRIES_IN_SCOPE:
  - grep `docs/qa/regressions/index.md` for BUG-0027 / legacy-pricing before
    starting — do not assume none exists; the register may have grown since
    this plan was authored.

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL for expand/switch work; the contract (column drop) migration is applied through the normal `prisma:migrate:deploy` release path, never by hand against a shared database
DEPLOYMENT_REQUIRED:      yes (api, apps/admin)
DEPLOYMENT_COMPONENTS:    api, admin
DEPLOYMENT_ORDER:         switch-phase code (stop every read/write) deploys and bakes in production for a full release cycle *before* the contract migration (column drop) is even written — see Database impact. database -> api -> admin for the eventual contract deploy itself.
ROLLBACK_CLASS:           DATABASE_DESTRUCTIVE
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  yes
POST_DEPLOY_QA_REQUIRED:  yes — before/after price assertion against production data is mandatory before the contract migration is even proposed as a follow-up plan
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    check `node scripts/session.mjs list` — `schema.prisma` is single-writer and this plan's contract phase cannot run alongside any other schema change
ENVIRONMENT_DEPENDENCIES: none new

---

# ExecPlan — Contract phase: remove and drop legacy Plan pricing columns (ITEM-0020)

## Objective

Zero code paths read or write `Plan.monthlyBasePrice`, `Plan.annualBasePrice`
or `Plan.currency` to decide what a customer sees or pays; the columns (and
their now-unneeded bookkeeping siblings `Plan.legacyPricingMigratedAt`,
`PlanPrice.backfilledFromLegacyAt`) are dropped by a migration proven safe
against production data by `report-legacy-price-conflicts.mjs` reporting zero
high-severity rows. **This plan covers only the switch and contract phases**
— removing every remaining reader/writer, then dropping the columns in a
later, separately-approved migration once the switch phase has run in
production for a full release cycle with zero fallout.

## Business requirement

Close the remaining phase of `BUG-0027` (CRITICAL — silently priced
operator-created subscriptions from the wrong source). Internal technical
debt closure; no new customer-facing behaviour. `TODO: Confirm product/business
rule` does not apply — this is corrective engineering work already directed
by the bug record and this backlog item.

## Existing behavior

**FACT**, `services/api/prisma/schema.prisma:3924-3931` (Plan model): the
three legacy columns carry an explicit `DEPRECATED` comment already stating
"nothing may read them to decide what a customer pays" and that
`legacyPricingMigratedAt` exists "so the contract phase can prove zero live
consumers before the columns are dropped" — i.e. the schema itself already
documents this plan's precondition.

**FACT**, `services/api/prisma/schema.prisma:4037-4040` (`PlanPrice.backfilledFromLegacyAt`):
marks rows created by the legacy backfill rather than authored in Admin, "so
the contract phase can tell generated rows from deliberate ones."

**FACT — re-derived 2026-09-11, materially larger than the item's own
2026-08-16 evidence.** The item recorded six consumers. A fresh repo-wide
grep for `monthlyBasePrice`/`annualBasePrice` today finds substantially more,
across both apps. This is not a contradiction of the item — it is exactly
the drift `AGENTS.md`'s "Verify counts on your branch" warning describes, and
it is why Task 1 below is a full re-audit, not a checklist copied from the
record. Representative findings, grouped by classification (full audit is
Task 1, not this plan's prose):

  - **LEGACY_WRITE** (still persists the columns):
    `services/api/src/modules/tenants/tenants.service.ts:154-155` (default
    plan auto-creation), `services/api/src/modules/super-admin/super-admin.service.ts:2027-2028,2153-2154`
    (create/update plan), `services/api/src/modules/super-admin/commercial-bootstrap.ts:169-170,219-220,236-237,264-265`
    (seed bootstrap — writes **and** compares against them to decide whether
    to re-seed), `apps/admin/app/_components/plan-form.tsx:80-81` (client
    payload for create/update).
  - **DERIVED_DISPLAY / READ** (renders or returns them, does not decide a
    charge — but must be individually confirmed, not assumed, per Requirement 1):
    `services/api/src/modules/billing/services/billing.service.ts:180-181`,
    `services/api/src/modules/platform-runtime/platform-runtime.service.ts:1128-1129`,
    `services/api/src/modules/super-admin/super-admin.service.ts:4657-4658`,
    `apps/admin/app/_components/subscription-form.tsx:187-188,213-214`
    (**this one specifically computes a displayed base price from them** —
    the exact case the item named), `apps/admin/app/_components/platform-lifecycle-types.ts:61-62`,
    `apps/admin/app/_components/tenants/tenant-commercial-panel.tsx:36-37`,
    `apps/admin/app/(internal)/plans/[planId]/page.tsx:38-39` (this file's own
    comment at line 73 already states it used to read these and was fixed —
    re-verify it does not still read them elsewhere in the same file).
  - **CATALOG / SEED SOURCE** (not a runtime read of the *column*, but the
    literal values that get written into it — relevant to whether seeding can
    stop writing the column at all): `services/api/src/modules/super-admin/plans.catalog.ts`
    — carries `monthlyBasePrice`/`annualBasePrice` per plan definition and its
    own file comment already says "deprecated and display-only"
    (`plans.catalog.ts:6`).
  - **DTO SURFACE** (client-settable today — a mass-assignment concern in its
    own right, separate from this item but touched by the same removal):
    `services/api/src/modules/super-admin/dto/create-plan.dto.ts:36,40`,
    `update-plan.dto.ts:39,44`.
  - **GENERATED, NOT HAND-EDITED**: `packages/config/platform-runtime-schema.generated.json`
    — two occurrences, both regenerated from `schema.prisma` by
    `npm run generate:runtime-schema`; do not hand-edit, regenerate after the
    schema change and commit the diff.
  - **COMMENTS ONLY, already correct** (evidence the migration is already
    partially trusted): `services/api/src/modules/billing/services/plan-change.service.ts:290`
    ("Deliberately NOT `Plan.monthlyBasePrice`") and
    `services/api/src/modules/super-admin/billing.service.ts:81-82` ("this
    used to fall back to `Plan.annualBasePrice`/`monthlyBasePrice`... and the
    result was [presumably wrong]") — these two files are evidence *for* the
    contract phase, not additional consumers to fix, but re-verify the
    surrounding code in both actually contains no residual read before
    treating the comment as sufficient.

**FACT**, `scripts/report-legacy-price-conflicts.mjs`: exists, is read-only,
classifies every plan's legacy amount against its authoritative `PlanPrice`
into `MISSING_AUTHORITATIVE_PRICE` / `UNPRICED` / `BACKFILLED_FROM_LEGACY` /
`AUTHORITATIVE_ONLY` / `UNIT_MISMATCH_FLAT_VS_PER_SEAT` / `AMOUNT_CONFLICT`,
and exits 1 on any `AMOUNT_CONFLICT`. This is the tool Requirement 3 depends
on and it already exists — no new tooling needed for that step.

## Existing architecture

- `services/api/prisma/schema.prisma` — `Plan`, `PlanPrice`,
  `CommercialPublicationStatus`, `CommercialSalesModel`.
- `services/api/src/modules/super-admin/` — plan/subscription CRUD,
  `commercial-bootstrap.ts` (seed convergence), `plans.catalog.ts` (seed
  source values).
- `services/api/src/modules/billing/` — customer-facing pricing resolution
  (`billing.service.ts`), plan-change flow (`plan-change.service.ts`).
- `services/api/src/modules/tenants/tenants.service.ts` — default plan
  auto-creation on tenant provisioning.
- `services/api/src/modules/platform-runtime/platform-runtime.service.ts` —
  generic entity API surface for Platform Admin's runtime tables.
- `apps/admin/app/_components/plan-form.tsx`, `subscription-form.tsx`,
  `tenants/tenant-commercial-panel.tsx`, `platform-lifecycle-types.ts`,
  `plans/plan-commercial-summary.tsx` — Admin UI.
- `scripts/report-legacy-price-conflicts.mjs` — the safety check this plan's
  Database impact section depends on.

## Requirements

1. **Re-audit, exhaustively, before writing any removal code.** Run
   `grep -rn "monthlyBasePrice\|annualBasePrice\|\.currency\b" services/api/src apps/admin packages/config` (the item's own six-consumer list is stale — re-derive it) and classify every hit as `LEGACY_WRITE`,
   `DERIVED_DISPLAY`, `CATALOG_SOURCE`, `DTO_SURFACE`, `GENERATED`, or
   `ALREADY_CORRECT_COMMENT`. Produce this as a table in the implementation
   PR description or an updated version of this plan — do not proceed on the
   list above without re-confirming line numbers, since this document itself
   may already be stale by the time it is implemented.
2. Every `LEGACY_WRITE` site stops writing the columns. Where a legitimate
   write is needed (default plan auto-creation in `tenants.service.ts`,
   operator plan create/update in `super-admin.service.ts`), it creates or
   updates a `PlanPrice` row instead, following the existing `PlanPrice`
   creation pattern already used elsewhere in `super-admin.service.ts`.
3. Every `DERIVED_DISPLAY` site reads from `PlanPrice` (resolved the same way
   `billing.service.ts`'s customer-facing path already resolves a price —
   reuse that resolution, do not invent a second one).
4. `create-plan.dto.ts` / `update-plan.dto.ts` stop accepting
   `monthlyBasePrice`/`annualBasePrice` as client input. Given the global
   `ValidationPipe`'s `forbidNonWhitelisted: true`, removing the DTO fields is
   sufficient to make a client-sent value a 400 — confirm this explicitly
   with a spec, since a client (Admin) still sending the now-removed field
   during rollout must not break silently.
5. `commercial-bootstrap.ts`'s seed convergence stops comparing against and
   writing the legacy columns; it converges `PlanPrice` rows for the four
   catalog plans instead, preserving idempotency (re-running seed must not
   create duplicate `PlanPrice` rows — reuse whatever uniqueness
   `commercial-bootstrap.ts` already relies on for `PlanPrice`, or add
   `@@unique` there if none exists — check before assuming).
6. `node scripts/report-legacy-price-conflicts.mjs` run against production
   data (read-only, safe) reports zero `AMOUNT_CONFLICT` and zero
   `UNIT_MISMATCH_FLAT_VS_PER_SEAT` rows. Any non-zero result is a
   `PRODUCT_DECISION` escalation (per BUG-0027's own established pattern),
   resolved deliberately in Admin before proceeding — **this plan does not
   authorize silently picking a winner.**
7. Every plan holding legacy amounts (`monthlyBasePrice > 0 OR
   annualBasePrice > 0`) has `legacyPricingMigratedAt` set. If any do not,
   that is a gap in the Wave 1 backfill this plan surfaces and must resolve
   before the contract migration — not paper over.
8. **The column drop itself is a separate migration, proposed only after
   requirements 2-7 have been deployed to production and observed for at
   least one full release cycle with zero regression.** This plan's
   Definition of Done stops at "zero readers/writers, proven"; the drop
   migration is written as its own follow-up ExecPlan amendment (or a new,
   small plan referencing this one) once that observation period has passed,
   per `services/api/prisma/AGENTS.md`'s destructive-change rule: expand,
   backfill, **and observe** before contract.
9. A before/after assertion: for a sample of existing subscriptions (ideally
   all of them, in a non-production dry run against a production data copy),
   the price the customer is charged (`Subscription.basePrice`/`finalPrice`,
   snapshotted at subscription time) is provably unaffected by this change —
   this plan only touches *plan-level* legacy columns, never the
   subscription's own snapshot, but the assertion must be run and recorded,
   not assumed from that architectural fact alone.

## Dependencies

`BUG-0027` — landed (Wave 1: expand + backfill + switch-for-pricing-authority).
This plan is explicitly its remaining phase, scoped narrower than the
original item implies (see Requirement 8) because "prove zero live consumers"
and "drop the columns" are not safe to do in the same change — see Risks.

## Files / modules affected

Backend: `services/api/src/modules/tenants/tenants.service.ts`,
`super-admin/super-admin.service.ts`, `super-admin/commercial-bootstrap.ts`,
`super-admin/dto/create-plan.dto.ts`, `super-admin/dto/update-plan.dto.ts`,
`super-admin/plans.catalog.ts`, `billing/services/billing.service.ts`,
`platform-runtime/platform-runtime.service.ts`, plus whatever Requirement 1's
re-audit finds beyond this list.

Frontend (`apps/admin`): `app/_components/plan-form.tsx`,
`app/_components/subscription-form.tsx`,
`app/_components/platform-lifecycle-types.ts`,
`app/_components/tenants/tenant-commercial-panel.tsx`,
`app/(internal)/plans/[planId]/page.tsx`, and
`app/_components/plans/plan-commercial-summary.tsx` if it turns out to read
the columns rather than only comment on them (re-verify).

Generated: `packages/config/platform-runtime-schema.generated.json`
(regenerate, do not hand-edit).

Schema (this phase — no column drop yet): none, unless Requirement 7's audit
finds plans needing a `legacyPricingMigratedAt` backfill, in which case a
small, additive `UPDATE` migration (setting a timestamp column, not adding
or dropping one) is in scope here.

Schema (follow-up phase, out of scope for this plan's implementation but
must be pre-designed per Requirement 8): drop `Plan.monthlyBasePrice`,
`Plan.annualBasePrice`, `Plan.currency`, `Plan.legacyPricingMigratedAt`,
`PlanPrice.backfilledFromLegacyAt`.

## Database impact

**This phase**: none destructive. At most, a backfill `UPDATE` setting
`legacyPricingMigratedAt` on any plan Requirement 7 finds missing it — additive,
reversible (the column already exists and already defaults to null).

**Follow-up phase (design now, execute later, per Requirement 8)**:
`ALTER TABLE "Plan" DROP COLUMN "monthlyBasePrice", DROP COLUMN
"annualBasePrice", DROP COLUMN "currency", DROP COLUMN
"legacyPricingMigratedAt"; ALTER TABLE "PlanPrice" DROP COLUMN
"backfilledFromLegacyAt";` — irreversible in a forward-only migration
history. Preconditions before this migration is even written:
`report-legacy-price-conflicts.mjs` clean against production, zero remaining
readers/writers (this plan's Requirements 2-6 deployed and observed), and an
explicit backup/export of the current column values taken immediately before
the migration runs (a `SELECT id, key, "monthlyBasePrice", "annualBasePrice",
currency, "legacyPricingMigratedAt" FROM "Plan"` dump, timestamped and stored
outside the database) — the forward fix for "we needed one of these values
after all" is restoring from that export, not reversing the migration.

## Backend impact

See Requirements 2-6 and Files/modules affected. No new endpoints. Existing
`super-admin` plan create/update endpoints keep their request/response shape
at the DTO's public surface except for removing the two now-forbidden legacy
fields (a breaking change for any client still sending them — see Migration
/ data compatibility). Reuse `billing.service.ts`'s existing price resolution
rather than writing a second one (Architecture Principle 3: reuse existing
domain services).

## Frontend impact

`apps/admin` only. `plan-form.tsx` and `subscription-form.tsx` stop reading/
writing the legacy fields and instead read/write through whatever
`PlanPrice`-backed form control the plan-price governance work (see
`ITEM-0022`, a sibling plan) provides — **check whether `ITEM-0022` has
landed before implementing this plan's frontend half**; if it has not, this
plan's Admin changes must still work against the raw `PlanPrice` create/list
endpoints directly, without assuming `ITEM-0022`'s governed publish/archive
actions exist yet. Loading/error/empty states: unchanged, this is a data-source
swap behind an existing form, not a new screen.

## Permission / RBAC impact

None. No new permission key; existing `super-admin` plan-management
permissions already gate every touched endpoint.

## Tenant-isolation impact

None — `Plan` and `PlanPrice` are platform-owned (commercial catalog), not
tenant-owned models; no `tenantId` filter applies to either.

## Audit / event / logging impact

Plan/PlanPrice create and update already go through `AuditService.log()`
(verify at implementation time in `super-admin.service.ts`) — no new audit
event type is needed, but the before/after snapshots for any touched update
path must be re-checked to ensure they still capture the fields that now
matter (`PlanPrice` amounts) rather than the fields being removed.

## Integration impact

None identified — Stripe sync (`stripeSyncStatus`, `stripePriceId` on
`PlanPrice`) already keys off `PlanPrice`, not the legacy columns (verify in
Task 1; not previously confirmed in this plan's research).

## Migration / data compatibility

**Breaking for any already-deployed Admin client still sending
`monthlyBasePrice`/`annualBasePrice`** on plan create/update once the DTO
fields are removed and `forbidNonWhitelisted: true` turns them into a 400.
Since `apps/admin` is deployed by this same repository (not an independently
versioned external client), coordinate the API DTO change and the Admin form
change in the **same deploy** — deploying the DTO change first, alone, would
400 the current, unmigrated Admin build. This is the one place in this plan
where "backend then frontend" ordering (the repo's usual default) is reversed
into "both together."

Already-stored data: legacy column values are left in place through this
phase (Requirement 8) — no existing row's data is destroyed, only stopped
being read.

## Parallel-safe tasks

- Requirement 1 (re-audit): `PARALLEL_SAFE`, must run first but is
  read-only.
- `commercial-bootstrap.ts` convergence rewrite: `PARALLEL_SAFE` relative to
  the Admin frontend work (different files, no shared state).

## Dependency-blocked tasks

- Every `LEGACY_WRITE`/`DERIVED_DISPLAY` fix: `DEPENDENCY_BLOCKED` on
  Requirement 1's completed, current audit.
- The DTO removal and the Admin form change: `DEPENDENCY_BLOCKED` on each
  other — must ship together per Migration/data compatibility above.
- Any backfill `UPDATE` for missing `legacyPricingMigratedAt`:
  `DEPENDENCY_BLOCKED` on Requirement 6's conflict report being clean first
  (no point backfilling a timestamp on a plan whose amounts still disagree).

## Integration tasks

- Final `report-legacy-price-conflicts.mjs` run against production,
  before/after subscription price assertion, and the full validation suite.
  `INTEGRATION`, runs last, one agent, one branch.

## Testing strategy

- `npm --workspace api run test` — extend or add specs for
  `tenants.service.spec.ts`, `super-admin.service.spec.ts`,
  `commercial-bootstrap.spec.ts` (if one exists; create if not) asserting no
  write to the legacy columns and a correct `PlanPrice` row instead.
- `npm --workspace api run test:e2e` — a request sending the now-removed DTO
  fields to plan create/update gets a 400, not a silent drop.
- `npm --workspace api run check-types`, `npm --workspace api run lint`.
- `npm --workspace admin run test`, `check-types`.
- `node scripts/report-legacy-price-conflicts.mjs` (and `--json` for a
  machine-readable record attached to the QA run).
- Manual: before the change, snapshot every subscription's resolved price via
  the existing customer-facing pricing endpoint; after the change, re-run the
  same snapshot and diff — zero differences is the acceptance bar. Record as
  a QA run under `docs/qa/runs/`.
- `npm run backlog:check`, `npm run validate:framework` if this plan's own
  record edits are part of the same change.

## Risks

1. **A pricing path still secretly depends on a legacy column read this plan
   removes, and BUG-0027 resurfaces in a new location.** Likelihood: medium
   — the consumer count already grew once since the item was filed, meaning
   the surface is not fully mapped by anyone yet. Impact: critical (same
   class as BUG-0027 — customers billed incorrectly). Mitigation: Requirement
   1's fresh, exhaustive audit; Requirement 9's before/after assertion is the
   final backstop and is non-negotiable.
2. **Dropping the columns before the switch phase has been observed in
   production burns the ability to recover a value nobody re-derived in
   time.** Likelihood: low if Requirement 8 is honoured, high if someone
   collapses this plan's two phases into one PR for expedience. Impact: high,
   irreversible. Mitigation: Requirement 8 makes this an explicit, separate,
   later plan — the Reviewer should refuse a PR that includes a
   `DROP COLUMN` migration alongside this plan's switch-phase code.
3. **`commercial-bootstrap.ts`'s seed convergence, rewritten to target
   `PlanPrice`, breaks idempotency and duplicates prices on every
   `seed:config` run.** Likelihood: medium (convergence logic is easy to get
   wrong the first time). Impact: medium, self-correcting once found but
   embarrassing on a fresh deploy. Mitigation: an idempotency test that runs
   the bootstrap twice and asserts the `PlanPrice` row count is unchanged the
   second time.
4. **Admin/API DTO deploy ordering mismatch 400s a plan-management screen for
   the length of a deploy window.** Likelihood: medium if not deployed
   together. Impact: low (internal Platform Admin tool, not customer-facing;
   brief). Mitigation: Migration/data compatibility's same-deploy requirement.

## Rollback considerations

This phase (`ROLLBACK_CLASS: DATABASE_DESTRUCTIVE` is declared at the plan
level because the plan's ultimate purpose is a destructive migration, even
though this phase's own changes are `CODE_ONLY` plus an additive backfill):
revert the commit; the legacy columns still exist and still hold their
values, so reverting restores the old read/write behaviour exactly. The
follow-up drop migration, once written, is **irreversible** — its own plan
must state the forward fix (restore from the pre-migration export named in
Database impact) rather than a rollback, and must not be executed until this
phase has run in production through at least one full release cycle with a
clean conflict report and a clean before/after price assertion.

## Definition of Done

- [ ] Requirement 1's fresh audit table produced and attached to the
      implementation PR.
- [ ] Every `LEGACY_WRITE` and `DERIVED_DISPLAY` site fixed per Requirements
      2-3, with specs.
- [ ] DTO fields removed; a 400 confirmed for the old shape; Admin ships in
      the same deploy.
- [ ] `commercial-bootstrap.ts` converges `PlanPrice`, idempotently, tested.
- [ ] `report-legacy-price-conflicts.mjs` clean against production.
- [ ] Any plan missing `legacyPricingMigratedAt` backfilled.
- [ ] Before/after subscription price assertion run and recorded as a QA run.
- [ ] `packages/config/platform-runtime-schema.generated.json` regenerated
      and committed if the schema changed (backfill-only migration; likely no
      schema shape change this phase).
- [ ] All validation commands in Testing strategy pass.
- [ ] The column-drop migration is explicitly **not** part of this
      implementation — confirmed absent from the diff.
- [ ] No unrelated file changed.
