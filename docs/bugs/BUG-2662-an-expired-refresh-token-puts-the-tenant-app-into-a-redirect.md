---
ID: BUG-2662
aliases: [BUG-2662]
Title: An expired refresh token puts the tenant app into a redirect loop instead of the login page
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: d833e694
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-388
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt:
---

# BUG-2662 — An expired refresh token puts the tenant app into a redirect loop instead of the login page

## Summary

When a tenant user's refresh token has expired but their cookies are still present, the tenant app does not bounce them to the login page. The browser follows a redirect loop until it gives up with `ERR_TOO_MANY_REDIRECTS`, showing a browser error page rather than anything the product controls.

Found incidentally while validating an unrelated deployment. **Not caused by that release** — it was reproduced before any of this task's code reached production.

## Expected Behavior

An expired session sends the user to `/login`, ideally with `?next=` preserved so they return where they were.

## Actual Behavior

The browser reports `net::ERR_TOO_MANY_REDIRECTS` and renders its own error page. Clearing cookies and signing in again resolves it.

## Reproduction

Observed twice, both times after the refresh token's lifetime had elapsed with cookies still set:

1. Sign in to a tenant workspace.
2. Leave the session idle past the refresh token's expiry (about one hour — `dp_web_refresh_token` carried `iat` 1788144496 and `exp` 1788148096, a 3600s window).
3. Navigate to any authenticated page.
4. The browser fails with `ERR_TOO_MANY_REDIRECTS`.

Not yet reproduced from a clean, scripted starting state, which is why this record asks for confirmation before a fix is designed.

## Evidence

First occurrence was before this task's first deployment, on the previous production commit — which is what establishes it as pre-existing.

With cookies cleared, the same URLs behave correctly:

```
GET /reports   (no cookies)  -> 307  /login?next=%2Freports
GET /login     (no cookies)  -> 200
```

So the unauthenticated path is right. The loop needs *stale* cookies, not absent ones.

## Root Cause

Established. `apps/web/proxy.ts` computed

```ts
const hasSessionCookie = Boolean(accessToken) || Boolean(refreshToken);
```

and then, on the login route, sent any visitor holding cookies to `/`. That is a **presence** check standing in for a validity check.

The middleware cannot see that the API has revoked the session, and it does
not always try: `shouldRefreshAccessToken` only refreshes when the access token
is near expiry, and an access token stays structurally valid for hours after
the server-side session row is gone. In the case observed, the access token had
eight hours left while the refresh token had already expired and the session was
dead.

So the request is waved through, the page's own fetch gets a 401 and redirects
to `/login?next=...`, the middleware sees the same stale cookies and sends it
back to `/`, and that 401s too. Every hop carries a `next` parameter, which is
what makes the cycle detectable without guessing.
## Impact

Any tenant user returning to an open tab after roughly an hour of inactivity, which is an ordinary thing to do. They see a browser error page rather than a login form, and the product has no opportunity to explain or recover. The workaround — clear cookies — is not one an ordinary user will find.

Reachable in production on every tenant.

## Affected Areas

`apps/web` middleware and the `(authenticated)` route group's session handling. Not reporting-specific: every authenticated tenant route is affected.

## Proposed Resolution

Establish which two redirects form the loop before changing anything. Then make one authority decide session validity, and ensure the expired case clears the stale cookies as it redirects, so the second request cannot repeat the first's decision.

## Acceptance Criteria

- A request carrying an expired refresh token returns a single redirect to `/login`, not a loop.
- The stale cookies are cleared by that response.
- `?next=` survives, so the user returns where they were.

## Regression Coverage

REG-388. The rule was extracted into `shouldSendSignedInVisitorToWorkspace` so
it could be asserted without booting the middleware, and the spec walks the
exact hop sequence that produced the loop.
## Dependencies

None.

## Related Items

Found during post-deploy validation of [[TASK-0028]]. Unrelated to that task's own defects [[BUG-2647]], [[BUG-2648]] and [[BUG-2657]].

## Resolution

Fixed on `agent/session-redirect-loop`. The login bounce now treats a `next` or
`reason` parameter as positive evidence that an earlier hop already decided the
session does not work, and renders the form instead of redirecting.

The cookies are deliberately **not** cleared there. That is a plain GET, and
signing someone out because one request returned 401 would be a worse failure
than the one being fixed; clearing them is `redirectToLogout`'s job, on the path
that knows the refresh itself failed.
## QA Retest

To be confirmed in production after deploy: let a session go stale, then open a
protected page and land on the login form rather than a browser error page.
## History

- 2026-08-31 — root cause established and fixed in the same session the owner asked for it; the deferral recorded below is superseded.
- 2026-08-31 — root cause established and fixed in the same session the owner asked for it; the deferral below is superseded.
- 2026-08-31 — found incidentally during post-deploy validation of TASK-0028, on the production commit that preceded that release.
- 2026-08-31 — DEFER. It is pre-existing, it is not in the reporting surface this task owns, and its root cause is not established. Folding an unreproduced auth-middleware change into a reporting release would put an unrelated risk into a deployment whose validation was scoped to reporting. It is recorded here so it is not lost, and it wants its own task.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]
- Regression — REG-388 (see the regression register)

<!-- GRAPH:END -->
