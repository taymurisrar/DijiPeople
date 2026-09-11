---
ID: BUG-3172
aliases: [BUG-3172]
Title: GET /payslips has no pagination and can return every payslip the tenant has ever generated
Status: OPEN
Severity: HIGH
Priority: P1
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/payslips]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-10
ResolvedAt:
---

# BUG-3172 — GET /payslips has no pagination and can return every payslip the tenant has ever generated

## Summary

GET /payslips has no pagination and can return every payslip the tenant has ever generated

Identified by the 2026-09-10 full technical audit as DBQ-07 (confidence: DBQ-07=CONFIRMED).

## Expected Behavior

`page`/`pageSize` fields with the same `@Max()`
  discipline every other list DTO in the codebase already has, and `select`
  instead of the deep `include` for the list view (a payslip list screen does
  not need `payrollRunEmployee` in full or the nested calendar chain — those
  belong on the single-payslip detail call, which already exists separately at
  `payslips.controller.ts:78+`).

## Actual Behavior

A caller with `payslips.read-all` who does not pass
  `employeeId`, `payrollRunId` or `status` — which the DTO permits, since all
  three are optional — receives every payslip the tenant has ever generated,
  each with its full join tree, in one response. For a 500-employee tenant
  running monthly payroll for three years that is 18,000 rows, each expanding
  through 4 joined tables.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**DBQ-07** (`services/api/src/modules/payslips/payslips.controller.ts`,
  `payslips.service.ts`, `payslips/dto/payslip-query.dto.ts`):

`payslip-query.dto.ts` (whole file):
  ```ts
  export class PayslipQueryDto {
    @IsOptional() @IsUUID() employeeId?: string;
    @IsOptional() @IsUUID() payrollRunId?: string;
    @IsOptional() @IsEnum(PayslipStatus) status?: PayslipStatus;
  }
  ```
  No `page`/`pageSize` field of any kind — unlike the 16 other query DTOs in
  this sweep that declare `pageSize`, every one of which also declares
  `@Max(...)` on it (see DBQ-09's healthy note).
  `payslips.controller.ts:64-75`:
  ```ts
  @Get('payslips')
  @Permissions('payslips.read-all')
  listPayslips(@CurrentUser() user, @Query() query: PayslipQueryDto) {
    return this.payslipsService.listPayslips({ tenantId: user.tenantId, ...query });
  }
  ```
  `payslips.service.ts:298-315`:
  ```ts
  async listPayslips(params: { tenantId; employeeId?; payrollRunId?; status? }) {
    const payslips = await this.prisma.payslip.findMany({
      where: { tenantId: params.tenantId, ...(employeeId?{}:{}), ...(payrollRunId?{}:{}), ...(status?{}:{}) },
      include: payslipInclude,
      orderBy: [{ createdAt: 'desc' }],
    });
    return payslips.map(mapPayslip);
  }
  ```
  `payslipInclude` (`payslips.service.ts:26-55+`) pulls `employee` (select),
  `payrollRun` → `payrollPeriod` → `payrollCalendar` (three nested `include`
  levels), `payrollRunEmployee` (whole row), and `lineItems` → `payComponent`
  (select) — one join fan-out per payslip.

---


Full finding text: DBQ-07 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Unbounded response size and Prisma join cost that grows without
  limit as a tenant's payroll history accumulates — this is the same failure
  shape RES-15 already flags for payslip *numbering* (up to 101 queries per
  employee, inline), on the read side instead of the write side, and it is
  reachable by any caller who simply omits the optional filters, not only by
  an edge case.

## Affected Areas

services/api/src/modules/payslips

## Proposed Resolution

Add `page`/`pageSize` (with `@Max`) to `PayslipQueryDto`,
  thread them into the `findMany` as `skip`/`take` plus a `payslip.count()`
  for `total`, and replace `payslipInclude`'s deep `include` with a `select`
  for the list endpoint specifically, keeping the full include for the
  single-record detail call.

(Difficulty: LOW; Regression risk: LOW — existing callers that already pass `employeeId`
  (the common case: an employee viewing their own payslips) are unaffected;
  this closes the unfiltered/unbounded case.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/payslips/payslips.controller.ts`,
  `payslips.service.ts`, `payslips/dto/payslip-query.dto.ts` (audit id DBQ-07).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: DBQ-07=LOW — existing callers that already pass `employeeId`
  (the common case: an employee viewing their own payslips) are unaffected;
  this closes the unfiltered/unbounded case.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `DBQ-07` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/DBQ.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (DBQ-07) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
