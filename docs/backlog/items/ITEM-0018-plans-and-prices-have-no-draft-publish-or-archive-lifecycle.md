---
ID: ITEM-0018
aliases: [ITEM-0018]
Title: Plans and prices have no draft, publish or archive lifecycle
Type: ARCHITECTURE
Status: DONE
Priority: P1
Severity: MEDIUM
AffectedModules: [services/api/prisma, api:super-admin, apps/admin, apps/landing]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
RelatedBug: BUG-0027
RelatedQA:
RelatedADR:
RelatedImplementation: agent/commercial-config-wave1
TargetMilestone:
BlockedBy:
---

# ITEM-0018 — Plans and prices have no draft, publish or archive lifecycle

## Summary

Commercial configuration is edited **in place and live**. `Plan` carries
`isActive` and `isPublic` booleans; `PlanPrice` carries `isActive`. There is no
`DRAFT` → `PUBLISHED` → `ARCHIVED` state, no `publishedAt` / `publishedById`, and
no way to prepare a change and release it deliberately.

Importantly, **half of this already exists and must not be rebuilt.** `PlanPrice`
already carries real version lineage: `version`, `effectiveFrom`, `effectiveTo`,
`supersedesPriceId` and a `supersedes` / `supersededBy` self-relation.
`Subscription` already snapshots what was bought — `planPriceId`, `basePrice`,
`discountType`, `discountValue`, `finalPrice`, `currency`. The gap is the
**publication state machine**, not versioning, and not the historical snapshot.

## Why It Matters

Without a publication state, every save to a plan or price is immediately live on
the public site. There is no way to stage next quarter's pricing, no review step
before a commercial change reaches customers, and no audit answer to "who
published this price, and when".

`isActive` is doing double duty as both "not yet ready" and "no longer sold",
which are different states with different consequences: a draft must never appear
publicly, whereas an archived price must still resolve for the subscriptions that
reference it.

## Evidence

- `services/api/prisma/schema.prisma:3635-3665` — `Plan` has only `isActive` and
  `isPublic`; no state enum, no `publishedAt`, no `publishedById`.
- `services/api/prisma/schema.prisma:3686-3712` — `PlanPrice` has `isActive`, and
  **already has** `version`, `effectiveFrom`, `effectiveTo`, `supersedesPriceId`.
- `services/api/prisma/schema.prisma:3728-3760` — `Subscription` already
  references `planPriceId` and stores `basePrice` / `discountType` /
  `discountValue` / `finalPrice` / `currency`, so existing customers already
  retain their purchased terms.
- `services/api/prisma/schema.prisma:3783,3831` — `Promotion` and
  `SubscriptionPromotion` exist; `Promotion` has no publication state either.
- `services/api/src/modules/billing/billing-seat-pricing.ts:70-99` —
  `deriveCheckoutReadiness` already gates checkout on `isActive`, `effectiveFrom`
  and full Stripe verification. A publication state must compose with this rather
  than replace it.

## Proposed Approach

**Needs an ExecPlan.** Single-writer files (`schema.prisma`, migrations) and a
contract consumed by three surfaces.

Direction:

1. Add a publication state enum to `Plan`, `PlanPrice` and `Promotion`, with
   `publishedAt` / `publishedById` / `archivedAt`. Keep `effectiveFrom` /
   `effectiveTo` — publication and effectivity answer different questions
   ("released" vs "in force"), and the second is already modelled.
2. Make the public plans endpoint serve only `PUBLISHED`, and make
   `deriveCheckoutReadiness` require it.
3. Give Admin explicit Publish / Archive actions, audited through
   `AuditService.log()` with before/after snapshots, rather than a checkbox.
4. Editing a `PUBLISHED` price creates a new version superseding it, using the
   lineage fields that already exist, instead of mutating a row that live
   subscriptions point at.

**Sequence with [[BUG-0027]] in one plan.** Both change `Plan`/`PlanPrice` and the
same Admin screens; doing them separately migrates that UI twice.

## Acceptance Criteria

- A plan or price in `DRAFT` never appears on the public site and cannot be
  checked out.
- Publishing and archiving are explicit, permissioned, audited actions.
- Editing a published price produces a new version; the superseded row survives
  and still resolves for subscriptions referencing it.
- An existing subscription's rendered terms are unchanged by publishing a new
  price for its plan — asserted by a test.
- `isActive` no longer expresses two different states.

## Dependencies

None blocking. Should be planned together with [[BUG-0027]].

## Related Items

[[BUG-0027]] — duplicate price source of truth, same models.
[[ITEM-0019]] — market model; markets gate which published plans are offered.
[[BUG-0028]] — hardcoded currency mapping.

## Delivered — Wave 1

`CommercialPublicationStatus` (`DRAFT` / `PUBLISHED` / `ARCHIVED`) now exists on
`Plan`, `PlanPrice` and `Market`, with `publishedAt`, `publishedById` and
`archivedAt`. The existing `PlanPrice` version lineage was **reused unchanged**,
as this record required — publication and effectivity are modelled as separate
questions rather than one flag.

- Only `PUBLISHED` plans and prices leave the public API at all, so unpublished
  configuration is not merely hidden by the UI.
- `deriveCheckoutReadiness`'s successor, `resolveCommercialOffer`, requires
  publication; a DRAFT or ARCHIVED price cannot be bought.
- The migration backfills existing rows from the booleans that previously
  carried this meaning, so nothing live went dark on deploy: active + public
  became `PUBLISHED`, inactive became `ARCHIVED`.
- Admin's plan list now leads with publication status rather than `isActive`.

**Not delivered, deliberately:** explicit Publish / Archive *actions* with audit
events in Admin, and the create-new-version-on-edit flow. The state and the
enforcement exist; the governed UI transitions are a follow-up, recorded as
[[ITEM-0022]]. Editing a published price is still a direct edit today.

## History

- 2026-08-16 — created during commercial-configuration discovery at `45d00cf`.

## Resolution

Done. Verified criterion by criterion at `ec6f189` rather than assumed from the
Wave 1 commit message.

- **A DRAFT plan or price never appears publicly and cannot be checked out.**
  `CommercialPublicationStatus` defaults to `DRAFT` on `Plan`, `PlanPrice`
  and `Market`, and `CommercialConfigService` filters every public read on
  `PUBLISHED`. Covered by REG-017 and REG-018.
- **Editing a published price produces a new version; the superseded row
  survives.** This was the half the item warned must *not* be rebuilt —
  `version`, `effectiveFrom`, `effectiveTo`, `supersedesPriceId` and the
  `supersedes`/`supersededBy` self-relation already existed and were left
  alone. `selectEffectivePrice` orders by `effectiveFrom`, so a future
  version cannot displace the current one; asserted in
  `billing.legacy-pricing.spec.ts`.
- **`isActive` no longer expresses two states.** Publication now lives in
  `publicationStatus`; `isActive` means only "not retired". Two fields, two
  meanings.
- **An existing subscription's terms are unchanged by publishing a new price —
  asserted by a test.** This was the one criterion with **no test behind it**,
  and it is the one with money attached: if the read path resolved the plan's
  current published price instead of the purchase-time snapshot, publishing a
  price rise would silently reprice every existing customer on that plan.
  `subscription-terms-immutability.spec.ts` now pins it.

**Residual, delegated not dropped:** *"publishing and archiving are explicit,
permissioned, audited actions"* is [[ITEM-0022]], which exists precisely for it
and stays open. The state machine this item is about is in place; the governed
actions on top of it are the next step.

## Verification

`subscription-terms-immutability.spec.ts` — 3 assertions: the renderer is
found (so the rest cannot pass vacuously), every money field is read from the
subscription snapshot, and no live price is resolved while rendering.

Verified to fail against the defect: changing `basePrice` to read
`subscription.planPrice.unitAmount` fails 2 of the 3.

An earlier draft of the spec sliced the function at the first `\n  }`, which is
the end of the *parameter type* rather than the body — it passed while asserting
against a type declaration. Bounded by the next class member instead.
