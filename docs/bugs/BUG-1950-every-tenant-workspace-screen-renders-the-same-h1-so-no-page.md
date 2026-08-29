---
ID: BUG-1950
aliases: [BUG-1950]
Title: Every tenant workspace screen renders the same h1, so no page announces what it is
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: 41eaadb4
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-302
RelatedBacklogItem: ITEM-0034
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1950 — Every tenant workspace screen renders the same h1, so no page announces what it is

## Summary

Every authenticated screen in `apps/web` renders exactly one `<h1>`, and on all
of them it says **"Dashboard"**. Employees, Leaves, Attendance, Timesheets,
Projects, Onboarding, Settings and every settings category are
indistinguishable by their primary heading.

For a sighted user the screen still has content, so this reads as a cosmetic
oddity. For anyone navigating by headings — the standard way a screen-reader
user orients on a page — every screen in the tenant product announces itself as
the same page.

## Expected Behavior

The `h1` names the screen. `apps/web/AGENTS.md` requires labelled controls and
keyboard-navigable structure; a heading that never changes defeats the landmark
those rules exist to make useful.

BUG-1421 fixed exactly this for `apps/admin` — "Every admin screen shares one
page title, two main landmarks and a duplicate h1" — and it is `VERIFIED`.

## Actual Behavior

`<h1>Dashboard</h1>` on every route, rendered by the shared workspace shell's
banner.

## Reproduction

1. Start the API and `apps/web` against a seeded database.
2. Sign in to a tenant workspace as any user.
3. Open `/employees`, `/leaves`, `/attendance`, `/settings`,
   `/settings/organization` in turn.
4. Inspect the `h1` on each, or run the accessibility snapshot.

## Evidence

Found by **Flow I and Flow J on their first real run** — the first browser tests
ever to open `apps/web` (ITEM-0034). Nine independent page snapshots, captured
2026-08-29 at `41eaadb4` against a local stack seeded with `seed-demo`:

| Route | Only `h1` present |
|---|---|
| `/attendance` | `heading "Dashboard" [level=1]` |
| `/employees` | `heading "Dashboard" [level=1]` |
| `/leaves` | `heading "Dashboard" [level=1]` |
| `/timesheets` | `heading "Dashboard" [level=1]` |
| `/projects` | `heading "Dashboard" [level=1]` |
| `/onboarding` | `heading "Dashboard" [level=1]` |
| `/settings` | `heading "Dashboard" [level=1]` |
| `/settings/organization` | `heading "Dashboard" [level=1]` |
| `/settings/notifications` | `heading "Dashboard" [level=1]` |

The banner region is identical on all nine:

```yaml
- banner:
  - paragraph: DijiPeople
  - heading "Dashboard" [level=1]
  - paragraph: Manage your workspace from one place.
```

The screens themselves render correctly — `/attendance` shows a full attendance
table with sortable, filterable columns. **This is a heading defect, not a
rendering one**, which is why nothing had noticed it: every functional check
passes.

## Root Cause

Not established. The `h1` is emitted by the shared authenticated shell's banner
rather than by each route, so it is one component that never learns which page
it is wrapping. `apps/web/app/(authenticated)/layout.tsx` and the components it
renders are the place to look.

## Impact

Accessibility, and it is the kind that is invisible to everyone who does not
depend on it. Heading navigation is a primary orientation mechanism; a product
where every page announces "Dashboard" cannot be navigated that way at all.

Also SEO-irrelevant and browser-title-irrelevant — this is specifically the
in-page heading, not `<title>`.

Reachable in production on every authenticated screen of the tenant product,
which is the application every employee of every tenant uses.

## Affected Areas

`apps/web` — the authenticated shell shared by all 254 pages.

## Proposed Resolution

The same shape as BUG-1421's fix for admin: each route supplies its own heading,
and the shell renders that rather than a constant. Worth checking at the same
time whether the shell also duplicates `main` landmarks, which was the other
half of BUG-1421 and which these snapshots do **not** show — there is exactly
one `main` per page here.

## Acceptance Criteria

- Each authenticated route's `h1` names that route.
- Exactly one `h1` per page, and it is the page's own.
- A browser assertion covers it, so it cannot regress silently — the reason it
  survived this long is that nothing could see it.

## Regression Coverage

None yet. Flows I and J now assert on module-specific content rather than on
headings, precisely *because* the headings are wrong — so they will not catch a
regression here. A dedicated assertion belongs with the fix.

## Dependencies

None.

## Related Items

Backlog item [[ITEM-0034-apps-web-has-zero-browser-e2e-coverage]] — this is the
first defect its coverage found. Same shape as
[[BUG-1421-every-admin-screen-shares-one-page-title-two-main-landmarks-]],
fixed for admin and never checked for web because nothing could check web.
Modules [[platform-admin|Platform Admin]] carries the fixed precedent.

## Resolution

Fixed. The Root Cause section guessed correctly: the heading is the shell's,
and the shell never learned which page it was wrapping.

**The defect, exactly.**
`apps/web/app/(authenticated)/_components/dashboard-topbar.tsx:36` declared
`pageTitle = "Dashboard"` as a default, and
`apps/web/app/(authenticated)/layout.tsx` — the only caller — never passed one.
So the heading was per-page in shape and constant in fact. That is why every
functional check passed: nothing was broken, one string was simply never
supplied.

**The fix.** The topbar resolves the title from the path
(`dashboard-topbar.tsx:61-62`), using `resolveRouteTitle` from
`apps/web/lib/tenant-branding-client.ts` — the same resolver that already names
the browser tab from `generateMetadata`. Two consequences worth stating: 232
routes are covered without each having to remember, and the in-page heading and
the document title can no longer disagree. A route with a better name than its
path gives still passes `pageTitle` and wins.

The topbar becomes a client component for this. A shared layout is not
re-rendered on client navigation in the App Router, so resolving the path on
the server would have left the heading naming whichever screen was loaded
first — a subtler version of the same bug.

**Exactly one h1 per page.** With the shell heading now naming the route, the
sixteen pages and three shared components that rendered a competing `h1` would
have produced two. They are `h2` now, which is also the correct hierarchy:
"Attendance" (the screen) above "Create manual attendance" (the section). Files
include `app/(authenticated)/attendance/new/page.tsx`,
`app/(authenticated)/page.tsx`,
`app/(authenticated)/payroll/_components/payroll-layout-shell.tsx`,
`app/components/dashboard/role-dashboard-page.tsx` and
`app/components/settings/settings-layout.tsx`.

The generic subtitle "Manage your workspace from one place." is now rendered
only on the overview it was written for; under "Employees" it said nothing.

**Coverage.** `apps/web/app/components/workspace-shell-headings.spec.ts` gains
a BUG-1950 block asserting the topbar resolves from `usePathname`, that the
literal `pageTitle = "Dashboard"` default is gone, that a route may still
override, and that the heading and the document title share one resolver. The
existing BUG-1673 assertions still hold: one `h1` in the shell, and the sidebar
owns none.

Note the earlier fix that made this survivable: BUG-1673 kept this `h1`
deliberately, on the stated grounds that it "renders pageTitle rather than a
constant, so it is the page's own". That was true of the code and false of the
product, because the prop had a constant default and no caller. It is true of
both now.

## QA Retest

Not retested — not yet fixed.

## History

- 2026-08-29 — found by Flows I and J on their first run against a live stack,
  at `41eaadb4`. Nine screens, one heading.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Backlog item — [[ITEM-0034]]
- Modules — [[tenant-application]]
- Regression — REG-302 (see the regression register)

<!-- GRAPH:END -->
