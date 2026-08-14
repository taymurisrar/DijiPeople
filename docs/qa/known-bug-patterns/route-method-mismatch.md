# Bug Pattern — Route Method Mismatch

## Pattern
A UI affordance reaches a Next route handler with an HTTP method the handler
does not export. Next answers **405 Method Not Allowed**, which renders as the
browser's own "This page isn't working" page — outside the app, so no
`error.tsx`, no error modal, and no route back.

The mismatch is invisible to the compiler. A route handler's exports and the
`href` that reaches it are connected by a string, and nothing type-checks the
pair.

## Why it happens in DijiPeople
Route handlers are written for the caller in front of the author. `fetch(url,
{ method: "POST" })` is the normal way the apps talk to `app/api/*`, so
`export async function POST` is the reflex. A plain `<a href>` or a redirect is
then added later, by a different change, for a case where there is no live
React tree to run `fetch` from — session expiry being the obvious one — and
that navigation is a GET.

It survives review because both halves read correctly on their own. It survives
local use because the affordance only appears in a state (expired session)
nobody exercises while developing.

## Example architecture area
`apps/admin/components/errors/error-provider.tsx` rendered the session-expired
modal's "Sign in again" control as `<a href="/api/auth/logout?reason=session-expired">`.
`apps/admin/app/api/auth/logout/route.ts` exported only `POST`. Every platform
operator whose session expired hit 405 and was stranded with no way back to
`/login`.

`apps/web` did not have the defect — its logout route exports both `GET` and
`POST` — which is why the same flow worked on the tenant product and hid the
admin gap.

## Detection checklist
- Grep the app for `href=` values containing `/api/` and for `<form action=`
  and `window.location.assign|replace|href =` pointing at a route handler.
  Every one of them is a **GET** (a form may be POST — check its `method`).
- For each, open the route and confirm it exports that method.
- Ask the inverse too: for every route handler exporting only `POST`, confirm
  no navigation, redirect or `<a>` can reach it.
- Auth and error-recovery routes deserve the check first — they are the ones
  reached from a broken state, where the fallback UI is the browser's.

## Required regression test
Assert the route module exports every method its callers use, listing the
caller beside each method so the reason survives. `apps/admin/app/api/auth/logout/logout-route.spec.ts`
is the pattern: it imports the route and asserts `typeof route.GET` and
`typeof route.POST`, naming the affordance behind each.

## Agent responsible
Frontend (both apps).

## Reviewer check
When a diff adds a link or a redirect to an `app/api/*` path, open the route
handler in the same review and confirm the method is exported. When a diff adds
a route handler, ask which methods reach it and whether any of them is a
navigation.

## QA check
Exercise recovery flows from the broken state they exist for, not from a
healthy session. Expire the session, then use the affordance the product offers
— do not navigate to `/login` by hand, which is what makes this class of defect
pass QA.

## Prevention rule
A route handler must export every method its callers use. An `<a href>` to
`app/api/*` is a GET; if the route is POST-only, one of the two is wrong.
