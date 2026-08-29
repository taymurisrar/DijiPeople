---
ID: BUG-2013
aliases: [BUG-2013]
Title: The dashboard error boundary classifies server-component failures by a message it can never receive
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-29
DetectedInSha: eb457d9d
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-315
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-29
UpdatedAt: 2026-08-29
ResolvedAt: 2026-08-29
---

# BUG-2013 — The dashboard error boundary classifies server-component failures by a message it can never receive

## Summary

`apps/web/app/(authenticated)/error.tsx` decides what to show the user by
string-matching `error.message` against `session-expired`, `access-denied`,
`not-found` and `api-error` patterns. When a Server Component throws, the message
the boundary receives is always the React production placeholder — "Minified
React error #441; visit https://react.dev/errors/441 …" — which matches none of
those branches. **Every server-component throw on every route therefore renders
the identical "UNEXPECTED ERROR" screen, whether the underlying failure was a
401, a 403, a 404 or a 500.** The digest is the only handle on the truth, and the
boundary does not surface it. This is why BUG-2003 and BUG-2004 — two entirely
unrelated defects on two unrelated routes — presented as the same bug and cost
hours to tell apart.

## Expected Behavior

A failure inside an authenticated route tells the user, and the engineer reading
over their shoulder, something true about what failed: "your session expired",
"you do not have access to this", "this record no longer exists", or "something
went wrong — reference `2951983503`". The reference must be present in the last
case, because in production it is the only thing that connects the screen to the
server log line that holds the real message.

## Actual Behavior

Every server-side failure renders:

```
UNEXPECTED ERROR
```

`classifyDashboardError` runs, matches nothing, and falls through to
`variant: "unexpected"`. No digest is shown, so there is nothing to search the
runtime logs with unless the user thought to open the browser console — where the
digest appears only as part of the React error text.

## Reproduction

Target: `https://dijipeople-demo.ws.dijipeople.com` and
`https://app.dijipeople.com`, production API commit `949f461c`, observed
2026-08-29.

1. Sign in and open `/users`. The underlying failure is a **404** from
   `GET /data/users` (BUG-2003). The screen reads `UNEXPECTED ERROR`.
2. Open `/approvals/new`. The underlying failure is a **404** on
   `GET /approvals/new` (BUG-2004). The screen reads `UNEXPECTED ERROR`.
3. Request `https://app.dijipeople.com/approvals/new` **unauthenticated**. The
   underlying failure is a **401**. The response body still carries a stripped
   Flight error row, and the same boundary would render the same screen.

Three different HTTP outcomes on two routes, one indistinguishable screen.

## Evidence

Code, at `eb457d9d`:

- `apps/web/app/(authenticated)/error.tsx:57-160` — `classifyDashboardError`
  string-matches `error.message` for the `session-expired`, `access-denied`,
  `not-found` and `api-error` variants, and falls through to
  `variant: "unexpected"` at `:150-159`.
- What it actually receives for any server-component throw is the React
  production placeholder. React and react-dom are pinned at 19.2.4
  (`apps/web/package.json:22-23`; `package-lock.json:19172-19184`); Next.js is
  16.3.1. Error 441 is not in react-dom — it is thrown by the RSC Flight browser
  client in `resolveErrorProd()`
  (`node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-client.browser.production.js`):

```js
function resolveErrorProd() {
  var error = Error(formatProdErrorMessage(441));
  error.stack = "Error: " + error.message;
  return error;
}
```

  and its un-minified text, taken verbatim from the same function in the edge
  build, is:

  > "An error occurred in the Server Components render. The specific message is
  > omitted in production builds to avoid leaking sensitive details. A digest
  > property is included on this error instance which may provide additional
  > details about the nature of the error."

- The stripped error row is visible in the raw HTML of an anonymous request:

```
$ curl -s https://app.dijipeople.com/approvals/new | grep -o '7:E{[^}]*}'
7:E{"digest":"1207789379"}
```

  That row is exactly what `resolveErrorProd()` consumes to build the placeholder
  the boundary then tries, and fails, to classify.

**The classifier is unreliable in the other direction too.** Where a route does
catch its own fetch failure and hand the boundary a real message, the
classification is still wrong: `/users/new` and `/users/import` render
"ACCESS DENIED — You cannot view this user record. 404: User was not found for
this tenant." (BUG-2014). A 404 is labelled as a permissions refusal, with the
correct 404 text printed underneath it. So the branch logic is worth reviewing on
its own merits, not merely bypassed for the #441 case.

## Root Cause

**Established.** For any error originating in a Server Component, React replaces
the message with a fixed production placeholder before the client boundary sees
it, by design, to avoid leaking server detail. `classifyDashboardError` was
written against messages that only ever arrive from client-side failures, so for
the entire server-rendered half of the app it is dead logic that always returns
the same answer.

## Impact

Diagnosability, which is what makes every other production defect expensive.

- **For the user:** a session that quietly expired, a permission they genuinely
  lack, a record someone else deleted and a broken deployment all look identical,
  and none of the four suggests the right next action.
- **For support and engineering:** the screen carries no reference, so a customer
  report of "it says unexpected error" is unactionable. The digest exists and is
  the only key into the Vercel runtime log, and the product throws it away.
- **Measured cost, on this run:** BUG-2003 (an entity-registry mismatch on the
  API side) and BUG-2004 (a missing frontend route flag) are unrelated in every
  respect, and both presented as the same screen with the same error number.
  Separating them took a full static investigation that a printed digest would
  have reduced to a one-minute log grep.

Rated HIGH: it is not a broken journey, but it silently degrades the diagnosis of
every broken journey in the tenant app, and it is live for every route behind
`(authenticated)`.

## Affected Areas

`apps/web/app/(authenticated)/error.tsx` (`classifyDashboardError` and the
variant renderer); every route under `(authenticated)`, since they all share this
boundary; the equivalent boundary in `apps/admin` should be checked for the same
shape.

## Proposed Resolution

Two changes, both small.

1. **Surface `error.digest`.** Next attaches it to the error instance for exactly
   this purpose. Render it in the unexpected variant — "something went wrong;
   reference `2951983503`" — and log it client-side. That alone restores the link
   between a user's screenshot and the server log line holding the real message.
2. **Stop classifying what cannot be classified.** Detect the #441 placeholder
   explicitly and take the server-failure path, rather than running four
   string-matches that are guaranteed to miss. If richer classification is
   wanted for server failures, the status has to be carried deliberately — for
   instance by having server components catch their own `ApiRequestError` and
   render a typed not-found/forbidden state, which is the pattern
   `users/[userId]` already half-implements.

While in the file, review the `access-denied` branch: it currently claims a 404
as a permissions refusal (BUG-2014).

## Acceptance Criteria

- A server-component throw renders a screen that includes the Next digest.
- The four classification branches are either reachable for server failures or
  are explicitly scoped to client failures, with a comment saying which.
- A 404 handed to the boundary does not render as "ACCESS DENIED".
- A test feeds `classifyDashboardError` the literal `"Minified React error #441;
  visit https://react.dev/errors/441 for the full message…"` and asserts the
  chosen server-failure behaviour rather than the accidental fall-through.

## Regression Coverage

None yet. The classifier test above is pure logic and fits the existing
node-environment jest setup in `apps/web` — no jsdom needed, since
`classifyDashboardError` takes an `Error` and returns a variant.

## Dependencies

None. This is independent of BUG-2003 and BUG-2004 and should not wait for
either; it is what makes the next one of them cheap to find.

## Related Items

BUG-2003 and BUG-2004 are the two defects this record made indistinguishable.
BUG-2014 is the misclassified 404. BUG-1963 (runtime dialogs showing the raw
server message) and BUG-1955 (every 404 reported as
`DATABASE_RECORD_NOT_FOUND`) are the same family — error surfaces that name the
wrong cause — from the other direction.

## Resolution

Fixed. The classifier no longer lives in the boundary component, and no longer
tries to read a message that was deleted before it arrived.

`classifyDashboardError` moved out of `error.tsx` into
`apps/web/app/(authenticated)/_lib/classify-dashboard-error.ts`, free of JSX so
the node-environment jest setup can reach it. `error.tsx:41-47` now maps the
returned variant to an icon and `:59-66` consumes the pure result; nothing else
about the rendered screen changed.

Three changes to the logic, against the three things the record established:

- **An explicit HTTP status is read first**
  (`classify-dashboard-error.ts:136-141`). The status tests used to sit inside
  each branch, below the message heuristics of the branch above, so a 404 whose
  message happened to contain the word "permission" was answered with ACCESS
  DENIED. That ordering is the mechanism behind this record's own complaint
  about the `access-denied` branch.
- **The server-component placeholder is detected explicitly**
  (`isServerComponentPlaceholder`, `:121-128`, consumed at `:148-150`), matching
  both the minified "Minified React error #441" text and the un-minified
  sentence this record quoted. It resolves to a new `server-error` variant
  (`:88-97`) whose description tells the user to quote the reference rather than
  naming a cause it cannot know.
- **The message branches are scoped to client failures in a comment**
  (`:161-167`), because they are unreachable for anything thrown on the server.

One narrowing worth calling out because it goes beyond what the record asked
for: the `api-error` branch used to include `message.includes("api")`, which
matched "rapid", "capital" and any message quoting an `/api/` URL, so the
fall-through was nearly unreachable. That substring is gone; `failed to fetch`,
`network` and `timeout` remain.

Against the acceptance criteria:

- **1, a server-component throw renders a screen including the digest** — met,
  and it was already half-met before this change: `error.tsx` renders an "Error
  reference" block from `error.digest`. What was missing was a screen whose text
  tells the user that reference is the thing to quote, which the `server-error`
  variant now does. The record was written against a screen reading "UNEXPECTED
  ERROR", and that is the string this fix removes for the server case.
- **2, the four branches are reachable or explicitly scoped** — met, by the
  comment at `:161-167` and by the status-first ordering that leaves them
  reachable for client failures only.
- **3, a 404 is not rendered as ACCESS DENIED** — met in the boundary, and met
  at the other end too: BUG-2014's `users/[userId]` page now renders a not-found
  state rather than an access-denied one for a 404.
- **4, a test feeding the literal #441 message** — met.
  `classify-dashboard-error.spec.ts:23-58` feeds both the minified and
  un-minified placeholders verbatim and asserts `server-error`, explicitly
  asserting it is **not** the accidental `unexpected` fall-through.

13 assertions, all passing. The first of them fails against the previous
classifier, which is the point of it.

## QA Retest

Retested by the new unit suite, not in a browser: 13 assertions in
`apps/web/app/(authenticated)/_lib/classify-dashboard-error.spec.ts` pass.

**Not retested live.** The classifier is pure logic over an `Error`, so the unit
coverage is a faithful test of the decision; what it does not establish is that
the rendered screen reads well, or that Next attaches `digest` in this
deployment exactly as assumed. Confirm on the next release by opening a route
that throws server-side: expect the "Server error" eyebrow, the sentence about
the reference, and the digest in the reference block.

## History

- 2026-08-29 — created from the Starter-plan production QA run (SESSION-0070) at `eb457d9d`, out of the React #441 root-cause investigation into BUG-2003 and BUG-2004. Disposition FIX_NOW.
- 2026-08-29 - fixed in SESSION-0076 on `agent/bugfix-runtime`. `classifyDashboardError` extracted to `_lib/classify-dashboard-error.ts`; an explicit HTTP status now outranks every message heuristic; the React #441 placeholder resolves to a deliberate `server-error` variant; the message branches are commented as client-only. All four acceptance criteria met, 13 assertions added. Status OPEN to FIXED, disposition DONE. **Not deployed** - this is on a task branch, not `develop` or `main`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-315 (see the regression register)

<!-- GRAPH:END -->
