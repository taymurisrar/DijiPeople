---
ID: ITEM-0031
aliases: [ITEM-0031]
Title: Replace remaining native prompts for governed input
Type: UX
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/admin, apps/web]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: BUG-0020
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0031 — Replace remaining native prompts for governed input

## Summary

Six call sites across `apps/admin` and `apps/web` still collect input with
`window.prompt`. They were found while fixing
[[BUG-0020-window-prompt-used-for-governed-reasons]], which
scoped only the two in `runtime-record-action-handler.ts` — those two are fixed
and the mechanism now exists, so the rest is replacement work rather than design
work.

## Why It Matters

Four of the six collect values that land in an audited business record:

| Call site | Collects |
|---|---|
| `apps/web/.../payroll/runs/[runId]/_components/payroll-run-actions.tsx` | Payroll **reversal reason and date** |
| `apps/web/.../payroll/runs/[runId]/_components/payroll-payments-workspace.tsx` | Payment **failure reason** |
| `apps/web/.../recruitment/_components/recruitment-applications-board.tsx` | Application **rejection reason** |
| `apps/web/.../attendance/exceptions/_components/attendance-exceptions-table.tsx` | Attendance exception **note** |
| `apps/admin/app/_components/runtime/runtime-module-list.tsx` | Bulk **status change**, saved-filter name |
| `apps/admin/app/_components/documents/contract-document-editor.tsx` | Link URL (editing convenience, not governed) |

The payroll pair is the sharpest: a reversal reason is financial, is read during
audit, and is currently accepted unvalidated — including a date typed as free
text into `window.prompt` with a pre-filled default, which is a parsing failure
waiting to happen.

The rest of the cost is the same as BUG-0020's: unstyled, unlabelled beyond one
string, no cancel semantics, outside the theme, and untestable, so none of these
paths can have a meaningful test written against them today.

## Evidence

`node scripts/check-no-native-prompt.mjs` enumerates them. Each is named in that
script's allowlist with what it collects, so the debt is counted rather than
implied by silence — the check fails if a *new* one appears, and also fails if an
allowlist entry becomes stale.

## Proposed Approach

No ExecPlan needed. `useReasonPrompt` (`apps/admin/app/_components/runtime/`)
already provides a promise-returning, focus-trapped, validated dialog for exactly
this, and is the model to follow.

Two things to decide rather than assume:

1. `apps/web` has its own component kit and does **not** share admin's
   `PanelDialog`. The hook must be reimplemented against `apps/web`'s own
   dialog primitives, not imported across the app boundary.
2. The payroll reversal date should become a date input with validation, not a
   text field — it is currently a string parsed hopefully.

Remove each call site's entry from the allowlist as it is converted; the check
fails on a stale entry, so the list cannot drift out of date.

## Acceptance Criteria

- `scripts/check-no-native-prompt.mjs` passes with an **empty** allowlist, or
  with only entries that are genuinely not governed input and say so.
- Each converted surface has a test asserting the cancel path leaves the record
  unchanged, which is not possible to write today.
