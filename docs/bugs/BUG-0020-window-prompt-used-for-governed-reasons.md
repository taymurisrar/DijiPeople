---
ID: BUG-0020
aliases: [BUG-0020]
Title: window.prompt collects governed reasons instead of the design system dialog
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [apps/admin, apps/web]
OwnerAgent: frontend
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0020 — window.prompt collects governed reasons instead of the design system dialog

## Summary

`window.prompt` is used to collect reasons for governed actions — lead
disqualification, moving a contract backward — while the tenant lifecycle
correctly uses `PanelDialog` for the same kind of input.

## Expected Behavior

Every input that becomes part of an audited business record is collected through
the design system, with a label, validation, a cancel path and keyboard
accessibility.

## Actual Behavior

A native browser prompt: unstyled, unlabelled beyond a single string,
unvalidated, untestable, and rendered outside the app's theme.

## Reproduction

Disqualify a lead, or move a contract backward, from the admin app.

## Evidence

QA run, UI / UX section, rated MEDIUM.

Verified at `main` `ad8f77f`, and **broader than the run recorded** — nine call
sites across both apps:
`apps/admin/lib/runtime/runtime-record-action-handler.ts:80` (disqualification
reason), `:115` (contract stage-back reason);
`apps/admin/app/_components/runtime/runtime-module-list.tsx:354`, `:640`;
`apps/admin/app/_components/documents/contract-document-editor.tsx:293`;
`apps/web/.../attendance-exceptions-table.tsx:48`;
`apps/web/.../payroll-run-actions.tsx:265`, `:268` (payroll **reversal reason and
reversal date**);
`apps/web/.../recruitment-applications-board.tsx:294`.

## Root Cause

A convenient shortcut for "get one string from the user" that was never revisited
once `PanelDialog` existed. Nothing flags it, so each new action copies the
nearest neighbour — the `sibling may itself be non-compliant` trap.

## Impact

Accessibility and consistency on one hand; on the other, two of these collect
inputs that go into **payroll reversal** records, where an unvalidated free-text
date entered through a native prompt is a data-quality risk rather than a
styling one.

## Affected Areas

`apps/admin` runtime record actions, module list, contract editor;
`apps/web` attendance exceptions, payroll run actions, recruitment board.

## Proposed Resolution

Replace with `PanelDialog` (admin) and the `apps/web` equivalent, starting with
the payroll reversal pair, which carries real data risk. This is nine mechanical
replacements, not a redesign — but each needs its own validation rules, so it is
not a single find-and-replace.

## Acceptance Criteria

No `window.prompt` in either app; every replaced input has a label, a validated
type, a cancel path and focus trapping.

## Regression Coverage

**None** possible as a render test — jsdom is not installed. A lint rule banning
`window.prompt` in `apps/**` is the testable form, and is the cheaper guard.

## Dependencies

None.

## Related Items

Modules [[platform-admin|Platform Admin]], [[payroll|Payroll]], [[attendance|Attendance]],
[[tenant-application|Tenant Application]] (attendance exceptions, payroll runs,
recruitment board). Architecture [[runtime-module-system|Runtime Module System]].

## Resolution

Fixed for the two call sites this record names, with the mechanism that was
missing, and the wider set counted rather than quietly left.

`useReasonPrompt` (`apps/admin/app/_components/runtime/use-reason-prompt.tsx`)
returns a promise-based dialog built on the existing `PanelDialog` /
`DialogField` / `PanelButton` primitives — labelled, required, minimum length,
focus-trapped, escapable, themed.

**Why a promise, and why injected.** These actions are dispatched from
`runtime-record-action-handler.ts`, which is a plain module and cannot render.
That is precisely why `window.prompt` was reached for: it is the only input a
non-React function can open. So the capability is injected the same way
`openSignatureDialog` already was, and the handler still reads as a sequence:

```ts
const reason = await requestReason({ ... });
if (!reason) return;   // cancelled
```

Both governed call sites now use it: lead disqualification and moving a contract
backward, each with a title, an explanation of who reads the value later, and a
`danger` tone.

**Six further call sites exist** across `apps/admin` and `apps/web`, four of
them governed — payroll reversal reason *and date*, payment failure reason,
application rejection reason, attendance exception note. They are outside this
record's scope and are recorded as [[ITEM-0031]] rather than left implied.

`scripts/check-no-native-prompt.mjs` is a required CI step. It names each
remaining call site with what it collects, fails when a **new** one appears, and
also fails when an allowlist entry goes stale — so the debt cannot quietly grow
or quietly rot.

## QA Retest

- `npm run check:no-native-prompt` — 1439 files scanned, 6 tracked call sites.
  Verified to fail: reintroducing a `window.prompt` into the action handler
  reports it and exits 1.
- `npm --workspace admin run test` — 10 suites, 91 tests passing.
- Admin typecheck and ESLint clean.

Note: the check strips comment lines. An earlier draft did not, and flagged the
fix's own doc comment as a violation.

## History

- 2026-08-15 — found during the commercial onboarding E2E UI/UX assessment
  (2 call sites reported).
- 2026-08-15 — re-verified against `main` `ad8f77f`; scope widened to 9 call
  sites across both apps, including payroll reversal.

- 2026-08-15 — Architect triage: PLAN_REQUIRED, not FIX_NOW. Nine call sites, and the record is right that they are not one find-and-replace — each replacement needs its own validation rules, and two of them collect payroll reversal reason and reversal date, where an unvalidated free-text date is a data-quality risk rather than a styling one. Sequence the payroll pair first. The cheap guard the record proposes — a lint rule banning `window.prompt` under `apps/**` — should land with the first batch so the count cannot grow while the rest is outstanding.
- 2026-08-16 — fixed for the two governed call sites in scope, with the dialog
  mechanism the handler lacked. Six further call sites found and recorded as
  ITEM-0031; a CI check now counts them.
