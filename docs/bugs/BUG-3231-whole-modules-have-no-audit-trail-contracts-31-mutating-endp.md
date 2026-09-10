---
ID: BUG-3231
aliases: [BUG-3231]
Title: Whole modules have no audit trail: contracts (31 mutating endpoints), customization (33), users.update, role creation
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: DATA_INTEGRITY
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: f36749b3
AffectedModules: [services/api/src/modules/contracts, services/api/src/modules/customization]
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

# BUG-3231 — Whole modules have no audit trail: contracts (31 mutating endpoints), customization (33), users.update, role creation

## Summary

Whole modules have no audit trail: contracts (31 mutating endpoints), customization (33), users.update, role creation

Identified by the 2026-09-10 full technical audit as OBS-17 (confidence: OBS-17=CONFIRMED).

## Expected Behavior

`AGENTS.md`: "call `AuditService.log()` for every state-changing operation that a tenant admin or auditor would need to see."

## Actual Behavior

Contract signature, amendment and termination; every customization change; user e-mail/status changes; and the creation of a role with an arbitrary permission matrix all leave no entry on the tenant's compliance surface.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**OBS-17** (modules/contracts, modules/customization, modules/users, modules/roles):

`rg "AuditService|auditService|audit\.log" services/api/src/modules/contracts --glob '!*.spec.ts'` → **no matches**, against 31 `@Post|@Put|@Patch|@Delete` handlers. Contracts keep a private parallel trail instead — `modules/contracts/contracts.service.ts:4406-4410` writes `'DOCUMENT_DOWNLOADED'` into a contract timeline row, and `:3990` builds an `auditTrail` from signature events. Neither is queryable from `/api/audit-logs`, neither passes through `redactAuditSnapshot`, and both are deleted with the contract.
`modules/users/users.service.ts:183-270` — `async update(...)` returns `this.mapUserSummary(updatedUser)` with no audit call; `rg "USER_UPDATED"` → **zero hits**. Since status/`isActive` changes route through `update`, **user deactivation is effectively unaudited** unless it goes through `remove` (`:500`).
`modules/roles/roles.service.ts:54 async create(...)` — no audit call; `rg "ROLE_CREATED"` → **zero hits**.
`modules/users/users.service.ts:645 removeRole`, `:716 updateAccessTeam`, `:733 removeAccessTeam` — no audit calls.

---


Full finding text: OBS-17 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A signed employment contract can be amended with no attributable record. A privileged role can be created, used, and deleted, and only the deletion is recorded.

## Affected Areas

services/api/src/modules/contracts, services/api/src/modules/customization

## Proposed Resolution

Prioritise `contracts` (legal exposure) and `users.update` + `roles.create` (security exposure). Extend `modules/audit/lifecycle-audit-coverage.spec.ts:49` — which today covers exactly three services (`EmployeesService`, `OrganizationService`, `LeaveService`) — to enumerate every module and require an explicit `exempt` entry, so a new unaudited module fails CI.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: LATER (contracts: YES))

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for modules/contracts, modules/customization, modules/users, modules/roles (audit id OBS-17).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: OBS-17=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `OBS-17` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/OBS.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (OBS-17) at `f36749b3`.
