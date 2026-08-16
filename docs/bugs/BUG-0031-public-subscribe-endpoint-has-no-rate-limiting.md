---
ID: BUG-0031
aliases: [BUG-0031]
Title: Public subscribe endpoint has no rate limiting
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [services/api/src/modules/billing, apps/landing]
OwnerAgent: backend-api
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId: REG-023
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0031 — Public subscribe endpoint has no rate limiting

## Summary

`POST /api/public/subscribe` is unauthenticated and carries **no rate-limit
guard**, while every accepted call creates a `Lead`, a `CustomerAccount`, a
`Tenant` (consuming a globally unique tenant slug), a `Subscription`, three
`AuditLog` rows, a **Stripe Customer** and a **Stripe Checkout Session**. It is
the most expensive write on the entire public surface and the only unguarded one.

This is the same defect class as
[[BUG-0013-public-lead-endpoint-had-no-rate-limiting]], which was fixed and
covered by REG-011. The guard was applied to `/public/leads` and not carried to
the endpoint added later.

## Expected Behavior

Every public write path is throttled. `apps/landing/AGENTS.md` states the rule
directly: "do not add a public write path that bypasses it."

## Actual Behavior

`PublicBillingController` declares `@Controller('public')` with **no
controller-level `@UseGuards`**. Its three handlers diverge:

| Handler | Guard |
|---|---|
| `GET plans` | none |
| `GET commercial-config` | `@UseGuards(PublicRateLimitGuard)` |
| `POST subscribe` | **none** |

The sibling handler two methods above `subscribe` carries the guard, so this is
an omission rather than a decision.

## Reproduction

1. Start the API.
2. `POST /api/public/subscribe` with a valid published `planPriceId` and a fresh
   e-mail address, more than 20 times inside ten minutes from one IP.
3. Every call returns 200 with a Stripe checkout URL. No `429` is ever returned.
4. Compare with `POST /api/public/leads`, which returns
   `PUBLIC_RATE_LIMITED` / 429 after 20 calls in the same window.

Comparative reproduction is what makes this unambiguous: the two endpoints sit
behind the same landing app, and only one is throttled.

## Evidence

- `services/api/src/modules/billing/controllers/public-billing.controller.ts:18`
  — `@Controller('public')`, no `@UseGuards`.
- Same file `:46-48` — `commercial-config` **does** carry
  `@UseGuards(PublicRateLimitGuard)`.
- Same file `:76-77` — `@Public()` then `@Post('subscribe')`, no guard.
- `services/api/src/modules/leads/public-leads.controller.ts:14` — the
  controller-level guard, with a comment explaining why it was added.
- `services/api/src/modules/billing/services/billing.service.ts:269-376` — the
  transaction creating `Lead`, `CustomerAccount`, `Tenant` and `Subscription`;
  `:318` consumes a unique tenant slug; `:377-390` creates the Stripe Customer;
  `:409-430` creates the Checkout Session.
- `services/api/src/common/guards/public-rate-limit.guard.ts:16-20` — 20 non-GET
  per IP+path per 10 minutes.

`GET /public/plans` is likewise unguarded, but it is a cached read and is not
the substance of this record.

## Root Cause

Established: the rate limit is applied **per controller or per handler by hand**,
with no mechanical check that a `@Public()` write path has one. `PublicLeadsController`
puts the guard at controller level; `PublicBillingController` puts it on one
handler and not the others. Nothing fails when a new public write is added
without it.

[[ITEM-0013]] already proposes exactly that mechanical check and is unbuilt.
This bug is the second instance of the failure it predicted.

## Impact

Reachable in production by anyone, with no account.

- **Database growth** — unbounded `Tenant` rows, each consuming a unique slug
  from a global namespace. Slug exhaustion or squatting on a desirable tenant
  slug is possible without ever paying.
- **Stripe object growth** — a Customer and a Checkout Session per call, against
  the real Stripe account. This has a cost and a rate ceiling outside our
  control.
- **Honeypot is not a substitute.** `billing.service.ts:228-230` short-circuits
  on the honeypot field, which stops naive bots and nothing deliberate.

Severity `HIGH` rather than `CRITICAL`: no cross-tenant exposure, no
authentication bypass, and the created tenants are `INACTIVE` / pending payment.

## Affected Areas

`services/api/src/modules/billing/controllers/public-billing.controller.ts` ·
`billing.service.ts` · `apps/landing` `/subscribe` · Stripe account hygiene ·
the `Tenant` slug namespace.

## Proposed Resolution

Direction, not a patch: move `PublicRateLimitGuard` to **controller level** on
`PublicBillingController`, matching `PublicLeadsController`, so a handler added
later inherits it rather than needing to remember it.

Needs an ExecPlan only if the fix is widened to the mechanical guard in
[[ITEM-0013]] — which is the durable fix, and is where the effort belongs. A
per-IP limit is also a weak control for this endpoint specifically while
[[BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b]]
is open, because the API cannot see the visitor's IP through the landing proxy.
The two should be resolved together, or the throttle will be measured against
the wrong identity.

## Acceptance Criteria

- `POST /api/public/subscribe` returns `429` / `PUBLIC_RATE_LIMITED` after the
  configured number of writes in the window.
- A test fails if a `@Public()` handler with a non-GET method has no rate-limit
  guard.
- No `Tenant`, `CustomerAccount` or Stripe object is created by a throttled call.

## Regression Coverage

**None today.** The regression must assert a `429` on the 21st subscribe call,
mirroring `public-leads.rate-limit.spec.ts` (REG-011).

## Dependencies

[[ITEM-0013]] — the mechanical check that would have caught this.
[[BUG-0032-landing-proxies-collapse-every-visitor-into-one-rate-limit-b]] —
without it, the limit keys on the wrong identity.

## Related Items

[[BUG-0013-public-lead-endpoint-had-no-rate-limiting]] (same class, fixed) ·
[[ITEM-0013]] · [[landing-architecture]] · [[landing-website]] · [[billing]] ·
bug pattern [[authorization-missing]].

## Resolution

Fixed, together with [[ITEM-0013]] and BUG-0032 as the triage required.

The one-line guard move was deliberately **not** done on its own, because doing
only that is what produced the second and third instances of this defect. Three
things changed:

1. `services/api/src/common/guards/public-write-rate-limit.invariant.spec.ts`
   — ITEM-0013, built. It reads every `*.controller.ts` under
   `src/modules`, resolves each `@Public()` to the handler it actually
   decorates, and fails when that handler writes without
   `PublicRateLimitGuard`. Exemptions are a named allowlist carrying a reason,
   not a silent skip, and a stale allowlist entry is itself a failure.
2. The invariant then surfaced the true inventory, which was larger than this
   record described: **14 unguarded public write handlers across 4 controllers**
   — `agent.controller.ts` (3), `auth.controller.ts` (7),
   `admin-auth.controller.ts` (3), `tenants.controller.ts` (1). All 14 now
   carry the guard.
3. Guards are applied per handler rather than at controller level, because all
   four controllers are mixed: `AgentController` also serves an authenticated
   `POST /agent/sessions/heartbeat` that desktop agents call continuously, and
   a class-level guard would have throttled it to 20 calls per 10 minutes.

The first draft of the invariant was itself too weak — it passed when *any*
handler in a file carried the guard, which is precisely how this endpoint slipped
through beside an already-guarded sibling. It was tightened to per-handler before
being relied on.

## QA Retest

`npm --workspace api run test -- --testPathPatterns "public-write-rate-limit"`
— 13 assertions, all passing. Verified to fail correctly: before the guards were
applied it reported all 4 controllers and named all 14 handlers.

Full API suite run as CI runs it (`--testNamePattern` excluding the known
baseline failure): **155 suites, 1107 tests, all passing**.

## History

- 2026-08-16 — found during the `apps/landing` deep documentation audit
  (TASK-0002) and verified directly against source at `78072d2`.
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`. The one-line guard move is
  obvious, but doing only that repeats the pattern a third time; the durable fix
  is the mechanical check in ITEM-0013, and it must be sequenced with BUG-0032
  so the limit is keyed on a real client identity.
- 2026-08-16 — fixed. ITEM-0013 built first, then the inventory it produced was
  cleared in full rather than only the endpoint named in this record.
