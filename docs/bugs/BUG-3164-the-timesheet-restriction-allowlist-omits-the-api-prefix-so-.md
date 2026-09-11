---
ID: BUG-3164
aliases: [BUG-3164]
Title: The timesheet-restriction allowlist omits the /api prefix, so it never matches
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [services/api/src/modules/timesheets]
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

# BUG-3164 — The timesheet-restriction allowlist omits the /api prefix, so it never matches

## Summary

The timesheet-restriction allowlist omits the /api prefix, so it never matches

Identified by the 2026-09-10 full technical audit as ORCH-03 (confidence: ORCH-03=CONFIRMED (traced through the framework's route registration)).

## Expected Behavior

The named routes stay reachable so a restricted employee can complete the timesheet that lifts the restriction.

## Actual Behavior

When a TimesheetAccessRestriction row is active and not WARNING_ONLY, the allowlist is dead. In BLOCKED mode the employee is refused every authenticated route, including /api/timesheets — the screen they must use to comply — and /api/notifications, /api/my-profile and /api/approvals. In LIMITED_ACCESS mode reads still pass via the separate GET check below, so the employee can view the timesheet but every write to it is refused. The 403 body advertises allowedRoutes: ['/timesheets', '/notifications', '/my-profile', '/help'], none of which are in fact allowed.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**ORCH-03** (services/api/src/common/guards/jwt-auth.guard.ts:222-253):

```ts
const path = request.path || request.url.split('?')[0] || '/';
const alwaysAllowed = [
  '/timesheets', '/timesheet-exports', '/approvals', '/notifications',
  '/in-app-notifications', '/my-profile', '/employees/me', '/auth', ...
];
if (alwaysAllowed.some((prefix) => path.startsWith(prefix))) return;
```
Every entry omits the global /api prefix. That prefix is present in request.path: main.ts:41 calls app.setGlobalPrefix('api'), and Nest bakes the prefix into the registered route string rather than mounting a sub-router — node_modules/@nestjs/core/router/route-path-factory.js:34-41 prepends metadata.globalPrefix to the path, which router-explorer.js:111-117 then registers directly on the top-level Express app. With no router.use('/api', …) anywhere, Express never rewrites req.url, so a guard on GET /api/timesheets sees request.path === '/api/timesheets'. '/api/timesheets'.startsWith('/timesheets') is false.

The repository already knows this hazard and handles it correctly elsewhere: common/guards/public-rate-limit.guard.ts:84-90 matches on a path suffix, with the comment "Matched on a path suffix because the guard sees the path after Nest has stripped the global /api prefix on some mounts and not others." The JWT guard uses startsWith and does not.

No test covers it: grep -rn "alwaysAllowed|TIMESHEET_ACCESS_RESTRICTED" over services/api/src and services/api/test matches only the guard file itself.

---


Full finding text: ORCH-03 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ORCH.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

A tenant that enables this feature locks the affected employees out of the product, with no self-service path back — the restriction can only be lifted by an administrator overriding the row. It converts an intended nudge into a total denial of service, and the misleading allowedRoutes payload will send support down the wrong path. Not a confidentiality issue; an availability and correctness one.

## Affected Areas

services/api/src/modules/timesheets

## Proposed Resolution

Match the same way the rate-limit guard does — compare against a path with the prefix stripped, or use endsWith/a normalised path. Extract one shared helper (e.g. routePathWithoutGlobalPrefix(request)) in common/security/ and use it in both guards so the two cannot drift again. Add a spec asserting /api/timesheets is allowed under BLOCKED, and align the allowedRoutes payload with whatever the guard actually permits.

(Difficulty: LOW; Regression risk: LOW — the fix widens access to the intended set. Note the restriction becomes genuinely enforcing for the first time, so confirm the intended allowlist with the feature owner before shipping.; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for services/api/src/common/guards/jwt-auth.guard.ts:222-253 (audit id ORCH-03).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: ORCH-03=LOW — the fix widens access to the intended set. Note the restriction becomes genuinely enforcing for the first time, so confirm the intended allowlist with the feature owner before shipping.. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `ORCH-03` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/ORCH.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (ORCH-03) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
