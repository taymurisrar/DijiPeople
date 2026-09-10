---
ID: PLAN-034
---

CONTEXT_FILES_REQUIRED:
  - services/api/AGENTS.md            (errors, audit, permissions dual-system rule)
  - PLANS.md                          (this template)
  - docs/bugs/BUG-0027-*.md           (why publication state exists at all)

SPECIALIST_AGENTS_REQUIRED:
  - backend-api — new publish/archive service methods, endpoints, permissions
  - frontend    — apps/admin action bar entries, impact statement copy
  - reviewer    — commercial-state-machine correctness, audit completeness

DELIBERATELY_NOT_USED:
  - database    — no schema change; every field this plan writes already exists
  - integration — Stripe sync is untouched by this plan (publication state and
                  Stripe sync status are separate concerns already)

SINGLE_WRITER_FILES:
  - services/api/src/common/constants/permissions.ts   (new permission key)
  - services/api/src/common/constants/rbac-matrix.ts    (new privilege entry, if this surface uses the matrix — verify at implementation time; super-admin currently gates by ROLE_KEYS, not the tenant RBAC matrix, see Existing behavior)

QA_REQUIRED: yes — commercial state-machine correctness and the "existing subscription unaffected" assertion both need real QA, not just unit tests.

KNOWN_BUG_PATTERNS_IN_SCOPE:
  - BUG-0027 — the reason `publicationStatus`/versioning exist at all; do not
    reintroduce a path where a price's live amount can be read or changed
    without going through the governed transition this plan adds.

REGRESSION_ENTRIES_IN_SCOPE:
  - none identified; check `docs/qa/regressions/index.md` for BUG-0027 /
    commercial-config entries before implementing, the register may have grown.

TARGET_BRANCH:            develop
TARGET_ENVIRONMENT:       LOCAL
DEPLOYMENT_REQUIRED:      yes (api, admin)
DEPLOYMENT_COMPONENTS:    api, admin
DEPLOYMENT_ORDER:         api -> admin (Admin's new action bar entries call the new endpoints; deploying Admin first would show buttons calling routes that do not exist yet)
ROLLBACK_CLASS:           CODE_ONLY
INTEGRATOR_REQUIRED:      yes
RELEASE_DEVOPS_REQUIRED:  no
POST_DEPLOY_QA_REQUIRED:  yes
MERGE_STRATEGY:           merge --no-ff
KNOWN_CONCURRENT_WORK:    check `node scripts/session.mjs list` for anything touching `super-admin.service.ts`/`super-admin.controller.ts` or `permissions.ts` — this plan and EXECPLAN-0033 (ITEM-0020) both touch `super-admin.service.ts` and should not run concurrently on overlapping methods; sequence them or coordinate.
ENVIRONMENT_DEPENDENCIES: none new

---

# ExecPlan — Governed publish and archive actions for commercial configuration (ITEM-0022)

## Objective

An operator publishes or archives a `Plan` or `PlanPrice` through an explicit,
named action — not by editing a field on the ordinary form — and that action
validates the transition, is refused with a specific reason when invalid, and
produces its own audit event naming the actor and the transition. Editing an
already-`PUBLISHED` price creates a superseding version rather than mutating
the live row.

## Business requirement

Publishing a price is a commercial act that changes what customers can be
charged; it must be distinguishable from renaming a plan in the audit trail,
and it must not be possible to publish a configuration that is simply
unresolvable (wrong market, no effective price window, etc.) with no feedback
until a customer's checkout fails. Internal governance work, directed by this
backlog item; no external product commitment beyond it.

## Existing behavior

**FACT — re-derived 2026-09-11, and it changes the shape of this plan.** The
item's evidence (2026-08-16) says "Today an operator changes
`publicationStatus` through the ordinary edit form." That is no longer true,
and may not have been true even then in the form implied: `CreatePlanDto`,
`UpdatePlanDto`, `CreatePlanPriceDto` and `UpdatePlanPriceDto`
(`services/api/src/modules/super-admin/dto/*.ts`) **do not expose
`publicationStatus` as a field at all.** A repo-wide grep for
`publicationStatus:` as a Prisma write target
(`grep -rn "publicationStatus:" services/api/src`) finds it set only in
`commercial-bootstrap.ts` (the seed) and defaulted to `DRAFT` at plan creation
(`super-admin.service.ts:2046`). The generic runtime-CRUD path
(`platform-runtime.service.ts`'s `'plans'` case) also routes through
`UpdatePlanDto`, the same DTO with no such field.

**This means the real, current gap is one step short of what the item
describes: there is today no operator-facing way to publish or archive a plan
or price at all, outside re-running `seed:config`.** This is not a
contradiction of the item's underlying need — governed publish/archive
actions are exactly the fix either way — but it changes the urgency framing
(this may be closer to "a commercial console cannot actually launch a new
paid offering today" than "publishing lacks governance") and it means this
plan is not removing a loose direct-edit path (there is none to remove); it
is adding the actions from a true blank slate. **Flag this to the Architect
during triage** — if it is more urgent than `P2`/`MEDIUM`, that is a decision
for the Architect, not this plan.

**FACT**, `services/api/src/modules/super-admin/super-admin.service.ts:2319-2377`
(`updatePlanPrice`): a **partial**, accidental form of versioning already
exists — `replacesImmutableStripePrice` detects when an edit changes
`unitAmount`/`currency`/`billingInterval`/`billingModel` on a price that
already has a live `stripePriceId` (because Stripe prices are immutable), and
in that case calls `createPlanPrice` for a new row, deactivates the old one,
and links it via `version`/`supersedesPriceId`. **This is driven by Stripe's
immutability constraint, not by `publicationStatus`** — it fires for a `DRAFT`
price with a Stripe id exactly as it does for a `PUBLISHED` one, and it does
**not** fire for a change that leaves those four fields alone (e.g. editing
`minimumSeats`) even on a `PUBLISHED` price, which still mutates the row
directly via the `else` branch (`super-admin.service.ts:2378-2465`). This
existing mechanism is the one to **extend and generalize** (key it off
`publicationStatus === PUBLISHED`, not off Stripe-immutability alone) rather
than duplicate — reuse `createPlanPrice`/the versioning fields exactly as
already wired.

**FACT**, `services/api/src/modules/billing/commercial-offer.resolver.ts`: a
pure, already-tested resolution module encoding exactly the validation rules
(`PLAN_NOT_PUBLISHED`, `MARKET_NOT_PUBLISHED`, `NO_PUBLISHED_PRICE`,
`PRICE_NOT_EFFECTIVE`, `PRICE_NOT_MARKET_SCOPED`, …) that the item wants
enforced **at publish time** instead of only at read time. This is the
validation logic to call from the new `publish` method — not reimplement.

**FACT**, `services/api/src/modules/super-admin/super-admin.controller.ts:73-74`:
this whole controller is gated by `@UseGuards(JwtAuthGuard, RolesGuard,
PlatformPermissionsGuard)` plus `@RequireRoles(ROLE_KEYS.SYSTEM_ADMIN,
ROLE_KEYS.SYSTEM_CUSTOMIZER)` at the class level — a platform-role check, not
the tenant `@Permissions`/`@RequirePermission` pair `AGENTS.md`'s dual-system
rule describes for tenant-scoped endpoints. **Verify at implementation time**
whether new publish/archive endpoints need anything beyond this existing
class-level guard, or whether this module also expects the matrix pair on
individual handlers (grep sibling handlers in this same controller for
`@Permissions`/`@RequirePermission` to see the actual local convention before
assuming either way).

**FACT**, `services/api/prisma/schema.prisma:3944` (`Plan.publicationStatus`),
`:4032` (`PlanPrice.publicationStatus`): `enum CommercialPublicationStatus {
DRAFT PUBLISHED ARCHIVED }` (`schema.prisma:181-186`). `PlanPrice` also
already carries `version`, `supersedesPriceId`, `publishedAt`,
`publishedById`, `archivedAt` (`schema.prisma:4032-4036`) — every field this
plan needs already exists; this is a service/endpoint change, not a schema
change.

## Existing architecture

- `services/api/src/modules/super-admin/super-admin.service.ts` — plan/price
  CRUD, the partial versioning logic to extend.
- `services/api/src/modules/super-admin/super-admin.controller.ts` — REST
  surface, `PlatformPermissionsGuard` + `RequireRoles`.
- `services/api/src/modules/billing/commercial-offer.resolver.ts` — the
  validation rules to call before allowing a publish.
- `services/api/src/common/audit/` (`AuditService.log()`) — existing pattern
  already used by `createPlanPrice`/`updatePlanPrice` (`action:
  'PLAN_PRICE_CREATED'`/`'PLAN_PRICE_UPDATED'`), extend with new action names.
- `apps/admin` — wherever `plan-form.tsx`/the plan detail page's action bar
  lives (`ModuleActionBar` per `AGENTS.md`'s apps/admin summary — reuse it,
  do not hand-roll buttons).

## Requirements

1. New service methods `publishPlan(actor, planId)`, `archivePlan(actor,
   planId)`, `publishPlanPrice(actor, planId, priceId)`,
   `archivePlanPrice(actor, planId, priceId)` on `SuperAdminService`.
2. Each validates the transition **before** writing:
   `DRAFT → PUBLISHED` and `PUBLISHED → ARCHIVED` are allowed;
   `ARCHIVED → PUBLISHED` is refused with a named reason ("create a new
   version instead" — per the item's own stated rule); publishing a price
   additionally runs the plan/market/price resolution rules from
   `commercial-offer.resolver.ts` (plan published & active, market enabled if
   scoped, price effective window valid, no overlapping active window for
   the same slot) and refuses with the specific
   `CommercialUnavailableReason`-shaped code if any fails — an operator must
   not be able to publish a configuration `commercial-offer.resolver.ts`
   would immediately mark unavailable.
3. Each transition calls `AuditService.log()` with a **transition-specific**
   action name (`PLAN_PUBLISHED`, `PLAN_ARCHIVED`, `PLAN_PRICE_PUBLISHED`,
   `PLAN_PRICE_ARCHIVED`) — not the existing generic `_UPDATED` name — with
   before/after snapshots, so the audit trail can distinguish "published a
   price" from "renamed a plan" as the item requires.
4. `updatePlanPrice`'s existing `replacesImmutableStripePrice` branch is
   generalized: editing **any** field on a `PUBLISHED` price (not only the
   four Stripe-immutable ones) creates a superseding version via the same
   `createPlanPrice`/`version`/`supersedesPriceId` mechanism already wired.
   Editing a `DRAFT` price continues to mutate in place — there is nothing to
   protect yet. `publishedAt`/`publishedById`/`archivedAt` are set only by
   the new publish/archive methods, never by the ordinary update path.
5. New REST endpoints: `POST /super-admin/plans/:planId/publish`,
   `POST /super-admin/plans/:planId/archive`,
   `POST /super-admin/plans/:planId/prices/:priceId/publish`,
   `POST /super-admin/plans/:planId/prices/:priceId/archive` — no request
   body (the action is the whole payload), same guard stack as sibling
   handlers in this controller (confirm exact decorators per the Existing
   behavior note above).
6. `apps/admin`'s plan/price detail screens gain explicit Publish/Archive
   actions (via `ModuleActionBar`, per `apps/admin/AGENTS.md`) with an impact
   statement describing only what the implementation actually guarantees —
   e.g. "existing subscriptions on this price are unaffected; new checkouts
   will use this price once published" — never a broader claim than
   Requirement 4 delivers.

## Dependencies

Builds on `ITEM-0018` (landed, Wave 1) for the publication **state** and its
enforcement at read time. Depends on nothing else. Note the sequencing risk
with `EXECPLAN-0033` (ITEM-0020) sharing `super-admin.service.ts` — see
`KNOWN_CONCURRENT_WORK`.

## Files / modules affected

Backend: `services/api/src/modules/super-admin/super-admin.service.ts`,
`super-admin.controller.ts`, a new DTO file if the publish/archive routes
need one (likely not — no body), `services/api/src/common/constants/permissions.ts`
if a new permission key is warranted (see Permission/RBAC impact).

Frontend: `apps/admin`'s plan detail page and plan-price list/detail
component (exact files depend on `apps/admin`'s current plan-detail layout —
locate via `apps/admin/app/(internal)/plans/[planId]/page.tsx` and its
`_components`, confirmed to exist from ITEM-0020's research above).

## Database impact

None. Every column this plan writes already exists (`schema.prisma:4032-4036`,
`3944`). No migration.

## Backend impact

Four new service methods plus four new thin controller endpoints, as in
Requirements 1 and 5. `commercial-offer.resolver.ts`'s pure functions are
called, not reimplemented (Architecture Principle 3). Reuses
`createPlanPrice`/`assertPlanPriceStripePriceIdUnique`/`prepareStripePlanPrice`
already present rather than a new versioning path.

## Frontend impact

`apps/admin` only, existing plan/price detail screens. Uses `ModuleActionBar`
(the established action-bar pattern, per `apps/admin/AGENTS.md`) — no new
bespoke UI shell. Loading/error/disabled states: the publish/archive buttons
must reflect the current `publicationStatus` (e.g. "Archive" hidden on an
already-`ARCHIVED` row) and surface the specific refusal reason from
Requirement 2 in the error toast/dialog, not a generic "failed" message.

## Permission / RBAC impact

This module is gated by platform `RolesGuard`/`RequireRoles`
(`SYSTEM_ADMIN`, `SYSTEM_CUSTOMIZER`), not the tenant `@Permissions`/
`@RequirePermission` pair — **confirm this is the complete, correct gate for
a commercial-pricing action before shipping**; if sibling handlers in this
controller additionally declare a platform-scoped permission constant (check
`common/constants/permissions.ts` for any `PLATFORM_*`/`SUPER_ADMIN_*` keys
used elsewhere in this controller), the new endpoints must carry the same one
for consistency, since publish/archive is at least as sensitive as
create/update, which do carry whatever the local convention is.

## Tenant-isolation impact

None — `Plan`/`PlanPrice` are platform-owned; this module is explicitly a
platform (cross-tenant) surface, consistent with `AGENTS.md`'s carve-out for
`super-admin`/`platform-*` modules.

## Audit / event / logging impact

Four new `AuditService.log()` action names, per Requirement 3, each with
before/after snapshots built the same way `createPlanPrice`/`updatePlanPrice`
already build them (`this.mapPlanPrice(...)`). Nothing new must never be
logged — no payment credential or secret is involved in a publish/archive
transition.

## Integration impact

None. Stripe sync (`stripeSyncStatus`, `stripePriceId`) is untouched —
publishing does not sync to Stripe and syncing to Stripe does not publish;
these remain the two separate concerns they already are today.

## Migration / data compatibility

Additive-only; no already-stored row's shape changes. Already-deployed
clients (there are none consuming this new surface yet) are unaffected.

## Parallel-safe tasks

- `commercial-offer.resolver.ts` call-site wiring inside the new `publish`
  methods: `PARALLEL_SAFE` relative to the Admin frontend work.
- `apps/admin` action-bar UI: `PARALLEL_SAFE` once the endpoint contracts
  (Requirement 5's paths/response shape) are agreed, even before the backend
  fully lands, per the repo's usual frontend-against-agreed-contract pattern.

## Dependency-blocked tasks

- Requirement 4's generalized versioning: `DEPENDENCY_BLOCKED` on
  Requirements 1-3 existing first (publish must exist before "editing a
  published price" is even a reachable case in the intended flow, though the
  code path itself can be written and tested independently with a
  hand-constructed `PUBLISHED` fixture).
- Admin wiring to the real endpoints: `DEPENDENCY_BLOCKED` on the backend
  endpoints being merged.

## Integration tasks

- Full `super-admin` module test run plus the before/after subscription
  assertion (Requirement/Testing below). `INTEGRATION`, runs last.

## Testing strategy

- `npm --workspace api run test -- super-admin.service` — new specs per
  transition: valid `DRAFT → PUBLISHED`, refused `ARCHIVED → PUBLISHED`,
  refused publish when `commercial-offer.resolver.ts` would mark the result
  unavailable (e.g. no market scope), each transition's audit call asserted
  with the correct action name.
- `npm --workspace api run test:e2e` — endpoint-level: publish/archive
  round-trip, permission refusal for a non-`SYSTEM_ADMIN`/`SYSTEM_CUSTOMIZER`
  caller.
- A specific regression test for Requirement 4's core promise, matching the
  item's own Acceptance Criteria wording: create a subscription against a
  published price, publish a *new* version of that price with a different
  amount, then assert the existing subscription's `basePrice`/`finalPrice`
  are unchanged (they are snapshotted at subscription time — confirm this
  snapshot mechanism exists and is not itself accidentally re-derived from
  the live `PlanPrice` row anywhere, which would defeat the whole point).
- `npm --workspace admin run test`, `check-types`.
- `npm --workspace api run check-types`, `lint`.

## Risks

1. **The corrected finding (publish is currently impossible at all outside
   seeding) means this is more load-bearing than a governance nicety —
   shipping it wrong blocks launching any new paid offering through Admin.**
   Likelihood: n/a (this is a framing risk, not an implementation one).
   Impact: process — flag to the Architect for a possible priority
   re-triage, per Existing behavior above.
2. **Generalizing versioning (Requirement 4) to fire on *any* edit of a
   published price, not only Stripe-immutable fields, changes behaviour for
   an operator editing something cosmetic (e.g. `maximumSeats`) on a
   published price — they now get a new row/version where today they get an
   in-place edit.** Likelihood: certain (this is the intended change).
   Impact: low, but Admin's UI must clearly communicate "this created a new
   version" so it does not read as a bug. Mitigation: Requirement 6's impact
   statement.
3. **Permission gate mismatch** — shipping the new endpoints under a weaker
   or inconsistent guard than sibling create/update endpoints. Likelihood:
   low if the Existing-behavior verification step is actually done.
   Mitigation: the Reviewer explicitly checks decorator parity against
   `createPlanPrice`'s controller method.

## Rollback considerations

`ROLLBACK_CLASS: CODE_ONLY`. No schema change, no data written that a revert
would need to unwind — reverting the commit removes the four endpoints and
restores exactly today's behaviour (which, per the corrected finding, is "no
operator publish path at all").

## Definition of Done

- [ ] Four service methods + four endpoints implemented per Requirements
      1-2, 5.
- [ ] Transition-specific audit actions per Requirement 3, verified in specs.
- [ ] `updatePlanPrice` generalized per Requirement 4, with the subscription-
      snapshot regression test passing.
- [ ] `apps/admin` action bar entries per Requirement 6, contract-first
      against the backend.
- [ ] Permission gate parity confirmed against sibling handlers.
- [ ] All validation commands pass; no unrelated file changed.
- [ ] Architect notified of the corrected "publish is currently impossible"
      finding for a possible priority re-triage.
