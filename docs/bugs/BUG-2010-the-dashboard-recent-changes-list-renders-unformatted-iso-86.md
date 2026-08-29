---
ID: BUG-2010
aliases: [BUG-2010]
Title: The dashboard Recent changes list renders unformatted ISO-8601 timestamps
Status: OPEN
Severity: LOW
Priority: P3
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
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

## Regression Coverage

None yet, and a rendering assertion is not currently possible in `apps/web` (no
jsdom). If the fix introduces or reuses a formatting helper, that helper's
behaviour is testable as pure logic.

## Dependencies

None identified.

## Related Items

BUG-2009 covers the other defect in the same widget — the raw enum constants in
the Label column — and is a label-resolution problem rather than a formatting
one, which is why the two are separate records despite appearing side by side.

## Resolution

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`. Disposition FIX_NOW.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
