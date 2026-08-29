---
ID: BUG-1976
aliases: [BUG-1976]
Title: Eight settings controls write a key name the resolver never reads
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [services/api/src/modules/tenant-settings, apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
---

# BUG-1976 — Eight settings controls write a key name the resolver never reads

## Summary

Eight tenant settings controls write one key name while the resolver — and, for
six of them, live enforcement code in `employees.service.ts` — reads a different
one. The administrator's change is stored under the dead name and the enforcing
code keeps using the catalog default of the live name. The switch appears to work
and the behaviour never changes. There is no alias map anywhere in the write path
or the resolver, so nothing reconciles the two.

## Expected Behavior

The key a control writes is the key the resolver reads. One name per setting,
with one home, as `AGENTS.md` requires: "Permission keys, entity keys, settings
catalogs, module registries and view definitions each have exactly one home."

## Actual Behavior

The eight pairs, all verified individually at `eb457d9d`
(resolver = `services/api/src/modules/tenant-settings/tenant-settings-resolver.service.ts`,
UI = `apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts` unless
noted):

| # | Category | Resolver reads (live) | UI renders (dead) | Live value consumed at |
|---|---|---|---|---|
| 1 | `employees` | `maxReportingLevels` — resolver `:567` | `maximumReportingLevels` — page-config `:159` | `employees.service.ts:2596, 2605, 2627-2629` |
| 2 | `employees` | `allowSkipLevelApprovals` — resolver `:568-569` | `allowSkipLevelReporting` — page-config `:171` | **nowhere** (see below) |
| 3 | `employees` | `allowEmployeeWithoutManager` — resolver `:573-574` | `allowEmployeeWithoutReportingManager` — page-config `:183` | `employees.service.ts:2708, 2883, 2921` |
| 4 | `employees` | `preventDuplicateByPersonalEmail` — resolver `:577-578` | `preventDuplicatePersonalEmail` — page-config `:208` | `employees.service.ts:821, 2950` |
| 5 | `employees` | `preventDuplicateByPhoneNumber` — resolver `:581-582` | `preventDuplicatePhone` — page-config `:220` | `employees.service.ts:831, 2960` |
| 6 | `employees` | `preventDuplicateByNationalId` — resolver `:585-586` | `preventDuplicateNationalId` — page-config `:226` | `employees.service.ts:841, 2970` |
| 7 | `employees` | `requireWorkLocation` — resolver `:557` | `requirePrimaryWorkLocation` — page-config `:134` | `employees.service.ts:2716, 2892, 2928`; `employee-metadata.adapter.ts` |
| 8 | `organization` | `weekStartsOn` — resolver `:497` | `weekStartDay` — `organization-settings-config.ts:119` | `configuration-resolver.service.ts:59`; `resolved-settings-provider.tsx:150` |

## Reproduction

Code-level, measured at `eb457d9d`. The customer-visible form:

1. Sign in to a tenant workspace and open Settings > Employees > Duplicate
   Prevention.
2. Turn "Prevent duplicate by personal email" **off** — for example to import
   contractors who share a family email address.
3. Save; the screen confirms, and a reload shows it off.
4. Import or create two employees with the same personal email. Every row still
   fails duplicate validation, because `employees.service.ts:821` reads
   `preventDuplicateByPersonalEmail`, which has no control and stays at its
   catalog default `true`.

The same shape applies to "Maximum reporting levels" (enforcement at
`employees.service.ts:2627` still uses 5) and "Require primary work location".

## Evidence

Each pair was checked with word-boundary greps against the resolver and both UI
config files. Two further checks make the finding hard to explain away:

**No alias layer exists.**

```bash
grep -rniE "alias|legacyKey|keyAliases|SETTING_KEY_MAP|normalizeKey|renameKey|synonym" \
  --include=*.ts services/api/src/modules/tenant-settings "apps/web/.../settings/_lib"
```

Three hits, all unrelated (two spec comments about a route alias, one controller
comment). No key-alias map in the write path or the resolver.

**Each dead `employees` name exists in exactly one file in the whole repository.**

```bash
for k in maximumReportingLevels allowSkipLevelReporting allowEmployeeWithoutReportingManager \
         preventDuplicatePersonalEmail preventDuplicatePhone preventDuplicateNationalId \
         requirePrimaryWorkLocation; do
  git grep -ln -w "$k" -- . ':!…/tenant-settings.catalog.ts'
done
# -> every one: apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts
```

One UI file, plus the catalog. No API, no adapter, no spec mentions them. The
write path stores them only because the catalog defines them
(`getAllowedKeysByCategory`, resolver `:1669-1682`).

**Two of the eight are weaker than the other six, and the record should say so:**

- **Pair 2 (`allowSkipLevelApprovals`)** — the "live" half is live only in the
  sense that the resolver exposes it. `git grep -w allowSkipLevelApprovals`
  returns just the resolver and `apps/web/.../settings/types.ts`. **Neither half
  has a consumer**; skip-level approval behaviour is not implemented at all.
  Renaming the UI field would fix nothing.
- **Pair 8 (`weekStartsOn`)** — real but low impact, and needs care: `timesheets.weekStartDay`
  **is** live (`timesheet-generation.service.ts:128`), so a token scan marks the
  name alive; it is `organization.weekStartDay` that is dead. Meanwhile
  `organization.weekStartsOn` is itself shadowed —
  `configuration-resolver.service.ts:59` reads
  `system.defaultWeekStartDay || organization.weekStartsOn`, and
  `defaultWeekStartDay` resolves through `stringValue(category.defaultWeekStartDay, 'MONDAY')`
  (resolver `:1377`) so it is never falsy. A working control does exist —
  `system.defaultWeekStartDay` at `settings-page-config.ts:3531` — on a different
  page.

**A ninth pair was claimed by an earlier analysis and is dropped here.**
`timesheets.requireMonthlySubmission` / `requireMONTHLYSubmission` is reconciled
in the resolver (`:913-914` reads both with `??`, `:933-934` echoes both) and the
UI renders the live half (`settings-page-config.ts:583`). It is not a defect. The
defensible count is **eight**.

Line-number corrections against that earlier analysis, recorded so the next reader
does not re-derive them: `allowEmployeeWithoutReportingManager` is at page-config
`:183` (not `:181`), `preventDuplicatePhone` at `:220` (not `~:218`), and
`preventDuplicateNationalId` at `:226`.

## Root Cause

Not established. The names differ in every row and no rename shim exists, so the
UI and the resolver were evidently written against different vocabularies for the
same settings.

## Impact

Worse than an inert control, because six of the eight have **live enforcement**
under the other name. An administrator who switches duplicate prevention off
still gets it enforced; an administrator who believes they have switched
something on gets no protection. Both are silent, and both are reachable in
production on every tenant.

Rated HIGH: it is a settings contract break with active enforcement on the other
side of it, affecting employee creation and import — a primary journey — with no
signal to the user.

## Affected Areas

`apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts` and
`organization-settings-config.ts`;
`services/api/src/modules/tenant-settings/tenant-settings-resolver.service.ts`
and `tenant-settings.catalog.ts`; `services/api/src/modules/employees`
(`employees.service.ts`, `employee-metadata.adapter.ts`);
`configuration-resolver.service.ts` and `resolved-settings-provider.tsx` for
pair 8.

## Proposed Resolution

Point each control at the key its reader uses — that is six straightforward
corrections. Handle the two exceptions on their own terms: pair 2 is an
unimplemented feature masquerading as a naming bug and should be recorded as
such; pair 8 needs the `organization` / `system` week-start precedence decided
before either control is trusted.

Existing stored values under the dead names need a migration decision: they are
the administrator's expressed intent and silently discarding them would change
behaviour on the tenants that set them.

The durable fix is a check that every editable UI field's `(category, key)` pair
exists in the catalog **and** has a production reader — the same check BUG-1974
argues for.

## Acceptance Criteria

- Each of the six enforceable controls writes the key its enforcement reads, and
  turning it off changes behaviour.
- Values already stored under a dead name are migrated or an explicit decision not
  to migrate is recorded.
- Pair 2 is filed as unimplemented behaviour rather than fixed as a rename.
- Pair 8's precedence between `system.defaultWeekStartDay` and
  `organization.weekStartsOn` is decided and only one control is offered.

## Regression Coverage

None yet. A test asserting every editable UI field's key has a reader would fail
today on all eight.

## Dependencies

None identified.

## Related Items

BUG-1974 (246 dead catalog keys) is the wider scan that surfaced these; the two
are distinct — there the key has no reader at all, here a reader exists under
another name. BUG-1978 covers two UI fields that are not catalog keys at all.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; each pair verified individually, and a ninth previously-claimed pair dropped as reconciled.
- 2026-08-29 — triaged by the Architect for SESSION-0070: ArchitectDisposition FIX_NOW — pure rename; each pair is a two-line fix.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]], [[tenant-application]]

<!-- GRAPH:END -->
