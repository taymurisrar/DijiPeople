---
ID: BUG-3241
aliases: [BUG-3241]
Title: Legacy role-permission grant and employee export both skip the sibling endpoint's access check
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: SECURITY_REVIEW
DetectedDate: 2026-09-10
DetectedInSha: 9bc0245b
AffectedModules: [services/api/src/modules/roles/roles.service.ts, services/api/src/modules/employees/employees.service.ts]
OwnerAgent: security
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

# BUG-3241 — Legacy role-permission grant and employee export both skip the sibling endpoint's access check

## Summary

One paragraph: what is wrong, for someone who has never seen this module.

## Expected Behavior

What the system should do. State it before describing the failure.

## Actual Behavior

What it does instead.

## Reproduction

Numbered steps, with the exact request/state. A bug nobody can reproduce is a rumour.

## Evidence

Paths with line numbers, request/response shapes, database rows, test output. **Never a credential, token or connection string.**

## Root Cause

Why it happens — not the symptom. Leave empty until it is actually established.

## Impact

Who is affected, how badly, and whether it is reachable in production.

## Affected Areas

Modules, endpoints, screens and consumers.

## Proposed Resolution

A direction, not a patch. Say if it needs an ExecPlan.

## Acceptance Criteria

Verifiable statements QA can retest against.

## Regression Coverage

The test that must fail without the fix, and its `REG-nnn` entry once it exists.

## Dependencies

Other records, decisions or infrastructure this waits on.

## Related Items

Wikilinks to related bugs, items, modules and decisions — for the Obsidian graph.

## Resolution

What was actually changed, with the commit or branch. Filled at fix time.

## QA Retest

Which QA run verified the fix, and the scenario ids.

## History

- 2026-09-10 — created from security review at `9bc0245b`.
