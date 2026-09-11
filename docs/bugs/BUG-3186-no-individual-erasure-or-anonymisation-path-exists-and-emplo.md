---
ID: BUG-3186
aliases: [BUG-3186]
Title: No individual erasure or anonymisation path exists, and employee deletion is soft, so personal data survives deletion indefinitely
Status: OPEN
Severity: HIGH
Priority: P1
Type: DATA_INTEGRITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/employees]
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

# BUG-3186 — No individual erasure or anonymisation path exists, and employee deletion is soft, so personal data survives deletion indefinitely

> **Architect triage, 2026-09-11 — `PLAN_REQUIRED`.** No erasure or anonymisation path is a data-protection obligation, not a bug fix. It needs a decision about what "erased" means for payroll history that must legally survive.

## Summary

No individual erasure or anonymisation path exists, and employee deletion is soft, so personal data survives deletion indefinitely

Identified by the 2026-09-10 full technical audit as OBS-27 (confidence: OBS-27=CONFIRMED).

## Expected Behavior

Not stated explicitly by the audit for this finding — see Proposed Resolution for the implied correct behaviour.

## Actual Behavior

(not stated)

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-27** (modules/employees, modules/tenant-control-plane, docs/):

Employee deletion is soft only — `schema.prisma:5094-5096` (`deletedAt DateTime?`, `isDeleted Boolean @default(false)`); `modules/employees/employees.controller.ts:87` and `:252` both route to `bulkDelete`, which sets `const deletedAt = new Date()` (`employees.service.ts:1407`). There is no `prisma.employee.delete` anywhere in the module. Reads filter `isDeleted: false, deletedAt: null` (`employees.repository.ts:243, 260-261, 284-285, …`). So a "deleted" employee's CNIC, DOB, address, bank rows and salary history all remain.
No erasure primitives exist: `rg "anonymi|erasure|gdpr|rightToBeForgotten|purge|retention"` across `services/api/src` finds matches **only** in `tenant-control-plane` (whole-tenant), `modules/agent` + `agent/dlp` (desktop-agent telemetry and DLP captures), and `modules/billing` (post-cancellation holds). No `anonymise` function, no subject-access endpoint, no per-employee erasure route.
Retention exists **only** for agent data — `modules/agent/agent.service.ts:1241-1254`, `modules/agent/dlp/dlp.service.ts:233-246, 440-468`, `schema.prisma:10832 screenshotRetentionDays Int @default(30)` — and for tenants after access ends (`render.yaml` `TENANT_RETENTION_DAYS: "60"`). **No retention policy of any kind covers HR, payroll, attendance or recruitment tables.**
Whole-tenant erasure *is* implemented and is genuinely destructive — `modules/tenant-control-plane/tenant-control-plane.controller.ts:369-375 @Post(':tenantId/erase')` → `tenant-erasure.service.ts:131 async erase(...)`, an ordered `deleteMany` driven by an explicit list (`tenant-erasure.constants.ts:151`) inside one transaction (`tenant-erasure.service.ts:84, 229`) with row counts recorded (`:240`).
No privacy or retention document exists in `docs/` — `find docs -iname '*privacy*' -o -iname '*retention*' -o -iname '*gdpr*' -o -iname '*erasure*'` returns only the backlog/QA records above, of which ITEM-0053 ("publish privacy policy and terms") is still open.
**What a GDPR-style erasure request could satisfy today:**
- *"Delete my whole company's data"* — **YES**, `POST /tenants/:id/erase` genuinely removes rows in dependency order, DLP tables included.
- *"Delete my personal data as an individual employee"* — **NO**. There is no code path. The best available action is a soft delete that hides the row and retains every field.
- *"Tell me who accessed my file"* — **NO** (OBS-16).
- *"Rectify / export my data"* — **NO dedicated path**; only whatever the employee self-service screens happen to show.
- *"Confirm it is gone from backups and logs"* — **NO**. Neon backups and the Render log stream retain whatever they retain; nothing tracks or purges them, and PII does reach logs (OBS-14, OBS-07).

---


Full finding text: OBS-27 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

The product cannot honour an individual erasure or subject-access request, which for an HR platform operating in or selling to GDPR jurisdictions is a direct compliance failure, and one the customer inherits as controller.

## Affected Areas

services/api/src/modules/employees

## Proposed Resolution

(1) Implement `EmployeesService.anonymise(employeeId)` — null or hash `cnic`, `dateOfBirth`, addresses, personal contact, emergency contacts, bank rows — retaining only what payroll law requires, audited. (2) Define a retention policy per data class and enforce it, reusing the DLP retention pattern. (3) Publish the privacy policy (ITEM-0053). Needs an ExecPlan and a legal decision on statutory retention minimums.

(Difficulty: HIGH; Regression risk: MEDIUM; Fix now: LATER (plan now))

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for modules/employees, modules/tenant-control-plane, docs/ (audit id OBS-27).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-27=MEDIUM. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-27` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-27) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[employees]]

<!-- GRAPH:END -->
