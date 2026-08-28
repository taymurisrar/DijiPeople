---
ID: BUG-1883
aliases: [BUG-1883]
Title: App releases and Agent rollout render on a shell no other admin screen uses
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: USER_REPORT
DetectedDate: 2026-08-28
DetectedInSha: 1003a2ac
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport:
RegressionId: REG-300
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: docs/plans/EXECPLAN-0024-admin-console-fx-reporting-desktop-agent-settings-and-generic-bulk-delete.md
CreatedAt: 2026-08-28
UpdatedAt: 2026-08-28
ResolvedAt: 2026-08-28
---

# BUG-1883 — App releases and Agent rollout render on a shell no other admin screen uses

## Summary

`/app-releases` and `/agent-rollout` are hand-rolled pages that render their own
`<main>` and carry Tailwind `dark:` variants. The admin console has no dark mode
to switch them on, so on a light product these two screens showed a dark navy
panel with a faded heading floating outside the standard page header — visibly
a different application. They were also top-level sidebar entries under
Operations, while every comparable platform-configuration screen lives under
Settings.

## Expected Behavior

Both screens look like the rest of the admin console and are reachable where an
operator would look for them.

## Actual Behavior

Two screens on a shell nothing else in the console uses, in the wrong section of
the navigation, a click apart from each other despite being two halves of one
decision.

## Reproduction

1. Platform Admin → **Operations → App releases**. The empty state renders as a
   dark panel; the page heading sits above the standard header rather than in
   it.
2. **Operations → Agent rollout**. Same shell, same mismatch.
3. Compare either with **Settings → Demo data**, which uses `SettingsShell`.

## Evidence

Reported by the repository owner on 2026-08-28 with two screenshots of
production (`admin.dijipeople.com/app-releases`,
`admin.dijipeople.com/agent-rollout`).

- `apps/admin/app/(internal)/app-releases/page.tsx` — `<main className="mx-auto
  grid max-w-5xl gap-6 p-6 md:p-8">`, with `dark:border-slate-700
  dark:bg-slate-900` on the empty state.
- `apps/admin/app/(internal)/agent-rollout/page.tsx` — the same shape.
- `apps/admin/app/_components/settings/settings-shell.tsx` — what every other
  settings screen uses.
- `apps/admin/app/_components/admin-sidebar.tsx` — both under
  `section("Operations", …)`.

## Root Cause

Both were built as standalone pages for TASK-0026/TASK-0027 and never adopted
the shared settings shell. The `dark:` variants were carried in from a template;
nothing in the admin app sets a dark theme, so they were never seen in the state
they were written for.

## Impact

Cosmetic, but on the screen an operator uses to ship a desktop-agent release to
every tenant. A screen that does not look like the product it is in reads as
unfinished, and undermines confidence in the action it offers.

## Affected Areas

`apps/admin` — the two routes, the sidebar, the settings index.

## Proposed Resolution

One **Settings → Desktop agent** screen on `SettingsShell` with Releases and
Rollout tabs. The two are a pair: releases decide what exists on a channel,
rollout decides who receives that channel. Keep the old URLs as redirects —
they are in bookmarks and in the release runbook.

## Acceptance Criteria

- `/settings/desktop-agent` renders both tabs on the standard settings shell.
- `/app-releases` and `/agent-rollout` redirect there rather than 404.
- No `dark:` variant remains on either surface.
- Loading, error, empty and access-denied states present on both tabs.
- The tables scroll inside their own container at mobile width; the page does
  not.

## Regression Coverage

REG-300 — `apps/admin/lib/desktop-agent-settings.spec.ts`. It pins the three
structural facts the fix rests on rather than the appearance, which no test can
speak to: the screen is on `SettingsShell` and declares no `<main>` of its own,
neither it nor its manager carries a `dark:` variant, and both old URLs still
resolve as redirects while the sidebar no longer lists them.

`apps/admin/lib/shell-landmarks.spec.ts` was also amended: it asserts every route
that paints declares its own title, and now exempts redirect-only routes —
narrowly, by stripping comments and checking the file renders no markup at all.

## Dependencies

None.

## Related Items

Modules [[platform-admin|Platform Admin]]. Same shape as
[[BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-]], which
was also a shell the screens did not share.

## Resolution

Fixed on branch `agent/admin-console-fx-and-agent-settings`.

- New `apps/admin/app/(internal)/settings/desktop-agent/page.tsx` on
  `SettingsShell`, rendering `DesktopAgentManager`.
- New `apps/admin/app/_components/settings/desktop-agent-manager.tsx` — both
  tables restyled onto the light admin palette, with `role="tablist"`, real
  `<th scope>` headers, an `sr-only` caption per table, labelled controls, and
  channel badges that carry text rather than colour alone.
- Both old routes are now `redirect("/settings/desktop-agent")`.
- The sidebar's Operations section keeps only Monitoring; the settings index
  gains a **Desktop agent** card.

## QA Retest

Not retested in a browser — the admin app cannot be driven against production
from here, because the MCP browser is blocked for production hosts. Verified by
`npm --workspace admin run test` (374 passing) and `check-types`.

The browser check: open `/settings/desktop-agent`, confirm both tabs render on
the light shell, and confirm `/app-releases` redirects.

## History

- 2026-08-28 — reported by the repository owner with production screenshots.
- 2026-08-28 — fixed as part of EXECPLAN-0024.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]
- Regression — REG-300 (see the regression register)

<!-- GRAPH:END -->
