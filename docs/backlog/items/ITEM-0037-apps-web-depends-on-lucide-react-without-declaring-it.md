---
ID: ITEM-0037
aliases: [ITEM-0037]
Title: apps/web depends on lucide-react without declaring it
Type: TECH_DEBT
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0037 — apps/web depends on lucide-react without declaring it

## Summary

**57 files in `apps/web` import `lucide-react`**, and
`apps/web/package.json` does not declare it. It resolves only by npm workspace
hoisting from `apps/admin`, which is the one workspace that does declare it.

This is the same defect as [[ITEM-0024]] (landing), at roughly 25× the scale —
landing had 2 importing files.

## Why It Matters

`apps/web` declares exactly four dependencies: `@repo/config`, `next`, `react`,
`react-dom`. A per-project install — the normal Vercel pattern, and `apps/web`
**is** deployed on Vercel as `diji-people-web` — would fail to resolve
`lucide-react` in 57 files and the build would fail.

It builds today, which is evidence the deployment installs the whole workspace.
But that is an inference from "it works", not a configuration anyone can read:
there is no `vercel.json` and the install settings live in a dashboard outside
the repository. **Removing `lucide-react` from `apps/admin` would break
`apps/web` with no signal in `apps/web` at all.**

The same shape applies to the test toolchain: `apps/web` declares no `jest`, no
`ts-jest` and no `@types/jest`, and `npm --workspace web run test` — a required
CI job — resolves them by hoisting from `services/api`.

## Evidence

Verified at `1af3690`:

- `grep -l 'from "lucide-react"'` across `apps/web/**/*.tsx` → **57 files**.
- `apps/web/package.json` dependencies: `@repo/config`, `next`, `react`,
  `react-dom`. No `lucide-react`, no jest family.
- `apps/admin/package.json` declares `lucide-react`.
- Root `node_modules` holds the hoisted copy.

## Proposed Approach

No ExecPlan needed. Declare `lucide-react` in `apps/web/package.json` at the
same version `apps/admin` pins, and declare `jest`, `ts-jest` and `@types/jest`
in every workspace whose `test` script runs them.

The durable half is a check: fail when a bare import in a workspace resolves to
a package that workspace does not declare. That is the generalisable form of
this item and of [[ITEM-0024]], and it would have caught both.

Note this interacts with [[BUG-0043-web-dialogs-have-no-focus-trap-and-filter-controls-are-unlab]]:
if a headless dialog library is adopted, it must be declared here rather than
relying on the same hoisting.

## Acceptance Criteria

- `apps/web/package.json` declares every package `apps/web` imports.
- Its `test` script's dependencies are declared in the workspace that runs them.
- A check fails on a new undeclared import.

## Dependencies

None. [[ITEM-0024]] is the same defect in `apps/landing` and should be closed by
the same check.

## Related Items

[[ITEM-0024]] · [[web-architecture]] · [[landing-architecture]] ·
[[deployment-architecture]] · [[qa-and-ci-architecture]].

## History

- 2026-08-17 — raised by the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `FIX_NOW`. Declaring the dependency is one
  line; leaving it means the largest app's build depends on a sibling app's
  package.json, which nobody editing that sibling would know.
</content>
