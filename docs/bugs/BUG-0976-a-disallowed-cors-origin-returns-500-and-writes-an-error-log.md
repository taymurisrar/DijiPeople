---
ID: BUG-0976
aliases: [BUG-0976]
Title: A disallowed CORS origin returns 500 and writes an error-log row, so anyone can fill the table
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: be486ae1
AffectedModules: [services/api/src/config]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: REG-240
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-24
ResolvedAt: 2026-08-23
---

# BUG-0976 — A disallowed CORS origin returns 500 and writes an error-log row, so anyone can fill the table

## Summary

`buildCorsOptions` refused an origin outside the allowlist by calling
`callback(new Error(...), false)`. The `cors` middleware treats an `Error` as a
thrown failure rather than a decision, so Nest's `HttpExceptionFilter` rendered
it as `500 SYSTEM_UNEXPECTED_ERROR` — and that filter persists **every** error
through `ErrorLogsService`.

The result: any unauthenticated caller could write rows into the production
error-log table, indefinitely, by sending ordinary requests with a varying
`Origin` header. No credentials, no rate limit in front of it, and each row
looks like a genuine server fault.

## Expected Behavior

A refused origin is a policy decision, not a server error. The server answers
normally and simply withholds `Access-Control-Allow-Origin`; the **browser** then
blocks the response. That is how CORS is specified to work, and it is what
`callback(null, false)` does.

## Actual Behavior

Observed against production (`ef57b2a`) on 2026-08-23:

```
GET /api/public/plans                                  → 200
GET /api/public/plans   Origin: https://www.dijipeople.com → 200  (ACAO set)
GET /api/public/plans   Origin: http://localhost:3001  → 500  (ACAO null)
GET /api/public/plans   Origin: https://evil.example   → 500  (ACAO null)
GET /api/public/plans   Origin: not-a-url              → 500  (ACAO null)
```

Every allowed origin succeeds; **every** other value produces a 500.

## Reproduction

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://api.dijipeople.com/api/public/plans
# 200

curl -s -o /dev/null -w '%{http_code}\n' \
  -H 'Origin: https://anything.example' \
  https://api.dijipeople.com/api/public/plans
# 500
```

Found by accident: `scripts/smoke-deployment.mjs` sends `Origin` on every
request, so the two checks added for ITEM-0086 reported 500 while a plain fetch
of the same endpoints returned 200. The discrepancy was the bug, not the script.

## Evidence

`services/api/src/config/env.validation.ts:137` before the fix:

```ts
callback(new Error(`Origin ${origin} is not allowed by CORS.`), false);
```

The amplification path — `services/api/src/common/filters/http-exception.filter.ts:124`:

```ts
await this.errorLogsService.persist({ … });
```

So one refused pre-flight or request equals one persisted row.

## Root Cause

The two-argument `cors` callback overloads a single parameter: the first
argument is an *error channel*, not a *reason*. Passing an Error to explain the
refusal reads naturally and is wrong — the middleware rethrows it, and
everything downstream treats a working access control as a crash.

Nothing caught it because there was no spec over `buildCorsOptions` at all, and
because every test and every legitimate client sends either an allowed origin or
none.

## Impact

Three distinct harms, in increasing order of seriousness:

1. **Wrong status.** Callers from unlisted origins see a server error rather
   than a CORS refusal — misleading for anyone integrating.
2. **Real 500s get buried.** Any scanner sending an `Origin` header produced
   `SYSTEM_UNEXPECTED_ERROR`, so the error log filled with the control working.
3. **Unauthenticated write amplification into the production database.** The
   error-log table grows without bound at the request rate of anyone who cares
   to. Reachable on production today, on a public endpoint, with no auth.

## Affected Areas

- `services/api/src/config/env.validation.ts` (`buildCorsOptions`)
- `services/api/src/common/filters/http-exception.filter.ts` (the persistence)
- every public endpoint, since CORS is applied globally in `main.ts`

## Proposed Resolution

`callback(null, false)`. One line, no behaviour change for allowed origins, and
it restores the specified CORS semantics.

Worth considering separately: `HttpExceptionFilter` persisting *every* 500 with
no sampling or rate limit is the amplifier that made a status-code mistake into
a database-growth problem. This fix removes today's trigger; it does not remove
the amplifier.

## Acceptance Criteria

- A request with a disallowed `Origin` returns the endpoint's normal status and
  omits `Access-Control-Allow-Origin`.
- A request with an allowed `Origin` still returns it.
- A request with no `Origin` is still allowed (server-to-server, curl, health
  checks).
- No error-log row is written for a refused origin.

## Regression Coverage

`services/api/src/config/cors-options.spec.ts`. Mutation-tested: restoring
`callback(new Error(...), false)` fails 3 of its 5 cases.

## Dependencies

None. The fix is one line and ships with any deploy — but it cannot reach
production until [[BUG-0899]] stops aborting them.

## Related Items

[[BUG-0899]] — blocks this from deploying.

## Resolution

Fixed on `agent/release-landing-e2e` in `env.validation.ts`: `callback(null,
false)`, with a comment recording why an Error there is not a smaller mistake
than it looks. Full API suite: 213 suites / 1690 tests pass.

**Not yet in production** — the API has not deployed since `ef57b2a`.

## QA Retest

Verified by [`2026-08-24-record-state-reconciliation-0a5586f.md`](../qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md) on 2026-08-24 at `0a5586f`.

REG-240 — `cors-options.spec.ts` passes.

## History

- 2026-08-23 — found while adding the ITEM-0086 smoke checks; fixed the same day.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[deployment-architecture]]
- Regression — REG-240 (see the regression register)

<!-- GRAPH:END -->
