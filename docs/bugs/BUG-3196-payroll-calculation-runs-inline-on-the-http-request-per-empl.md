---
ID: BUG-3196
aliases: [BUG-3196]
Title: Payroll calculation runs inline on the HTTP request, per employee, with no idempotency and no crash recovery
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/payroll]
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3196 — Payroll calculation runs inline on the HTTP request, per employee, with no idempotency and no crash recovery

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** Payroll calculated inline per employee on the HTTP request is a correctness risk under timeout as much as a performance one. Moving it off the request path changes how a run is observed and resumed, so it needs a design.

## Summary

Payroll calculation runs inline on the HTTP request, per employee, with no idempotency and no crash recovery

Identified by the 2026-09-10 full technical audit as RES-02 (confidence: RES-02=CONFIRMED).

## Expected Behavior

the endpoint should enqueue a job (the repository
  already has the pattern: `DataJobWorkerService`, `AttendanceReconciliation
  QueueService`) and return `202` with a run id; the calculation should claim
  the run with a conditional `updateMany` so a second request is a no-op; a
  stale-claim sweep should return abandoned `CALCULATING` runs.

## Actual Behavior

one HTTP request performs the entire payroll
  calculation. For a 500-employee tenant that is well over 5,000 sequential
  database round-trips; at a conservative 10 ms each against Neon that is
  roughly 50–100 seconds of wall clock, holding one pool connection (RES-01) and
  one HTTP socket the whole time. A double-click issues a second calculation
  that calls `clearRunDraftData` and deletes the first run's partial rows out
  from under it. A deploy or OOM mid-run leaves the run permanently
  `CALCULATING` with partial `PayrollRunEmployee` rows.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**RES-02** (`services/api/src/modules/payroll/payroll-run.service.ts`, `payroll-run.controller.ts:169`):

Entry point is a plain synchronous-return controller action, not a queue
  submission — `services/api/src/modules/payroll/payroll-run.controller.ts:169`:
  ```ts
  @Post('runs/:id/calculate')
  @Permissions('payroll-runs.calculate')
  calculatePayrollRun(
  ```
  The guard only rejects three statuses —
  `services/api/src/modules/payroll/payroll-run.service.ts:956-961`:
  ```ts
  if (
    run.status === PayrollRunStatus.APPROVED ||
    run.status === PayrollRunStatus.PAID ||
    run.status === PayrollRunStatus.LOCKED
  ) {
  ```
  `CALCULATING` is **not** in that list, so a second request enters while the
  first is still running.

  The work itself is two sequential per-employee loops with multiple awaited
  round-trips each — `payroll-run.service.ts:1004` and `:1179`:
  ```ts
  for (const employee of employees) {
    const compensation = await this.compensationResolver.resolveActiveCompensation({...});
    ...
    const benefitInputs = await this.benefitsService.resolvePayrollBenefits({...});
    ...
    const compensationRate = await this.exchangeRateService.lockRate({...});
  ```
  and later per employee: `payrollException.create`, `payrollRunEmployee.create`,
  `taxCalculationService.calculateTaxesForPayrollRunEmployee`,
  `includeLoanInputs`.

  State is moved to `CALCULATING` *before* the loop and only reset inside a
  JavaScript `catch` (`payroll-run.service.ts:1678-1698`):
  ```ts
  } catch (error) {
    await this.clearRunDraftData(user.tenantId, id, user.userId);
    await this.prisma.payrollRun.update({ where: { id }, data: { status: PayrollRunStatus.FAILED } });
  ```
  There is no `startedAt`-lease sweep and no reclaim job for `CALCULATING`.

---


Full finding text: RES-02 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

a payroll administrator sees a spinner for minutes and often a proxy
  timeout with no way to tell whether the run completed. A retry corrupts the
  first run's data. A deploy during month-end calculation strands the run with
  no operator recovery. Concurrently, one payroll calculation is enough to
  consume a tenth of the connection pool for the whole run.

## Affected Areas

services/api/src/modules/payroll

## Proposed Resolution

add `CALCULATING` to the rejected-status list in
  `calculateDraftPayrollRun` as an immediate one-line guard against the
  double-click case. Then move the body behind a claimed job row, following
  `DataJobWorkerService.claimNextJob()`, and add a startup/interval sweep that
  fails runs stuck in `CALCULATING` past a lease.

(Difficulty: MEDIUM (guard is LOW; the queue move is MEDIUM); Regression risk: MEDIUM — the frontend currently expects the finished run
  in the response body.; Fix now: YES for the `CALCULATING` guard; LATER for the queue move.)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/payroll/payroll-run.service.ts`, `payroll-run.controller.ts:169` (audit id RES-02).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: RES-02=MEDIUM — the frontend currently expects the finished run
  in the response body.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `RES-02` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/RES.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (RES-02) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[payroll]]

<!-- GRAPH:END -->
