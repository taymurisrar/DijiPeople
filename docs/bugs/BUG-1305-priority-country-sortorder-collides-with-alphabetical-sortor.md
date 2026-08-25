---
ID: BUG-1305
aliases: [BUG-1305]
Title: Priority country sortOrder collides with alphabetical sortOrder, scattering key markets mid-list
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: DATABASE
Source: QA_RUN
DetectedDate: 2026-08-25
DetectedInSha: 42435d59
AffectedModules: [services/api/src/modules/lookups]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-25-landing-e2e-local-and-prod-42435d5.md
RegressionId: REG-255
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt: 2026-08-25
---

# BUG-1305 — Priority country sortOrder collides with alphabetical sortOrder, scattering key markets mid-list

## Summary

`Country.sortOrder` is being used for two incompatible purposes at once. The
eight priority markets carry `sortOrder` 10, 20, 30 … 80, evidently intended to
hoist them to the top of the picker. Every other country carries its own
alphabetical index in the *same* numeric space (0…249). The two ranges overlap,
so instead of leading the list the eight priority markets land in the middle of
it — United States between Argentina and Armenia, Qatar after Cape Verde.

## Expected Behavior

Either the priority markets appear first, as a distinct group before the
alphabetical remainder, or the list is purely alphabetical. Both are defensible;
the current interleave is neither.

## Actual Behavior

Exactly eight countries sit outside alphabetical order, at roughly every
eleventh position, with no visual grouping to explain why.

## Reproduction

Against a database where the ISO country sync has run (a local stack on
`develop` at `42435d59`):

```bash
curl -s http://localhost:4000/api/public/geography/countries
```

Then scan for descending name transitions. Or open `/subscribe` and look for
"United States" under U — it is not there.

## Evidence

Out-of-order transitions in the API response, all eight of them:

```
12: United States -> Armenia
23: Saudi Arabia -> Belgium
34: Pakistan -> British Indian Ocean Territory
44: Qatar -> Caribbean Netherlands
55: United Arab Emirates -> Cook Islands
66: India -> Dominican Republic
77: United Kingdom -> Falkland Islands
86: Gabon -> Canada
```

The misplaced eight are exactly the priority set from
`ensureDefaultCountries()`. The rendered picker therefore begins:

```
Afghanistan, Åland Islands, Albania, Algeria, American Samoa, Andorra, Angola,
Anguilla, Antarctica, Antigua and Barbuda, Argentina, United States, Armenia,
Aruba, Australia, ...
```

The stored data, queried directly, shows the collision:

| name | code | sortOrder |
|---|---|---|
| Afghanistan | AF | 0 |
| Åland Islands | AX | 1 |
| ... | | |
| Argentina | AR | **10** |
| United States | US | **10** |
| Armenia | AM | 11 |

The `sortOrder` distribution confirms it is exactly eight collisions — the only
values held by two rows are 10, 20, 30, 40, 50, 60, 70 and 80.

The ordering clause, at
[`geographic-lookup.service.ts:79`](../../services/api/src/modules/lookups/geographic-lookup.service.ts#L79):

```ts
orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
```

is correct in itself. Ties break alphabetically — which is why `Argentina`
precedes `United States` at the shared value 10. The defect is in the data.

## Root Cause

`sortOrder` carries two meanings that were assigned independently. The ISO sync
numbers every country by its position in the alphabetical import, filling 0…249.
`ensureDefaultCountries()` separately assigns the priority markets 10, 20, …, 80
as ranks. Neither writer knows about the other, and nothing reserves a band for
priority values, so the ranks land inside the alphabetical range.

## Impact

Latent in production today, because production only holds the eight defaults
([[BUG-1304]]) and with nothing else present they *do* render in intended
priority order. The moment the ISO widening succeeds — which is the fix for
BUG-1304 — the eight most commercially important markets scatter into a
250-entry list at positions no user would look.

That ordering makes BUG-1304's fix actively worse for the majority of buyers
unless both are addressed together, which is the main reason to record it now
rather than after it ships.

Severity is capped at MEDIUM because it degrades findability rather than
blocking a purchase: the field is a native `<select>`, so type-ahead still finds
"United States" by name.

## Affected Areas

- `services/api/src/modules/lookups` — `ensureDefaultCountries`, the ISO sync
  writer, `listCountries`.
- `/subscribe` step 1, and every admin screen reading the same lookup.

## Proposed Resolution

Separate the two meanings rather than renumbering around the collision:

- Give priority markets a reserved band that cannot overlap the alphabetical
  index — negative values, or a dedicated `isPriority` boolean ordered before
  `sortOrder`. A boolean is the clearer expression of intent and cannot drift
  as the ISO set grows.
- Have the ISO sync stop writing an alphabetical index into `sortOrder` at all;
  `name: 'asc'` already orders the remainder, so the column only needs to
  express priority.
- Group the two visually in the picker (an `<optgroup>`), so a list that is not
  purely alphabetical explains itself.

Needs a migration or a seed correction for existing rows, so it warrants an
ExecPlan under [`PLANS.md`](../../PLANS.md) if the column semantics change.

## Acceptance Criteria

- With the full ISO set loaded, the priority markets appear before the
  alphabetical remainder, or the list is strictly alphabetical.
- No two active countries share a `sortOrder` that changes their relative order
  arbitrarily.
- A test asserts the rendered order for a database containing both the priority
  set and the full ISO set.

## Regression Coverage

Needs a test that fails today: seed the priority eight plus a full ISO import,
call `listCountries`, and assert the first eight names are the priority markets
(or that the sequence is strictly sorted). `geographic-lookup.service.spec.ts`
already exists and is the natural home.

## Dependencies

Should be fixed together with [[BUG-1304]] — fixing that one alone exposes this
one to every production buyer.

## Related Items

- [[BUG-1304]] — why this is currently latent rather than live.

## Resolution

Fixed by separating the two meanings rather than renumbering around the clash.

`sortOrder` now means one thing: how far up the list a country is pinned.

- **Priority markets take a negative band** (`-8` … `-1`) in
  [`lookups.catalog.ts`](../../services/api/src/modules/lookups/lookups.catalog.ts).
  `Country.sortOrder` defaults to `0`, so negatives sort ahead of everything
  and the two ranges cannot meet.
- **The ISO import stops numbering.** It writes `sortOrder: 0`; the existing
  `name: 'asc'` tiebreak already orders those alphabetically, so nothing is lost.
- **`ensureDefaultCountries` writes `sortOrder` on update**, where it previously
  passed `update: {}` — otherwise correcting the catalog would fix only new
  databases.
- **A data migration** (`20260825210000_country_priority_sort_band`) normalises
  rows that already exist. Non-destructive: no column added, dropped or retyped,
  no row deleted.

Regression coverage: four invariant tests asserting the *band* rather than the
eight numbers, plus a sort simulation pinning that the US no longer lands
between Argentina and Armenia.

## QA Retest

Verified in `docs/qa/runs/2026-08-25-landing-fixes-verification.md` (V12–V14) against the **real database**, not only mocks —
the defect was in data, so a passing unit test alone would not have been
evidence.

After `prisma migrate deploy`: 250 countries, the eight priority markets first
in intended order, then alphabetical, and `out-of-order within a band: 0`. The
live subscribe picker renders US, Saudi Arabia, Pakistan, Qatar, UAE, India, UK,
Canada, then Afghanistan.

## History

- 2026-08-25 — created from qa run at `42435d59`.
- 2026-08-25 — fixed, verified on the running product, and closed. See `docs/qa/runs/2026-08-25-landing-fixes-verification.md`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-255 (see the regression register)

<!-- GRAPH:END -->
