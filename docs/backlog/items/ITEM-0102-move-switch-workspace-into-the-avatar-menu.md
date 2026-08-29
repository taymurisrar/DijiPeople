---
ID: ITEM-0102
aliases: [ITEM-0102]
Title: Move Switch workspace into the avatar menu
Type: UX
Status: DONE
Priority: P2
Severity: 
AffectedModules: [views]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-29
RelatedBug: 
RelatedQA: docs/qa/scenarios/QA-TENANT-054-switching-workspace-is-reached-from-the-avatar-menu-and-name.md
RelatedADR: 
RelatedImplementation: agent/workspace-switcher-avatar-menu
TargetMilestone: 
BlockedBy: 
---

# ITEM-0102 — Move Switch workspace into the avatar menu

> **Architect triage, 2026-08-27 — `DEFER`, and deliberately not "no".** The owner asked for this directly, so it is not deferred on merit. It touches the same shell header as [[BUG-1673]] and [[BUG-1668]], and opening that header three times to make three small changes is worse than opening it once. This should ride with whichever of those is done first rather than wait on its own priority.

> **Architect triage, 2026-08-29 — `DONE`.** The owner asked again directly, which retires the deferral: the reason to wait was to avoid opening the shell header twice, and the owner asking is a stronger signal than the saving. [[BUG-1673]] had already landed by then, so the header was opened once for that and once for this, which is the cost the deferral was trying to avoid and is now spent.


## Summary

"Switch workspace" sits on its own, right-aligned, in the empty band between the
page header and the record action bar. It should live in the avatar menu beside
the user's name, where account- and identity-scoped actions belong.

Requested by the owner on 2026-08-27, from the employee record screen.

## Why It Matters

It is an identity action — *which workspace am I acting in* — and it is
currently the only thing in that band, so it reads as page content rather than
as a property of the session. The avatar menu is where a user already looks for
"who am I and where am I", and it is the convention every comparable product
follows.

There is a correctness argument as well as a tidiness one. Sitting loose in the
page, the control moves with the layout and competes with the record's own
actions; a user scanning the action bar for Edit or Delete passes over a control
that changes their entire context. Grouping it under the avatar puts a
deliberate step between a person and switching tenant.

## Evidence

Observed on production 2026-08-27, tenant `dijipeople-demo`, on
`/employees/{id}`. The control renders as
`group "Switch workspace. Switch workspace"` at roughly x=1291, y=150 — a
126×24 region alone on its row, below the banner and above the action bar.

The avatar menu is immediately above it in the same corner, already carrying the
user's initials and name ("TI · Taimur Israr").

Note the accessible name is doubled — "Switch workspace. Switch workspace" —
which is worth fixing in the same change.

## Proposed Approach

> **Correction, 2026-08-29.** The paragraph below was written from a browser
> snapshot and got one premise wrong: the avatar menu *does* exist as a dropdown
> — `user-menu-dropdown.tsx`, carrying My Profile and Logout, with its own
> outside-click and Escape handling. It was read as "only a name badge" because
> a snapshot of a closed menu is a name badge. Nothing had to be introduced; the
> switcher was moved into the menu that was already there.

Move the control into the avatar menu. The menu does not appear to exist as a
dropdown yet, only as a name badge, so this likely means introducing one — which
is the right home for sign-out and profile as well, and worth checking what else
currently has nowhere to live.

Keep the workspace *name* visible outside the menu if the design wants it; it is
the **switch action** that belongs behind the avatar, not the indication of
which tenant is active. The sidebar already shows "Active tenant" separately.

While there, fix the doubled accessible name.

## Acceptance Criteria

- "Switch workspace" is reachable from the avatar menu.
- It no longer occupies its own row in the page body.
- Its accessible name is stated once.
- The active workspace remains identifiable without opening the menu.
- Keyboard reachable, and the menu is escapable.

## Dependencies

None, though it touches the same shell as [[BUG-1673]] and could sensibly be
done in the same pass — that record already opens the header and landmarks.

## Related Items

Raised alongside [[BUG-1673]] from the same screen. The shell work in
[[BUG-1668]] touches the same header region at mobile width.

## Resolution

Implemented on `agent/workspace-switcher-avatar-menu`, 2026-08-29.

The switcher is no longer a control of its own. `workspace-switcher.tsx` now
renders a **section** — a label and a list of links, plus its own top border —
rather than a `<details>` disclosure, and the layout passes it into
`UserMenuDropdown` as a `workspaceSection` slot by way of `DashboardTopbar`. The
loose right-aligned row between the page header and the action bar is gone.

Three decisions in it are worth keeping:

- **A section, not a nested disclosure.** A dropdown inside the avatar dropdown
  would be two menus deep for a list that is almost always two items long.
- **Resolved in the layout, behind `<Suspense fallback={null}>`.** The switcher
  is an async server component and the menu is a client component, so the menu
  cannot fetch it; and the original reason for keeping it outside the topbar
  still holds — a slow or failing `/workspaces/mine` must not delay a header
  that renders on every authenticated screen.
- **The section draws its own separator.** The menu receives an already-rendered
  node and cannot tell an empty section from a present one, because a Suspense
  boundary is truthy whichever way it resolves. A divider drawn by the menu
  would hang in the menu of every single-workspace user, which is nearly all of
  them.

The doubled accessible name is fixed: the visually hidden "Switch workspace."
sitting beside the visible "Switch workspace" is replaced by one labelled
section, with `aria-labelledby` tying the list to it.

Against the acceptance criteria:

| Criterion | Outcome |
|---|---|
| Reachable from the avatar menu | Yes — rendered inside the open panel, under the identity card |
| No longer occupies its own row | Yes — the layout's standalone row is removed |
| Accessible name stated once | Yes — asserted by `workspace-switcher-placement.spec.ts` |
| Active workspace identifiable without opening the menu | Yes, unchanged — the topbar eyebrow and the sidebar's "Active tenant" both name it |
| Keyboard reachable, menu escapable | Yes — the menu's existing `<button>` trigger, `aria-expanded` and Escape handler now cover the switcher too |

## History

- 2026-08-27 — requested by the owner while reviewing an employee record.
- 2026-08-29 — implemented and verified; `DEFERRED` → `DONE`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- QA run — [[QA-TENANT-054-switching-workspace-is-reached-from-the-avatar-menu-and-name]]

<!-- GRAPH:END -->
