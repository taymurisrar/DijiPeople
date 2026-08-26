---
ID: BUG-1419
aliases: [BUG-1419]
Title: Every incident on the monitoring overview links to a route that does not exist
Status: OPEN
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 8d6be21b
AffectedModules: [apps/admin]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: docs/qa/runs/2026-08-26-admin-prod-e2e-8d6be21.md
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-26
ResolvedAt:
---

# BUG-1419 — Every incident on the monitoring overview links to a route that does not exist

## Summary

`/settings/monitoring` is the screen an operator opens when something is wrong.
It lists the most recent incidents, and every row's title is a link to that
incident's detail page. That page has never existed. Every one of those links
returns HTTP 404 — on production, right now, for all twenty-five rows the
overview renders.

The cost is not only the dead click. Next.js prefetches the links in the
viewport, so simply opening the monitoring screen fires a burst of 404s, which
is why the page takes roughly **25 seconds** to settle against a **6 second**
baseline for every other admin screen.

## Expected Behavior

Clicking an incident on the overview opens that incident, in whatever form the
product intends — a detail route, the queue filtered to it, or a drawer. An
operator following up on a specific incident reaches it.

## Actual Behavior

The link resolves to `/settings/monitoring/error-logs/<id>`, for which there is
no page. The user gets the admin 404: *"404 Page not found — The requested admin
page or record could not be found. Go to tenants"* — which offers to send an
operator mid-incident to the tenant list.

## Reproduction

1. Sign in to https://admin.dijipeople.com as a platform user.
2. Go to `/settings/monitoring`.
3. Click any incident title under **Incidents to pick up**.

Observed, 2026-08-26 against `8d6be21b`:

```
INCIDENT_DETAIL_LINKS_ON_PAGE: 25
CLICKED:     /settings/monitoring/error-logs/admin_c9561f79-3d70-4cd5-b637-059996c106f1
HTTP_STATUS: 404
FINAL_URL:   https://admin.dijipeople.com/settings/monitoring/error-logs/admin_c9561f79-...
WHAT_THE_OPERATOR_SEES: 404 Page not found The requested admin page or record
                        could not be found. Go to tenants
```

## Evidence

The href is built from a constant that names the *queue*, not a record route —
[`monitoring-overview.tsx:302`](../../apps/admin/app/_components/monitoring/monitoring-overview.tsx#L302):

```tsx
href={`${QUEUE}/${incident.id}`}
```

where [`monitoring-overview.tsx:70`](../../apps/admin/app/_components/monitoring/monitoring-overview.tsx#L70):

```ts
const QUEUE = "/settings/monitoring/error-logs";
```

The route tree under monitoring has no dynamic segment at all:

```
apps/admin/app/(internal)/settings/monitoring/page.tsx
apps/admin/app/(internal)/settings/monitoring/error-logs/page.tsx
apps/admin/app/(internal)/settings/monitoring/events/page.tsx
apps/admin/app/(internal)/settings/monitoring/integrations/page.tsx
```

The prefetch storm is visible as seven concurrent 404s on load:

```
404 GET [fetch] /settings/monitoring/error-logs/req_cb9c6880-...?_rsc=GA6O06PCoA2UnwCb
404 GET [fetch] /settings/monitoring/error-logs/req_9f8adc2b-...?_rsc=GA6O06PCoA2UnwCb
… five more
### /settings/monitoring  (24984ms)
```

Compare its own sub-pages, which are clean and roughly a third of the time:

```
### /settings/monitoring/error-logs   (9321ms)  no >=400 responses
### /settings/monitoring/events       (8608ms)  no >=400 responses
### /settings/monitoring/integrations (9580ms)  no >=400 responses
```

## Root Cause

`monitoring-incidents` declares `routeBase: "/settings/monitoring/error-logs"` in
[`platform-module-registry.ts:3827`](../../apps/admin/lib/runtime/platform-module-registry.ts#L3827).
`routeBase` means *where this module's records live*, and the runtime record
routes are built from it — so the registry's own contract says
`<routeBase>/<id>` is a record page. For every other module that is true,
because a `[recordId]` route exists. For this one it never did.

The belief that it exists is written down. [`monitoring-metrics.spec.ts`](../../apps/admin/lib/monitoring-metrics.spec.ts)
justifies using a sidebar override instead of changing `routeBase`:

> An override rather than a changed `routeBase`, because changing it would break
> `/settings/monitoring/error-logs/<id>`.

The spec reasons about protecting a route that returns 404. Nothing tested the
claim, so the assumption survived in a comment and in the registry, and the
screen shipped linking into empty space.

## Impact

Production, reachable by every platform user, on the screen used during an
incident. Twenty-five dead links per view. No data is exposed or lost — the
damage is that incident follow-up is impossible from the overview, and the
operator is offered a link to the tenant list at the moment they least want it.

The prefetch storm makes the same screen the slowest in the app: ~25s versus a
~6s baseline across the other 62 routes.

## Affected Areas

- `/settings/monitoring` — Incidents to pick up
- `apps/admin/app/_components/monitoring/monitoring-overview.tsx`
- `apps/admin/lib/runtime/platform-module-registry.ts` — `monitoring-incidents`
- `apps/admin/lib/monitoring-metrics.spec.ts` — asserts the false premise

## Proposed Resolution

Two directions, and the choice is a product decision the Architect should make:

1. **Build the detail route.** `error-logs/[traceId]/page.tsx`, rendering the
   sanitized incident the queue already returns. Makes `routeBase` honest and
   gives the runtime record route something to land on.
2. **Stop linking to a record.** Point the row at the queue filtered to that
   incident, which is where the detail actually lives today, and correct the
   registry so no other consumer builds a record URL.

Either way `monitoring-metrics.spec.ts` must stop asserting the premise, and a
regression test must fail when a module's `routeBase` has no record route.

## Acceptance Criteria

- Clicking any incident on `/settings/monitoring` reaches a page that renders
  that incident, with HTTP 200.
- Loading `/settings/monitoring` produces zero 4xx responses.
- `/settings/monitoring` settles within the same order of magnitude as its
  sibling monitoring pages.
- A test fails if a platform module's `routeBase` record route does not resolve.

## Regression Coverage

Needed: a test asserting that for every entry in the platform module registry
that the runtime treats as having records, the record route resolves to a page.
That check would have caught this at the commit that introduced it, and
generalises to every future module.

## Dependencies

None.

## Related Items

- [[BUG-1420]] — the severity filter on the same screen, found in the same run
- [[BUG-1421]] — admin-wide landmark and page-title defects

## Resolution

Not yet fixed.

## QA Retest

Pending.

## History

- 2026-08-26 — created from qa run at `8d6be21b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[platform-admin]]

<!-- GRAPH:END -->
