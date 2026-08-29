---
ID: ITEM-0107
aliases: [ITEM-0107]
Title: Four Users screens exist in the tenant app and two of them are unreachable
Type: ARCHITECTURE
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
RelatedBug: BUG-2003
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0107 — Four Users screens exist in the tenant app and two of them are unreachable

## Summary

`apps/web` contains four separate implementations of "list the tenant's users".
One works and is canonical. One crashes (BUG-2003). Two are unreachable by any
request, because `next.config.ts` redirects their paths — yet they are still
compiled into every build, still maintained, and still turn up in a grep as if
they were live. That is roughly 1,972 lines of surplus code and, more
importantly, four contradictory answers to the question "how do we list users",
one of which is the broken one the product actively pushes administrators toward.

## Why It Matters

`AGENTS.md` states plainly that duplicate sources of truth are a regression even
when they compile. This is the concrete cost of one:

- The dashboard hard-codes `/users` — the crashing screen — in four places, and
  **nothing in the product links to the canonical screen that works**. So the
  duplication is not neutral: the product routes customers to the wrong one of
  the four.
- Anyone reading the codebase to change user listing behaviour finds four
  implementations, two of which no request can reach, and no marker saying which
  is authoritative.
- The dead screen at (4) below still fetches `/users`, `/roles`,
  `/business-units` and `/teams` and still renders roles from its own record
  shape, so it reads as maintained code and is not.
- Resolving this is also the cheapest fix for BUG-2003.

## Evidence

At `eb457d9d`:

| # | Path | Implementation | Reachable? |
|---|---|---|---|
| 1 | `/settings/security-access/identities/users` | settings runtime — the generic `settings/[category]/[settingGroup]/[item]/page.tsx` driven by the `users` adapter (`settings-adapter-registry.ts:5930-5990`, `serverApiPath: "/users"`) | **Yes — canonical, and the only one that works** |
| 2 | `/users` | bespoke: `page.tsx`, `types.ts`, `_components/{users-table,users-command-bar,users-filter-bar,users-filters,user-detail}.tsx`, `[userId]/page.tsx` — **8 files, 1,753 lines** | Yes — **crashing**, BUG-2003 |
| 3 | `/settings/security-access/users` | bespoke shim to `SettingsRuntimeList` — 4 files, 78 lines, including `[userId]`, `[userId]/edit` and `new` | **No — dead** |
| 4 | `/settings/access/users` | bespoke: fetches `/roles`, `/users`, `/business-units`, `/teams` and renders `UserAccessManagement` — 4 files, 141 lines | **No — dead** |

(3) and (4) are unreachable because `apps/web/next.config.ts` redirects both,
including all sub-paths — the redirect list is expanded to `{source,
source/:path*}` pairs by the `flatMap` at the end of `redirects()`:

```ts
["/settings/access/users",          "/settings/security-access/identities/users"],
["/settings/security-access/users", "/settings/security-access/identities/users"],
```

So `/settings/access/users/new`, `/settings/access/users/[userId]/edit`,
`/settings/security-access/users/[userId]` and their siblings are permanently
unreachable: **219 lines across 8 files that no request can ever hit.**

What still links to the crashing `/users`:
`services/api/src/modules/dashboard/dashboard.service.ts:161` (the allowed-links
whitelist), `:512` (the "Active users > Open" tile), `:623`
(`this.action('users', 'Manage users', '/users', 'users.read')`) and `:2056` (the
"Users not linked to employee records" data-quality row); plus the icon-matched
sidebar entry at `apps/web/app/_components/dashboard-sidebar.tsx:386` and the
protected prefix at `apps/web/lib/auth-config.ts:33`.

## Proposed Approach

Redirect `/users` to `/settings/security-access/identities/users` in
`next.config.ts` — one line, using the mechanism already applied to the other two
— and delete implementations (2), (3) and (4). That removes roughly 1,972 lines
and closes BUG-2003 and BUG-2014 with them, along with the three secondary
defects recorded inside BUG-2003 (the `userRoles`/`employee` field mismatch, the
fabricated pagination metadata and the unrendered `UsersFilterBar`).

The four `dashboard.service.ts` links can stay pointing at `/users`, since the
redirect makes them correct; repointing them at the canonical path is tidier and
touches the API.

The expensive alternative — registering a `users` entity in the entity registry
so the bespoke screen works — is real work and buys nothing the canonical screen
does not already provide. It should only be chosen if the bespoke screen has
capabilities the settings runtime cannot express, and nobody has claimed it does.

No ExecPlan is needed for the redirect-and-delete path: deleting unreachable and
crashing code is not a design change. If the decision goes the other way, that
one does need a plan.

## Acceptance Criteria

- Exactly one Users list implementation remains in `apps/web`.
- Navigating to `/users` reaches it.
- All four `dashboard.service.ts` links reach it.
- No route under `/settings/access/users` or `/settings/security-access/users`
  exists in the tree.
- BUG-2003 and BUG-2014 are closed by the change, or explicitly re-scoped.

## Dependencies

None. This decides how BUG-2003 and BUG-2014 are fixed, so it should be settled
before either.

## Related Items

BUG-2003 is the crash on implementation (2). BUG-2014 covers `/users/new` and
`/users/import`, which are part of the same tree and disappear with it.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`, out of the React #441 root-cause investigation. Filed initially as three screens; corrected to four once the redirect list in `next.config.ts` was read and the two dead trees counted. Disposition FIX_NOW: it is the cheapest resolution for BUG-2003, and the tenant app should not carry four answers to one question.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-2003]]
- Referenced by — [[BUG-2014]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
