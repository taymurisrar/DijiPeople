# Platform FX Reporting

> **Last verified:** 2026-08-28 · **Verified against commit:** 1003a2ac
>
> Every path and figure below was derived at that commit on branch
> `agent/admin-console-fx-and-agent-settings`. Move these two lines when you
> change a claim here.

How the Control Hub turns money collected in several currencies into one
reporting figure — and, more importantly, what it does when it cannot.

## Why this exists

The dashboard used to filter every money aggregate on the platform's reporting
currency. Production stored `reportingCurrency: "PKR"` while every payment,
invoice and price was `QAR`, so the Control Hub read **"Collected revenue
PKR 0"** beside two succeeded payments totalling QAR 160 (BUG-1745). The screen
could not distinguish "no money" from "no money in the currency this happened to
be configured with".

The first fix made that zero honest: the header named the currencies the filter
had excluded. On 2026-08-28 the repository owner asked for the money to be
converted and counted instead, with live rates and a manual override. Reporting
stays PKR.

## The two rules

Everything below follows from these, and both are tested rather than asserted:

1. **A missing rate is never a guess.** `convert()` returns `null`, never the
   unconverted amount and never zero. A par fallback would turn QAR 160 into
   "PKR 160" on the dashboard with nothing on the screen able to say so.
2. **An operator's rate outranks the provider's.** `manualOverride` survives
   every refresh until explicitly cleared, so correcting a rate is not a race
   against the next fetch.

## Model

`PlatformExchangeRate` (`services/api/prisma/schema.prisma`), unique on
`(baseCurrency, quoteCurrency)`.

`rate` reads **"1 quoteCurrency = rate baseCurrency"**, so converting a payment
is a multiplication and never an inversion decided at the call site. The
provider quotes the other direction; `refreshFromProvider` stores the inverse
once, at write time.

**Not tenant-owned, and deliberately so.** `ExchangeRateSnapshot` already covers
the tenant-scoped case and requires a real `Tenant` foreign key, which a
platform rate has no honest value for. This model sits beside `PlatformSetting`,
which is tenant-free for the same reason. It reuses the existing
`ExchangeRateSource` enum rather than introducing a second name for one idea.

Changing the reporting currency orphans the old rows rather than corrupting
anything: they are ignored and refetched under the new base.

## Service

`PlatformFxService` (`services/api/src/modules/super-admin/platform-fx.service.ts`).

| Method | What it does |
|---|---|
| `resolveReportingCurrency()` | the one resolution of the `platform-defaults` row, shared by the dashboard and the settings screen |
| `loadConverter(base)` | one read, then pure arithmetic — the dashboard folds thousands of rows through it |
| `ensureFresh(base)` | refreshes if the newest provider rate is over 24h old, bounded by a 4s timeout, never fatal |
| `refreshFromProvider(base, actor)` | fetches and upserts, skipping manual overrides |
| `setManualRate(...)` / `clearManualOverride(...)` | operator control, both audited |

### The provider

`https://open.er-api.com/v6/latest/{base}` — free, no API key, no account, and
it quotes the Gulf currencies this platform trades in (the ECB feeds do not).
Chosen by the repository owner on 2026-08-28.

A module constant, **not an environment variable**: there is no secret, nothing
to rotate, and one correct value. An env var would mean four registration sites
(`packages/config` validation, `turbo.json` `globalEnv`, `render.yaml`,
`docs/environment-variables.md`) for a URL nobody will change. Specs stub the
`protected fetchProviderRates()` method, which is the seam that matters.

### Refresh policy, and why there is no cron

This API has **no scheduler** — no `@nestjs/schedule`, no `@Cron` anywhere. A
daily fetch would have meant a new dependency and a new failure mode for one
HTTP call, so the read path keeps its own rates warm instead:
`getDashboardSummary` calls `ensureFresh`, which refreshes only past a 24h TTL,
awaits at most 4 seconds, and falls back to stored rates on timeout or provider
error. Concurrent dashboard loads share one in-flight promise; a failed attempt
is not retried inside the same TTL window.

The consequence worth knowing: **rates refresh when somebody opens the
dashboard.** A platform nobody looks at for a week has week-old rates, and the
screen says so.

### Which currencies

Only those the platform actually holds money in — distinct currencies across
`Payment`, `Invoice` and `PartnerCommission`, plus any pair an operator has
already touched. Not the ~160 the provider returns. A settings table listing
rates for currencies no invoice was ever raised in is a table nobody reads, and
the operator needs to recognise every row as something they could be asked
about.

## Dashboard

`SuperAdminService.getDashboardSummary()` no longer filters money on currency
anywhere. Eight aggregates group by currency and fold through one converter, so
the headline, the trend and the period comparison cannot use different rates:

- collected revenue, outstanding, commission exposure
- the invoice and payment trend series
- the current and previous period collections

`invoiceBreakdown` lost its currency filter outright — it is a count of invoices
by status and never had a currency to be in.

The response carries `fx`:

```ts
fx: {
  base: string;
  ratesAsOf: string | null;
  rates: Array<{ currency; rate; source; manualOverride }>;
  unconvertible: Array<{ currency; amount; count }>;
}
```

`unconvertible` is the honest successor to `excludedCurrencies`. The predecessor
listed every currency that was not the reporting one — on production, all of
them. This lists only currencies with no rate at all, so it is normally empty
and an entry is a prompt to add a rate rather than a permanent footnote.

The admin renders the rate as a chip on the same line as the numbers it
produced, linking to Settings → Exchange rates. A converted figure is only as
trustworthy as its rate, and the operator should never have to go looking for
it.

## Endpoints

All under `super-admin/platform-settings/…`, so they inherit the rule that
already governs every platform setting — `settings.read` on a GET,
`settings.manage` otherwise (`platform-permissions.ts`, the `platform-settings`
branch). **No new permission key was introduced.**

| Method | Path |
|---|---|
| `GET` | `/super-admin/platform-settings/exchange-rates` |
| `POST` | `/super-admin/platform-settings/exchange-rates/refresh` |
| `PUT` | `/super-admin/platform-settings/exchange-rates/:quoteCurrency` |
| `DELETE` | `/super-admin/platform-settings/exchange-rates/:quoteCurrency` |

## Audit

Three actions, all with `tenantId: 'platform'`:
`PLATFORM_FX_RATES_REFRESHED`, `PLATFORM_FX_RATE_OVERRIDDEN`,
`PLATFORM_FX_OVERRIDE_CLEARED`.

A rate is what a revenue figure is made of. An unaudited rate change makes a
past report unexplainable — "why did last month's number move?" has to have an
answer, and the override reason is required for exactly that.

## Tenant isolation

Nothing here is tenant-scoped. `PlatformExchangeRate` holds currency pairs and
rates and no tenant data; the dashboard aggregates were already cross-tenant by
design and this change removed a *currency* filter, never a tenant one. Every
route is behind `PlatformPermissionsGuard`, which refuses any subject without a
platform identity before a handler runs.

## Tests

- `services/api/src/modules/super-admin/platform-fx.service.spec.ts` — the
  arithmetic, the override rules, the freshness window, the provider-failure
  path.
- `services/api/src/modules/super-admin/dashboard-fx.spec.ts` — the folding and
  the trend, including that an unconvertible currency is named rather than
  dropped or counted at par.
- `services/api/src/modules/super-admin/promotion-safety.spec.ts` — asserts the
  currency filter has not come back.

## Related

- [[BUG-1745-the-executive-dashboard-reports-zero-revenue-because-reporti]]
- [[EXECPLAN-0024]] — the plan this was built from
- [`settings-and-branding.md`](settings-and-branding.md) — the canonical
  contract for settings, branding and formatting
