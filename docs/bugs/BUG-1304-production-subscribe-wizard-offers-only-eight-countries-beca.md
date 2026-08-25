---
ID: BUG-1304
aliases: [BUG-1304]
Title: Production subscribe wizard offers only eight countries because the ISO country sync never populates production
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATABASE
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: 42435d59
AffectedModules: [services/api/src/modules/lookups, apps/landing]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt:
---

# BUG-1304 — Production subscribe wizard offers only eight countries because the ISO country sync never populates production

## Summary

`/api/public/geography/countries` returns **250** countries against a local
database and **8** against production. The subscribe wizard's Country field is a
required select fed by that endpoint, so on production a buyer whose country is
not one of eight cannot complete step 1 of checkout. The landing app has a
31-country bundled fallback for exactly this situation, but it never engages,
because eight rows is a successful non-empty response rather than a failure.

## Expected Behavior

The Country field offers the full ISO set the `Country` table is meant to hold,
and in no case offers fewer countries than the bundled shortlist the app ships
with.

## Actual Behavior

Production offers eight: United States, Saudi Arabia, Pakistan, Qatar, United
Arab Emirates, India, United Kingdom, Canada. Any other buyer has no selectable
country and cannot pass the Organization step.

## Reproduction

```bash
curl -s https://api.dijipeople.com/api/public/geography/countries
```

Returns 8 records. The same call against a local API on `develop` returns 250.

In the UI the field is reachable at `/subscribe` step 1 — though on production
it is currently masked by the `DP-CHK-01` block for QAR visitors
([[BUG-0898]]), so this defect surfaces the moment a plan becomes purchasable.

## Evidence

Production response, in order:

```
0 US United States
1 SA Saudi Arabia
2 PK Pakistan
3 QA Qatar
4 AE United Arab Emirates
5 IN India
6 GB United Kingdom
7 CA Canada
```

Local response: `count: 250`.

The eight are exactly the set written by `ensureDefaultCountries()`, which
[`geographic-lookup.service.ts:156`](../../services/api/src/modules/lookups/geographic-lookup.service.ts#L156)
calls unconditionally before deciding whether to refresh:

```ts
private async syncCountriesIfNeeded() {
  const count = await this.prisma.country.count();
  const latest = await this.prisma.country.findFirst({ orderBy: { updatedAt: 'desc' }, ... });
  await this.ensureDefaultCountries();
  if (count > 0 && latest && Date.now() - latest.updatedAt.getTime() < ONE_DAY_MS) return;
  try {
    const endpoint = this.configService.get<string>('GEOGRAPHY_COUNTRIES_API_URL',
      'https://countriesnow.space/api/v0.1/countries/iso');
    ...
```

So the widening step is an outbound call to a third-party host made lazily from
a public endpoint. On production it evidently does not succeed — the table has
never grown past the eight defaults — and the failure is swallowed by the
`try`, which is deliberate (a lookup outage must not block checkout) but leaves
no user-visible signal.

The client-side fallback in
[`apps/landing/lib/use-country-options.ts`](../../apps/landing/lib/use-country-options.ts)
cannot rescue it:

```ts
const usable = Array.isArray(countries) && countries.length > 0;
setState({ countries: usable ? countries : BUNDLED_COUNTRIES, ... });
```

Eight is `> 0`, so `usable` is true and the 31-country `BUNDLED_COUNTRIES` list
is discarded in favour of a shorter one. The fallback guards against an empty or
failed response, not against a response that is merely too small.

## Root Cause

Two compounding causes:

1. The ISO widening sync does not complete in production — most likely the
   outbound call to `countriesnow.space` does not succeed from the Render
   service — and its failure is silent by design.
2. The client's usability test is "non-empty" rather than "at least as complete
   as what we ship", so a degraded eight-row answer outranks the bundled
   thirty-one.

## Impact

Reachable in production as soon as any plan is purchasable. A buyer outside the
eight listed markets cannot complete self-service checkout at all — the field is
required and offers nothing that describes them. There is no error message,
because from the app's perspective nothing failed.

Contrast with the contact and partner forms, which use the bundled
`COUNTRY_OPTIONS` list directly and include a "Somewhere else" escape — those
are unaffected.

Note this is *narrower* than the currently-dominant blocker: today no QAR plan
can be bought at all ([[BUG-0898]]), so few buyers reach the field.

## Affected Areas

- `services/api/src/modules/lookups` — `listCountries`, `syncCountriesIfNeeded`,
  `ensureDefaultCountries`, `PublicGeographyController`.
- `apps/landing/lib/use-country-options.ts` — the fallback threshold.
- `/subscribe` step 1 (Organization) and step 3 addressing.
- `apps/admin`, which reads the same lookup.

## Proposed Resolution

Two separable changes:

- **Make the country set a seeded fact rather than a runtime fetch.** A
  reference list of 250 ISO countries does not need to be pulled from a third
  party on demand from a public endpoint; seeding it (`seed-config`, verified by
  `verify-seed-config`) makes production deterministic and removes an outbound
  dependency from the checkout path. This is the durable fix and likely needs an
  ExecPlan, since it touches seed architecture.
- **Raise the client's usability bar** so a lookup answer is only preferred when
  it is at least as large as `BUNDLED_COUNTRIES`, and surface a warning
  otherwise. Cheap, and stops a degraded answer beating a good one.

Whichever is chosen, the silent-failure property should be addressed: the sync
failing in production should be visible in `error-logs`, not only in the shape
of the data.

## Acceptance Criteria

- `GET /api/public/geography/countries` on production returns the full ISO set.
- With the lookup degraded or unreachable, the subscribe wizard still offers at
  least the bundled 31 countries.
- A failed country sync is recorded where an operator can see it.

## Regression Coverage

Needs a test that fails without the fix: given a lookup response smaller than
`BUNDLED_COUNTRIES`, `useCountryOptions` must not narrow the list. A seed test
asserting the production country count is the companion check.

## Dependencies

The seeding option depends on a decision about where reference geography lives —
see `docs/seed-architecture.md`.

## Related Items

- [[BUG-1305]] — the ordering defect that appears once the full list *is* loaded.
- [[BUG-0898]] — the blocker currently masking this one.

## Resolution

Not yet fixed.

## QA Retest

Pending. Retest by comparing the production and local endpoint counts, and by
completing step 1 of `/subscribe` as a buyer outside the eight markets.

## History

- 2026-08-25 — created from qa run at `42435d59`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[landing-architecture]]

<!-- GRAPH:END -->
