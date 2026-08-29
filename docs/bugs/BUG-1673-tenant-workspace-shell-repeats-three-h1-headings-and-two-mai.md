---
ID: BUG-1673
aliases: [BUG-1673]
Title: Tenant workspace shell repeats three h1 headings and two main landmarks on every screen
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-27
DetectedInSha: 21032ae
AffectedModules: [views]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-288
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1673 — Tenant workspace shell repeats three h1 headings and two main landmarks on every screen

> **Architect triage, 2026-08-27 — `DEFER`.** Sequenced with [[BUG-1421]], its admin twin, and behind the [[BUG-1423]] accessibility plan. Two shells share one mistake; fixing them apart is how the convention stays unshared.


## Summary

Every screen in the tenant workspace carries three `<h1>` elements — "Workspace",
"Workspace" again, then "Dashboard" — before any heading that names the page.
Several also carry two `<main>` landmarks. On a record screen the subject's own
name is an `<h2>` beneath all three.

Someone navigating by headings hears "Workspace, Workspace, Dashboard" on the
payroll screen, the settings screen and an employee's record alike.

## Expected Behavior

One `<h1>` per page, naming that page. One `<main>` landmark. On a record
screen, the record's identity is the heading.

## Actual Behavior

Three or four `<h1>`s, the first three identical on every route and none of them
describing where the user is. Two `<main>` landmarks on most screens.

## Reproduction

1. Sign in to a tenant workspace.
2. Open the overview, then `/employees`, `/payroll/cycles`, `/settings` and an
   employee record.
3. Count `document.querySelectorAll('h1')` and `<main>` on each.

## Evidence

Measured on production 2026-08-27, tenant `dijipeople-demo`:

| Route | `h1` count | `h1` text | `<main>` |
|---|---|---|---|
| `/` | 3 | Workspace, Workspace, Dashboard | 2 |
| `/employees` | 3 | Workspace, Workspace, Dashboard | 1 |
| `/payroll/cycles` | 4 | Workspace, Workspace, Dashboard, Payroll Cycles | 2 |
| `/settings` | 4 | Workspace, Workspace, Dashboard, Configuration workspace | 2 |

On the employee record `/employees/7edd20b9-…` the headings run:

```
h1  Workspace
h1  Workspace
h1  Dashboard
h2  Aisha Rahman
```

The page is about Aisha Rahman. Nothing in the heading structure says so, and
"Dashboard" is asserted on a screen that is not one.

One thing the tenant shell does *better* than admin: `<title>` varies correctly
per route — "Employees | DijiPeople", "Cycles | DijiPeople", "Settings |
DijiPeople". That half is right here.

## Root Cause

Not established. The three repeated headings are almost certainly the shell —
sidebar brand, workspace label and page banner each reaching for `h1` — but the
components have not been read, and the fourth heading appearing on only some
routes suggests page-level templates differ in whether they add their own.

## Impact

Heading structure is how screen-reader users skim a page; three identical wrong
headings before the content means that skim returns nothing useful, on every
screen. Two `<main>` landmarks break "jump to main content" in the same way.

The record screen is the worst case, because the one thing a user needs — whose
record is this — is the only heading demoted below the noise.

Nothing is unreachable, and sighted users see a correct-looking page, which is
why this is MEDIUM and why it survived until someone counted.

## Affected Areas

- The tenant workspace shell in `apps/web` — sidebar, workspace label, page
  banner
- Runtime record and list page templates
- Not verified: whether the landing site shares any of this

## Proposed Resolution

One `h1` per page, owned by the page rather than the shell. The sidebar brand
and workspace label should be `p`, `span` or a visually-hidden label — they are
identity, not document structure. Remove the duplicate `<main>`.

Do it with [[BUG-1421]], which is the same four-defect pattern in `apps/admin`
("Control Hub" in place of "Dashboard"). Two shells, one mistake, and fixing
them together is the only way the convention ends up shared.

## Acceptance Criteria

- Exactly one `<h1>` per route, naming the page.
- On a record screen the `h1` is the record's identity.
- Exactly one `<main>` landmark.
- Verified by counting on at least the five routes above.

## Regression Coverage

None yet. Needs an assertion over a sample of routes that `h1` and `main` counts
are each exactly one. That check would cover [[BUG-1421]] too if written against
both apps. Requires a `REG-nnn` entry once written.

## Dependencies

None, though it shares a shell with [[BUG-1668]] and [[ITEM-0102]].

## Related Items

The `apps/web` sibling of [[BUG-1421]], which covers `apps/admin` and is
explicitly scoped to it. Same class as [[BUG-1423]] and [[BUG-1655]] — the
accessibility family that wants one plan rather than five patches.

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`, with [[BUG-1421]] as this record
asked.

Both "Workspace" headings in the sidebar — the expanded brand and its compact
twin — are now `<p>`. They are identity, not document structure. The topbar's
`<h1>` stays, because it renders `pageTitle` rather than a constant, so it is
the page's own heading and the only one left.

**The duplicate `<main>` is not fixed, and I could not reproduce it.** Two
shared components render a `<main>` — `role-dashboard-page` and
`settings-layout` — and neither is nested inside a page that renders its own;
the shell renders none. So the second landmark the audit found is not reachable
from the source, and guessing at a fix would mean changing markup on the
strength of nothing. The spec holds the invariant (no shell `<main>`, no
nesting) so the state cannot get worse, and identifying the second one needs the
browser pass that found it.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/shell-landmarks.spec.ts`, `apps/web/app/components/workspace-shell-headings.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing) and `npm --workspace web run test` (888 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested in a browser, and the `<main>` half is **still open** — see above.

`apps/web/app/components/workspace-shell-headings.spec.ts` asserts the sidebar
renders no heading and that exactly one `<h1>` remains, in the topbar, carrying
`pageTitle`.

When retesting, navigate by headings rather than looking: the defect was
audible, not visible. The sequence should now start with the page's own name.

## History

- 2026-08-27 — found from an owner's screenshot of an employee record showing
  "Dashboard — Manage your workspace from one place" as its header.
- 2026-08-28 - un-deferred: three h1 reduced to the page's own. The duplicate main was not reproducible from source and remains open. REG-288.

## Verification — 2026-08-29

Verified by re-reading the guard and running it, not by a browser pass. The
repository owner asked for this sweep after 48 records had accumulated in
`FIXED` — fixed, but with nobody having confirmed them against a running
system.

What was checked for this record:

- its regression guard exists on disk at this commit;
- the suite containing it passes.

Guard:

- `apps/admin/lib/shell-landmarks.spec.ts`
- `apps/web/app/components/workspace-shell-headings.spec.ts`

Proven by:

- `npm --workspace admin run test` — 379 passing
- `npm --workspace web run test` — 888 passing

**What this does not establish.** No screen was opened. A guard that reads
source and asserts a string is weaker evidence than one that runs the code, and
this sweep does not distinguish between them — it establishes that the fix is
still present and its test still passes, which is what separates a real fix from
one that was silently reverted. Behaviour against production remains unverified
here, and a browser QA pass would still be worth having.

Part of a sweep over all 48: every one of the 206 regression test files named in
the register was confirmed to exist, and every suite containing one was run.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Regression — REG-288 (see the regression register)

<!-- GRAPH:END -->
