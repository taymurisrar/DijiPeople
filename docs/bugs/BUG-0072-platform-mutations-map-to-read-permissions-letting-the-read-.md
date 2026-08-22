---
ID: BUG-0072
aliases: [BUG-0072]
Title: Platform mutations map to read permissions, letting the read-only auditor write
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-18
DetectedInSha: aa33524
AffectedModules: [super-admin, platform-auth]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-067
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: docs/development/execplan-platform-authorization-boundary.md
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0072 — Platform mutations map to read permissions, letting the read-only auditor write

## Summary

`resolvePlatformPermission` decides which platform permission a route requires
by matching substrings of the request path. For several domains it ignores the
HTTP method entirely, so `POST`, `PATCH` and `DELETE` resolve to the domain's
**read** permission. The clearest case is the commercial plan catalog: every
method on `/api/super-admin/plans*` resolves to `plans.read`, and the
`READ_ONLY_AUDITOR` platform role holds `plans.read`. A role whose name and
purpose are "read only" can create, update and delete plans and plan prices.

## Expected Behavior

A mutating request must require a mutating permission. A role that grants only
`*.read` permissions must not satisfy authorization for any `POST`, `PATCH`,
`PUT` or `DELETE` route.

## Actual Behavior

Mutating routes resolve to read permissions, so read-only roles pass
authorization on them.

## Reproduction

1. Sign in as a platform user whose role is `READ_ONLY_AUDITOR`.
2. Call `POST /api/super-admin/plans` with a valid plan body.
3. `PlatformPermissionsGuard` resolves the required permission as `plans.read`,
   which the auditor holds, and the request is authorized.
4. The same holds for `PATCH /plans/:planId`, `POST /plans/:planId/prices`,
   `PATCH /plans/:planId/prices/:priceId` and
   `DELETE /plans/:planId/prices/:priceId`.

## Evidence

`services/api/src/modules/platform-auth/platform-permissions.ts` —
`resolvePlatformPermission` returns a method-independent permission for these
paths:

```
if (path.includes('payments'))      return 'payments.read';
if (path.includes('subscriptions')) return 'subscriptions.read';
if (path.includes('invoices'))      return 'invoices.read';
if (path.includes('plans'))         return 'plans.read';
```

The mutating routes those cover, from
`services/api/src/modules/super-admin/super-admin.controller.ts`:

```
POST   invoices/:invoiceId/email                        → invoices.read
PATCH  invoices/:invoiceId/status                       → invoices.read
POST   subscriptions/:subscriptionId/invoices           → subscriptions.read
POST   subscriptions/:subscriptionId/stripe-subscription → subscriptions.read
POST   payments                                         → payments.read
POST   plans                                            → plans.read
PATCH  plans/:planId                                    → plans.read
POST   plans/:planId/prices                             → plans.read
PATCH  plans/:planId/prices/:priceId                    → plans.read
DELETE plans/:planId/prices/:priceId                    → plans.read
```

`READ_ONLY_AUDITOR` holds every one of those read permissions —
`platform-permissions.ts:202-216`.

Separately, `actionFor` returns `null` for `DELETE`, so
`DELETE /super-admin/customers/:id` and
`DELETE /super-admin/customer-onboarding/:id` resolve to no permission at all,
as do `/operators`, `/lifecycle-options`, `/feature-catalog` and
`/tenant-slug/availability`. Under the pre-BUG-0071 guard an unresolved
permission threw, so those routes returned `403` to legitimate platform users —
see [[BUG-0071]], which records the same map gap from the opposite direction.

## Root Cause

`resolvePlatformPermission` is a path-substring matcher that was extended
domain by domain. The domains added with `actionFor` are method-aware; the
domains added as a bare `return '<domain>.read'` are not. Nothing forced the
newer entries to consider the method, and nothing tested that a mutating route
resolves a mutating permission.

The `PlatformPermission` union also has no `plans.manage`, `invoices.manage`,
`subscriptions.manage` or `payments.manage`, so there was no mutating permission
to return even if the author had wanted one.

## Impact

A platform user holding a read-only role can mutate the commercial plan catalog
— plans and their prices — and can trigger invoice emails, invoice status
changes, manual payment records and Stripe subscription creation.

Confined to authenticated **platform** users; no tenant user reaches this on its
own. It is a privilege-escalation *within* the platform console rather than a
cross-tenant breach, which is why it is HIGH and not CRITICAL. Combined with
[[BUG-0071]] before that fix, however, a tenant administrator inherited this
surface too.

## Affected Areas

- `services/api/src/modules/platform-auth/platform-permissions.ts`
- `services/api/src/modules/super-admin/super-admin.controller.ts` — the routes
  listed above

## Proposed Resolution

Covered by the same ExecPlan as [[BUG-0071]]
(`docs/development/execplan-platform-authorization-boundary.md`), because both
defects live in this one resolver and a partial fix to either leaves the other
reachable.

1. Add the missing mutating permissions to the `PlatformPermission` union —
   `plans.manage`, `invoices.manage`, `subscriptions.manage`, `payments.manage`
   — and grant them to the roles that legitimately administer those domains,
   deliberately **not** to `READ_ONLY_AUDITOR`.
2. Make every branch of `resolvePlatformPermission` method-aware, so a mutating
   method never resolves a read permission.
3. Give `actionFor` a `DELETE` mapping rather than returning `null`.
4. Map the four unmapped paths.
5. Enforce completeness with a test that enumerates the controller's routes
   from its own metadata.

## Acceptance Criteria

- No route on `super-admin` resolves `null`.
- No `POST`, `PATCH`, `PUT` or `DELETE` route resolves a permission ending in
  `.read`.
- `READ_ONLY_AUDITOR` is refused on every mutating `super-admin` route.
- A role that legitimately administers plans, invoices, subscriptions or
  payments still passes on those routes.

## Regression Coverage

Must fail without the fix: a unit test enumerating the controller's routes and
asserting no mutating method resolves a `.read` permission, plus a test that
`READ_ONLY_AUDITOR` fails `userHasPlatformPermission` for each new manage
permission. `REG-nnn` assigned when the fix lands.

## Dependencies

Sequenced with [[BUG-0071]] — same file, same fix.

## Related Items

- [[BUG-0071]]
- [[super-admin]]
- [[platform-auth]]

## Resolution

Fixed on branch `agent/provisioning-ops-and-qa`, in the same commit as
[[BUG-0071]] because both defects live in one resolver.

1. Four permissions added to the `PlatformPermission` union — `plans.manage`,
   `invoices.manage`, `subscriptions.manage`, `payments.manage` — and granted to
   `PLATFORM_ADMIN`. `SUPER_ADMIN` and `PLATFORM_OWNER` hold `platform.*`
   already.
2. Every branch of `resolvePlatformPermission` is method-aware. `plans`,
   `invoices`, `subscriptions` and `payments` return the `.manage` permission
   for a non-GET request.
3. `billing/stripe-webhook-events` became method-aware too — listing events
   reads, but retrying one re-drives a payment side effect and now needs
   `billing.manage`. That route was found by the enumeration test, not by the
   original review.
4. `actionFor` maps `DELETE` to `<domain>.update`. There is no `<domain>.delete`
   permission and inventing one would need a grant decision across sixteen
   roles; `update` is the closest existing mutating permission and is already
   scoped per domain.
5. The four unmapped paths were mapped — see [[BUG-0071]].

**Deliberately not granted** to `READ_ONLY_AUDITOR` or `MEMBER`. Both hold only
the `.read` variants of these domains, which is what their lists already
express; before this fix that intent was simply unenforced. This is a real
behaviour change — a `MEMBER` who was creating plans through the console will
now be refused — and it is called out in the ExecPlan rather than left to be
discovered.

## QA Retest

Automated, and enumerated from the controller rather than a hand-written list:

- Every `super-admin` route resolves a non-null permission when read with its
  own HTTP verb. Before: four unmapped. After: none.
- No route whose verb is not `GET` resolves a permission ending in `.read`.
  Before: eight, including `POST /plans`, `PATCH /plans/:planId`,
  `DELETE /plans/:planId/prices/:priceId` and
  `POST /billing/stripe-webhook-events/:id/retry`. After: none.
- `READ_ONLY_AUDITOR` is refused `plans.manage` on POST, PATCH and DELETE of the
  plan-price route; `PLATFORM_ADMIN` still holds it.

`platform-permissions.spec.ts` — 30 passed. Full API unit suite: 184 suites,
1406 tests, all passing. A platform SUPER_ADMIN was re-verified live against
`/plans` and the other commercial routes at `200`.

## History

- 2026-08-18 — fixed and retested; REG-067 recorded.
- 2026-08-18 — found while completing the permission map for the [[BUG-0071]]
  fix. The route-enumeration test written for that fix surfaced the unmapped
  routes, and reading the map to close them exposed the method-blind branches.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[super-admin]], [[platform-auth]]
- Regression — REG-067 (see the regression register)

<!-- GRAPH:END -->
