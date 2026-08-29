---
ID: BUG-2010
aliases: [BUG-2010]
Title: The dashboard Recent changes list renders unformatted ISO-8601 timestamps
Status: FIXED
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-342
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2010 — The dashboard Recent changes list renders unformatted ISO-8601 timestamps

## Summary

The Recent changes list on the tenant dashboard prints raw ISO-8601 strings in
its Date column — `2026-08-29T00:37:42.741Z` — while every other surface in the
product renders the tenant's configured format, `08/27/2026`. The tenant has
`dateFormat: "MM/dd/yyyy"`, `timeFormat: "12h"` and `timezone: "UTC"` configured;
this widget consults none of them.

## Expected Behavior

The Date column renders in the tenant's configured date and time format and
timezone, as the rest of the product does.

## Actual Behavior

```
TYPE Timesheet  LABEL DRAFT                               DATE 2026-08-29T00:37:42.741Z
TYPE Employee   LABEL EMPLOYEE_SYSTEM_ACCESS_PROVISIONED  DATE 2026-08-29T00:27:5…
```

The column is also truncated mid-string, which is a symptom of the same thing: a
39-character machine timestamp does not fit a column sized for a formatted date.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29.

1. Sign in to the tenant workspace as an administrator, on a tenant with recent
   activity.
2. Open the dashboard and read **Recent activity > Recent changes**.
3. The Date column shows raw ISO-8601 strings.
4. For contrast, open `/leaves` or `/attendance`: dates there render as
   `08/27/2026`, per the tenant's `organization` settings.

## Evidence

The rendered rows above, observed live on the production demo tenant.

The tenant's configured formatting, from `GET /api/tenant-settings/resolved`:

```
dateFormat   : "MM/dd/yyyy"
timeFormat   : "12h"
timezone     : "UTC"
weekStartsOn : "MONDAY"
```

so the settings this widget should be reading exist and are populated.

This is consistent with the settings review conducted in the same session, which
found the repository's "no direct `Intl`" convention is enforced by nothing and
counted roughly 51 direct-formatting violations across 30 files. This widget is
one visible instance of that; the count itself is that review's finding, not this
record's, and is repeated here only as context for scoping the fix.

No file:line evidence was collected for the Recent changes component.

## Root Cause

Not established. Observably, the component renders the timestamp it receives
without passing it through the tenant formatting helpers the rest of the product
uses.

## Impact

Cosmetic, on the landing screen. A customer sees a machine timestamp in an
otherwise formatted table, truncated because it does not fit. Nothing is wrong
and nothing is lost.

It matters slightly more than an isolated cosmetic defect because it is on the
first screen a prospect sees during a demonstration, and because it is one
instance of a convention the repository states and does not enforce — so the same
defect will keep appearing until the convention has a check behind it.

Rated LOW: cosmetic, single widget, no functional consequence.

## Affected Areas

The dashboard Recent changes component in `apps/web`; more broadly, the
unenforced direct-formatting convention across the tenant app.

## Proposed Resolution

Render the Date column through the tenant formatting helpers, as the rest of the
product does.

Separately, and worth more than this fix: give the "no direct `Intl`, no direct
`toLocaleDateString`" convention a lint rule or a repository check, so the next
instance fails before it ships rather than being found by a QA pass. That is
scoping work beyond this record and should be raised on its own if it is wanted.

## Acceptance Criteria

- The Recent changes Date column renders in the tenant's configured date and time
  format and timezone.
- The column is not truncated at its default width.

## Dependencies

None identified.

## Related Items

BUG-2009 covers the other defect in the same widget — the raw enum constants in
the Label column — and is a label-resolution problem rather than a formatting
one, which is why the two are separate records despite appearing side by side.

## Resolution

Found: `apps/web/app/components/dashboard/dashboard-widget-renderer.tsx`,
`formatValue`. The Recent changes widget already recognised an ISO timestamp
(`ISO_TIMESTAMP` regex) and formatted it — so the literal raw-string symptom
quoted in this record's Actual Behavior may already have looked different by
the time of a re-run — but it did so with
`Date.prototype.toLocaleString(undefined, {...})`: the visiting **browser's**
locale and local timezone, not the tenant's. A tenant configured for
`MM/dd/yyyy`, 12h, UTC got whatever locale the browser happened to report,
which is the exact violation `AGENTS.md` names ("Never call
`toLocaleDateString` ad hoc").

Replaced both branches (timestamp and date-only) with `formatDateTime` /
`formatDate` from `lib/formatting-context.ts` — the same helpers
`runtime-value-formatter.ts` and the rest of the product already use.
Deliberately called with **no explicit context argument**: both functions fall
back to a module-level `runtimeDefaultContext` that
`app/(authenticated)/_components/resolved-settings-provider.tsx` installs for
the whole authenticated shell from the tenant's resolved settings, so no prop
needed to be threaded through `DashboardWidgetRenderer` to reach it.

The truncation named in Acceptance Criteria ("the column is not truncated at
its default width") was a symptom of the 39-character raw string, not a
separate defect — a formatted date such as "Aug 29, 2026, 04:37 PM" is short
enough that no column width change was needed; not independently verified in
a browser.

This shares a commit with BUG-2009 (surface 3, the same widget's Label
column): both are fixes to the same `formatValue` function in the same file,
found while investigating this record.

## Regression Coverage

REG-342.
`apps/web/app/components/dashboard/dashboard-widget-formatting.spec.ts`
exports `formatValue` for direct testing (no jsdom in this app) and asserts,
with `setDefaultFormattingContext` set to representative tenant configurations:
an ISO timestamp formats to the configured `MM/dd/yyyy` + 12h shape and
contains no `T`; a different configuration (`dd/MM/yyyy`, 24h) produces a
different, correctly-ordered result over the *same* input, proving the tenant
configuration is actually read rather than a lucky default; a date-only ISO
string formats through the same path.

Mutation-tested: reverting the timestamp branch to
`parsed.toLocaleString(undefined, {...})` fails both the `MM/dd/yyyy` and
`dd/MM/yyyy` format assertions (3 of 6 tests in the file, including the two
enum ones from BUG-2009 sharing the file); reverted immediately after
confirming.

## QA Retest

Not retested live against a running tenant. Verified from source and by the
spec above with two different tenant configurations over the same raw input,
which is closer evidence than a single-tenant screenshot would have been for
whether the fix reads configuration rather than coincidentally matching one
tenant's format.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW.
- 2026-08-30 — resolved: `formatValue` was already recognising ISO timestamps but formatting them with the browser's locale via `toLocaleString(undefined, ...)` rather than the tenant's configured format; replaced with `formatDateTime`/`formatDate` reading the shell-wide resolved-settings context. Landed in the same commit as BUG-2009 (same function, same file). Closed FIXED under REG-342.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
