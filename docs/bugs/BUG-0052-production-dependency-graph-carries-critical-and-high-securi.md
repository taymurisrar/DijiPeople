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
RelatedImplementation: TASK-0010
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-20
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

Partially fixed 2026-08-17. Production advisories went **20 → 12**; every
technically safe fix has been applied, and the four groups that remain are
documented below because npm's proposed fix costs more than the advisory.

**Applied — 8 advisories cleared, no breaking change**

1. `npm audit fix --omit=dev` (never `--force`): cleared `brace-expansion`,
   `fast-uri`, `ip-address`, `js-yaml` and `nanoid`. Lockfile only.
2. Next.js `16.2.0 → 16.3.1` across `web`, `admin`, `landing` **and `docs`**:
   cleared `next`, `postcss` and `sharp`. Patch-level inside 16.x, not a major.

   `apps/docs` is why this needed a second pass. The three real apps were bumped
   first and took 16.3.1 into their own `node_modules`, but the audit still
   reported `next` — because `apps/docs`, the effectively unused starter, pinned
   `16.2.0` exactly and kept the vulnerable copy hoisted at the root. An unused
   workspace was holding the advisory open for the whole repository.

**Not applied — and why**

| Group | Advisories | npm's fix | Why not |
|---|---|---|---|
| `prisma`, `@prisma/config`, `deepmerge-ts` | 3 high | `prisma@6.12.0` | A **downgrade from 7.9.1**. The data layer is Prisma 7 with `@prisma/adapter-pg` driver adapters, which 6.x does not support. It is also a `devDependency` — the CLI, not shipped runtime code. This "fix" would break every query in the product to silence a build-tool advisory. |
| `active-win`, `tar` (critical), `cacache`, `make-fetch-happen`, `node-gyp`, `@mapbox/node-pre-gyp` | 1 critical, 5 high | `active-win@7.7.2` | A **major downgrade** of a direct dependency. `active-win` is reached only from `apps/agent-desktop/src/main/activity-tracker.ts` in the Electron main process, and the `tar`/`node-gyp` chain beneath it is install-time native-build tooling that does not ship in the packaged app. |
| `xlsx` | 1 high | none exists | ~~Reached only from `services/api/src/common/excel/excel-export.service.ts` — **export**, so it writes workbooks rather than parsing untrusted ones. The advisory class is parse-side.~~ **This reachability finding was wrong. Superseded by the 2026-08-20 correction below — do not act on this row.** |
| `exceljs`, `uuid` | 2 moderate | `exceljs@3.4.0` | A **major downgrade** from 4.4.0, `uuid` transitive through it. Moderate severity does not justify losing four majors of the library the `xlsx` containment would migrate *toward*. |

**Compensating controls and revalidation.** None of the twelve is reachable from
an unauthenticated tenant request path: three are build tooling, six are behind
the desktop agent's main process, one is export-only, two are moderate and
transitive. Revalidation trigger: re-run `npm audit --omit=dev` when
`active-win`, `xlsx` or `exceljs` publishes a new major, or when the desktop
agent is next packaged.

The two decisions left — replacing or containing `active-win`, and migrating the
`xlsx` export path onto `exceljs` — are dependency-replacement projects with
their own testing surface, not audit hygiene. They are carried by [[ITEM-0048]].

## Correction — 2026-08-20, TASK-0010

**The `xlsx` row above was wrong, and the disposition rested on it.**

The 2026-08-17 analysis said the package was "export, so it writes workbooks
rather than parsing untrusted ones". The file it named,
`services/api/src/common/excel/excel-export.service.ts`, contained *both*
directions: `buildWorkbookBuffer` wrote, and `parseFirstWorksheet` called
`XLSX.read` on an uploaded buffer. The reachability check looked at the file's
name and its principal purpose rather than at its call sites.

`parseFirstWorksheet` was reachable from two authenticated upload endpoints:

- `services/api/src/modules/payroll/payroll-operations.service.ts` — payment
  result import;
- `services/api/src/modules/timesheets/timesheets.service.ts` — timesheet
  import.

Both take a file from a tenant user. Both advisories — prototype pollution
(GHSA-4r6h-8v6p-xvw6) and ReDoS (GHSA-5pgg-2g8v-p4x9) — are triggered by
*parsing* a crafted workbook. So the one class of input the disposition assumed
could not happen was exactly what those two endpoints accept.

Authentication is a real mitigation and it is why this is not a critical: an
attacker needs a tenant account with payroll or timesheet import rights. It is
not a reason to ship it, because a tenant user is not a trusted party in a
multi-tenant product, and prototype pollution in a shared Node process is not
confined to the tenant who triggered it.

### What changed

`parseFirstWorksheet` now parses with **ExcelJS**, which is maintained, was
already a dependency, and was already used for exactly this job in
`import-analysis.service.ts`. There is no longer any `XLSX.read` call site
anywhere in the repository — verified by search across `services`, `apps`,
`packages` and `scripts`.

Writing still uses SheetJS. That direction consumes only data this application
produced, and neither advisory applies to it.

### What that leaves

`npm audit --omit=dev` in `services/api` still reports the two `xlsx` highs,
because the package is still installed for the write path. They are now
**present but unreachable** rather than accepted-as-reachable, which is a
different statement and a much cheaper one to defend at the next release.

Dropping the dependency entirely means moving the writer to ExcelJS too. That
was deliberately **not** done here: payroll exports are consumed by banks, and
changing the bytes of a produced workbook immediately before a production
release is a customer-visible risk with no security payoff. Carried by
[[ITEM-0070]].

### The lesson

A reachability claim about a package must name the **call sites**, not the file.
This one named a file whose name described half of what it did. Recorded as the
`reachability-asserted-from-file-purpose` variant of `assertion-without-a-check`.


## QA Retest

Pass for what was applied. On Node 22, after the upgrade:

```text
apps/web      17 suites, 391 tests   PASS   check-types PASS
apps/admin    10 suites,  95 tests   PASS   check-types PASS
apps/landing   3 suites,  49 tests   PASS   check-types PASS
```

`npm audit --omit=dev`: `{critical: 1, high: 9, moderate: 2, total: 12}`, from
`{critical: 1, high: 17, moderate: 2, total: 20}`.

## History

- 2026-08-17 — 8 of 20 advisories cleared without a breaking change; the
  remaining 12 documented with package path, reachability, compensating control
  and revalidation trigger. Replacement work split to ITEM-0048.
- 2026-08-20 — the `xlsx` reachability finding was found to be wrong during
  TASK-0010 release verification. The parse path moved to ExcelJS; the two
  advisories are now unreachable rather than accepted.
- 2026-08-17 — discovered after a clean locked install for TASK-0005.
