---
ID: BUG-0068
aliases: [BUG-0068]
Title: Prisma client freshness check is blind to field-level drift
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INFRA
Source: USER_REPORT
DetectedDate: 2026-08-18
DetectedInSha: 304bfda
AffectedModules: [scripts, services/api]
OwnerAgent: backend-api
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-063
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/prisma-freshness-fields
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0068 — Prisma client freshness check is blind to field-level drift

## Summary

`scripts/check-prisma-client-fresh.mjs` exists to stop a stale generated Prisma
client from surfacing as a wall of TypeScript errors that all point at
application code which is not wrong (BUG-0060). It checked two things: that
every declared enum is exported, and that every declared model has a delegate.

It never checked **fields**. Adding a scalar column to a model that already
exists changes neither of those, so the guard reported healthy while the client
was a field behind — which is the most common schema change there is.

## Expected Behavior

A generated client missing anything `schema.prisma` declares — enum, model or
field — fails the check with the missing symbol named and
`npm run prisma:generate` as the remedy.

## Actual Behavior

```
prisma freshness: OK — 267 enums reachable on the generated client.
```

…printed against a client with no `ApplicationRelease.checksumSha512`, while
`tsc` reported 8 errors on that exact property. The guard said the environment
was fine at the same moment it was failing in the way the guard was written to
prevent.

## Reproduction

1. Add a scalar field to an existing model in `services/api/prisma/schema.prisma`.
2. Do **not** run `npm run prisma:generate`.
3. Run `node scripts/check-prisma-client-fresh.mjs`.
4. Before the fix: exits 0, prints OK. After: exits 1 and names the field.

## Evidence

Reported by the user as 8 compilation errors after pulling `develop`:

```
src/modules/app-releases/release-publisher.service.ts:231:11 - error TS2561:
  'checksumSha512' does not exist in type '…ApplicationReleaseCreateInput…'.
  Did you mean to write 'checksumSha256'?
src/modules/app-releases/update-feed.service.ts:103:28 - error TS2551:
  Property 'checksumSha512' does not exist on type '{ … }'.
Found 8 errors.
```

Source of truth was correct throughout — `schema.prisma:12053` declares the
field and migration `20260818090000_application_release_sha512` exists — and
`prisma migrate status` reported the database up to date. Only the generated
artifact was behind, and only the guard failed to say so.

Mutation test of the fix, adding a field to the schema alone:

```
Missing fields (1):
    - ApplicationRelease.checksumSha999Probe
exit code 1
```

and, with the schema restored, exit code 0.

## Root Cause

`scripts/check-prisma-client-fresh.mjs` compared two symbol sets and neither
carried field information:

- `declaredEnums` against `client[name]`
- `declaredModels` against `instance[delegate(name)]`

`prisma.applicationRelease` resolves whether or not the model has gained a
column, so the delegate probe cannot see field drift by construction.

A second, quieter weakness sat alongside it: the model check only ran when
`DATABASE_URL` was set, because it constructed a `PrismaClient`. On a dev boot
without a datasource — which is when this check matters most — only the enum
check ran at all.

## Impact

Every developer pulling a branch that adds a column. The failure is expensive
out of proportion to its cause: the errors name application code, the source is
correct, CI is green because CI regenerates the client, and the natural reading
is that the branch is broken. BUG-0060 documented that this costs roughly an
hour of misdirected debugging, and this is the second occurrence.

## Affected Areas

`scripts/check-prisma-client-fresh.mjs`, consumed by `prestart:dev`,
`prestart:debug` and `precheck-types` in `services/api/package.json`.

## Proposed Resolution

Compare fields as well, sourced from `Prisma.dmmf` — generated data on the
client that needs no database and no constructed instance. That also removes
the `DATABASE_URL` dependency, so models are now checked on every dev boot
rather than only when a datasource happens to be configured.

## Acceptance Criteria

1. A field present in `schema.prisma` and absent from the generated client
   fails the check and is named in the output.
2. The check runs its full comparison without `DATABASE_URL`.
3. A current client still passes, and the summary states how many fields were
   compared so the scope is visible rather than assumed.

## Regression Coverage

REG-063. The check is its own regression test: it runs from `prestart:dev`,
`prestart:debug` and `precheck-types`, and was mutation-tested by adding a
schema-only field and confirming exit 1 with the field named.

## Dependencies

None. Extends the guard added for
[[BUG-0060-stale-generated-prisma-client-breaks-local-api-development]].

## Related Items

[[BUG-0060-stale-generated-prisma-client-breaks-local-api-development]]

## Resolution

`check-prisma-client-fresh.mjs` now reads `Prisma.dmmf.datamodel.models` and
compares every field declared in each `model` block against the generated
client, alongside the existing enum check. Output reports the scope it actually
covered:

```
prisma freshness: OK — 267 enums, 292 models, 6917 fields reachable on the generated client.
```

When the DMMF is unavailable — a client old enough not to ship one — it falls
back to the previous delegate probe rather than silently checking less.

## QA Retest

The reported errors are resolved: `npm --workspace api run check-types` exits 0
after `npm run prisma:generate`, with all 8 TypeScript errors gone. The guard
was mutation-tested in both directions as shown in Evidence.

## History

- 2026-08-18 — reported by the user as 8 compilation errors; diagnosed as a
  stale client that the freshness guard failed to detect. Fixed and verified.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[api-architecture]]
- Regression — REG-063 (see the regression register)

<!-- GRAPH:END -->
