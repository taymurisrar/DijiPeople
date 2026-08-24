---
ID: BUG-0907
aliases: [BUG-0907]
Title: An unknown legal slug answers 200 and hangs on the loading shell instead of returning 404
Status: VERIFIED
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [apps/landing]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: REG-239
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-24
ResolvedAt: 2026-08-23
---

# BUG-0907 — An unknown legal slug answers 200 and hangs on the loading shell instead of returning 404

## Summary

`/legal/<anything>` returned **HTTP 200** and rendered the loading fallback
forever. The page already called `notFound()` for an unrecognised slug and could
not deliver it: `apps/landing/app/loading.tsx` places a Suspense boundary above
every route, so Next flushes the shell — with a 200 — before the segment runs.
Once the status is committed it cannot be changed, and the not-found UI never
replaces the loading fallback.

The result is a soft 404: a crawler indexes `/legal/anything` as a real page,
and a visitor who mistypes a URL sits on "Loading" with no error and no way to
tell the page is never coming.

## Expected Behavior

An unrecognised legal slug answers 404 and renders the site's not-found page,
exactly as `/this-page-does-not-exist` does. A *known* slug whose document is
unpublished still answers 200 — the route exists, the text does not yet.

## Actual Behavior

```
/legal/not-a-document        -> 200 | title "Legal | DijiPeople" | body "… Loading"
/this-page-does-not-exist    -> 404 | title "Page not found | DijiPeople"
```

## Reproduction

1. Request `/legal/not-a-document` on any deployment of the landing app.
2. Observe HTTP 200 and a page that never leaves the loading state.

Reproduced on production and on a local production build of the pending
release, so it is not a dev-server artefact.

## Evidence

Established by experiment rather than inference. Same build, same URL, the only
difference being whether the root loading boundary exists:

```
WITH    apps/landing/app/loading.tsx : 200 | "Legal | DijiPeople"      | body "… Loading"
WITHOUT apps/landing/app/loading.tsx : 404 | "Page not found | DijiPeople"
```

The page's intent was never in doubt — `apps/landing/app/legal/[slug]/page.tsx`
already reads:

```ts
// An unknown slug is a genuine 404. A known slug whose document is not
// published is not — the route exists, the text does not yet.
if (!isLegalSlug(slug)) {
  notFound();
}
```

## Root Cause

A route-level `loading.tsx` makes Next stream the shell immediately. The HTTP
status goes out with that first flush, before the dynamic segment executes, so
any later `notFound()` can change the rendered output but not the status — and
in this case did not even manage the output, because the boundary's fallback was
what the client kept.

This affects `notFound()` in *any* dynamic route under this app's root layout,
not just the legal one; the legal route is where it is reachable by guessing a
URL.

## Impact

SEO and user-facing rather than functional: a soft 404 competes with real pages
in an index, and a visitor who mistypes a legal URL gets a hang rather than an
error. No data is at risk.

## Affected Areas

- `apps/landing/app/legal/[slug]/page.tsx`
- `apps/landing/app/loading.tsx` (the mechanism, not the fault)
- any future dynamic route in this app that relies on `notFound()`

## Proposed Resolution

Move the refusal to the routing layer, where it happens before streaming
begins. `generateStaticParams` in the same file already enumerates all ten
legitimate slugs, so `export const dynamicParams = false` makes an unknown one
be refused exactly as an unmatched path is — and leaves the loading boundary in
place for the routes that want it.

## Acceptance Criteria

- `/legal/<unknown>` returns 404 and renders the not-found page.
- All ten published routes still return 200 with their own titles.
- `/this-page-does-not-exist` is unaffected.

## Regression Coverage

`e2e/tests/landing-public-surface.spec.ts` — "an unknown legal slug is a real
404, not a 200 stuck on the loading shell". Proven to fail without the fix by
running it against production, which still carries the defect: it fails there
and passes against the fixed build.

## Dependencies

None. The fix is one exported constant.

## Related Items

[[BUG-0899]] — the fix cannot reach production until deployment is unblocked.

## Resolution

Fixed on `agent/landing-e2e-go-live`: `export const dynamicParams = false` in
`apps/landing/app/legal/[slug]/page.tsx`, with a comment recording the streaming
interaction so the next person does not delete it as redundant beside
`notFound()`.

Verified against a local production build: `/legal/not-a-document` → 404 "Page
not found"; `/legal/terms` and `/legal/privacy` → 200 with their own titles.

## QA Retest

Verified by [`2026-08-24-record-state-reconciliation-0a5586f.md`](../qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md) on 2026-08-24 at `0a5586f`.

REG-239 — verified against production: `GET https://www.dijipeople.com/legal/not-a-real-document` returns `404` and `/legal/privacy` returns `200`.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.
- 2026-08-23 — fixed and verified against a production build.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[landing-architecture]]
- Regression — REG-239 (see the regression register)

<!-- GRAPH:END -->
