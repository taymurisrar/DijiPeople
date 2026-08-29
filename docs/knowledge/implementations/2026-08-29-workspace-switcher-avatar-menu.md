# Workspace Switcher Moves Into the Avatar Menu

**Category:** UI_CHANGE
**Date:** 2026-08-29
**Branch:** `agent/workspace-switcher-avatar-menu`
**Base:** `develop` at `3fff9cc9`
**Merged:** `develop` at `9f32c407`
**Record:** [[ITEM-0102]]
**Scenario:** [[QA-TENANT-054-switching-workspace-is-reached-from-the-avatar-menu-and-name]]

## What changed, in one sentence

"Switch workspace" stopped being a control of its own, sitting alone in the band
between the page header and the record action bar, and became a section inside
the avatar menu.

## The constraint that shaped it

The switcher is an **async server component** — it reads the access-token cookie
and calls `/workspaces/mine`. The avatar menu is a **client component**, because
it owns open/closed state, outside-click and Escape. A client component cannot
await a server one, so "move it into the menu" could not mean moving the code
into the menu.

It is resolved in `layout.tsx` and handed down as a slot:

```
layout.tsx                     <Suspense fallback={null}><WorkspaceSwitcher /></Suspense>
  └─ DashboardTopbar           workspaceSection={workspaceSection}   (pass-through only)
       └─ UserMenuDropdown     {workspaceSection}                    (renders, never fetches)
```

The Suspense boundary is not decoration. The header renders on every
authenticated screen, and before this change the switcher was deliberately kept
*outside* the topbar so a slow or failing `/workspaces/mine` could not delay it.
Moving it inside had to preserve that, and a boundary is what preserves it.

## The non-obvious consequence

**The slot is truthy even when it resolves to nothing.** `WorkspaceSwitcher`
returns `null` for anyone with fewer than two workspaces — which is almost
everyone — but what `UserMenuDropdown` receives is a Suspense element, and that
is a node regardless. The menu therefore cannot write:

```tsx
{workspaceSection ? <hr /> : null}    // always renders the rule
```

So the **section draws its own separator**. Everything conditional on the
section existing has to live inside the section. This generalises to every
server-slot-into-client-component pattern in this shell, and is recorded as a
trap in [[tenant-application]].

## Two smaller decisions

**A section, not a nested disclosure.** It was a `<details>`; keeping that would
have put a dropdown inside a dropdown for a list that is almost always two items
long. The section inherits the menu's keyboard behaviour instead of duplicating
it.

**One accessible name.** The old control carried a visually hidden
"Switch workspace." beside a visible "Switch workspace" and announced both.
There is now one label and an `aria-labelledby` binding the list to it.

## How it is held

`apps/web/app/components/workspace-switcher-placement.spec.ts` — six assertions
against the source, because `apps/web` has no jsdom (see [[tenant-application]]).
It normalises CRLF before matching: a source-reading spec that does not passes
vacuously on a Windows checkout and meaningfully on CI, which makes a negative
assertion silent exactly where it is needed.

Mutation-tested against the pre-change source: four of the six fail there. The
two that pass are guards for behaviour that was already correct — the switcher
already rendered nothing when there was nowhere to switch to, and the menu
already handled Escape.

## Related

[[tenant-application]] · [[web-architecture]] · [[ITEM-0102]] · [[ITEM-0114]] ·
[[BUG-2148]] · [[BUG-2149]] · [[BUG-1673]]
