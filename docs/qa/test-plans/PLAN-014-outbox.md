---
PLAN_ID: PLAN-014
aliases: [PLAN-014]
TITLE: Transactional outbox delivery and idempotency
AREA: outbox
STATUS: CURRENT
MODULES: [outbox]
RISK: HIGH
COVERAGE_UNIT: GAP
COVERAGE_API: NOT_APPLICABLE
COVERAGE_DATABASE: GOOD
COVERAGE_INTEGRATION: GAP
COVERAGE_E2E: GAP
COVERAGE_BROWSER: NOT_APPLICABLE
COVERAGE_SECURITY: NOT_APPLICABLE
COVERAGE_PERFORMANCE: GAP
RELATED_BUGS: [BUG-0070]
RELATED_REGRESSIONS: [REG-064]
CREATED_AT: 2026-08-18
UPDATED_AT: 2026-08-18
VERIFIED_AGAINST_SHA: bd0fb36
---

# PLAN-014 — Transactional outbox delivery and idempotency

## Scope

`services/api/src/modules/outbox` — the emitter, the dispatcher and the poll
worker. Covers the guarantee that a business state change and the event
announcing it commit together, that delivery is at-least-once, and that
consumers are idempotent.

**Deliberately excludes** the consumers themselves. Each domain module owns tests
for what its own handler does; this plan owns the delivery mechanism. Also
excludes `PlatformEvent`, which is observability and delivers nothing.

## Risks

Ranked by what actually goes wrong with an outbox:

1. **An event written outside its business transaction.** Announces something
   that rolled back, or loses something that committed. Highest severity because
   nothing downstream can detect it.
2. **Duplicate delivery causing duplicate side effects.** Two tenants provisioned
   for one payment. Guarded by `OutboxEventConsumption`'s unique constraint.
3. **Two dispatchers claiming one event.** The find-then-update failure mode that
   `FOR UPDATE SKIP LOCKED` exists to remove.
4. **A crashed dispatcher stranding events forever.** Guarded by the claim lease.
5. **Retry exhaustion silently swallowing a transition.** `FAILED` must be
   visible, not merely logged.
6. **A retriable failure and a permanent one treated the same.** Burns the attempt
   budget and misattributes the cause.

Related bug patterns: `premature-completion`, `silent-configuration-fallback` — a
worker that is off by default is safe, but a deployment with *no* worker enabled
fails silently, and that is a configuration risk rather than a code one.

## Preconditions

Real PostgreSQL with migrations applied through
`20260818090000_transactional_outbox`. No seed data required. The poll loop should
stay **off** (`OUTBOX_WORKER_ENABLED` unset) so tests drive `drain()` directly and
control timing.

## Test Types

| Type | Status | Note |
|---|---|---|
| UNIT | **COVERED** | `outbox.service.spec.ts`, `outbox-dispatcher.service.spec.ts` — 13 tests |
| DATABASE | **GAP** | The unique indexes, `FOR UPDATE SKIP LOCKED` and transactional rollback cannot be demonstrated against Prisma doubles. Blocker: no local PostgreSQL credential. CI's database jobs are the environment. |
| INTEGRATION | **GAP** | Awaits the first real consumer (WP-07). |
| E2E | **GAP** | Awaits payment to provisioning (WP-07). |
| PERFORMANCE | **GAP** | Claim-query behaviour under a large backlog is unmeasured. |
| API / BROWSER / SECURITY | **NOT_APPLICABLE** | No HTTP surface and no user-facing surface yet. An admin operations view arrives in WP-11 and will add API and SECURITY rows then. |


> **Why COVERAGE_UNIT is GAP when unit specs exist.** The coverage matrix
> counts *scenarios*, not spec files, because a spec the registry cannot select
> cannot be re-run by `qa:select`. The specs listed under Test Types are real and
> pass; what is missing is a UNIT-type scenario record pointing at them. That gap
> is the accurate statement, and closing it is WP-13 work.

## Data Requirements

Events constructed inline per test. No fixtures, no tenants, no credentials.

## Security Cases

`NOT_APPLICABLE` at this SHA — the module exposes no route. When WP-11 adds an
operations view, this section must gain: platform-guard enforcement, and the rule
that `payload` is never rendered to a tenant-scoped caller, since an event body
can carry another tenant's identifiers.

## Negative Cases

- `emit` with a duplicate `idempotencyKey` → returns the existing event, not an error.
- `emit` failing for a non-unique reason → propagates, so the caller's transaction rolls back.
- An event type with no registered consumer → `PROCESSED`, not failed.
- A handler throwing → `RETRY_SCHEDULED` while budget remains, `FAILED` after.
- A handler returning `MANUAL_ACTION_REQUIRED` → that status, never `RETRY_SCHEDULED`.

## State Transitions

Legal: `PENDING → CLAIMED → PROCESSED`; `CLAIMED → RETRY_SCHEDULED → CLAIMED`;
`CLAIMED → FAILED`; `CLAIMED → MANUAL_ACTION_REQUIRED`; expired
`CLAIMED → RETRY_SCHEDULED`; any → `DISCARDED` by an operator.

Illegal and to be rejected: `PROCESSED → CLAIMED` (a settled event must never be
re-delivered), and any transition that increments `attemptCount` during lease
reclaim.

## Integration Cases

Not yet applicable. When consumers exist: consumer timeout, consumer 5xx,
malformed payload, and redelivery after a lost response must each leave exactly
one business effect.

## Browser Cases

None. Stated rather than left blank: this module has no browser surface at this SHA.

## Regression Links

None yet. QA-BILLING-002 implements this plan; a regression entry becomes
appropriate the first time a delivery defect is found in the wild.
