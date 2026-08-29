---
ID: ITEM-0111
aliases: [ITEM-0111]
Title: PROTECTED_ROUTE_PREFIXES omits twelve authenticated route trees, so deep links to them are lost at sign-in
Type: UX
Status: READY
Priority: P3
Severity: LOW
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
RelatedBug: BUG-2004
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0111 — PROTECTED_ROUTE_PREFIXES omits twelve authenticated route trees, so deep links to them are lost at sign-in

## This is not an authentication bypass — do not triage it as a security fix

This item was originally raised from code analysis and typed `SECURITY`. It has
since been **tested live, unauthenticated, with cookies cleared**, and the result
settles it: an unlisted route still ends at the login screen and **no content is
served to an unauthenticated caller.**

```
GET /approvals   -> 302 /login?next=%2F            (unlisted: deep link lost)
GET /employees   -> 302 /login?next=%2Femployees   (listed:   deep link kept)
```

The defect that remains is a **deep-linking one**: the middleware does not
recognise the route, so the `next` parameter falls back to `/`. A user who
bookmarks `/approvals`, or follows a link to it from a notification email, signs
in and lands on the dashboard instead of where they were going.

Retyped `UX`, severity LOW. The QA log rated it "LOW-MEDIUM"; the severity scale
has no intermediate rung and nothing here is unsafe, so LOW at P3 is the honest
placement. **Anybody picking this up should not spend triage time looking for a
phantom authorization hole.** The two real access controls both hold, and the
live A/B above is the proof.

## Summary

`apps/web/lib/auth-config.ts:22-40` lists the route prefixes the proxy treats as
requiring a session. Twelve authenticated route trees are missing from it. For
those routes the proxy takes no action, so the sign-in redirect comes later, from
the authenticated layout — which cannot know where the user was going and sends
them to `/`.

A secondary, non-disclosing cost: because the proxy passes the request through,
the page component executes, including its server-side data fetches, before the
layout redirects.

## Why It Matters

- **The deep link is lost.** Every link into one of those twelve trees — a
  bookmark, a notification email, a shared URL — drops the user on the dashboard
  after sign-in with no indication of what they asked for.
- Unauthenticated requests run server-rendered work and issue API calls that are
  certain to 401: wasted compute and log noise attributable to nobody.
- Errors thrown by those fetches emit into the Flight stream and are recorded, so
  unauthenticated traffic pollutes the error signal that BUG-2013 is trying to
  make usable.
- The prefix list is one of two places that decide whether a route needs a
  session. While the two disagree, the behaviour of a route depends on which one
  a reader consults. The list is the cheap declarative control; the layout
  redirect is the one that must never be relied on alone.

## Evidence

**Live, 2026-08-29, cookies cleared, unauthenticated, against production.** The
A/B at the top of this record: `/approvals` (unlisted) redirects to
`/login?next=%2F`; `/employees` (listed) redirects to `/login?next=%2Femployees`.
Same session state, same product, one difference — membership of the list.

At `eb457d9d`, `apps/web/lib/auth-config.ts:22-40` omits:

```
/approvals   /inbox     /onboarding   /loans
/benefits    /employee-bank-accounts  /executive
/hr          /manager   /dlp-review   /my-preferences   /profile
```

The mechanism, all three parts confirmed in code:

- `auth-config.ts:64-69` — `matchesPrefix` special-cases the root entry
  (`if (prefix === "/") return pathname === "/";`), so the `"/"` in
  `PROTECTED_ROUTE_PREFIXES` matches **only** the exact root. It is not a
  catch-all, and a route tree absent from the list therefore matches nothing.
- `apps/web/proxy.ts:116-120` — the proxy builds the login URL with
  `next: ${pathname}${search}` **only** when `isProtectedRoute(pathname)` is
  true. For an unlisted route this branch never runs.
- `apps/web/app/(authenticated)/layout.tsx:67` — the fallback that then fires is
  `requireSessionUser("/")`, with the destination hardcoded to `/`. That literal
  is where the deep link is lost.

The earlier code-only observation still holds as the secondary cost: an anonymous
`GET https://app.dijipeople.com/approvals/new` reached the page component, whose
data fetch received a 401 and threw, emitting an inlined Flight error row into
the response body.

```
$ curl -sI https://app.dijipeople.com/approvals/new
X-Matched-Path: /approvals/[approvalId]

$ curl -s  https://app.dijipeople.com/approvals/new | grep -o '7:E{[^}]*}'
7:E{"digest":"1207789379"}
```

The redirect to sign-in still happened, from the layout, after the page had
already run. Order of operations, not access.

## Proposed Approach

Add the twelve prefixes to `PROTECTED_ROUTE_PREFIXES`, then close the gap that
let them drift: derive the list from the route tree, or add a test asserting that
every directory under `app/(authenticated)/` has a matching prefix. A
hand-maintained list of routes will always fall behind the routes.

Consider also passing the real pathname into `requireSessionUser()` in the
authenticated layout, so the fallback preserves the deep link even for a route
the list has not caught up with. That makes the list an optimisation rather than
the only thing standing between a user and a lost destination.

The test is the part worth keeping — adding twelve strings fixes today, and only
today.

## Acceptance Criteria

- Every route tree under `app/(authenticated)/` is covered by
  `PROTECTED_ROUTE_PREFIXES`.
- An anonymous request to `/approvals` redirects to
  `/login?next=%2Fapprovals`, and signing in lands on `/approvals`.
- An anonymous request to `/approvals/new` redirects to sign-in without executing
  the page component or issuing an API call.
- A test fails when a new authenticated route tree is added without a matching
  prefix.

## Dependencies

None.

## Related Items

BUG-2004 is where this was found — the anonymous probe used to prove the route
shadowing only reached the page because of this gap. BUG-2013 concerns the error
signal that this gap adds noise to.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`, out of the React #441 root-cause investigation. Recorded as defence-in-depth, explicitly not as an authorization hole: both real controls hold.
- 2026-08-29 — tested live, unauthenticated, with cookies cleared. Confirmed no content is served to an unauthenticated caller on an unlisted route; the surviving defect is the lost `next` deep link. Retyped from SECURITY to UX and rewritten so nobody triages it as a security fix. Root cause narrowed to the hardcoded `requireSessionUser("/")` fallback in the authenticated layout.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-2004]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
