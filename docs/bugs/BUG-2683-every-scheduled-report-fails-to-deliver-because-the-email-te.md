---
ID: BUG-2683
aliases: [BUG-2683]
Title: Every scheduled report fails to deliver because the email template variable tenantName is never passed
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: 4a7c0d4a
AffectedModules: [services/api/src/modules/reporting/schedule]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-386
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt:
---

# BUG-2683 — Every scheduled report fails to deliver because the email template variable tenantName is never passed

## Summary

No scheduled report has ever been delivered. The scheduler runs on time, executes the report under the owner's access and produces the file correctly — then the email fails to render, every time, for every tenant, because the dispatch does not pass a variable the template declares.

Found by scheduling a real report in production and watching it fail, which is the one thing the release's QA run had explicitly not done.

## Expected Behavior

A due schedule produces its file and emails it to each recipient with the file attached.

## Actual Behavior

The run is marked failed with *"The report was produced but could not be delivered to any recipient."* The underlying reason, one level down: `Missing email template variables: tenantName.`

100% failure. Not intermittent, not tenant-specific, not recipient-specific.

## Reproduction

1. Open any report and create a schedule with at least one recipient.
2. Wait for its hour.
3. The Scheduled page shows `Last run: (failed)` with the delivery message.

Production log at the moment of the run:

```
WARN  report.scheduler.delivery_failed schedule=80c665ca… run=aed93bcd…
      recipient=e0302ffb… reason=Missing email template variables: tenantName.
ERROR report.scheduler.failed schedule=80c665ca… run=aed93bcd…
      failures=1 disabled=false
      reason=The report was produced but could not be delivered to any recipient.
```

## Evidence

The system template for `REPORT_SCHEDULE_DELIVERY` declares `tenantName` in `availableVariables` and uses it in the subject line:

```
subjectTemplate: '{{reportName}} - {{tenantName}}'
```

`ReportSchedulerWorker.deliver()` passed `recipientName`, `scheduleName`, `reportName`, `periodLabel`, `format`, `rowCount` and `fileName` — every declared variable except that one.

`EmailTemplateRendererService.render()` treats a declared-but-absent variable as a **hard failure**, not a blank:

```ts
const missingVariables = requiredVariables.filter(
  (variable) => resolveVariable(input.variables, variable) === undefined,
);
if (missingVariables.length > 0) throw new BadRequestException({ … });
```

So omitting a variable does not degrade an email — it stops it.

## Root Cause

The template and the dispatcher are two halves of one contract, written in two files, with the contract asserted in neither. Both halves were individually correct and individually tested: the template renders given its variables, and the worker was tested with a mocked orchestrator that accepted whatever it was handed. Nothing compared them.

`tenantName` is the house convention — `auth`, `user-invitations` and `employee-profiles` all pass it — so this is an omission at one call site rather than a disagreement about design.

A second, latent half of the same bug: `organizationSettings()` returns `companyDisplayName || undefined`, so even once the variable is passed, a tenant that never filled in a display name would still fail. A produced report must not be lost over the text in its own subject line.

## Impact

Every scheduled report, every tenant, since the feature shipped. Users could create schedules, see them listed as Active with a next run time, and receive nothing. The file was generated and stored each time, so the cost was borne and the value was not delivered.

Mitigating: the failure was recorded honestly rather than swallowed. The run row is `FAILED` with the precise reason, the reason is shown on the Scheduled page, the failure streak is counted, and the schedule was not disabled. Someone reading the screen could see it was broken — nobody had looked.

## Affected Areas

`services/api/src/modules/reporting/schedule/report-scheduler.worker.ts`. Delivery only; report execution, authorization-at-execution, artifact production and the run lifecycle were all correct.

## Proposed Resolution

Pass `tenantName`, and give it a fallback so it can never be undefined. No ExecPlan.

## Acceptance Criteria

- A due schedule delivers its file to every recipient.
- A tenant with no configured display name still receives its reports.
- Adding a variable to the template without passing it fails a test rather than production.

## Regression Coverage

REG-386.

## Dependencies

None.

## Related Items

Found during post-deploy validation of [[TASK-0028]], with [[BUG-2647]], [[BUG-2648]] and [[BUG-2657]].

## Resolution

Fixed on `agent/session-redirect-loop`. `deliver()` takes a `tenantName` resolved once per run: the tenant's configured display name, falling back to the tenant's own `name`, then to `DijiPeople` — matching `user-invitations.service.ts`. Settings are now read once per run and shared with the file builder, so the attachment and the email describe the same tenant.

The test asserts the **contract**, not a hand-written list: it reads `availableVariables` off the catalog seed and requires every key to be present in what the worker actually dispatched. A variable added to the template in future fails that test until it is passed.

## QA Retest

Re-scheduled in production after deploy; delivery confirmed to a real inbox.

## History

- 2026-08-31 — found by scheduling a real report in production and watching it fail.
- 2026-08-31 — fixed with a contract test between the dispatcher and the template.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-386 (see the regression register)

<!-- GRAPH:END -->
