---
ID: PLAN-035
---

CONTEXT_FILES_REQUIRED:
  - services/api/prisma/AGENTS.md   (additive-column conventions, indexing)
  - PLANS.md                        (this template)

SPECIALIST_AGENTS_REQUIRED:
  - database    — the additive migration
  - backend-api — provisioning engine change, both call sites
  - frontend    — apps/admin tenant record surface (display only)

DELIBERATELY_NOT_USED:
  - integration — no external system involved
  - reviewer    — not required beyond the standard review; no tenant-isolation
                  or RBAC surface is touched (see those sections below)

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma
  - services/api/prisma/migrations/**

QA_REQUIRED: no — additive, nullable, no behavioural branch in production code reads the new field yet beyond display; a colocated unit/e2e spec covers it. Escalate to QA_REQUIRED: yes if the Architect wants an end-to-end provisioning QA run.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - none specific; general reminder from BUG-0027/BUG-0078 in this same
    commercial area: do not guess a value silently. This plan's rule (record
    null when the market has none) is deliberately the same discipline.

REGRESSION_ENTRIES_IN_SCOPE:
  - none identified

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      yes (api, admin)
DEPLOYMENT_COMPONENTS:    api, admin
DEPLOYMENT_ORDER:         database -> api -> admin
ROLLBACK_CLASS:           DATABASE_ADDITIVE
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  no (LOW severity, additive, no customer-facing claim changes — see Objective)
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    check `node scripts/session.mjs list` — `schema.prisma` is single-writer; also check for any in-flight work on `provisioning-requested.handler.ts` or `platform-onboarding.service.ts` (shared with ITEM-0022/ITEM-0119's neighbourhood of the billing/provisioning surface, though none of those three plans touch these exact files)
ENVIRONMENT_DEPENDENCIES: none new

---

# ExecPlan — Tenant.dataRegion populated from market at provisioning (ITEM-0023)

## Objective

`Tenant` gains a nullable `dataRegion` column. The one shared provisioning
engine (`PlatformOnboardingService.provisionTenantForCustomer`) records the
resolved market's `dataRegion` on it when a market is known and that market
declares one; every other case — no market, or a market with `dataRegion:
null` — leaves it null rather than guessing. Nothing yet publicly claims a
region for any tenant (**FACT**, every seeded `Market.dataRegion` is `null`
— `services/api/src/modules/super-admin/markets.catalog.ts`), so this closes
the recording half only; no public surface changes.

## Business requirement

Data region is a customer-visible promise once any market declares one, and
that promise must be substantiated per-tenant, not inferred after the fact.
Sourced directly from this backlog item; no additional product requirement
beyond it. `TODO: Confirm product/business rule` — no market currently has a
non-null `dataRegion`, so there is no live claim to substantiate yet; this
plan makes the plumbing ready for the day one does.

## Existing behavior

**FACT**, `services/api/prisma/schema.prisma:4090-4096` (`Market`):
`dataRegion String?` already exists, "Deliberately nullable references
rather than invented values. A market with no configured tax profile or
legal document set is a market that must not claim one publicly" (comment
covers the sibling fields; the same discipline applies to `dataRegion`).
Every seeded market sets it to `null`
(`services/api/src/modules/super-admin/markets.catalog.ts:43,59,86,105,130`).

**FACT**, `services/api/prisma/schema.prisma:2055` (`Tenant`): has no
`dataRegion` field and no `marketId` field at all today — a tenant currently
records no relationship to a market whatsoever.

**FACT — re-derived 2026-09-11.** There are three places that call
`prisma.tenant.create`, and only one of them is the shared provisioning
engine the item's "populate at provisioning" requirement should target:

1. `services/api/src/modules/super-admin/platform-onboarding.service.ts:204`
   (`provisionTenantForCustomer`) — **the one provisioning engine**, per its
   own doc comment: "Sales-assisted onboarding reaches it through
   `onboardCustomer`... self-service reaches it from the
   `PROVISIONING_REQUESTED` consumer." Both paths converge here. This is the
   single call site to change.
2. `services/api/src/modules/super-admin/provisioning-requested.handler.ts` —
   does **not** call `tenant.create` directly; it calls
   `onboarding.provisionTenantForCustomer(...)` (line 149), so it only needs
   to *supply* the resolved market/region, not create the row itself.
3. `services/api/src/modules/super-admin/platform-lifecycle.service.ts:1435`
   (`createTenantRowIdempotently`, one private caller at line 1639) — a
   distinct, older idempotent-create helper whose caller assembles the full
   `Prisma.TenantCreateInput` itself. **Verify at implementation time**
   whether this path is still reachable in production (self-service and
   sales-assisted both now route through `provisionTenantForCustomer` per
   the comment above; this may be legacy). If still reachable, its caller
   must also resolve and pass `dataRegion` the same way — do not leave a
   second, silently-null-forever tenant-creation path.
4. `services/api/src/modules/tenants/tenants.repository.ts:388` — a generic
   repository `create`; confirm its only caller(s) and whether any go through
   a path unrelated to customer provisioning (e.g. `demo-data`/seed tenants,
   which legitimately have no market and should record `null`, not be
   treated as a gap).

**FACT**, `services/api/src/modules/super-admin/provisioning-requested.handler.ts:74-98`:
the self-service path's `SubscriptionOrder` select does **not** currently
select `marketId` — it must be added to the select.

**FACT**, `services/api/src/modules/billing/services/subscription-order.service.ts:346`:
`SubscriptionOrder.marketId` is populated from `planPrice.marketId` at order
creation time — already the authoritative source for "which market this
purchase resolved to." It is nullable (a price created before market scoping
existed may carry no market), which is the legitimate "record null" case
this item's Acceptance Criteria describes.

**FACT**, sales-assisted onboarding (`platform-onboarding.service.ts`'s
`onboardCustomer`, lines ~150-178): builds its `provisionTenantForCustomer`
input directly from a DTO with no market concept visible in the excerpt
above — **verify at implementation time** whether the sales-assisted DTO
(`OnboardCustomerDto` or similar) carries a market/country selection anywhere
that could resolve a market, or whether this path legitimately has no market
signal today and should always record `null`. Do not invent a resolution
path (e.g. from a country field) that the item did not ask for.

## Existing architecture

- `services/api/src/modules/super-admin/platform-onboarding.service.ts` —
  `provisionTenantForCustomer`, `ProvisionTenantForCustomerInput`, the single
  `tx.tenant.create` call.
- `services/api/src/modules/super-admin/provisioning-requested.handler.ts` —
  the self-service consumer, already loads `order` and calls the engine.
- `services/api/src/modules/billing/services/subscription-order.service.ts` —
  where `SubscriptionOrder.marketId` is set, the pattern to follow for
  reading a market's fields.
- `apps/admin` tenant record screen (`app/(internal)` tenant detail —
  confirm exact path at implementation time, likely alongside
  `tenant-commercial-panel.tsx` found during ITEM-0020's research) —
  where `dataRegion` is displayed per Requirement 4.

## Requirements

1. `Tenant.dataRegion String?` added to `schema.prisma`, with a one-line
   comment matching the existing `Market.dataRegion` comment's discipline
   ("null means undeclared — never assume a region").
2. `ProvisionTenantForCustomerInput` gains an optional `dataRegion?: string |
   null`. `provisionTenantForCustomer`'s `tx.tenant.create` writes it
   verbatim — this method does no market resolution itself; it only records
   what its caller resolved, keeping the engine's existing separation of
   concerns (callers gather input, the engine provisions).
3. `ProvisioningRequestedHandler.handle` (self-service path) selects
   `order.marketId` (add to the existing `select`), and when non-null, loads
   `Market.dataRegion` for it (a single `findUnique` — reuse an existing
   markets lookup service if one exists, e.g. check for a `MarketsService` or
   similar in `super-admin`/`billing` before adding a raw Prisma call) and
   passes it through. When `order.marketId` is null, passes `dataRegion:
   null` explicitly (not omitted) — the record must say "we checked and there
   is none," matching this plan's overall discipline.
4. Sales-assisted onboarding (`onboardCustomer`) passes `dataRegion: null`
   unless Requirement's "verify at implementation time" step above finds a
   real market signal to resolve from — do not add a country-to-market
   inference that does not already exist elsewhere in the codebase.
5. **No backfill of existing tenants.** Per the item's own Acceptance
   Criteria ("existing tenants only where a market is unambiguous; leave the
   rest null rather than guessing") and the fact that `Tenant` has never
   recorded a market relationship at all, there is no reliable, existing
   signal to backfill from for any already-provisioned tenant — record this
   explicitly as a decision rather than silently skipping it. If a future
   audit finds a reliable derivation (e.g. from `Tenant.customerAccountId` →
   its original `SubscriptionOrder.marketId`, for tenants provisioned after
   `SubscriptionOrder.marketId` existed), that is a separate, later backfill
   script — not part of this plan's scope, and not blocking it.
6. `apps/admin`'s tenant record screen displays `dataRegion` when present,
   and displays nothing (not "Unknown", not a placeholder) when null — per
   the item's Acceptance Criteria: "No public surface states a region for a
   tenant whose value is null."
7. `packages/config/platform-runtime-schema.generated.json` regenerated
   (`npm run generate:runtime-schema`) since `Tenant`'s shape changed, and
   committed.

## Dependencies

None blocking. Sequenced after the tenant provisioning wave landed (it has —
`provisionTenantForCustomer`/`ProvisioningRequestedHandler` both exist and
are live), which is exactly the revisit trigger this record's own 2026-08-17
history entry names.

## Files / modules affected

Backend: `services/api/prisma/schema.prisma`, one new migration,
`platform-onboarding.service.ts` (`ProvisionTenantForCustomerInput`, the
`tenant.create` call), `provisioning-requested.handler.ts` (select +
market lookup), possibly `platform-lifecycle.service.ts` /
`tenants.repository.ts` per Requirement 3's verification step.

Frontend: `apps/admin`'s tenant detail screen/component (path confirmed at
implementation time).

Generated: `packages/config/platform-runtime-schema.generated.json`.

## Database impact

**Additive only.** `ALTER TABLE "Tenant" ADD COLUMN "dataRegion" TEXT;` —
nullable, no default needed beyond Prisma's implicit `NULL`, no backfill
(Requirement 5), fully reversible (`DROP COLUMN` is safe on an
always-nullable, currently-always-null column). No index needed — this field
is not filtered or joined on anywhere in this plan's scope; add
`@@index([dataRegion])` only if a future consumer needs to query by region.

## Backend impact

See Requirements 2-4. No new endpoint. `provisionTenantForCustomer`'s public
contract grows by one optional field — backward compatible for any existing
caller that omits it (defaults to `undefined`/not-set, which Prisma writes as
`null` for a nullable column with no `@default`).

## Frontend impact

`apps/admin` only, existing tenant record screen — an additional
display-only field, no new form control (nothing edits `dataRegion`
directly; it is provisioning-derived). Loading/error/empty states: unchanged
existing screen: this is one more optional field rendered conditionally.

## Permission / RBAC impact

None. No new permission key — `dataRegion` is exposed through the same
tenant-record read path (`platform-runtime`/`tenant-control-plane`) that
already returns every other `Tenant` field to a platform admin.

## Tenant-isolation impact

None new. `Tenant` is the platform-owned root record itself, read only
through platform-guarded paths already gated correctly. No tenant-scoped
query changes.

## Audit / event / logging impact

None required. `dataRegion` is set once, at creation, as part of the
existing tenant-provisioning audit trail (`provisionTenantForCustomer`
already logs tenant creation — confirm it captures the full created record,
which will now include this field automatically via the existing snapshot
mechanism, needing no new audit call).

## Integration impact

None.

## Migration / data compatibility

Every existing tenant reads `dataRegion: null` after the migration — exactly
the "leave the rest null rather than guessing" outcome Requirement 5
describes deliberately, not accidentally. No already-deployed client reads
this field (it does not exist yet), so nothing can break by its addition.

## Parallel-safe tasks

- Schema/migration + `apps/admin` display work: `PARALLEL_SAFE` relative to
  the provisioning-engine change, once the field name is agreed (it already
  is, per the item).

## Dependency-blocked tasks

- `provisioning-requested.handler.ts`'s market lookup and
  `onboardCustomer`'s decision (Requirement 3-4): `DEPENDENCY_BLOCKED` on the
  schema migration landing first (needs the column to write to) — standard
  expand-then-write ordering, trivial here since there is no backfill step.

## Integration tasks

- Final wiring, full `super-admin`/`billing` test run.

## Testing strategy

- `npm --workspace api run test -- platform-onboarding` /
  `provisioning-requested.handler` — new specs: a self-service order with a
  market whose `dataRegion` is set records it on the tenant; an order with no
  market records `null`; an order whose market has `dataRegion: null`
  records `null` (three distinct cases, per the item's own Acceptance
  Criteria wording).
- `npm --workspace api run check-types`, `lint`.
- `npm --workspace admin run test`, `check-types` for the display change.
- `npm run prisma:validate`, `npm run prisma:migrate:status` after the
  migration is written.
- Manual: seed one market with a non-null `dataRegion` locally (temporarily,
  in a throwaway local database per this repo's local-Postgres rules — never
  the shared `dijipeople` dev database), provision a tenant against a price
  scoped to it, confirm the tenant record shows the region in Admin.

## Risks

1. **`platform-lifecycle.service.ts`'s separate `createTenantRowIdempotently`
   path turns out to still be live and gets missed, leaving a second,
   silent, permanently-null-only tenant-creation path.** Likelihood: low if
   Requirement 3's verification step is done; the risk exists only if it is
   skipped. Impact: low (the field is additive and optional; a missed path
   just never populates it, which is indistinguishable from "no market" —
   not a correctness bug, a completeness gap). Mitigation: the verification
   step is written into the plan explicitly rather than assumed.
2. **A future reader assumes a non-null `dataRegion` is currently
   observable/tested end-to-end**, when in fact no market has one yet.
   Likelihood: low. Impact: low. Mitigation: Objective and Existing behavior
   both state this plainly; the manual test step exercises it once with a
   deliberately-seeded value.

## Rollback considerations

`ROLLBACK_CLASS: DATABASE_ADDITIVE`. Revert the commit; `DROP COLUMN
"dataRegion"` is safe at any time since nothing ever depends on it being
present (always-optional read) and no non-null value has product
significance yet (no market has one). No data loss on rollback beyond the
column's own contents, which are reproducible by re-running provisioning
logic per tenant if ever needed (not required by this plan).

## Definition of Done

- [ ] `Tenant.dataRegion` migration written, additive, no backfill.
- [ ] `provisionTenantForCustomer` records it verbatim from its input.
- [ ] Self-service path resolves it from `SubscriptionOrder.marketId` →
      `Market.dataRegion`, explicitly recording `null` for both "no market"
      and "market has no region."
- [ ] Sales-assisted path's behaviour decided and documented (either resolves
      a real signal or explicitly always records `null`).
- [ ] `platform-lifecycle.service.ts`'s alternate creation path verified
      live-or-dead; fixed if live.
- [ ] `apps/admin` displays the field only when present.
- [ ] `platform-runtime-schema.generated.json` regenerated.
- [ ] All validation commands pass; no unrelated file changed.
