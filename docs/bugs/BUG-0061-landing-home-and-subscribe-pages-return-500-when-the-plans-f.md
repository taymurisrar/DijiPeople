---
ID: BUG-0061
aliases: [BUG-0061]
Title: Landing home and subscribe pages return 500 when the plans fetch fails
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: f58ee1d
AffectedModules: [apps/landing]
OwnerAgent: frontend
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-17-landing-uiux-browser-qa-f58ee1d.md
RegressionId: REG-057
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation: agent/landing-uiux-remediation
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
---

# BUG-0061 — Landing home and subscribe pages return 500 when the plans fetch fails

## Summary

`getPublicPlans()` calls the API with a bare `fetch` and no error handling. It
handles an API error *status* gracefully, but a transport-level failure —
connection refused, DNS failure, timeout, an API restarting mid-deploy — throws
out of the server component and Next.js renders a 500 for the whole page. The
two routes that call it are the site's front door and its purchase page.

## Expected Behavior

A failure to reach the plans API degrades the affected section only, exactly as
the sibling loader `getCommercialConfig()` already does: catch, log, and return
an empty result so the page still renders its shell, navigation and copy.

## Actual Behavior

`GET /` returns HTTP 500 and the visitor gets Next.js's unstyled error page.
Because the app has no `error.tsx` boundary (ITEM-0046), that page carries no
branding and fails four accessibility checks of its own.

## Reproduction

1. Start the landing app locally (`LANDING_PORT=3010 npm run dev` in `apps/landing`).
2. Ensure the API on port 4000 is **not** running, or restart it mid-request.
3. Request `GET http://localhost:3010/`.
4. Observe HTTP 500 rather than a rendered page. Same for `GET /subscribe`.

## Evidence

Server log with the API down:

```
GET / 500 in 11.7s
[TypeError: fetch failed] { digest: '3227098399',
  [cause]: AggregateError: { code: 'ECONNREFUSED' } }
GET /contact 200 in 2.5s
```

`/contact` returning 200 in the same window is the control — it does not call
this loader.

Captured again in Chromium during the browser pass **while the API was running**,
which shows the failure is not limited to a fully stopped API; a single transient
is enough:

```
PAGEERROR | / | TypeError: fetch failed
HTTP500   | / | http://localhost:3010/
```

axe-core on that error page additionally reports `html-has-lang`,
`document-title`, `landmark-one-main` and `region` violations, so the failure
state is also the least accessible page on the site.

## Root Cause

`apps/landing/lib/plans-server.ts:6` — the `fetch` is not wrapped. The
`!response.ok` branch immediately below it returns a graceful empty result,
which shows the degraded path was intended; only the throwing case was missed.
`apps/landing/lib/commercial-config.ts:114-142` wraps the same call shape in
try/catch and returns `EMPTY_CONFIG`.

## Impact

Public, unauthenticated, and on the two highest-value commercial routes:
`/` (`apps/landing/app/page.tsx:32`) and `/subscribe`
(`apps/landing/app/subscribe/page.tsx:28`). Reachable in production on any API
restart, deploy or network blip. The visitor sees a broken site rather than a
degraded one, at the top of the acquisition funnel.

## Affected Areas

`apps/landing/lib/plans-server.ts`, `apps/landing/app/page.tsx`,
`apps/landing/app/subscribe/page.tsx`.

## Proposed Resolution

Wrap the fetch in try/catch and return the same shape the `!response.ok` branch
already returns, so both failure modes converge on one degraded path. No
ExecPlan required. Pairs naturally with ITEM-0046, which adds the `error.tsx`
boundary that would contain anything this misses.

## Acceptance Criteria

1. With the API unreachable, `GET /` and `GET /subscribe` return HTTP 200.
2. Both pages render header, footer and copy, with a stated degraded state where
   plans would otherwise appear.
3. No unhandled `TypeError: fetch failed` reaches the Next.js error boundary.

## Regression Coverage

Needs a test that stubs the plans endpoint to a connection failure and asserts a
200 with the shell intact. No `REG-nnn` yet.

## Dependencies

None. Overlaps [[ITEM-0046-add-landing-loading-error-and-not-found-boundaries]].

## Related Items

[[ITEM-0046-add-landing-loading-error-and-not-found-boundaries]],
[[BUG-0065-public-commercial-config-omits-featurecatalog-when-no-market]]

## Resolution

`apps/landing/lib/plans-server.ts` rewritten. The fetch is wrapped, carries an
explicit 8s `AbortSignal.timeout`, and every outcome resolves to one of five named
states rather than a thrown error or a single opaque message:

```
OK · EMPTY · API_UNAVAILABLE · API_ERROR · MALFORMED
```

The distinction is the point. "We could not reach our pricing service" is a
temporary condition worth retrying; "no plans are published for your region" is
not. Collapsing them either tells people to retry something that will never
work, or hides an outage behind an empty state. Each failure is logged, so a
persistent backend fault stays visible rather than silently absorbed.

A structural guard drops any plan missing `id`/`key`/`name`/`prices` instead of
letting a partial record reach a price calculation, and a non-array envelope is
classified `MALFORMED` rather than mistaken for an empty region.

## QA Retest

Verified with the API stopped entirely (port 4000 closed):

```
/          -> 200      (was 500)
/subscribe -> 200      (was 500)
/plans     -> 200
/contact   -> 200
/features  -> 200
```

The page rendered its shell, navigation and copy, with the degraded notice
"We could not reach our pricing service just now. Please try again in a moment."
No fabricated pricing appeared. Covered durably by
`e2e/tests/flow-c-landing-public-surface.spec.ts`.

QA run: `docs/qa/runs/2026-08-18-landing-uiux-remediation-verification.md`

## History

- 2026-08-17 — created from qa run at `f58ee1d`.
- 2026-08-18 — fixed and verified on `agent/landing-uiux-remediation`.
