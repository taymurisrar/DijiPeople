---
PLAN_ID: PLAN-030
aliases: [PLAN-030]
TITLE: Monitoring and incident triage
AREA: monitoring
STATUS: CURRENT
MODULES: [error-logs, platform-monitoring, notifications, apps/admin]
RISK: HIGH
COVERAGE_UNIT: GOOD
COVERAGE_API: GAP
COVERAGE_DATABASE: GAP
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: GAP
COVERAGE_SECURITY: GAP
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-2459, BUG-2460, BUG-2465, BUG-1754, BUG-1750, BUG-1420, BUG-1419]
RELATED_REGRESSIONS: [REG-368, REG-369, REG-371, REG-282, REG-281]
CREATED_AT: 2026-08-30
UPDATED_AT: 2026-08-30
VERIFIED_AGAINST_SHA: 39d8ddc4
---

# PLAN-030 — Monitoring and incident triage

## Scope

The incident pipeline end to end: what gets recorded as a failure, how it is
classified on the way in, and whether the operator surface at
`/settings/monitoring` is usable for triage.

Covers `error-logs` (both write paths — the exception filter and
`POST /error-logs/client`), `platform-monitoring` (the queue, its filters and
its metrics), the admin monitoring screens, and the client-side pollers whose
failures land in the queue.

Deliberately excludes the `notifications` delivery pipeline itself — catalog,
orchestrator, queue, processor — which is a separate concern that happens to
share a module name.

## Risks

Ranked from what has actually gone wrong here, not from imagination.

1. **The queue fills with things nobody should triage, and the real signal is
   buried.** This is the dominant failure mode and it has now happened twice:
   BUG-1754 (1,588 rows) and BUG-2465 (1,870 of 1,897). It is insidious
   because nothing breaks — the screen loads, the data is real, and the
   operator simply stops looking.
2. **A client loop writes unboundedly to the queue.** BUG-2459: two
   fingerprints, 1,033 occurrences, from a handful of forgotten tabs. Volume
   grows with no user action at all.
3. **An incident is recorded without enough context to act on.** BUG-2462
   (`details: {}` on a six-day billing failure) and BUG-2463 ("Database
   constraint failed"). A row that cannot be acted on is worse than absent:
   it costs attention and returns nothing.
4. **The same concept spelled differently in two places.** BUG-1750 and
   BUG-1420: a tile counted 11 and linked to a filter matching 0.
5. **Unbounded client input reaching an operator surface.** BUG-2460: a 14 KB
HTML document rendered as an incident title.

## Preconditions

For the unit scenarios: none. The classification rule, the message bounding
and the rate-limit budgets are pure functions or single classes.

For the API and browser scenarios: a platform user holding `monitoring.read`
and, for status changes, `monitoring:manage`. Credentials are never recorded
here or in any scenario.

## Test Types

- **UNIT** — the classification rule, client message bounding, severity case
  folding. This is where the defects have actually been, and where they are
  cheapest to catch.
- **API** — the queue listing, its filters, and `PATCH` status transitions.
  Partially covered.
- **BROWSER_E2E** — the overview tiles agreeing with the lists they link to.
  Partial: reachable through the MCP browser against production, exercised
  during the 2026-08-30 triage, but not automated.
- **INTEGRATION / DATABASE / PERFORMANCE** — not covered. The pipeline is
  synchronous and single-table; there is no external boundary and no
  meaningful volume test short of production-scale data.

## Data Requirements

The production queue is itself the richest fixture and was used as such: the
full 1,897-row pull on 2026-08-30 is what surfaced every finding in this
plan. Aggregate it before reading it — 1,464 distinct groups is not a list
anyone can read row by row, and reading only the newest page is how the
earlier misses happened.

No fixture tenant is required. No credential belongs in this file.

## Security Cases

The queue is a **cross-tenant** surface — it holds incidents from every
tenant, and BUG-0005 was a support-role user reading another tenant's error
log. So:

- A tenant user must never reach `/platform/logs/*` at all.
- A platform user without `monitoring.read` sees the access-denied state,
  not an empty queue.
- Status changes require `monitoring:manage`.
- No incident payload may carry a token, password, key or full request body;
  `sanitizeForErrorLog` is the control, and anything added to `details` must
  be identifiers only.

## Negative Cases

The negative cases **are** the plan for the classification rule. Every
widening of what counts as routine must be paired with an assertion that the
neighbouring case still queues — see QA-PLATFORM-030. A filter over the only
queue anyone watches becomes a blindfold one exemption at a time.

Specifically: `400`, `403`, invalid-credential `401`, `409`, `422`, `429` and
every `5xx` must stay `NEW`, as must a `404` for a record rather than a route
and a `TENANT_NOT_FOUND` anywhere but public host resolution.

## State Transitions

`NEW` → `INVESTIGATING` → `RESOLVED`, with `NOT_AN_INCIDENT` reachable from
`NEW` and assigned at write time by the classifier.

The illegal transition that matters most is automated: a backfill or rule
change may move `NEW` → `NOT_AN_INCIDENT`, and must never touch a row an
operator has already moved to `INVESTIGATING` or `RESOLVED`, nor move any row
*into* the queue.

## Integration Cases

None owned by this area. Failures arriving *from* integrations (Stripe
webhooks, the attendance gateway) are recorded here but owned by their own
plans.

## Browser Cases

What a browser must prove, honestly stated: **the overview tiles agree with
the lists they link to.** That is exactly what BUG-1750 and BUG-1419 broke,
and neither was catchable below the browser — a tile counted 11, its link
filtered on a value nothing stores, and the screen it opened returned 0 of 0.

Tooling status: reachable and exercised manually through the MCP browser
against production. Not automated — there is no Playwright suite for the
admin console, so this is a manual check today.

## Regression Links

- REG-371 — expected protocol outcomes, and the backfill (QA-PLATFORM-030)
- REG-368 — a poller that could not tell a dead session from a bad minute
  (QA-PLATFORM-028)
- REG-369 — a rendered web page stored as an incident title (QA-PLATFORM-029)
- REG-282 — the original triage-queue record (BUG-1754)
- REG-281 — a tile that counted 11 and linked to 0 (BUG-1750, BUG-1420)

<!-- GRAPH:BEGIN — generated by scripts/rebuild-qa.mjs; edit the frontmatter, not this block -->

## Related

- Scenarios — [[QA-PLATFORM-028]], [[QA-PLATFORM-029]], [[QA-PLATFORM-030]]
- Bugs — [[BUG-2459]], [[BUG-2460]], [[BUG-2465]], [[BUG-1754]], [[BUG-1750]], [[BUG-1420]], [[BUG-1419]]
- Regressions — REG-368, REG-369, REG-371, REG-282, REG-281 (see the regression register)

<!-- GRAPH:END -->
