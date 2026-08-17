---
ID: BUG-0052
aliases: [BUG-0052]
Title: Production dependency graph carries critical and high security advisories
Status: OPEN
Severity: HIGH
Priority: P0
Type: SECURITY
Source: ARCHITECT
DetectedDate: 2026-08-17
DetectedInSha: 0051180
AffectedModules: [package-lock.json, apps/agent-desktop, apps/web, apps/admin, apps/landing, services/api]
OwnerAgent: integration
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0052 — Production dependency graph carries critical and high security advisories

## Summary

`npm audit --omit=dev` reports 17 production dependency advisories: 1 critical,
14 high and 2 moderate. Direct affected packages include `active-win`, `next`,
`postcss`, `xlsx` and `exceljs`; the critical `tar` advisory arrives through the
desktop agent's direct `active-win` dependency.

## Expected Behavior

Production application and installer dependency graphs contain no technically
resolvable critical/high advisory without an explicit, evidence-backed risk
disposition.

## Actual Behavior

The locked graph contains a critical transitive `tar` issue, high advisories in
direct `active-win`, `next`, `postcss` and `xlsx`, and multiple high transitives.
`xlsx` has no automated fix; `active-win` requires a major downgrade according
to npm; Next/Electron have non-major fixes available.

## Reproduction

1. Install exactly from `package-lock.json` with `npm ci`.
2. Run `npm audit --omit=dev --json`.
3. Observe `{moderate:2, high:14, critical:1, total:17}`.

## Evidence

Audit at `0051180` names: `tar` critical; `active-win`, `next`, `postcss`,
`xlsx`, `@mapbox/node-pre-gyp`, `brace-expansion`, `cacache`, `fast-uri`,
`ip-address`, `js-yaml`, `make-fetch-happen`, `nanoid`, `node-gyp`, `sharp` high;
`exceljs` and `uuid` moderate. `active-win`, `next`, `postcss`, `xlsx` and
`exceljs` are direct dependencies in workspace manifests.

## Root Cause

The lockfile has not been reconciled against the current advisory database, and
some production packages depend on abandoned or lagging transitive toolchains.

## Impact

Reachability varies by package and must be verified, but a critical advisory in
the desktop production graph and high direct web/server advisories are not safe
to ignore. Severity is HIGH pending exploit-path analysis rather than inflated
to CRITICAL from the registry label alone.

## Affected Areas

Desktop packaging/runtime, Next.js applications, spreadsheet import/export and
the shared npm lockfile.

## Proposed Resolution

Take the `workspace` lease. Apply compatible direct fixes first, rebuild and
test every affected workspace, inspect `active-win` and `xlsx` replacement or
containment separately, and rerun both full and production-only audit. Do not
run `npm audit fix --force` or accept breaking downgrades blindly.

## Acceptance Criteria

- Technically safe critical/high fixes are applied and verified per workspace.
- Remaining advisories have package path, runtime reachability, compensating
  control and revalidation trigger documented.
- Desktop build and relevant app/API tests pass on Node 22.
- `package-lock.json` is the only dependency source of truth changed.

## Regression Coverage

Add a deterministic audit policy/allowlist check only after reachability and
upgrade behavior are understood; no blanket zero-advisory gate on noisy dev deps.

## Dependencies

Requires the exclusive `workspace` lease and Node 22 validation. Some packages
may require architecture decisions if no maintained safe version exists.

## Related Items

[[desktop-agent]] · [[deployment-architecture]] · [[TASK-0005]]

## Resolution

Not fixed.

## QA Retest

Pending.

## History

- 2026-08-17 — discovered after a clean locked install for TASK-0005.
