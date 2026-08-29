---
ID: BUG-2004
aliases: [BUG-2004]
Title: The approvals module emits a New action for a page that does not exist, and the detail route throws on it
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2004 — The approvals module emits a New action for a page that does not exist, and the detail route throws on it

## Summary

There is no `approvals/new/page.tsx`. `/approvals/new` therefore falls into the
sibling dynamic route `approvals/[approvalId]/page.tsx` with `approvalId ===
"new"`, which fetches an approval record with the literal id `"new"`. The fetch
fails, the throw is uncaught in an async Server Component, and the page is
replaced by the "UNEXPECTED ERROR" boundary. The link exists because
`approvalRuntimeSpec` omits `adapterCapabilities.disableCreate`, so the standard
runtime generates a `system.new` command for a module that has no create page and
should not have one — approvals are raised by other modules, never authored
directly.

## Expected Behavior

The approvals inbox lists items awaiting the signed-in user's decision and offers
approve/reject actions on them. It offers no create action, exactly as
`recruitmentApplicationRuntimeSpec` and `onboardingRuntimeSpec` already declare
for themselves.

## Actual Behavior

- The approvals list renders a primary **New** button.
- Pressing it navigates to `/approvals/new`, which renders the error boundary:

```
UNEXPECTED ERROR
```

with, in the console:

```
Minified React error #441   (https://react.dev/errors/441)
```

and error reference / digest `2836191299`.

React #441 means a **Server Component threw on the server** — it is the
placeholder the RSC Flight browser client builds when the payload carries an
error row whose message was stripped for production. It is not a client crash and
not a hydration error. See BUG-2003 for the full account of the error code.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com`, tenant `DijiPeople Demo`,
production API commit `949f461c`, observed 2026-08-29, signed in as the tenant
administrator.

1. Sign in to the tenant workspace.
2. Open **Approvals** from the sidebar. Observe the **New** button in the action
   bar.
3. Press **New**. `/approvals/new` renders the error boundary; the console shows
   `Minified React error #441`, digest `2836191299`.

It also reproduces **unauthenticated**, against `https://app.dijipeople.com`:

```
$ curl -sI https://app.dijipeople.com/approvals/new
X-Matched-Path: /approvals/[approvalId]
```

and the body of that same anonymous response carries the inlined Flight error
row with the message stripped:

```
7:E{"digest":"1207789379"}
```

(a different digest, because unauthenticated the fetch 401s rather than 404s).
The `X-Matched-Path` header is the direct proof of the route shadowing.

## Evidence

Code, at `eb457d9d`:

- `apps/web/app/(authenticated)/approvals/` contains only `page.tsx` and
  `[approvalId]/page.tsx`. There is no `new/page.tsx`.
- The throw, `approvals/[approvalId]/page.tsx:27-29`:

```ts
const approval = await apiRequestJson<ApprovalRequestItem>(
  `/approvals/${approvalId}`,
);
```

- The link is generated, not hand-written:
  `apps/web/lib/runtime/modules/standard-module-specs.ts:2850-2857` declares
  `approvalRuntimeSpec` with `routeBase: "/approvals"` and **no**
  `adapterCapabilities.disableCreate`; `buildStandardCommands`
  (`standard-module-runtime.ts:788-807`) therefore emits `system.new`;
  `module-list-page.tsx:119-125` promotes it to a primary button; and
  `module-runtime-command-handler.tsx:280-286` resolves its href to
  `` `${runtime.module.routeBase}/new` ``.
- Two modules already do it correctly:
  `recruitmentApplicationRuntimeSpec` (`standard-module-specs.ts:1695`) and
  `onboardingRuntimeSpec` (`:2598`) both set
  `adapterCapabilities: { disableCreate: true }`.
- Every standard-runtime `routeBase` was checked against the presence of a `new`
  page and of `disableCreate`. `/customers`, `/projects`, `/leaves`,
  `/attendance`, `/timesheets`, `/recruitment/candidates` and
  `/recruitment/jobs` all have a `new` page; `/recruitment/applications` and
  `/onboarding` set the flag. **`/approvals` is the only standard runtime module
  with neither.**

**Not data-dependent.** Zero approvals or a thousand, any tenant, any role:
`/approvals/new` always resolves to `[approvalId]` and always fetches a record
that cannot exist. It reproduces unauthenticated, which is about as
data-independent as a defect gets.

**Not fixed in `develop`.** `git log --oneline 949f461c..origin/develop` over
`apps/web/app/(authenticated)/approvals` and
`apps/web/lib/runtime/modules/standard-module-specs.ts` returns nothing.

## Root Cause

**Established, and it is one line.** `approvalRuntimeSpec` does not set
`adapterCapabilities.disableCreate`, so the standard runtime generates a
`system.new` command whose href points at a route that has no page; Next matches
it against the sibling `[approvalId]` detail route, which fetches an approval
with the id `"new"` and throws uncaught in a Server Component.

## Impact

Low functional cost, real credibility cost. The user is offered a primary action,
takes it, and the product breaks in front of them. Nothing is lost and the back
button recovers, but a crash reachable in two clicks from the sidebar on a screen
managers visit daily is exactly what a prospect notices during a demo.

Rated MEDIUM: an architectural divergence (a read-only mirror surface declaring a
create capability) plus a missing route, not a blocked journey — the actual
approval work is done from the list, which renders fine.

## Affected Areas

`apps/web/lib/runtime/modules/standard-module-specs.ts` (`approvalRuntimeSpec`);
`apps/web/app/(authenticated)/approvals/[approvalId]/page.tsx`;
`buildStandardCommands` and the command-handler href resolution, which have no
guard against a `routeBase/new` that does not exist.

## Proposed Resolution

Set `adapterCapabilities: { disableCreate: true }` on `approvalRuntimeSpec`,
matching the two specs that already do. That removes the button and the dead
route in one line.

Separately — and this is a product question rather than part of the fix — confirm
that no create-an-approval use case is intended. If one ever is, it needs a page,
not a flag.

Independently of both, `approvals/[approvalId]/page.tsx` should handle a
non-existent id without throwing, so that a hand-typed or stale URL is a
not-found state rather than a crash. `users/[userId]` already does this
(see BUG-2014), which is the pattern to copy.

## Acceptance Criteria

- The approvals list offers no create action.
- `/approvals/new` either does not resolve to the detail route, or resolves to a
  not-found state with no error boundary and no `#441`.
- A route-integrity test asserts that for every standard-module spec, either
  `apps/web/app/(authenticated)${routeBase}/new/page.tsx` exists or
  `adapterCapabilities.disableCreate === true`.

## Regression Coverage

None yet. The route-integrity spec above is pure logic, fits the existing
node-environment jest setup, and would have caught this the day the spec was
written. It also catches BUG-2014. Nothing in CI catches it today:
`/approvals/new` is a string href and type-checks perfectly, and the browser
suite added for ITEM-0034 on 2026-08-29 (`e2e/tests/flow-h`, `flow-i`, `flow-j`)
covers the entitled modules and settings rather than the approvals inbox, so it
never clicks this action.

## Dependencies

None identified.

## Related Items

BUG-2003 is the other React #441 route; same mechanism, different cause.
BUG-2013 is why both render the same undiagnosable "UNEXPECTED ERROR" screen.
BUG-2014 is the same route-shadowing shape under `/users`. ITEM-0111 records why
the unauthenticated probe reached the page component at all.

## Resolution

**The link is gone; the route still shadows. One of three acceptance criteria
is met, so this record stays open.**

Commit `d3ffb3aa` on `agent/starter-blocker-fixes` — on that branch only, not yet on `develop` or `main`,
added `adapterCapabilities: { disableCreate: true }` to `approvalRuntimeSpec`
(`apps/web/lib/runtime/modules/standard-module-specs.ts:2867`), matching what
`recruitmentApplicationRuntimeSpec` and `onboardingRuntimeSpec` already declare.
`buildStandardCommands` (`standard-module-runtime.ts:790`) reads the flag and
omits `system.new` entirely, so the approvals list no longer renders a New
button and nothing in the product navigates to `/approvals/new`.

Against the acceptance criteria:

- **1, the list offers no create action** — met, at the source rather than by
  hiding a button.
- **2, `/approvals/new` does not resolve to the detail route, or resolves to a
  not-found state** — **not met.** No `approvals/new/page.tsx` was added and no
  redirect was declared in `next.config.ts`. The route still falls through to
  `approvals/[approvalId]/page.tsx` with `approvalId === "new"`, still fetches an
  approval with the literal id `"new"`, and still throws uncaught into the error
  boundary. What changed is that nothing in the UI takes you there any more — the
  crash is now reachable only by typing the URL, from a bookmark, or from a stale
  link.
- **3, a route-integrity test** — **not done.** Nothing yet fails when a standard
  module spec has neither a `new/page.tsx` nor `disableCreate`, which is the
  assertion this record proposed and which would also catch BUG-2014.

The distinction matters for triage: the severity of the *reachable* defect has
dropped, because a user following the product's own affordances can no longer
land on it. The underlying route shadowing is unchanged.


### 2026-08-29 - the shadowed route, and the test that catches the shape

**The earlier fix is no longer branch-local.** The Resolution above records
`d3ffb3aa` as living only on `agent/starter-blocker-fixes`; it reached
`origin/develop` as `3fff9cc9` and is in this branch's base, so
`approvalRuntimeSpec` already declares `adapterCapabilities.disableCreate`
here (`standard-module-specs.ts:2879`). That paragraph is left standing rather
than rewritten.

The two criteria it left open are now met.

**Criterion 2, `/approvals/new` no longer throws.** The route still resolves to
`approvals/[approvalId]` - that is what Next does with a path that has no page,
and adding a `new/page.tsx` for a module that must not have a create screen
would be the wrong shape. What changed is the detail page's response to a record
that is not there: `approvals/[approvalId]/page.tsx:36-59` wraps the fetch and,
on a 404 or a 400, returns a not-found state instead of letting the throw reach
the Flight stream. So `/approvals/new` renders "This approval was not found",
with the honest explanation that approvals are raised by other modules and
cannot be created here.

That covers more than the "new" segment: a stale link, a bookmark, or a
withdrawn request now produce the same handled state, which the record noted was
the pattern `users/[userId]` already half-implemented. It is the same fix
applied there for BUG-2014.

**Criterion 3, the route-integrity test** - written, at
`apps/web/lib/routing/route-integrity.spec.ts`, over a route resolver at
`apps/web/lib/routing/app-route-table.ts` that walks the App Router tree the way
Next does: route groups transparent, `_private` folders unroutable, static
children beating `[param]`, catch-alls last. The resolver reports **how** the
final segment was matched, which is the part that matters.

The first block is exactly what this record asked for: for every
`StandardModuleRuntimeSpec` in both spec files, either
`adapterCapabilities.disableCreate` is set or `<routeBase>/new` resolves to a
real page **without** a `[param]` consuming the last segment. 21 modules are
checked. The second block is BUG-2014's assertion, in the same suite.

`/settings/**` is exempted deliberately and with a comment: the settings runtime
serves static-looking paths through `[category]/[settingGroup]/[item]`, where a
path naming nothing in the registry is answered by `getSettingsRuntimeItem`
returning `notFound()` - a real not-found state, not a fetch for a record with a
literal id. That is the opposite of this defect, not an instance of it.

Mutation-tested rather than assumed: removing `disableCreate` from
`approvalRuntimeSpec` - which is this bug, exactly - fails the suite with
`"routeBase": "/approvals"` and `finalSegmentDynamic: true`. Restored
afterwards.

All three acceptance criteria are met.

## QA Retest

Not yet performed, and it cannot be performed today: the fix is not on `develop`
and production runs `main` at `949f461c`, which does not contain it. This task
did not touch `main`, so **nothing here is verified in production** and the New
button is still on the approvals list on the demo tenant.

Live verification is pending a release: confirm the approvals list renders no
New button, then navigate to `/approvals/new` directly and record what happens.
Expect the error boundary and `#441` — that is criterion 2, still open, not a
new finding.


**Updated 2026-08-29.** The unit-level half now exists: 26 assertions in
`route-integrity.spec.ts` pass, and the one covering this module fails against
the defect. The live half is unchanged - production runs `main` at `949f461c`
and this work is on a task branch. On the next release, confirm the approvals
list renders no New button, then open `/approvals/new` directly: the expected
result is now the not-found state, **not** the error boundary. If `#441` still
appears there, criterion 2 has regressed rather than never having been met.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — root cause established (route shadowing plus the missing `disableCreate` flag), confirmed live by `X-Matched-Path` and an inlined Flight error row; title, Summary, Evidence, Root Cause and Proposed Resolution rewritten. Disposition set to FIX_NOW by the SESSION-0070 Architect triage.
- 2026-08-29 — Regression Coverage updated: browser E2E coverage for `apps/web` landed on `origin/develop` (ITEM-0034, 2026-08-29). The suite does not exercise the approvals inbox, so this remains uncovered — but not for want of a suite.
- 2026-08-29 — partially fixed in SESSION-0072 at `d3ffb3aa`, on `agent/starter-blocker-fixes`: `approvalRuntimeSpec` now declares `adapterCapabilities.disableCreate`, so the New command is no longer emitted. Status OPEN to IN_PROGRESS, not FIXED — the route shadowing at `/approvals/new` is untouched and the route-integrity spec was not written. **Not deployed** — production runs `main` at `949f461c`.
- 2026-08-29 - closed in SESSION-0076 on `agent/bugfix-runtime`. The `disableCreate` fix was confirmed present in this branch's base; the detail route now returns a not-found state for a 404 or 400 instead of throwing into the boundary; and the route-integrity suite the record asked for was written over a new App Router resolver and mutation-tested. All three acceptance criteria met. Status IN_PROGRESS to FIXED, disposition DONE. **Not deployed.**

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0111]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
