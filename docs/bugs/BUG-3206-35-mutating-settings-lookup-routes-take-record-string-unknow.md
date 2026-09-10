---
ID: BUG-3206
aliases: [BUG-3206]
Title: 35 mutating settings/lookup routes take Record<string, unknown> bodies, bypassing ValidationPipe whitelisting
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
AffectedModules: [services/api/src/modules/settings-runtime, services/api/src/modules/lookups]
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

# BUG-3206 — 35 mutating settings/lookup routes take Record<string, unknown> bodies, bypassing ValidationPipe whitelisting

## Summary

35 mutating settings/lookup routes take Record<string, unknown> bodies, bypassing ValidationPipe whitelisting

Identified by the 2026-09-10 full technical audit as API-01 (confidence: API-01=CONFIRMED).

## Expected Behavior

per AGENTS.md's own Backend convention ("Every request body has a DTO with `class-validator` rules"), these routes should take a typed DTO so `ValidationPipe` enforces bounds, enum membership and rejects unknown fields declaratively and consistently.

## Actual Behavior

these 35 routes accept any JSON object; `ValidationPipe`'s `whitelist`/`forbidNonWhitelisted` do not apply because there is no class-validator DTO; the service layer picks named fields via ad hoc reader functions, so validation coverage is whatever each reader happens to check, and unexpected extra fields are silently ignored rather than rejected with a 400.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**API-01** (`services/api/src/modules/lookups/{lookups,configuration}.controller.ts`, `services/api/src/modules/tenant-settings/{enterprise-configuration,field-security}.controller.ts`, `services/api/src/modules/inbox/inbox.controller.ts`, `services/api/src/modules/onboarding/onboarding.controller.ts`, `services/api/src/modules/recruitment/candidates.controller.ts`, `services/api/src/modules/platform-monitoring/platform-monitoring.controller.ts`):

`services/api/src/modules/tenant-settings/enterprise-configuration.controller.ts:47` — `createHolidayCalendar(@CurrentUser() user, @Body() body: Record<string, unknown>)`. `services/api/src/modules/tenant-settings/enterprise-configuration.service.ts:102-155` — the service hand-reads `body.name`, `body.countryCode`, `body.weekendDays`, etc. via typed helper functions, with no centralized length/enum validation. `services/api/src/modules/lookups/lookups.service.ts:114-117` — same pattern for `createState`.

---


Full finding text: API-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/API.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

inconsistent validation (a reader can miss a bound a DTO decorator would have caught for free), unbounded string fields (no `@MaxLength`) reaching the database on 35 routes, and no `forbidNonWhitelisted` 400 to surface a client/API contract drift early. Not directly exploitable for mass assignment (verified in §3 — no spread reaches Prisma), so this is a robustness/consistency gap rather than an active breach.

## Affected Areas

services/api/src/modules/settings-runtime, services/api/src/modules/lookups

## Proposed Resolution

introduce class-validator DTOs for the 35 routes listed in Appendix B, matching the pattern already used correctly elsewhere in the same modules (e.g. `CreateSupportCaseDto`). Where per-field business rules already exist in the reader functions (date ranges, enum sets), those can move into custom `@Validate()` decorators rather than being rewritten.

(Difficulty: MEDIUM (35 routes, but each DTO is a mechanical translation of an existing reader function); Regression risk: MEDIUM (any client currently relying on lenient extra-field tolerance will start getting 400s once `forbidNonWhitelisted` applies); Fix now: LATER)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `services/api/src/modules/lookups/{lookups,configuration}.controller.ts`, `services/api/src/modules/tenant-settings/{enterprise-configuration,field-security}.controller.ts`, `services/api/src/modules/inbox/inbox.controller.ts`, `services/api/src/modules/onboarding/onboarding.controller.ts`, `services/api/src/modules/recruitment/candidates.controller.ts`, `services/api/src/modules/platform-monitoring/platform-monitoring.controller.ts` (audit id API-01).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: API-01=MEDIUM (any client currently relying on lenient extra-field tolerance will start getting 400s once `forbidNonWhitelisted` applies). Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `API-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/API.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (API-01) at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[settings]]

<!-- GRAPH:END -->
