---
ID: BUG-1751
aliases: [BUG-1751]
Title: A promotion goes live against every subscription the instant it is created
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-28
DetectedInSha: 912f4e61
AffectedModules: [apps/admin, api:super-admin, integration:stripe]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-294
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
ResolvedAt:
---

# BUG-1751 — A promotion goes live against every subscription the instant it is created

## Summary

The Discounts and promotions screen creates a promotion that is **Active**
immediately, with **Scope defaulting to "All eligible subscriptions"** and
**Percent off pre-filled with 10**. One press of "Add promotion" with the form's
own defaults publishes a 10% global discount. There is no draft state and no
confirmation. Separately, the promotion is created **unsynced to Stripe** unless
a checkbox is ticked, so what the platform believes about a discount and what
Stripe will actually apply can differ from the moment it exists.

The feature works — this record is about how easy it is to publish commercial
terms by accident, and about which system is authoritative.

## Expected Behavior

Creating a discount is a deliberate act. A new promotion is either scoped
narrowly by default or created inactive and explicitly activated, and the
operator is told whether it will apply in Stripe.

## Actual Behavior

The promotion is live and global on creation. Its Stripe sync status is
`NOT_SYNCED` by default.

## Reproduction

1. Platform Admin, **Promotions**.
2. Observe the form's defaults: Discount type `Percentage`, Percent off `10`,
   Duration `First invoice`, Scope `All eligible subscriptions`, and
   "Create Stripe coupon now" **unticked**.
3. Enter a Name and press **Add promotion**.
4. The row appears immediately as `v1`, Status **Active**, Stripe **Not Synced**.
   The only row action is **Deactivate**.

## Evidence

Created during this pass and read back at `GET /api/super-admin/promotions`:

```json
{"name":"QA E2E Promo 20260828 DELETE ME","code":"QAE2E20260828",
 "discountType":"PERCENTAGE","percentOff":10,"duration":"ONCE","scope":"GLOBAL",
 "isActive":true,"stripeCouponId":null,"stripeSyncStatus":"NOT_SYNCED",
 "version":1,"redemptionCount":0}
```

Scope options are `All eligible subscriptions` (GLOBAL), `Plan`, `Price`,
`Customer`, `Subscription`; GLOBAL is the default selection.

Deactivate works — `isActive` became `false`.

Versioning is present and sound (`version`, `supersedesPromotionId`).

## Root Cause

Not a code fault so much as a set of defaults chosen for convenience on a screen
that writes commercial terms. The widest scope is the default, activation is
implicit in creation, and the safer Stripe path is opt-in.

## Impact

An operator exploring the screen can publish a live global discount in one
click. The blast radius is every eligible subscription. Nothing about the form
signals that pressing the button is a commercial act.

The Stripe half matters for go-live: checkout runs through Stripe, so a
promotion that exists only locally will not discount a real Stripe checkout — or
worse, will be applied on one side and not the other. Which system is
authoritative for discounts needs deciding before promotions are used in anger.

## Affected Areas

`apps/admin` promotions screen, `super-admin` promotions service, the Stripe
coupon and promotion-code sync.

## Proposed Resolution

Three separable changes:

1. Do not default Scope to GLOBAL, or require an explicit confirmation when the
   scope is global.
2. Create promotions inactive and require an explicit Activate, so creating and
   publishing are two acts.
3. Decide and document whether Stripe or the platform is authoritative for
   discounts, and make the sync default match that decision rather than being an
   unticked box.

Point 3 is a decision, not a patch, and should be recorded as an ADR.

## Acceptance Criteria

- Creating a promotion with the form's defaults does not publish a global
  discount.
- A promotion's effect in Stripe matches its state in the platform, or the
  screen says plainly that it does not.
- A regression test covers the default scope and the default active state.

## Regression Coverage

None yet.

## Dependencies

Point 3 depends on an owner decision about Stripe authority for discounts.

## Related Items

[[BUG-1752]] — the promotions table has no empty state, found on the same
screen.
[[BUG-1757]] — promotions cannot be deleted, only deactivated.

## Resolution

> **Update, 2026-08-28 — the third change landed too.** This record left "whether Stripe or the platform is authoritative for discounts" as a product decision, and the repository owner answered it that day: **the platform is authoritative.** `syncToStripe` now defaults to on, because a promotion the platform knows about and Stripe does not is a divergence rather than a valid state. It stays a checkbox rather than becoming mandatory — a promotion created while Stripe is unreachable should still be creatable — and unticking it now says what it costs: without the sync, Stripe will not apply the discount. All three of this record's separable changes are therefore done.


Fixed 2026-08-28 on `agent/open-bug-sweep`. Two of the three changes this record
separates; the third is a decision rather than a change.

1. **Scope is no longer defaulted.** It starts unset and the form refuses to
   submit without one, so the widest possible commercial term is no longer what
   an operator gets for not touching a field. The pre-filled `10` is gone for
   the same reason — a discount percentage should be a number somebody chose.

2. **Creating and publishing are two acts.** `createPromotion` defaults
   `isActive` to `false`, and the screen offers an explicit Activate that
   confirms — naming what the discount applies to, and treating a global scope
   as the dangerous case. A caller that explicitly says `isActive: true` still
   gets it: this is about the default for one that says nothing.

3. **Not done, because it is a decision.** Whether Stripe or the platform is
   authoritative for discounts is a product question, and this record says so.
   The `syncToStripe` checkbox is still opt-in and still unticked. Until that is
   settled, changing the default would be picking an answer by implementation.

Guarded by REG-294.

## QA Retest

Not retested in a browser. `promotion-safety.spec.ts` covers the defaults, the
required fields, the inactive creation and the confirmation.

**For whoever retests:** promotions created before this change are unaffected,
and any that are live stay live. What changes is that a new one arrives
inactive, so an operator used to the old screen will create a promotion and find
it does nothing until they activate it. That is the point, and it is also the
thing most likely to be reported as a bug.

The Stripe authority question stays open and is the more consequential half:
what the platform believes about a discount and what Stripe applies can still
differ from the moment a promotion exists.

## History

- 2026-08-28 — created from the admin console end-to-end QA pass at `912f4e61`,
  observed against production `e0aeabcd`. The promotion created during the pass
  was deactivated immediately; it could not be deleted, see [[BUG-1757]].
- 2026-08-28 - scope and amount must be chosen, promotions are created inactive with an explicit Activate. The Stripe authority decision is NOT made. REG-294.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]], [[super-admin]]
- Regression — REG-294 (see the regression register)

<!-- GRAPH:END -->
