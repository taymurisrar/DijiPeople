---
ID: ITEM-0097
aliases: [ITEM-0097]
Title: A saved column preference could hide the column that identifies the row
Type: UX
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [apps/admin, e2e]
Source: USER_REPORT
OwnerAgent: frontend
ArchitectDisposition: DONE
CreatedAt: 2026-08-25
UpdatedAt: 2026-08-25
ResolvedAt: 2026-08-25
RelatedBug: BUG-0795
RelatedQA: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0097 — A saved column preference could hide the column that identifies the row

## Summary

The production tenant list led with **Customer** and carried no tenant name at
all. Every row was addressed by somebody else's name, and the screen had stopped
being a list of tenants. Reported as: *"Customers are showing on the tenant
page!!"*

Nothing was broken in a way anything could detect. The module definition was
correct, the deploy had landed, the API returned the right fields, and the whole
test suite was green. A saved table preference — written when the module offered
a different column set — was reapplied over the definition and removed the
identity column.

## Why It Matters

`mergeVisibleColumns` honours a hidden column **on purpose**. [[BUG-0795]] was
the opposite defect: preferences hid columns added later, and the fix taught the
merge to tell "never offered" from "deliberately hidden". That distinction is
right, and this item does not undo it.

But it is wrong for exactly one column. A list whose identity column is off does
not degrade — it changes meaning. And the recovery, open the column picker and
re-tick the missing column, requires already knowing which column is missing,
which is the one thing the screen has stopped telling you.

## Evidence

- `apps/admin/lib/runtime/platform-module-registry.ts` — the tenants module
  declared `displayName` as its first column, so the definition was never wrong.
- `apps/admin/app/_components/runtime/runtime-module-list.tsx` —
  `mergeVisibleColumns` returned the saved visible set for any column the saved
  state knew about, identity column included.
- The three columns `cbc65c5c` added on 2026-08-23 — `slug`, `environmentType`,
  `employees` — were all present on screen, which confirms BUG-0795's fix was
  working. Only the pre-existing, hidden `displayName` was absent.
- **The release under suspicion was not the cause.**
  `git diff 6ed7a440..origin/main` touched no tenant code; the layout shipped on
  2026-08-23, before it.

## Resolution

Three changes, in the order they matter.

**1. `essential` on `RuntimeColumnDefinition`.** A column so marked is forced
visible however the saved state was written. `mergeVisibleColumns` checks it
ahead of the known/visible logic, because the point is that it outranks the
preference. Applied to the tenants identity column.

**2. The picker shows it as checked, disabled, and labelled "always shown"** —
not hidden from the list. Removing it entirely would be tidier and worse: an
operator hunting for the missing column would find nothing and conclude it had
been dropped, which is the confusion this exists to end.

**3. The tenant columns say more about tenants.** `displayName` is relabelled
from "Tenant" to **"Name"** — the header sat on a page already titled Tenants,
so repeating the noun said nothing. `legalName` is added, off by default: it is
the registered entity rather than the workspace name, needed rarely and badly
when needed.

### An owner column was attempted and deliberately dropped

Worth recording, because it looked easy and would have shipped a blank column.

`mapTenantSummary` returns the owner under `owner`, while
`validateRuntimeDefinition` resolves column paths against the **Prisma** graph,
where the relation is `ownerUser`. So `owner.fullName` fails validation, and
`ownerUser.fullName` **passes** it and then renders empty, because that key is
not in the payload.

A column that validates and shows nothing is the shape of [[BUG-0796]]. The
reason is left as a comment at the call site so the next person does not
rediscover it by shipping it.

## Regression Coverage

Two layers, because one of them provably could not have caught this.

**Unit** — `column-preferences.spec.ts` gains four cases: the identity column
survives a saved state that hid it; an ordinary column the operator turned off
**stays** hidden (the counterweight — if that fails, `essential` has been
applied too broadly); it works with no saved state; and `essential` wins over a
contradictory `visible: false`. Reverting the merge change fails two of them.

**Browser** — `e2e/tests/flow-g-admin-tenant-list.spec.ts`, four scenarios: the
first column header is not `Customer`; the triage columns are all present;
the identity toggle is checked and disabled while an ordinary one is not; and
no row renders an empty identity cell.

**The browser layer is the point.** Every test that could have caught this reads
the definition, and the definition was right. Only a browser sees what the
definition *plus the saved state plus the render* produce. The assertions are
deliberately about what is on screen — a test that re-read the registry would
have passed throughout the incident.

## Acceptance Criteria

- The tenant list shows a `Name` column first, whatever the saved preference.
- The column picker offers `Name` as checked and disabled.
- An ordinary column can still be hidden and stays hidden.
- No row renders an empty identity cell.
- The browser suite covers all four.

## Dependencies

None. Sits beside [[BUG-0795]] rather than reverting it.

## Related Items

- [[BUG-0795]] — the opposite defect, and the reason the merge honours hidden
  columns at all.
- [[BUG-0796]] — a list column with no data behind it; why the owner column was
  dropped.
- [[ITEM-0034]] — `apps/web` has no browser E2E. `apps/admin` had none either
  until this item; that gap is what let a rendering defect reach an operator.

## History

- 2026-08-25 — reported from production and fixed the same session. The first
  hypothesis — that the release had broken it — was checked and disproved before
  anything was changed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0795]]
- Modules — [[platform-admin]], [[qa-and-ci-architecture]]
- QA run — [[2026-08-24-record-state-reconciliation-0a5586f]]

<!-- GRAPH:END -->
