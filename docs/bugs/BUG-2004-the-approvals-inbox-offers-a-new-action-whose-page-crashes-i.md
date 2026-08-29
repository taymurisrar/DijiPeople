---
ID: BUG-2004
aliases: [BUG-2004]
Title: The approvals module emits a New action for a page that does not exist, and the detail route throws on it
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt:
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

Open. No fix has been written.

## QA Retest

Awaiting a fix — nothing to retest yet.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`; observed against production API `949f461c`.
- 2026-08-29 — root cause established (route shadowing plus the missing `disableCreate` flag), confirmed live by `X-Matched-Path` and an inlined Flight error row; title, Summary, Evidence, Root Cause and Proposed Resolution rewritten. Disposition set to FIX_NOW by the SESSION-0070 Architect triage.
- 2026-08-29 — Regression Coverage updated: browser E2E coverage for `apps/web` landed on `origin/develop` (ITEM-0034, 2026-08-29). The suite does not exercise the approvals inbox, so this remains uncovered — but not for want of a suite.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Referenced by — [[ITEM-0111]]
- Modules — [[tenant-application]]

<!-- GRAPH:END -->
