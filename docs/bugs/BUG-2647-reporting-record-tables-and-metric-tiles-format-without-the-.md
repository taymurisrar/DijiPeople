---
ID: BUG-2647
aliases: [BUG-2647]
Title: Reporting record tables and metric tiles format without the tenant context, causing a hydration mismatch
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: e5258e80
AffectedModules: [apps/web/app/(authenticated)/reports, apps/web/app/components/charts]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-384
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt:
---

# BUG-2647 — Reporting record tables and metric tiles format without the tenant context, causing a hydration mismatch

## Summary

Every date in a reporting records table rendered one way on the server and another in the browser. The server produced `Mar 10, 2025`; the client produced the tenant's configured `03/10/2025`. React detected the disagreement during hydration, reported error #418, discarded the rendered tree and re-rendered the table on the client. The visible result was correct, which is exactly why this survived local QA.

## Expected Behavior

Server and client render identical text, so hydration is silent and React keeps the server-rendered DOM.

## Actual Behavior

`Minified React error #418` on every report runner page in production, with the table thrown away and rebuilt client-side.

## Reproduction

1. Sign in and open `/reports/library?target=std:workforce.directory` on a tenant whose date format is not the fallback.
2. Observe `Minified React error #418; visit https://react.dev/errors/418?args[]=text` in the console.
3. Fetch the same URL's server HTML and compare against the hydrated DOM.

## Evidence

Server HTML versus hydrated DOM for the same request, production `cace6cdb`:

```
server HTML   ">Mar 10, 2025<"  ">Apr 22, 2024<"  ">Jan 9, 2023<"   (0 slash-formatted dates)
client DOM    "03/10/2025"      "04/22/2024"      "01/09/2023"
```

The period label above the table rendered `08/02/2026 - 08/31/2026` on **both** sides — that component was already passing the context, which is what narrowed this to the table cells.

## Root Cause

`formatRecordCell` and `formatReportValue` both accept an optional formatting `context`; `report-records-table.tsx` and `metric-tile.tsx` called them without one. With no context the formatters fall back to a module-level default — and that default is installed by an effect in `SystemPreferencesProvider`. Effects do not run during server rendering, so the server formatted with the built-in fallback while the client, whose effect had already run, formatted with the tenant's settings.

The same omission existed in every chart component: `chart-format.ts` accepts and forwards a `context`, and not one of its seven callers supplied it.

This is the same defect class fixed earlier in this task for eight other components. It was missed here because the earlier sweep fixed the components that formatted a date *directly* and did not follow the value into the shared cell and chart formatters.

## Impact

Present on every report runner page and every analytics surface, for every tenant whose formatting differs from the fallback. React recovers by re-rendering, so the data shown is correct and no number is wrong — the costs are a discarded server render on each page load and an error in the console. The reason it still matters: this is the identical mechanism that, in a component with a different error boundary earlier in this task, put an "Unexpected error" dialog over a page that was working.

## Affected Areas

`apps/web/app/(authenticated)/reports/_components/report-records-table.tsx`, `metric-tile.tsx`, and `apps/web/app/components/charts/{area,bar,chart-frame,donut,funnel,horizontal-bar-list,line}-chart.tsx`.

## Proposed Resolution

Read the tenant context during render via `useFormattingContext()` and pass it to every formatter call. Not by making the module default work on the server: a module-level mutable default is shared between concurrent requests on a Node server, so on a multi-tenant deployment it could leak one tenant's formatting into another's response. Explicit threading is the correct architecture, and the module default is a client-only convenience.

## Acceptance Criteria

- No React #418 in the console on any reporting page.
- Server HTML and hydrated DOM render dates identically in the tenant's format.
- A tenant with a non-default number or currency format sees the same values before and after hydration.

## Regression Coverage

REG-384.

## Dependencies

None.

## Related Items

Found during post-deploy validation of [[TASK-0028]], alongside [[BUG-2648]]. Same class as the in-task hydration defect recorded in the QA run, and related to [[BUG-2626]].

## Resolution

Fixed on `agent/reports-analytics-platform-fixes`. `useFormattingContext()` threaded into the records table, the metric tile and all seven chart components; `chart-frame`'s `buildTable` takes the context as a parameter because it is a module-level function rather than a component.

## QA Retest

Post-deploy validation of the fix, in production, comparing server HTML against the hydrated DOM.

## History

- 2026-08-31 — created from post-deploy validation at `cace6cdb`.
- 2026-08-31 — fixed and verified in production.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-384 (see the regression register)

<!-- GRAPH:END -->
