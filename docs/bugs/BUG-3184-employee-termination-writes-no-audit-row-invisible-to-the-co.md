---
ID: BUG-3184
aliases: [BUG-3184]
Title: Employee termination writes no audit row, invisible to the coverage spec designed to catch exactly this
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/employees]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-711
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-11-24
ResolvedAt: 2026-11-22
---

# BUG-3184 — Employee termination writes no audit row, invisible to the coverage spec designed to catch exactly this

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Employee termination unaudited, and invisible to the coverage spec that should have caught it. Termination is the single event an auditor asks about first.

## Summary

Employee termination writes no audit row, invisible to the coverage spec designed to catch exactly this

Identified by the 2026-09-10 full technical audit as OBS-15 (confidence: OBS-15=CONFIRMED).

## Expected Behavior

`EMPLOYEE_TERMINATED` with `beforeSnapshot` (`employmentStatus`, `terminationDate`) and `afterSnapshot`, per `AGENTS.md`'s "every state-changing operation that a tenant admin or auditor would need to see".

## Actual Behavior

An employee is terminated and the only durable evidence is `Employee.updatedById` / `terminationDate` on the row itself — which the next update overwrites.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-15** (services/api/src/modules/employees/employees.service.ts):

`services/api/src/modules/employees/employees.service.ts:2045-2071` — the entire method:
```ts
async terminate(tenantId: string, employeeId: string, dto: TerminateEmployeeDto, actorId: string) {
  const employee = await this.employeesRepository.findByIdAndTenant(tenantId, employeeId);
  if (!employee) { throw new NotFoundException('Employee was not found for this tenant.'); }
  const terminationDate = dto.terminationDate ? new Date(dto.terminationDate) : new Date();
  await this.employeesRepository.update(tenantId, employeeId, {
    employmentStatus: EmployeeEmploymentStatus.TERMINATED,
    terminationDate,
    updatedById: actorId,
  });
  return this.findById(tenantId, employeeId);
}
```
No `auditService` call. `rg "EMPLOYEE_TERMINATED" services/api/src` → **zero hits**.
The endpoint is live and separately permissioned — `modules/employees/employees.controller.ts:785-787`:
```ts
@Post(':employeeId/terminate')
@Permissions('employees.terminate')
@RequirePermission(ENTITY_KEYS.EMPLOYEES, 'delete')
```
The guard that exists to make missing audit calls visible structurally cannot see it — `modules/audit/lifecycle-audit-coverage.spec.ts:37-38`:
```ts
const WRITE_METHOD_PATTERN = /^(create|update|delete|assign|submit|cancel|archive|deactivate|provision|import|restore)/;
```
`terminate` matches none of these alternatives, so it is filtered out at `:129` (`.filter((name) => WRITE_METHOD_PATTERN.test(name))`) before the `unclassified` assertion at `:141-154` ever runs.

---


Full finding text: OBS-15 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

terminate() updated the status and wrote no audit row, and the coverage spec pattern could not see a method named terminate.

## Impact

Termination is the most consequential and most litigated event in an HR system. In a wrongful-dismissal dispute the platform cannot say who terminated the employee, when the record was changed, or what the prior state was. The same gap makes a malicious termination unattributable.

## Affected Areas

services/api/src/modules/employees

## Proposed Resolution

Add an `AuditService.log` call in `EmployeesService.terminate` using `AUDIT_ACTIONS`; add `terminate|reinstate|offboard|promote|transfer` to `WRITE_METHOD_PATTERN` in `lifecycle-audit-coverage.spec.ts:37`; and extend that spec so a method listed as `audited` is verified to actually reach `AuditService` (today membership in the `audited` array is an unchecked string claim — `lifecycle-audit-coverage.spec.ts:49-124`).

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/modules/employees/employees.service.ts (audit id OBS-15).

## Regression Coverage

services/api/test/audit-trail-reads.e2e-spec.ts. REG-711, QA-AUDIT-001. Logging a different action fails the control.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-15` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

terminate() logs EMPLOYEE_TERMINATED with before and after snapshots. The coverage spec has a per-service pattern including terminate so the next such method is caught.

Fixed on branch agent/dependency-alert-remediation (SESSION-0137). Premise re-verified against the code before changing it (2026-11-22).

## QA Retest

QA-AUDIT-001 on the isolated database, 2026-11-22: passing with the fix and failing with it removed. Independent review pending.

Independent QA retest 2026-11-24 (SESSION-0137 reconciliation): employees.service.ts logs AUDIT_ACTIONS.EMPLOYEE_TERMINATED; audit-trail-reads e2e asserts exactly one row naming actor with TERMINATED afterSnapshot and none for cross-tenant attempt; 5/5 pass.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-15) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]]
- Regression — REG-711 (see the regression register)

<!-- GRAPH:END -->
- 2026-11-24 — FIXED → VERIFIED by independent QA (SESSION-0137 reconciliation).
