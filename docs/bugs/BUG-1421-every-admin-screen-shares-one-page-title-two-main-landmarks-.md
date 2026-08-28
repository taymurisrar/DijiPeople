---
ID: BUG-1421
aliases: [BUG-1421]
Title: Every admin screen shares one page title, two main landmarks and a duplicate h1
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 8d6be21b
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: REG-288
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-1421 — Every admin screen shares one page title, two main landmarks and a duplicate h1

> **Architect triage, 2026-08-27 — `DEFER`.** Real, and part of the same accessibility family as BUG-1423. Sequenced behind that plan so the shared shell is fixed once.


## Summary

Four structural defects live in the shared admin shell, so each one is present on
every screen at once. Audited across all 63 admin routes on production, of which
48 were reached authenticated in a single pass:

| Defect | Affected |
|---|---|
| `<title>` identical on every screen | 47 of 48 |
| Two `<main>` landmarks | 47 of 48 |
| Two `<h1>`, the first always "Control Hub" | 48 of 48 |
| Sidebar not inside a `<nav>` landmark | 48 of 48 |
| No skip link | 48 of 48 |

This is the shape [`PLAN-019`](../qa/test-plans/PLAN-019-platform-admin.md)
already warns about: *"The shell is shared, so a defect in it is a defect
everywhere."* BUG-0073 was the same class — one class name in the sidebar
failing contrast on every screen. Screen-by-screen review keeps missing these
because each screen looks correct in isolation.

## Expected Behavior

- Each screen has a `<title>` naming that screen, so tabs, history and bookmarks
  are distinguishable — WCAG 2.4.2 Page Titled (Level A).
- Exactly one `<main>` landmark per page — ARIA landmark rules; assistive
  technology offers "jump to main content" and must have one destination.
- One `<h1>` per page, naming that page.
- The primary navigation is inside a `<nav>` landmark so it can be jumped to.
- A skip link lets a keyboard user bypass the sidebar — WCAG 2.4.1 Bypass Blocks
  (Level A).

## Actual Behavior

- 47 of 48 screens report `document.title === "DijiPeople Admin"`. Only
  `/operations/provisioning` sets its own ("Provisioning operations"). Sixteen
  open admin tabs are sixteen identical tabs.
- Every screen renders two `<main>` elements.
- Every screen renders two `<h1>`: the shell's "Control Hub" first, then the
  page's real heading. A screen reader user hears "Control Hub" as the page name
  on all 48 screens.
- The sidebar's 19 links sit in no landmark at all; 43 of 48 screens contain zero
  `<nav>` elements. The five that have one are tab strips inside page content,
  not the sidebar.
- No skip link exists anywhere, so reaching page content by keyboard means
  tabbing past 19 sidebar links on every navigation.

## Reproduction

1. Sign in to https://admin.dijipeople.com.
2. Open any two admin screens in two tabs — the tabs are indistinguishable.
3. On any screen, evaluate:

```js
({
  title: document.title,
  main: document.querySelectorAll('main').length,
  h1:   [...document.querySelectorAll('h1')].map(h => h.textContent.trim()),
  nav:  document.querySelectorAll('nav').length,
  sidebarInNav: !!document.querySelector('nav a[href="/leads"]'),
})
```

Observed on `/tenants`, `/leads`, `/customers`, `/plans`, `/security` and 43
others:

```json
{ "title": "DijiPeople Admin", "main": 2, "h1": ["Control Hub", "Tenants"],
  "nav": 0, "sidebarInNav": false }
```

Aggregate across the sweep:

```
routes audited (authenticated) : 48
distinct <title>               : 2  ["DijiPeople Admin","Provisioning operations"]
routes with main != 1          : 47
routes with h1 > 1             : 48
routes with nav == 0           : 43
sidebar present but not in nav : 48
routes with a skip link        : 0
```

## Evidence

The defects are in the shell, not the pages: the second `<main>`, the "Control
Hub" `<h1>` and the un-landmarked sidebar all come from
`apps/admin/app/_components/admin-shell.tsx` and `admin-sidebar.tsx`, which every
route in `(internal)` composes. That is why the counts are near-total rather than
scattered.

The one screen that sets its own title, `/operations/provisioning`, shows the
mechanism works and is simply not used elsewhere.

Record pages inherit the same fault and one screen compounds it. A later pass
over the nine record routes found `/contract-templates/<id>` rendering **three**
`<h1>` elements — "Control Hub" from the shell, then its own title twice:

```
h1s: ["Control Hub", "Company Partner Agreement", "Company Partner Agreement"]
```

Every other record page renders the expected two. The duplicate is that screen's
own, so fixing the shell leaves it at two rather than one; it needs its own
correction in the same pass.

## Root Cause

Not yet established beyond the shell being the common ancestor. The likely shape:
the shell was built as a full page (its own `main`, its own `h1`, its own title)
and pages were later nested inside it as content, each bringing a second `main`
and `h1` without the outer ones being demoted to `div`/`header`. No metadata
export was added per route, so the root layout's title is never overridden.

To be confirmed by whoever fixes it — this record should not assert a cause it
has not verified.

## Impact

Production, every screen, every user of the console.

- Screen reader users get no page identity: all 48 screens announce as "Control
  Hub" and offer two "main content" destinations.
- Keyboard-only users have no way past 19 sidebar links, on every navigation.
- Everyone loses tab, history and bookmark identity — a real cost in a console
  whose operators routinely keep many screens open at once.

Two of the five are Level A WCAG failures (2.4.1, 2.4.2). None is a security or
data defect; all are reachable by every user on every screen.

## Affected Areas

- `apps/admin/app/_components/admin-shell.tsx`
- `apps/admin/app/_components/admin-sidebar.tsx`
- `apps/admin/app/(internal)/layout.tsx` and every route beneath it
- `apps/admin/app/(internal)/contract-templates/[templateId]/` — renders its own
  heading twice, on top of the shell's

## Proposed Resolution

One change in the shell fixes four of the five everywhere:

1. Demote the shell's outer `<main>` to a `<div>` and its "Control Hub" `<h1>`
   to a non-heading element (or `<p>` inside a `<header>`), leaving the page's
   own `main` and `h1` as the only ones.
2. Wrap the sidebar in `<nav aria-label="Platform admin">`.
3. Add a skip link as the first focusable element in the shell.
4. Add a per-route `metadata` export (or `generateMetadata`) so each screen
   titles itself, following `/operations/provisioning`.

Item 4 is 60-odd small edits; items 1–3 are a handful of lines each. Worth
sequencing as shell-first, then titles.

## Acceptance Criteria

- Every admin route reports exactly one `<main>` and one `<h1>` — record routes
  included, and `/contract-templates/<id>` specifically.
- No two admin routes share a `<title>`.
- The sidebar is inside a `<nav>` landmark on every route.
- A skip link is the first focusable element and moves focus to page content.
- An automated axe pass over the admin routes reports no landmark or
  page-title violations.

## Regression Coverage

Needed: a browser test iterating the admin route list and asserting one `main`,
one `h1`, a `nav`-wrapped sidebar and a distinct title per route. `PLAN-019`
already identifies the shell as needing audit in its own right; this is the test
that would satisfy that.

## Dependencies

None.

## Related Items

- [[BUG-1419]] — dead incident links, same QA run
- [[BUG-1420]] — severity filter mismatch, same QA run
- [[PLAN-019-platform-admin]] — predicted this defect class

## Resolution

Fixed 2026-08-28 on `agent/open-bug-sweep`. All five, in the shell where four of
them belonged.

1. The shell's outer `<main>` is a `<div>` carrying `id="admin-content"`, so the
   page's own `<main>` is the only one.
2. The topbar's "Control Hub" is a `<p>`. The text stays — it is identity, not
   document structure — so the page's heading is now the first and only `<h1>`.
3. The sidebar is a `<nav aria-label="Platform admin">` rather than an `<aside>`.
4. A skip link is the first focusable element, visible on focus.
5. Every route that can carry one now exports `metadata` with its own title, and
   the root layout carries a `title.template` so the product name survives.

On (5): 78 routes were given a title, 1 already had one, and 3 are client
components. Next forbids `export const metadata` from a client component, so
those three fall back to the shared default — a known gap rather than an
oversight, and the spec skips them explicitly rather than silently.

Done together with [[BUG-1673]], which is this same four-defect pattern in the
tenant workspace shell with "Dashboard" in place of "Control Hub". That record
asked for them to be fixed together on the grounds that it is the only way the
convention ends up shared, and it was right — the two specs now assert the same
invariants in the same shape.

## QA Retest
Retested 2026-08-29 by the regression-guard sweep: `apps/admin/lib/shell-landmarks.spec.ts`, `apps/web/app/components/workspace-shell-headings.spec.ts` ran and passed, as part of `npm --workspace admin run test` (379 passing) and `npm --workspace web run test` (888 passing).

Not retested in production, and that boundary is the point of saying so — this environment cannot drive the deployed system, so what is established is that the fix is still present and its guard still passes, not that the screen behaves. See [[2026-08-28-regression-guard-sweep-9e55663]].

### What this record said before the sweep

Not retested with axe-core across the 48 routes.

`apps/admin/lib/shell-landmarks.spec.ts` asserts the four shell defects and
walks every route under `(internal)` for the fifth. It strips comments before
asserting, because each fix carries a note naming the element it replaced and an
assertion that cannot tell code from prose would force the explanation to be
vague.

Worth re-running the original audit rather than spot-checking: the reason these
survived is that every screen looked equally wrong, so they read as the design.

## History

- 2026-08-26 — created from qa run at `8d6be21b`.
- 2026-08-28 - un-deferred: one main, one h1, a nav landmark, a skip link, and 78 routes that title themselves. REG-288.

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

- Modules — [[platform-admin]]
- Regression — REG-288 (see the regression register)

<!-- GRAPH:END -->
