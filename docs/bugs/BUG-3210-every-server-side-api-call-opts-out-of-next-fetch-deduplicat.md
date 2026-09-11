---
ID: BUG-3210
aliases: [BUG-3210]
Title: Every server-side API call opts out of Next fetch deduplication; tenant-settings/resolved is fetched twice on nine pages
Status: DEFERRED
Severity: MEDIUM
Priority: P2
Type: PERFORMANCE
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 4c86a29b
AffectedModules: [apps/web]
OwnerAgent: architect
ArchitectDisposition: DEFER
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3210 — Every server-side API call opts out of Next fetch deduplication; tenant-settings/resolved is fetched twice on nine pages

> **Architect triage, 2026-09-11 — `DEFER`.** Real and recorded, below the line for this cycle. Revisit at the next backlog review — the evidence is in the record, so nothing is lost by scheduling it later.

## Summary

Every server-side API call opts out of Next fetch deduplication; tenant-settings/resolved is fetched twice on nine pages

Identified by the 2026-09-10 full technical audit as CACHE-11 (confidence: CACHE-11=CONFIRMED).

## Expected Behavior

Identical GETs within one render should resolve to one upstream request. The codebase already knows the pattern (`React.cache` is used at `layout.tsx:42` and `app/layout.tsx:116`); it is applied in two places out of hundreds.

## Actual Behavior

Rendering `/attendance` issues at least seven API calls — five from the layout (`layout.tsx:43,130,143,155` plus `_lib/business-unit-access.ts:22`), one from `getSessionUser`, and the page's own — of which `/tenant-settings/resolved` is a verbatim duplicate. Because each call passes an abort signal, Next collapses none of them.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**CACHE-11** (`apps/web/lib/server-api.ts`, `apps/web/app/(authenticated)/`):

Next's dedupe wrapper opts out whenever the caller passes an `AbortSignal`:

`node_modules/next/dist/server/lib/dedupe-fetch.js` (next 16.3.1)
```js
return function dedupeFetch(resource, options) {
    if (options && options.signal) {
        // If we're passed a signal, then we assume that
        // someone else controls the lifetime of this object and opts out of caching.
        return originalFetch(resource, options);
    }
```

`apps/web/lib/server-api.ts:132-140` always passes one:
```ts
let response = await fetch(url, {
  ...init, method, headers,
  signal: mergeAbortSignals(init.signal, controller.signal),
  cache: init.cache ?? "no-store",
});
```

The layout fetches tenant settings once, memoised by hand with React `cache()`:

`apps/web/app/(authenticated)/layout.tsx:42-46`
```ts
const getResolvedTenantSettings = cache(() =>
  apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(() => null),
);
```
It is a module-local `const`, not exported, so no page can reuse it. Nine pages fetch the same endpoint again in the same render: `attendance/page.tsx:33`, `attendance/[entryId]/edit/page.tsx:25`, `employees/new/page.tsx:43`, `employees/page.tsx:119`, `employees/[employeeId]/edit/page.tsx:56`, `employees/[employeeId]/page.tsx:52`, `leaves/page.tsx:46`, `my-profile/page.tsx:85`, `(authenticated)/page.tsx:26`.

`apps/web/app/(authenticated)/attendance/page.tsx:30-35`
```ts
const [sessionUser, resolvedSettings, attendanceContext] = await Promise.all([
  getSessionUser(),
  apiRequestJson<TenantResolvedSettingsResponse>("/tenant-settings/resolved").catch(() => null),
```

---


Full finding text: CACHE-11 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CACHE.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

Doubled latency and doubled backend load on the hottest endpoint of every page. Each duplicate carries the full authenticated-request cost measured in CACHE-12.

## Affected Areas

apps/web

## Proposed Resolution

Export the memoised readers from a shared module — `apps/web/lib/server-reads.ts` exposing `getResolvedTenantSettings()`, `getTenantFeatures()`, `getBusinessUnitAccessSummary()` each wrapped in `cache()` — and have layout and pages call those instead of `apiRequestJson` directly. `React.cache` is request-scoped, so this introduces **zero** staleness. Separately, drop the abort signal when the caller did not supply one (keep the timeout via `AbortSignal.timeout` inside `init` only when explicitly requested), so Next's own dedup starts working for the rest.

(Difficulty: MEDIUM; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for `apps/web/lib/server-api.ts`, `apps/web/app/(authenticated)/` (audit id CACHE-11).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: CACHE-11=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `CACHE-11` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CACHE.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (CACHE-11) at `4c86a29b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]]

<!-- GRAPH:END -->
