---
ID: BUG-0060
aliases: [BUG-0060]
Title: A stale generated Prisma client breaks local API development with 60 misleading errors
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-17
DetectedInSha: 48e3ed0
AffectedModules: [services/api, scripts, package.json]
OwnerAgent: database
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-048
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0060 — A stale generated Prisma client breaks local API development with 60 misleading errors

## Summary

`npm run start:dev` and the editor's TypeScript server reported **60 errors** in
`services/api`, and the API crashed at runtime on `LeadInquiryIntent.REQUEST_DEMO`
being undefined. Every error pointed at application code. **None of the
application code was wrong.** The generated Prisma client in `node_modules` was a
day older than `schema.prisma`, so symbols the schema declares were absent from
the client the compiler and the runtime were reading.

Nothing regenerated it on the local development path: `build` runs
`prisma:generate` and CI runs it explicitly before typechecking, but `start:dev`
did neither.

## Expected Behavior

A developer who pulls a branch carrying schema changes and runs the API either
gets a regenerated client, or gets one clear message naming the real problem.
They should never be handed 60 errors that all accuse correct code.

## Actual Behavior

```
Module '"@prisma/client"' has no exported member 'LeadInquiryIntent'.
Module '"@prisma/client"' has no exported member 'PartnershipModel'.
Module '"@prisma/client"' has no exported member 'CommercialPublicationStatus'.
Property 'market' does not exist on type 'BootstrapClient'.
Property 'inquiryIntent' does not exist on type '{ ... }'.
… 60 total
```

and at runtime, `LeadInquiryIntent` resolving to `undefined`.

## Reproduction

1. Check out a commit whose `schema.prisma` declares an enum the installed
   client predates — here, any commit at or after `20260816120000`.
2. Do **not** run `npm run prisma:generate`.
3. `npm --workspace api run check-types` → 60 errors.
4. Start the API → crash on `LeadInquiryIntent.REQUEST_DEMO`.

## Evidence

Timestamps at the point of diagnosis, on `develop` at `48e3ed0`:

```
services/api/prisma/schema.prisma        2026-08-17 01:37
node_modules/.prisma/client/index.d.ts   2026-08-16 01:05   ← ~24h stale
```

Every reported symbol was already declared in the schema **and** already had a
migration. Six enums, two models and twelve fields were checked; all present:

| Symbol | In schema | Migration |
|---|---|---|
| `LeadInquiryIntent`, `PartnershipModel` | yes | `20260816220000_lead_partner_acquisition_context`, `20260817100000_partner_partnership_model` |
| `CommercialPublicationStatus`, `CommercialSalesModel`, `MarketLaunchStatus` | yes | `20260816120000_commercial_configuration_foundation` |
| `CustomerOriginChannel` | yes | `20260817090000_customer_origin_channel` |
| `Market`, `MarketCountry` models | yes | `20260816120000_commercial_configuration_foundation` |
| `ActivityEvent.dedupeKey` | yes | `20260816230000_activity_event_dedupe_key` |

Running `npm run prisma:generate` alone took the count from 60 to **0** with no
source change whatsoever — which is the proof that the code was never the defect.

The local database was stale in the same way: seven migrations pending, the same
seven that introduce these symbols. Applied forward with
`prisma:migrate:deploy`; no reset, no data loss.

## Root Cause

**`SCHEMA_CHANGE_NOT_GENERATED`.** Of the eight categories considered, this is
the one that holds: schema correct, migrations present and correct, application
code correct, generated client stale.

The mechanism is a gap in the script graph:

| Path | Regenerates? |
|---|---|
| `npm run build` | yes — `clean:dist && prisma:generate && nest build` |
| CI | yes — an explicit `npm run prisma:generate` step before typecheck |
| `npm run start:dev` | **no** |
| `npm run check-types` | **no** |
| `postinstall` / `prepare` | did not exist |

So the two commands a developer actually runs all day were the two that could
silently read a stale client — and because CI regenerates, CI stayed green
throughout, which made the failure look like a branch defect rather than a local
one.

## Impact

Development-time only; no production, tenant or runtime-data impact. The cost is
that it is **actively misleading**: it presents as 60 unrelated compile errors
across six modules plus a runtime crash, so the obvious response is to "fix" the
code — by widening types, casting to `any`, or re-declaring the enums locally.
Any of those would have written a real defect into the repository to satisfy a
stale artefact.

## Affected Areas

`services/api/src/modules/leads`, `partner-experience`, `super-admin`
(`billing`, `commercial-bootstrap`, `markets.catalog`, `origin-channel`,
`platform-lifecycle`), `agent`, and the root/API `package.json` script graph.

## Proposed Resolution

Regenerate the client, apply the pending migrations forward, and add a fast
freshness guard to the two developer paths that lacked one, so the next stale
client announces itself instead of arriving as sixty errors about correct code.
Do not add full regeneration to the watch path; it taxes every reload.

## Acceptance Criteria

- `npm --workspace api run check-types` reports 0 errors. **Met.**
- The API boots without a Prisma enum or delegate failure. **Met.**
- A stale client produces one actionable message, not 60 errors. **Met.**

## Regression Coverage

[REG-048](../qa/regressions/index.md) — `scripts/check-prisma-client-fresh.mjs`,
run automatically before `check-types` and before the dev server starts.
Mutation-tested: deleting the `LeadInquiryIntent` export from the generated
client makes the guard fail and name that enum; restoring it passes.

## Dependencies

None.

## Related Items

[[TASK-0005]] · [[doc-code-drift]]

## Resolution

Fixed 2026-08-17. No application source was changed, because none was wrong.

1. Regenerated the client — 60 errors to 0.
2. Applied the seven pending migrations to the local database with
   `prisma:migrate:deploy` (forward-only).
3. Added `scripts/check-prisma-client-fresh.mjs`, wired as `prestart:dev`,
   `prestart:debug` and `precheck-types` in `services/api`, plus a root
   `check:prisma-client`.

The guard compares what `schema.prisma` **declares** against what the generated
client actually **exports**, rather than comparing files or mtimes. A byte
comparison is useless here because Prisma writes a reformatted copy of the
schema into the client directory, so the two always differ; mtimes are fragile
across checkouts. Symbol reachability is the same question the failure asks, so
it is the question the guard asks:

```
prisma freshness: THE GENERATED CLIENT IS STALE.
  schema.prisma declares symbols the generated client does not export.
  Your source code is almost certainly fine — the client is out of date.
  Missing enums (1):
    - LeadInquiryIntent
  Fix: npm run prisma:generate
```

Regeneration was **not** added to `start:dev` itself: it costs ~20s on every
restart of a watch process, which is a tax on every developer on every reload to
cover a rare event. The check costs about a second and names the fix.

## QA Retest

Verified against the live local PostgreSQL after applying the migrations. Every
one of the eight terminal error groups was queried through the regenerated
client and returned successfully:

```
Lead acquisition columns         OK    market delegate                 OK
Plan commercial columns          OK    marketCountry delegate          OK
PlanPrice commercial columns     OK    Partner.partnershipModel        OK
CustomerAccount.originChannel    OK    ActivityEvent.dedupeKey         OK
LeadInquiryIntent.REQUEST_DEMO = REQUEST_DEMO
```

API boot: `Nest application successfully started`, 1,198 routes mapped, zero
Prisma errors. `prisma migrate status`: *Database schema is up to date.*

## History

- 2026-08-17 — reported from the developer terminal as "60 TypeScript errors and
  a runtime crash"; diagnosed as a stale generated client, fixed, and guarded.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[api-architecture]]
- Regression — REG-048 (see the regression register)

<!-- GRAPH:END -->
