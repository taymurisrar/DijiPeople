# Starter Plan Scope and Entitlement Enforcement

> Derived from repository evidence at `eb457d9d` on 2026-08-29, with the
> navigation and subscription behaviour confirmed against the production API at
> `949f461c`. Line numbers and counts drift; re-derive on your branch
> (`doc-code-drift`).

## The one-paragraph answer

Starter is a **7-of-12 module bundle**. The bundle is defined in code
(`plans.catalog.ts`), materialised into `PlanFeature` rows by
`bootstrapCommercialDefaults`, and resolved per tenant by `FeatureAccessService`.
That resolution is published to the web app and used for **exactly one thing:
hiding sidebar links.** No API controller, guard, interceptor or service
consults plan entitlement before serving a tenant request.
`FeatureAccessService.assertFeatureEnabled()` — the function written to throw on
an unentitled feature — **has zero call sites.** [[BUG-1952]].

## What Starter grants

`services/api/src/modules/super-admin/plans.catalog.ts:22-38`, and
`DEFAULT_PLAN_KEY = 'starter'` at `:99`.

**Includes (7):** `employees`, `organization`, `leave`, `attendance`,
`documents`, `notifications`, `branding`.
**Excludes (5):** `timesheets`, `projects`, `recruitment`, `onboarding`,
`payroll`.

For contrast: Growth adds timesheets, projects, recruitment and onboarding (11
of 12 — still no payroll); Enterprise and Enterprise+ take all 12.

The vocabulary is 12 keys in `TENANT_FEATURE_DEFINITIONS`
(`tenant-settings.catalog.ts:701-858`). "Module" and "feature" are the same
concept, keyed by a plain string `featureKey`; there is no `PlanModule` and no
`Entitlement` model. The web app mirrors only **8** of the 12 in
`apps/web/lib/security-keys.ts:312-321` — `organization`, `documents`,
`notifications` and `branding` have no frontend constant and gate nothing in the
UI.

Rows are **disabled, never deleted** by `reconcilePlanFeatures`
(`commercial-bootstrap.ts:282-320`), because deleting one loses the difference
between "never offered payroll" and "stopped offering payroll". On a fresh
bootstrap Starter gets exactly 7 `PlanFeature` rows and none for the excluded
five; a missing key resolves as `false`, so absence and `isEnabled: false` are
equivalent.

## How entitlement is computed

`feature-access.service.ts:21-37` is the only place it happens:

```ts
const planFeatureMap = new Map(
  subscription?.status === ACTIVE || subscription?.status === TRIALING
    ? (subscription?.plan?.features.map(f => [f.featureKey, f.isEnabled]) ?? [])
    : [],
);
const isEnabled = typeof tenantOverride === 'boolean'
  ? isIncludedInPlan && tenantOverride    // AND — an override can only subtract
  : isIncludedInPlan;
```

Three consequences:

1. Only `ACTIVE` and `TRIALING` entitle anything. Every other status —
   `PAST_DUE` included — yields an empty map and all 12 features `false`.
2. No `Subscription` row at all behaves identically.
3. A `TenantFeature` override can only ever **subtract**, never grant.

`Subscription.status` is the **only** field that changes product behaviour.
`trialEnd`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `canceledAt` and the rest
are written by Stripe webhooks and read by billing screens only — **an expired
trial does not lose entitlement until a webhook rewrites `status`.**

`SubscriptionStatus` carries **both `CANCELLED` and `CANCELED`**, and different
services write different ones. Harmless today because neither entitles, but any
`status IN (...)` assertion must allow for both.

## How (little) it is enforced

| Layer | Enforced? |
|---|---|
| Prisma / DB constraint | No |
| Nest guard / interceptor / decorator | **No — none exists** |
| Domain service check | No — `assertFeatureEnabled` has zero callers |
| API route handler | No |
| Next.js route proxy (`apps/web/app/api/`) | No |
| Next.js page (server component) | No |
| Sidebar navigation | **Yes** — and bypassed for three roles, and fails open |

The five real call sites of `FeatureAccessService` are all **read-only or
toggle-gating**: `GET /tenant-settings/features[/availability]`, a refusal when a
tenant override would *enable* an excluded feature, and three platform-admin
read paths. A repo-wide grep for `FeatureGuard|RequireFeature|@Feature\(|featureFlag|planFeature`
finds no guard class, no decorator and no metadata key. No tenant-product
endpoint refuses a request on subscription status either.

`navigation.ts:292-299` is the whole gate, and it has three holes:

1. **It fails open.** The layout's fetch of `/tenant-settings/features/availability`
   is wrapped in `.catch(() => null)` (`layout.tsx:97`), and
   `!input.enabledFeatureKeys` is treated as "allow everything". Any hiccup on
   that one call restores the full sidebar for everyone.
2. **The privileged shortcut runs first.** `navigation.ts:273-274` returns the
   item before the feature check at `:292` for `global-admin`, `system-admin`
   and `system-customizer`. **A tenant admin on Starter sees Payroll,
   Timesheets, Projects, Recruitment, Onboarding and Customers in the sidebar.**
3. **It is navigation only.** No `page.tsx` under `(authenticated)` reads
   feature availability; page gates are permission-based. The runtime module
   registry has no feature-key concept at all.

`navigation.spec.ts` contains zero occurrences of `feature`. The one gate that
exists is untested.

**The framework rule "permissions in the UI are cosmetic; every gated action
must also be enforced server-side" is not satisfied for plan features — there is
no server side to it.**

## Seat limits are metered, never enforced

`normalizePurchasedSeats` (`billing-seat-pricing.ts:31-42`) and
`commercial-offer.resolver.ts:394` are the only seat checks, and all three
callers are **purchase-time** paths: checkout quantity, an operator changing a
subscription, an order being priced. They constrain what you may buy, not how
many employees you may create.

Grep for `seat` across `services/api/src/modules/employees/` returns **zero
matches**; the same holds for `users`. **Creating an employee or a user is never
blocked by seat count.** What happens instead is metering:
`seat-usage.service.ts` computes `overage = max(0, activeEmployees - purchasedSeats)`
and opens `SeatOverageEvent` rows past thresholds. Going over capacity is
measured and billed, or flagged for human review — never refused.

That may well be intended commercial policy. It is worth a recorded product
decision either way.

The `minimumSeats: 10` on Starter's per-seat price is a **billing floor, not a
cap** — the commitment, not the headcount. `maximumSeats` is never written by
the seeder and stays `null`; an operator can type one in Admin. A `25` seen
anywhere is most likely `FLAT_SCHEDULE.starter.includedSeats`, which sits beside
`minimumSeats` and `maximumSeats` in the same JSON object.

## Before you test a "Starter tenant"

**`seed-demo` creates no `Subscription` and no plan reference at all** — grep for
`plan|subscription` in that 1,215-line file returns zero hits. A `seed:demo`
tenant therefore resolves all 12 features `false`, and a non-privileged role
sees only the four unkeyed sidebar entries. **That is not a Starter observation
and must not be reported as one.**

Call `GET /api/tenant-settings/features/availability` **first**. For a healthy
Starter tenant `enabledKeys` must be exactly:

```
["employees","organization","leave","attendance","documents","notifications","branding"]
```

Fewer than 7 means the subscription is not `ACTIVE`/`TRIALING` and every other
observation is confounded. The platform-admin view is
`GET /platform/tenants/:tenantId/modules`, which additionally reports
`planEntitlementActive`, `subscriptionStatus` and a per-module state of
`ENABLED_BY_PLAN | DISABLED_BY_PLAN | ENABLED_BY_OVERRIDE | DISABLED_BY_OVERRIDE | BLOCKED_BY_PLAN`.

Then, for each excluded module: the sidebar link should be **absent for a
non-privileged role and present for the three privileged ones**; the direct URL
renders normally if permissions allow; and the API returns 200 with data. The
third is the finding that matters, and a read leak and a write leak are
different severities — `read-filter-without-a-write-check` exists for exactly
that distinction.

Also note the routes with **no feature key at all**, reachable on Starter by
design and gated by permission only: `/benefits/assignments`, `/business-trips`,
`/claims`, `/loans`, `/employee-bank-accounts`, `/customization`, `/inbox`,
`/approvals`, `/reports`, `/me/*`, `/users`, the role dashboards, and the whole
`/settings/**` tree — including `/settings/payroll/**` and `/settings/tax-rules`.
`/me/payslips` is payslip *viewing* on a plan that excludes payroll.

Where a subscription comes from, and in what state:

| Path | Plan | Status |
|---|---|---|
| Tenant self-signup (`POST /tenants/signup`) | `starter` (created from the catalog if missing) | `TRIALING` |
| Operator onboarding in Admin | operator's choice, plus `featureOverrides` | `TRIALING` |
| Paid self-service checkout → provisioning | the order's plan | `ACTIVE` |

## Related

[[tenant-lifecycle]] · [[product-areas]] · [[billing]] · [[super-admin]] ·
[[tenant-application]] · [[settings-and-configuration]] ·
[[leave-attendance-approvals]] · [[rbac]]
