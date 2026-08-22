---
ID: BUG-0282
aliases: [BUG-0282]
Title: The platform runtime schema manifest drifted from schema.prisma and no check noticed
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: QA_RUN
DetectedDate: 2026-08-21
DetectedInSha: cf9ea47
AffectedModules: [packages/config, apps/admin, services/api/prisma]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-178
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/checkout-account-and-payment-confirmation
CreatedAt: 2026-08-21
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-21
---

# BUG-0282 — The platform runtime schema manifest drifted from schema.prisma and no check noticed

## Summary

`packages/config/platform-runtime-schema.generated.json` is generated from
`schema.prisma` and decides which Prisma columns the Platform Admin runtime can
render. It had fallen behind the schema, and nothing detected it: five real
scalar columns existed in the database and could not be displayed, filtered or
edited anywhere in Platform Admin.

## Expected Behavior

Every readable column on a registered runtime model is available to the module
that owns it.

## Actual Behavior

`CustomerAccount.originChannel`, `Partner.partnershipModel`,
`Tenant.readinessStatus`, `Tenant.dataRegion` and `Subscription.scheduledSeats`
— with `scheduledSeatsEffectiveAt`, `Tenant.readyAt` and nine relations — were
absent from the manifest, so the registry could not offer them and the
schema-coverage rule could not miss them.

## Reproduction

1. `node scripts/generate-platform-runtime-schema.mjs`
2. `git diff packages/config/platform-runtime-schema.generated.json` — six
   modules gain fields.

## Evidence

- `originChannel` is declared at `schema.prisma:2587` on `CustomerAccount`,
  indexed at `:2651`, and written by `platform-lifecycle.service.ts:177`. It was
  not in the manifest.
- `.github/workflows/ci.yml` ran `test:runtime-schema` only, which validates the
  **registry against the manifest** — so a stale manifest and a registry built
  from it agree with each other, and the job passes.
- `apps/admin/lib/runtime/platform-module-registry.ts` — `schemaCoverageModules`
  requires every readable field to appear on a record form, and iterates the
  manifest. A column missing from the manifest is missing from the check too.

## Root Cause

A generated artifact with no freshness check.
`scripts/check-prisma-client-fresh.mjs` exists for the generated *client*; the
equivalent for this manifest did not, so the only thing keeping it current was
somebody remembering to run the generator.

The deeper failure is the shape recorded as [[BUG-0221]]: the coverage rule
asserts that every field it knows about is represented, which is trivially true
when the thing defining "every field" is the stale artifact.

## Impact

Operators could not see whether a customer arrived through sales or
self-service, which partnership model a partner holds, whether a tenant is
ready, which region its data is in, or a subscription's scheduled seat change.
Silent, and indistinguishable from those columns not existing.

## Affected Areas

`packages/config`, every `apps/admin` runtime module, CI.

## Proposed Resolution

Regenerate, and give the generator a `--check` mode that regenerates in memory
and compares — one implementation of the derivation rather than a second copy
that can itself drift. Run it in CI ahead of the contract test.

## Acceptance Criteria

- The committed manifest equals what the generator produces from
  `schema.prisma`.
- CI fails, naming the module and the field, when it does not.

## Regression Coverage

`npm run check:runtime-schema`
(`scripts/generate-platform-runtime-schema.mjs --check`), wired into the
`CI required gate` ahead of `test:runtime-schema`. Verified to fail against the
defect: restoring the previous manifest reports
`customers: missing field originChannel` and eleven more, and exits 1.

## Dependencies

None.

## Related Items

[[BUG-0221]] — the same "assertion proves presence, not reachability" shape.
[[BUG-0280]] — `originChannel` is written by that fix and would have stayed
invisible without this one.

## Resolution

Fixed on `agent/checkout-account-and-payment-confirmation`: manifest
regenerated, `--check` added to the generator, `check:runtime-schema` wired into
the CI gate.

## QA Retest

Covered by the CI check; no manual QA run was recorded.

### Verification — 2026-08-22, SESSION-0040

Re-ran the guard this record names, rather than reading a green suite
summary: REG-178 names `scripts/generate-platform-runtime-schema.mjs`, `npm run check:runtime-schema`, `.github/workflows/ci.yml`, and that is what was executed.

```text
node <script>   PASS
npm run check:runtime-schema   PASS
whole-workspace suite for `.github/workflows/ci.yml`   PASS
```

`Status: FIXED` → `VERIFIED`.

## History

- 2026-08-21 — found while asking why `CustomerAccount.originChannel` was absent
  from the Customers module.
