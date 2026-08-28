---
ID: PLAN-024
aliases: [PLAN-024, EXECPLAN-0024]
Title: Admin console — FX reporting, desktop agent settings, generic bulk delete, payment recheck and profile capture
Status: APPROVED
Session: SESSION-0068
Type: FEATURE
Size: LARGE
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
---

# ExecPlan — Admin console: FX reporting, desktop agent settings, generic bulk delete, payment recheck and profile capture

## Objective

The Control Hub reports one revenue number that includes every currency the
platform has actually collected, converted at a rate the operator can see and
correct. The desktop-agent screens stop being two unstyled top-level pages and
become one Settings screen built like every other Settings screen. Bulk delete
stops being a per-module allowlist that disagrees with single-record delete, and
becomes one rule applied uniformly. The payment re-check button stops offering
itself on customers who have already paid. And the subscribe wizard collects the
company-size field the Customers module has always reported on.

Five reports, one integrated change, because four of the five touch the same
admin runtime and the same platform settings surface.

## Business requirement

Reported by the repository owner on 2026-08-28 against production, with five
screenshots. Every decision below was put to them and answered the same day;
each answer is recorded inline where it applies.

1. **Remove "Excludes QAR".** The dashboard must show all payments and revenue
   irrespective of currency. Exchange rates are maintained in Settings.
   - *Decided:* rates come from **open.er-api.com** (free, no API key, covers
     QAR/PKR/USD) with a **manual override** per pair. Reporting currency stays
     **PKR**.
2. **Fix the UI of the agent pages in the sidebar**, and move them under
   `/settings`.
   - *Decided:* one **Settings → Desktop agent** page with **Releases** and
     **Rollout** tabs, on the standard `SettingsShell`. Old URLs redirect.
3. **Bulk delete must be generic and available by default for every module.**
   - *Decided:* every module that permits single-record delete also permits bulk
     delete — **including leads**, which reverses the BUG-0018 disposition taken
     earlier the same day. The **retention refusals stay**: invoices, payments,
     commissions, agreements, signature evidence, subscriptions, plans,
     templates, monitoring incidents and tenants continue to refuse both.
4. **The re-check payment button should not be offered when payment already
   succeeded**, and the `Not set` fields on the customer record must be
   collected rather than left blank.
   - *Decided:* hide the panel when payment is confirmed and show a confirmed
     summary instead. Collect industry **and** company size at signup, both
     **optional** — neither blocks checkout.
5. Work the remaining open/deferred backlog afterwards, in severity order.
   - *Decided:* items 1–4 ship first. Item 5 is a separate program and is **not
     in this plan's scope**; it starts when this lands.

## Existing behavior

### Item 1 — dashboard currency

`SuperAdminService.getDashboardSummary()`
(`services/api/src/modules/super-admin/super-admin.service.ts:266`) resolves
`reportingCurrency` from the `platform-defaults` `PlatformSetting` row
(`:276-281`) and then filters **eight** money aggregates on it:

| Aggregate | Line |
|---|---|
| `payment.aggregate` — collected revenue, all time | `:363-370` |
| `invoice.groupBy` — invoice breakdown (a *count*, not money) | `:387-390` |
| `invoice.aggregate` — outstanding `amountDue` | `:395-408` |
| `partnerCommission.aggregate` — commission payable | `:468-474` |
| `invoice.findMany` — revenue trend series | `:475-481` |
| `payment.findMany` — revenue trend series | `:482-489` |
| `payment.aggregate` — current range | `:552-559` |
| `payment.aggregate` — previous range | `:560-568` |

Production stores `reportingCurrency: "PKR"` while every payment, invoice and
price is `QAR`, so all eight return zero. BUG-1745 (FIXED, unverified) added
`excludedCurrencies` (`:643-656`, `:676`) and the admin renders it as the
`Excludes QAR` chip
(`apps/admin/app/_components/dashboard/platform-dashboard.tsx:355-370`). That
made the zero *honest*; it did not make it *right*, which is what item 1 asks
for.

There is an `ExchangeRateSnapshot` model (`schema.prisma`) and a
`PayrollExchangeRateService`
(`services/api/src/modules/payroll/payroll-exchange-rate.service.ts`), but both
are **tenant-scoped** — `ExchangeRateSnapshot.tenantId` is a required FK to
`Tenant`. Neither can hold a platform rate. The `ExchangeRateSource` enum
(`MANUAL | IMPORT | API | SYSTEM`) is not tenant-scoped and is reused.

### Item 2 — the agent screens

`apps/admin/app/(internal)/app-releases/page.tsx` and
`.../agent-rollout/page.tsx` are hand-rolled client pages that render their own
`<main>` with `dark:` variants — which is why they appear as dark panels inside
the light admin shell, and why their headings sit outside the standard page
header. Every other admin settings screen uses `SettingsShell`
(`apps/admin/app/_components/settings/settings-shell.tsx`), as
`app/(internal)/settings/demo-data/page.tsx:32` does.

Both are top-level sidebar entries under **Operations**
(`apps/admin/app/_components/admin-sidebar.tsx:130-144`), gated on
`appDownloads.manage`.

### Item 3 — bulk delete

`PlatformRuntimeService` has two independent delete paths that do not agree:

- `remove()` (`platform-runtime.service.ts:559-596`) — an arm per module:
  `leads`, `customers`, `customer-onboarding`, `partners`, `partner-inquiries`,
  `partner-onboarding`; everything else throws.
- `bulkDelete()` (`:974-1005`) — the same list **minus `leads`**; everything
  else throws `Bulk delete is not available for this module.` — the exact 400
  in the production error log.

On the console, `MODULE_CAPABILITIES.leads` carries
`bulkDelete: false` (`platform-module-registry.ts:392`) and `defaultActionsFor`
gates the bulk action on `capabilities.bulkDelete ?? capabilities.delete`
(`:430-441`). `DELETE_REFUSALS` (`:352-376`) names, per module, why deletion is
refused at all — that mechanism is correct and stays.

`services/api/src/modules/leads/bulk-delete-withdrawn.spec.ts` asserts the
withdrawal, guarded by REG-298 and QA scenario
`leads-are-withdrawn-rather-than-bulk-deleted`. All three encode a decision that
has now been reversed and must be retired rather than deleted silently.

### Item 4 — payment re-check and the profile fields

`runtime-record-page.tsx:597-602` renders `PaymentRecheckPanel` for
**every** customer record, unconditionally, with a primary black button. The API
(`payment-recheck.service.ts:62-99`) already knows better: `findRecheckableOrder`
returns only orders in `PENDING_PAYMENT | PAID | FAILED`, and
`recheckCustomerPayment` throws `NO_RECHECKABLE_ORDER` when there is none. The
frontend never asks.

The subscribe wizard collects `industry`
(`apps/landing/app/subscribe/onboarding-steps.tsx:186-201`) but not
`companySize` — the known gap ITEM-0075 (DEFERRED, LOW). `PublicSubscribeDto`
already accepts both (`public-subscribe.dto.ts:178,184`) and
`SubscriptionOrderService.createCustomer` spreads `buildOrganizationProfile()`
into `customerAccount.create` (`subscription-order.service.ts:588,702`), so the
backend half exists and only the form is missing.

## Existing architecture

- **API**: NestJS modules under `services/api/src/modules/`. `super-admin` owns
  the platform dashboard and platform settings; `billing` owns orders, payments
  and the re-check service; `platform-runtime` is the generic record runtime the
  admin console drives; `platform-auth` resolves platform permissions from the
  route path.
- **Admin console**: metadata-driven. `apps/admin/lib/runtime/` declares modules,
  capabilities and actions; `app/_components/runtime/` renders them.
  `app/_components/settings/settings-shell.tsx` is the settings page shell.
- **Platform settings**: one `PlatformSetting` row per key, read and written
  through `SuperAdminService.getPlatformSettings()` /
  `updatePlatformSettings()`, surfaced by
  `apps/admin/app/(internal)/settings/platform-defaults/`.
- **Permissions on the platform path**: `PlatformPermissionsGuard` +
  `resolvePlatformPermission()`, which maps by route path — anything containing
  `platform-settings` resolves to `settings.read` on GET and `settings.manage`
  otherwise (`platform-permissions.ts:426-431`).

## Requirements

1. Every money figure on the Control Hub includes money in every currency,
   converted into the reporting currency.
2. A currency with no usable rate is **not** silently dropped: it is reported as
   unconvertible, with its native total.
3. Rates are stored per `(baseCurrency, quoteCurrency)` pair, carry their source
   and the time they were fetched, and can be overridden by hand with a reason.
4. An operator can see, edit and refresh rates from Settings.
5. Rate refresh never blocks the dashboard for more than a bounded interval, and
   a provider failure leaves the last known rates in place.
6. `/settings/desktop-agent` renders Releases and Rollout on the standard
   settings shell; `/app-releases` and `/agent-rollout` redirect to it.
7. Bulk delete is available for exactly the modules single-record delete is
   available for — no module-specific allowlist, no way for the two to drift.
8. Modules in `DELETE_REFUSALS` continue to refuse both, with the same reason
   text.
9. The payment panel offers the re-check button only when there is an order
   Stripe could still change its mind about; otherwise it states what was paid.
10. The subscribe wizard collects company size; neither it nor industry blocks
    checkout, and neither is fabricated when absent.

## Dependencies

- **open.er-api.com** reachable from Render's outbound network. No key, no
  account. If it is unreachable the feature degrades to manual rates only, which
  is a supported state, not a failure.
- The `schema` write lease, held by SESSION-0068.
- No dependency on item 5's backlog program; that starts after this merges.

## Files / modules affected

**services/api** *(single-writer files flagged)*
- `prisma/schema.prisma` — **SINGLE WRITER**, lease held
- `prisma/migrations/<timestamp>_platform_exchange_rate/migration.sql` — new
- `src/modules/super-admin/platform-fx.service.ts` — new
- `src/modules/super-admin/platform-fx.service.spec.ts` — new
- `src/modules/super-admin/dto/exchange-rate.dto.ts` — new
- `src/modules/super-admin/super-admin.controller.ts`
- `src/modules/super-admin/super-admin.service.ts`
- `src/modules/super-admin/super-admin.module.ts`
- `src/modules/super-admin/dashboard-fx.spec.ts` — new
- `src/modules/platform-runtime/platform-runtime.service.ts`
- `src/modules/platform-runtime/generic-delete.spec.ts` — new
- `src/modules/leads/admin-leads.controller.ts`
- `src/modules/leads/bulk-delete-withdrawn.spec.ts` — **replaced** by the above
- `src/modules/billing/services/payment-recheck.service.ts`

**apps/admin**
- `app/(internal)/settings/desktop-agent/page.tsx` — new
- `app/_components/settings/desktop-agent-manager.tsx` — new
- `app/(internal)/app-releases/page.tsx` — becomes a redirect
- `app/(internal)/agent-rollout/page.tsx` — becomes a redirect
- `app/_components/admin-sidebar.tsx`
- `app/(internal)/settings/page.tsx`
- `app/(internal)/settings/exchange-rates/page.tsx` — new
- `app/_components/settings/exchange-rates-manager.tsx` — new
- `app/api/super-admin/platform-settings/exchange-rates/route.ts` — new proxy
- `app/_components/dashboard/platform-dashboard.tsx`
- `app/_components/customers/payment-recheck-panel.tsx`
- `app/api/super-admin/customers/[customerId]/payment-state/route.ts` — new proxy
- `lib/runtime/platform-module-registry.ts`
- `lib/runtime/platform-runtime.types.ts`

**apps/landing**
- `app/subscribe/onboarding-steps.tsx`
- `app/subscribe/` form state and submit payload

**docs**
- `docs/bugs/BUG-0018-*` — disposition reversed, with the new decision recorded
- `docs/qa/regressions/index.md` — REG-298 retired, new REG for the generic rule
- `docs/qa/scenarios/` — the withdrawal scenario retired, replaced
- `docs/backlog/items/ITEM-0075-*` — closed by requirement 10
- new bug records for items 1–4 as QA findings, per the completion contract

## Database impact

**One new model. Additive only. No backfill, no destructive phase.**

```prisma
model PlatformExchangeRate {
  id             String             @id @default(uuid())
  baseCurrency   String             // the reporting currency, e.g. "PKR"
  quoteCurrency  String             // the money's own currency, e.g. "QAR"
  rate           Decimal            @db.Decimal(18, 8) // 1 quote = rate base
  source         ExchangeRateSource @default(API)
  provider       String?
  fetchedAt      DateTime?
  manualOverride Boolean            @default(false)
  overrideReason String?
  effectiveFrom  DateTime           @default(now())
  createdAt      DateTime           @default(now())
  updatedAt      DateTime           @updatedAt
  createdById    String?
  updatedById    String?

  @@unique([baseCurrency, quoteCurrency])
  @@index([baseCurrency])
}
```

- **Not tenant-owned.** This is platform commercial configuration and sits beside
  `PlatformSetting`, which is also tenant-free. It carries no `tenantId` and no
  `tenant` relation, deliberately — a `tenantId` here would be a lie, and
  `ExchangeRateSnapshot` already covers the tenant-scoped case.
- **Reuses `ExchangeRateSource`** rather than introducing a second enum for the
  same idea.
- Uniqueness on the pair means a changed reporting currency simply orphans the
  old rows rather than corrupting anything; they are ignored and can be refetched.
- Migration name: `platform_exchange_rate`. Reversible by dropping the table;
  nothing else references it.
- **Seed**: no `seed-config` entry. An empty rate table is a valid state — the
  dashboard reports unconvertible currencies rather than failing — so a fresh
  deploy does not break, and `verify-seed-config` needs no change.

## Backend impact

### `PlatformFxService` (new, in `super-admin`)

| Method | Behaviour |
|---|---|
| `listRates(base)` | every stored rate for the base, newest fetch first |
| `convert(amount, from, to)` | `null` when no rate exists — never a guess |
| `loadConverter(base)` | one DB read, returns a pure `(amount, currency) => number \| null` plus the set of currencies it could not convert |
| `refreshFromProvider(base, actor)` | one GET to `open.er-api.com/v6/latest/{base}`, upserts every quote it returns **except** pairs marked `manualOverride` |
| `setManualRate(base, quote, rate, reason, actor)` | upsert with `source: MANUAL`, `manualOverride: true` |
| `clearManualOverride(base, quote, actor)` | returns the pair to provider control |

Provider access is a single `protected fetchProviderRates()` so specs stub it
without touching the network. The provider URL is a module constant, not an env
var — there is no secret, nothing to rotate, and adding one would mean four
registration sites (`packages/config`, `turbo.json`, `render.yaml`,
`docs/environment-variables.md`) for a value that has one correct setting.

Refresh policy: `getDashboardSummary` calls `ensureFresh(base)`, which refreshes
only when the newest `API`-sourced row for the base is older than **24 hours**,
and awaits it under a **4-second timeout**. On timeout or provider error it logs
and proceeds with stored rates. A dashboard is never blocked and never wrong
about which rates it used.

### `getDashboardSummary` changes

Every `currency: reportingCurrency` filter is removed. The aggregates become
`groupBy(['currency'])` and are summed through the converter in application
code. `invoiceBreakdown` loses its currency filter outright — it is a count of
invoices by status and never should have been currency-scoped.

The response keeps `reportingCurrency` and **replaces** `excludedCurrencies`
with:

```ts
fx: {
  base: string;
  ratesAsOf: string | null;
  rates: Array<{ currency: string; rate: number; source: string; manualOverride: boolean }>;
  unconvertible: Array<{ currency: string; collected: number; payments: number }>;
}
```

`unconvertible` is non-empty only when a currency has no rate at all — the
honest successor to `excludedCurrencies`, and normally empty.

### New endpoints

All mounted under `super-admin/platform-settings/…`, so
`resolvePlatformPermission` maps them without a new entry: GET →
`settings.read`, everything else → `settings.manage`
(`platform-permissions.ts:426-431`).

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/super-admin/platform-settings/exchange-rates` | — | `{ base, rates[], ratesAsOf }` |
| `POST` | `/super-admin/platform-settings/exchange-rates/refresh` | — | same shape, after refresh |
| `PUT` | `/super-admin/platform-settings/exchange-rates/:quote` | `{ rate, reason }` | the updated pair |
| `DELETE` | `/super-admin/platform-settings/exchange-rates/:quote` | — | the pair, returned to provider control |

Plus, for item 4:

| Method | Path | Returns |
|---|---|---|
| `GET` | `/super-admin/customers/:customerAccountId/payment-state` | `{ state: 'CONFIRMED' \| 'AWAITING' \| 'FAILED' \| 'NONE', orderNumber?, paidAt?, amount?, currency?, checkoutSessionId? }` |

`payment-state` reuses `findRecheckableOrder` — it is a read of the same query
the POST already runs, so the button and the endpoint cannot disagree about
whether there is anything to re-check.

### `platform-runtime` delete unification

`remove()` and `bulkDelete()` collapse onto one private
`deleteRecords(user, key, ids)`. Both public methods call it with one id or
many. There is no second list to fall out of step with the first, which is the
actual defect behind the reported 400 — not the missing `leads` arm.

`leads` returns to the deletion set. `AdminLeadsController` regains its bulk
route.

## Frontend impact

### Admin — dashboard

`platform-dashboard.tsx` replaces the `Excludes QAR` chip with a rate chip:
`Rates 28 Aug · 1 QAR = 76.40 PKR`, whose tooltip lists every rate used and
links to Settings → Exchange rates. An `unconvertible` entry renders as a
warning chip naming the currency and its native total — the BUG-1745 guarantee
that a zero cannot mean two things is preserved, not discarded.

### Admin — Settings → Exchange rates (new)

`SettingsShell` + a table: quote currency, rate, source badge (`Live` /
`Manual`), fetched-at, and per-row Edit / Reset-to-live. One `Refresh rates now`
button. Loading, error, empty (`No rates yet — refresh to fetch them`) and
access-denied states all present. The table scrolls inside its own container at
mobile width; every input has a real `<label>`.

### Admin — Settings → Desktop agent (new)

`SettingsShell` with two tabs, reusing the existing table markup from both
pages, restyled onto the light admin palette (the stray `dark:` variants go —
the admin shell is not theme-switched). `/app-releases` and `/agent-rollout`
become `redirect("/settings/desktop-agent")`. The sidebar's Operations section
loses both entries; Settings gains one.

Both tabs keep their existing `appDownloads.manage` gate, so the Settings index
hides the card for anyone without it.

### Admin — payment panel

`PaymentRecheckPanel` fetches `payment-state` on mount.

- `CONFIRMED` → a single confirmed line: amount, currency, paid date, order
  number. No button.
- `AWAITING` / `FAILED` → today's panel, unchanged.
- `NONE` → renders nothing at all.
- fetch failure → today's panel, because refusing to show the operator their
  tool because a status probe failed is worse than showing it.

### Landing — subscribe wizard

A `Company size` select beside `Industry`, from the existing
`companySizeOptions` in `app/_components/marketing/content.ts` — the same list
the contact form and Platform Admin already use, so the column stays
comparable. Optional, no asterisk, no validation gate. Sent only when chosen;
absent otherwise, never `"Unknown"` (the BUG-0077 fabrication rule).

## Permission / RBAC impact

- **No new permission keys.** Exchange-rate routes inherit `settings.read` /
  `settings.manage` from the `platform-settings` path rule
  (`platform-permissions.ts:426`). `payment-state` sits under
  `customers/:id/…` and resolves to `customers.read`, the same key the record
  page already required to render.
- **No new RBAC matrix entries** — the platform path uses
  `PlatformPermissionsGuard`, not `PermissionsGuard`, and declares no
  `@RequirePermission`.
- **No elevated-role changes.** Nothing added to `hasElevatedTenantRole`.
- **Leads bulk delete** re-grants an action that `resolvePlatformPermission`
  already maps for DELETE; no key changes, and
  `platform-permissions.spec.ts` continues to enumerate every route.
- **Nothing mirrored into `apps/web/lib/security-keys.ts`** — none of this is on
  the tenant path.

## Tenant-isolation impact

Every surface in this plan is on the **platform** path
(`authSubjectType: 'platform-user'`), behind `PlatformPermissionsGuard`, which
throws `PLATFORM_ACCESS_REQUIRED` before any handler runs when
`request.user.platform.id` is absent.

- `PlatformExchangeRate` is **not tenant-owned** and holds no tenant data —
  currency pairs and rates only. There is nothing to leak across tenants because
  there is nothing per-tenant in it.
- The dashboard aggregates were already cross-tenant by design; this change
  removes a *currency* filter, never a tenant one, and adds none.
- `payment-state` reads a `SubscriptionOrder` by `customerAccountId` — a
  commercial record on the platform side, the same scope the existing POST
  already had.
- `platform-runtime` delete keeps `assertModuleWrite` / `assertAdmin` exactly as
  they are; unification changes *which modules* are reachable, never *who* may
  reach them.
- **No tenant-owned model gains a query in this plan.** A reviewer can confirm
  it by grepping the diff for `prisma.` inside `services/api/src/modules/`: every
  hit is on `Payment`, `Invoice`, `PartnerCommission`, `SubscriptionOrder`,
  `PlatformExchangeRate` or `PlatformSetting`, none of which is tenant-scoped in
  these paths.

## Audit / event / logging impact

`AuditService.log()` with `tenantId: 'platform'` on every rate mutation:

| Action | Entity | Before | After |
|---|---|---|---|
| `PLATFORM_FX_RATES_REFRESHED` | `PlatformExchangeRate` | prior rates by pair | new rates, provider, fetchedAt |
| `PLATFORM_FX_RATE_OVERRIDDEN` | `PlatformExchangeRate` | prior rate + source | new rate, reason, actor |
| `PLATFORM_FX_OVERRIDE_CLEARED` | `PlatformExchangeRate` | manual rate | restored provider rate |

A rate is what a revenue number is made of; an unaudited rate change makes a
past report unexplainable.

`BILLING_PAYMENT_RECHECKED` is unchanged — `payment-state` is a read and is not
audited, consistent with every other record read.

Bulk delete audits through the existing per-module services, which already log;
unifying the dispatch does not remove a call site.

Logging: the provider response body is logged only at `debug` and only its
`rates` map — no headers, no URL query. Nothing here touches a secret.

## Integration impact

- **New outbound host**: `open.er-api.com`, HTTPS GET, no credentials. Called at
  most once per 24h per base currency, plus explicit operator refreshes. A
  failure is logged and swallowed.
- **Stripe**: untouched. `payment-state` reads local order state only; the POST
  re-check path that talks to Stripe is unchanged.
- **Desktop agent / .NET gateway**: untouched. The agent reads
  `/app-releases/*` **API** routes; only the admin *page* URLs move.
- **API response shape**: `excludedCurrencies` is removed from the dashboard
  payload and replaced by `fx`. The only consumer is
  `platform-dashboard.tsx`, changed in the same commit. No deployed client
  reads it.

## Migration / data compatibility

- **Existing data under new code**: with an empty rate table the dashboard
  behaves exactly as today's `excludedCurrencies` path did — reporting-currency
  money is summed, everything else is disclosed as unconvertible. The first
  refresh turns disclosure into conversion. There is no window in which a
  figure is silently wrong.
- **Old frontend against new API**: the dashboard bundle and the API ship
  together; a stale bundle reading a missing `excludedCurrencies` renders no
  chip, which is a cosmetic degradation, not an error.
- **New frontend against old API**: `fx` absent → the rate chip is not rendered.
  Guarded with optional chaining.
- **Customers created before item 4**: keep their blank `industry` and
  `companySize`. Nothing is backfilled — an invented value is worse than a blank
  one, and the admin record remains editable.

## Parallel-safe tasks

`PARALLEL_SAFE` — no shared files, no ordering between them:

- **WP-A** `PlatformExchangeRate` model + migration + `PlatformFxService` + spec
- **WP-C** Settings → Desktop agent page, redirects, sidebar, settings index
- **WP-D** `platform-runtime` delete unification + leads restoration + spec
- **WP-E** landing subscribe wizard `companySize`
- **WP-F** `payment-state` endpoint + panel states

## Dependency-blocked tasks

- **WP-B** `getDashboardSummary` FX conversion + dashboard chip —
  `DEPENDENCY_BLOCKED` on WP-A (needs `PlatformFxService.loadConverter`).
- **WP-G** Settings → Exchange rates screen — `DEPENDENCY_BLOCKED` on WP-A
  (needs the four endpoints).
- **WP-H** Record reversal: BUG-0018 disposition, REG-298 retirement, the
  replacement regression and QA scenario — `DEPENDENCY_BLOCKED` on WP-D, because
  the record must describe what actually shipped.

## Integration tasks

`INTEGRATION`, last:

- **WP-I** Settings index card ordering, sidebar consistency, full
  lint/typecheck/test sweep, component index regeneration, backlog and QA index
  rebuilds, engineering-history record.

## Testing strategy

Commands from AGENTS.md only:

```bash
npm --workspace api   run test          # jest, all api specs
npm --workspace api   run check-types
npm --workspace api   run lint
npm --workspace admin run check-types
npm --workspace admin run test
npm --workspace web   run check-types
npm run prisma:validate
npm run prisma:generate
npm run validate:framework
npm run backlog:check
npm run qa:check
npm run typecheck                       # crosses workspace boundaries
```

New specs:

- `platform-fx.service.spec.ts` — conversion arithmetic against a stubbed
  provider; a missing pair returns `null` and never a fallback of `1`; a manual
  override survives a refresh; a provider error leaves stored rates intact.
- `dashboard-fx.spec.ts` — a fixture with QAR and PKR payments produces one
  total in PKR; a currency with no rate lands in `unconvertible` rather than
  being dropped or counted at par.
- `generic-delete.spec.ts` — **replaces** `bulk-delete-withdrawn.spec.ts`. Its
  load-bearing assertion is that the module sets reachable through `remove` and
  through `bulkDelete` are **identical**, derived from one source. That is the
  assertion the easy wrong fix (adding a `leads` arm to `bulkDelete`) fails.
- `platform-permissions.spec.ts` — extended so the four new routes are
  enumerated and resolve to `settings.read` / `settings.manage`.

Manual verification, against production after deploy:

1. Control Hub → the chip reads `Rates <date>`, not `Excludes QAR`, and
   Collected revenue is non-zero.
2. Settings → Exchange rates → `Refresh rates now` → QAR appears with source
   `Live`; edit it, confirm the badge reads `Manual` and the dashboard total
   moves; reset it.
3. Settings → Desktop agent → both tabs render on the light shell;
   `/app-releases` redirects.
4. Leads → select two → Delete → the confirmation names both → they are gone,
   and no 400 reaches the error log. Invoices → the bulk control still refuses,
   with its retention reason.
5. A customer with a succeeded payment shows the confirmed line and no button; a
   customer mid-checkout still shows the button.
6. Subscribe wizard → Company size appears, is skippable, and when chosen
   reaches the admin Customer record.

## Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| 1 | **A wrong rate silently misstates revenue.** Converted money is money nobody counted by hand. | Medium | High | Rate, source and date shown on the dashboard itself, not buried in Settings. Every mutation audited. `convert` returns `null` rather than guessing, so a missing rate is loud. |
| 2 | **Bulk delete on leads destroys commission attribution** — the exact harm BUG-0018 was closed to prevent, now re-opened by explicit decision. | Medium | High | Decision recorded in the bug record with its date and its author. Confirmation names the count and the records (BUG-1756's mechanism). Converted leads remain individually refused. The audit trail survives the lead. |
| 3 | Provider unavailable or rate-limited on Render. | Medium | Low | 4s timeout, 24h TTL, stored rates always win over a failed fetch, manual override needs no provider at all. |
| 4 | `getDashboardSummary` refactor changes a figure nobody asked to change. | Medium | Medium | `invoiceBreakdown` is the only non-money aggregate touched, and it is a count that was wrongly currency-scoped. `dashboard-fx.spec.ts` pins the arithmetic. |
| 5 | Retiring REG-298 and its QA scenario loses the reasoning behind them. | Low | Medium | Neither is deleted. Both are marked superseded, pointing at the reversal and its date, so the argument survives its outcome. |
| 6 | Moving two URLs breaks a bookmark or a runbook. | Low | Low | Redirects, not deletions. |

Tenant isolation, RBAC and payroll correctness are **not** in scope: nothing
here touches a tenant-owned model, a tenant guard or a payroll path.

## Rollback considerations

- **Fully reversible.** The migration is additive; dropping
  `PlatformExchangeRate` restores the prior state exactly, and no other table
  references it.
- **API without migration** → every rate query fails. Deploy applies migrations
  before starting the API (`npm run release:api`), so this ordering cannot occur.
- **Frontend without API** → the rate chip is absent, the exchange-rates screen
  404s from its proxy and renders its error state, the payment panel falls back
  to always-show. Degraded, not broken.
- **Reverting item 3** means restoring the `leads` exception in three places;
  the retired spec is preserved in history and names them.

## Definition of Done

- [ ] `npm --workspace api run test` passes, including the three new specs
- [ ] `npm run typecheck` passes across workspaces
- [ ] `npm --workspace api run lint`, admin/web/landing eslint all exit 0
- [ ] `npm run prisma:validate` and `prisma:generate` clean; migration applies
- [ ] `npm run validate:framework`, `backlog:check`, `qa:check` pass
- [ ] Component index regenerated in the same commit
- [ ] Audit calls in place for all three rate mutations
- [ ] Permissions verified: four new routes resolve through the existing
      `platform-settings` rule; `platform-permissions.spec.ts` enumerates them
- [ ] Tenant scoping verified: no tenant-owned model queried
- [ ] BUG-0018 reversal recorded with its date and author; REG-298 and the QA
      scenario superseded rather than deleted; ITEM-0075 closed
- [ ] Bug records filed for items 1, 2, 3 and 4 and triaged
- [ ] `docs/architecture/` note for platform FX reporting
- [ ] No unrelated changes in the diff
