---
TASK_ID: TASK-0008
aliases: [TASK-0008]
TITLE: Self-service customer onboarding, tenant provisioning, domain routing and central login
TYPE: FEATURE
SIZE: LARGE
STATUS: IN_PROGRESS
PRIORITY: P0
CREATED_AT: 2026-08-18
AFFECTED_MODULES: [super-admin, tenant-domains, tenant-control-plane, auth, billing, notifications, legal, landing, web, admin]
AGENTS: [Architect, Database, Backend/API, Frontend, UI/UX, Integration, Security, QA, Reviewer, Integrator]
DEPENDENCIES: origin/develop 494c44d; TASK-0007 WP-01..WP-10, WP-12
CURRENT_PACKAGE: WP-08
COMPLETED_PACKAGES: [WP-01, WP-02, WP-03, WP-04, WP-05, WP-07, WP-10, WP-11]
BLOCKED_PACKAGES: [WP-06]
OWNER_DECISIONS: 4
FINAL_STATUS:
---

# TASK-0008 — Self-service customer onboarding, tenant provisioning, domain routing and central login

## What this record is

The brief that opened this parent describes the self-service acquisition system
end to end, from a visitor on the public site to a Tenant Owner opening their
workspace. **Most of that system already exists.** It was built across the
commercial-platform waves and TASK-0007, and it is not obvious from the outside
because it is spread over four deployables.

So the first act of this parent was not planning — it was **reconciliation**:
probing each requirement in the brief against the code at `494c44d` and
recording which are already satisfied, which are partially satisfied, and which
are genuinely absent. That reconciliation is the section below, and the work
packages descend from it rather than from the brief's chapter order.

Writing the already-built two thirds a second time would have been the single
most expensive mistake available here, and the brief's own instruction —
*"Architect and Database Agent must reconcile the current schema first"*,
*"use existing entities where appropriate instead of blindly duplicating them"* —
says so directly.

## Objective

Close the genuine gaps between the brief and the repository so that a visitor
can buy a plan on the public site and finish inside their own provisioned
workspace with no Platform Admin intervention. A reader knows it is finished
when the reconciliation table below carries no `ABSENT` or `PARTIAL` row without
an evidenced disposition, and `develop` holds the work behind a green exact-SHA
gate.

## Reconciliation against the brief at `494c44d`

`BUILT` means the requirement is satisfied by code that exists and is tested.
`PARTIAL` means the mechanism exists but does not meet the brief.
`ABSENT` means there is nothing.

### Already built — do not rebuild

> **Four rows in this table were withdrawn on 2026-08-19.** All were read from
> the *presence* of code — a provisioning engine exists, a webhook emits a
> provisioning event — without following the call graph to the end. Following it
> showed the website never reaches the engine and the event has no consumer. The
> rows are struck through rather than deleted, because a reconciliation that
> quietly edits its own wrong answers teaches the next reader nothing about how
> far to trust the rest of it. The lesson generalises: *emitted* is not
> *handled*, and *exists* is not *reached*.

| Brief requirement | Evidence | State |
|---|---|---|
| Server-authoritative plan, market, currency, price | `super-admin/commercial-offer.resolver.ts`, `markets.catalog.ts`, `plans.catalog.ts`, `PlanPrice` | BUILT |
| Browser-posted price is never trusted | `plan-read-path-purity.spec.ts`; money resolved server-side into `SubscriptionOrder` | BUILT |
| Durable pre-customer commercial transaction | `SubscriptionOrder` (`schema.prisma:13044`) — DRAFT status, `expiresAt`, `abandonedAt` | BUILT |
| Abandoned checkout does not pollute Customers/Tenants | `SubscriptionOrder.status`, `submissionHash` released on abandonment | BUILT |
| Double-submit / refresh absorption | `submissionHash @unique`, nullable and released — database refuses the second, not a racing pre-check | BUILT |
| Stripe webhook authenticity, replay and idempotency | `StripeWebhookEvent` (`schema.prisma:8061`), `webhook.service.ts` | BUILT |
| ~~Payment confirmation authorizes provisioning~~ | **Withdrawn.** The webhook confirms payment and emits `PROVISIONING_REQUESTED`; nothing consumes it. Payment authorises nothing today — [[BUG-0078]] | ABSENT |
| ~~One provisioning engine for website and Platform Admin~~ | **Withdrawn.** The engine exists and only Platform Admin reaches it. The website path never calls it; its tenant comes from a pre-payment block — [[BUG-0077]], [[BUG-0078]] | PARTIAL |
| Durable, stateful, resumable provisioning | `TenantProvisioningRun` / `TenantProvisioningStep` (`schema.prisma:2424`, `:2466`) | BUILT |
| Per-step retryability | `TenantProvisioningStep.isRetryable`; `tenant-provisioning-retry.spec.ts` | BUILT |
| Provisioning idempotency | `tenant-provisioning-idempotency.spec.ts` | BUILT |
| Provisioning observability — step, timing, failure, attempt | run/step rows carry `failedStepKey`, `durationMs`, `attempt`, `correlationId` | BUILT |
| Operational targets and breach tracking | `targetReadyBy`, `escalateAt`, `breachedAt` on the run | BUILT |
| `TenantDomain` model with type, primary, verification, TLS | `schema.prisma:2363` — `SYSTEM_SUBDOMAIN` / `CUSTOM_DOMAIN`, DNS TXT challenge | BUILT |
| Hostname uniqueness enforced by the database | `TenantDomain.domain @unique` | BUILT |
| Slug normalisation and reserved-name list | `common/utils/slug.util.ts` + `.spec.ts` | BUILT |
| Canonical hostname resolver | `tenant-domains/tenant-domain.service.ts`, `workspace-resolution.service.ts` | BUILT |
| Unknown host never falls through to another tenant | `workspace-resolution.service.spec.ts`; `test/workspace-domain-isolation.e2e-spec.ts` | BUILT |
| Forwarded-host trust is bounded | `tenant-domains/request-hostname.ts` + `.spec.ts` — trusts the chain only behind a trusted proxy | BUILT |
| Hostname is not authorization | `/workspaces/access-check` decides from the session's own tenant | BUILT |
| Edge hostname routing for the shared deployment | `apps/web/proxy.ts` (611 lines) — resolves once, forwards unforgeable headers | BUILT |
| Wrong-tenant denial with a safe onward path | `assertSessionMatchesWorkspace()` → `/workspace/wrong-workspace` | BUILT |
| ~~Central login and workspace discovery~~ | **Withdrawn.** The entry point exists and the landing Login link is correct, but `AuthService` refuses to authenticate without tenant context — `AUTH_TENANT_REQUIRED`. Login from the marketing site with no tenant in hand fails — [[ITEM-0062]] | PARTIAL |
| ~~Workspace picker~~ | **Withdrawn.** The page renders, and `/workspaces/mine` returns a one-element array *by construction*: it reads `user.tenantId` from the session. There is never more than one workspace to pick — [[ITEM-0062]] | PARTIAL |
| Unknown-workspace state | `apps/web/app/workspace/not-found/page.tsx` | BUILT |
| Direct tenant login preserving return context | `apps/web/app/t/[tenantSlug]/login/page.tsx`; proxy redirect | BUILT |
| Environment families for one customer | `TenantEnvironmentGroup` (`schema.prisma:2401`) | BUILT |
| Non-production workspaces visibly marked | `workspace-environment-banner.tsx`, `isNonProductionWorkspace()` | BUILT |
| Versioned legal documents and consent evidence | TASK-0007 WP-02 / WP-03 — `LegalDocument`, publication, acknowledgements | BUILT |
| Billing failure does not delete a live tenant | TASK-0007 WP-08 — cancellation, retention, holds, erasure as a separate lifecycle | BUILT |
| Admin provisioning status and guarded retry | `tenant-operations-panel.tsx` — `canRetry`, `retryBlockedReason`, step table | BUILT |
| Admin domain operations | `tenant-domains-panel.tsx`, `tenant-domains-admin.service.ts` | BUILT |
| Reconciliation jobs against Stripe | TASK-0007 WP-09 | BUILT |
| Data-residency readiness — placement separable from hostname | `Tenant.dataRegion` and `Tenant.environmentType`; `TenantDomain` binds a hostname to a tenant, never to a placement | BUILT |
| Canonical columns for the whole organization profile | `CustomerAccount` already carries `legalCompanyName`, `registrationNumber`, `taxId`, `industry`, `companySize`, `estimatedEmployeeCount`, `addressLine1/2`, `city`, `stateProvince`, `country`, `website` | BUILT |
| Canonical columns for owner identity | `CustomerAccount.primaryContactFirstName` / `primaryContactLastName` / `primaryContactEmail` / `primaryContactPhone` | BUILT |

### Genuine gaps — this parent's actual scope

**Corrected after reading `CustomerAccount`.** G-02 and G-04 were first written as
though the organization and owner fields did not exist. They do — every one of
them, on the canonical entity, unused. `resolveCustomer()` in
`subscription-order.service.ts` even says so in a comment, and refuses to
fabricate: *"industry and companySize are deliberately absent. The subscribe form
does not ask for them, and writing 'Unknown' into a reportable column makes a
fabricated value indistinguishable from a real one."*

That moves both rows from *schema work* to *capture work*, and it is the whole
difference between a migration and a form. The one column this parent genuinely
has to add is the slug reservation in G-03.

| GAP | Brief requirement | Repository truth | State |
|---|---|---|---|
| G-01 | Multi-step public onboarding capturing organization, workspace, owner, agreements, review | `apps/landing/app/subscribe/subscribe-form.tsx` is one 351-line form capturing only company/workspace name, contact name, email, phone, country | PARTIAL |
| G-02 | Organization identity — legal name, registration number, tax number, industry, employee count, registered address | the columns exist on `CustomerAccount` and are never written by the public path. **Capture gap, not a schema gap** | ABSENT |
| G-03 | Workspace step — slug entry, live availability, `[slug].dijipeople.com` preview | validation is complete (`slug.util.ts`, reserved labels shared with the host parser) and `Tenant.slug` is unique — but no slug is ever *collected*, and none can be reserved before `Tenant` exists. **The one real schema change in this parent** | ABSENT |
| G-04 | Tenant Owner step — first/last name separately, job title | `primaryContactFirstName`/`LastName` exist and are filled by splitting one "Contact name" field on whitespace; job title has no column and no canonical home yet | PARTIAL |
| G-05 | Email verification before activating a self-service Tenant Owner | no verification subsystem in `services/api/src` — brief calls this a minimum | ABSENT |
| G-06 | Live provisioning progress reflecting real backend state | `/subscribe/success` is a static 32-line page telling the customer to wait | ABSENT |
| G-07 | Workspace-ready state with an "Open DijiPeople" button on the canonical domain | not present | ABSENT |
| G-08 | Workspace switcher inside the tenant app for multi-membership users | no component exists — `/workspaces/mine` has no in-app consumer | ABSENT |
| G-09 | Public slug availability endpoint, advisory only, rate-limited, non-enumerable | no public endpoint; reservation happens inside provisioning | ABSENT |
| G-10 | Resume an abandoned onboarding through a secure mechanism | `expiresAt`/`abandonedAt` exist; no continuation token or resume route | PARTIAL |
| G-11 | Last-used workspace preference | not stored | ABSENT |

### Documentation drift found during reconciliation

| Finding | Classification |
|---|---|
| `docs/knowledge/architecture/tenant-workspace-routing.md` presents BUG-0017 as live. The bug is `Status: VERIFIED`, `ArchitectDisposition: DONE`, `ResolvedAt: 2026-08-16`. The note was generated at `ad8f77f` and never regenerated. | STALE_REPOSITORY_DOC |
| TASK-0007 lists WP-11 as `NOT_STARTED`, but the provisioning-operations half of it — status, steps, guarded retry — is present in `tenant-operations-panel.tsx`. | STALE_REPOSITORY_DOC |

Both are recorded here rather than silently fixed, per the retrieval contract.

## Work Packages

| WP_ID | TITLE | STATUS | DEPENDENCIES | AGENTS | BRANCH | SHA | QA_STATUS | CI_STATUS | MERGE_STATUS |
|---|---|---|---|---|---|---|---|---|---|
| WP-01 | Onboarding draft model, slug reservation and session-bound availability API | DONE | — | Database, Backend/API, Security | agent/self-service-onboarding-provisioning | pending | PASS | NOT_RUN | NOT_STARTED |
| WP-02 | Email verification for the self-service Tenant Owner | DONE | WP-01 | Backend/API, Security, Integration | agent/self-service-onboarding-provisioning | pending | PASS | NOT_RUN | NOT_STARTED |
| WP-03 | Onboarding status API for the provisioning experience | DONE | WP-01 | Backend/API | agent/self-service-onboarding-provisioning | pending | PASS | NOT_RUN | NOT_STARTED |
| WP-04 | Onboarding API surface — organization profile, owner identity, agreements, draft session | DONE | WP-01, WP-02 | Backend/API, Database | agent/self-service-onboarding-provisioning | pending | PASS | NOT_RUN | NOT_STARTED |
| WP-11 | Public onboarding wizard UI — organization, workspace, owner, agreements, review | DONE | WP-04 | Frontend, UI/UX | agent/self-service-onboarding-provisioning | pending | PASS_WITH_RISKS | NOT_RUN | NOT_STARTED |
| WP-05 | Provisioning progress and workspace-ready experience | DONE | WP-03, WP-04 | Frontend, UI/UX | agent/self-service-onboarding-provisioning | pending | PASS | NOT_RUN | NOT_STARTED |
| WP-06 | Workspace switcher and last-used workspace | BLOCKED | ITEM-0062 | Frontend, UI/UX, Backend/API, Database, Security | — | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-07 | Security review — enumeration, abuse, rate limiting, redirect safety | DONE | WP-01..WP-05 | Security | agent/self-service-onboarding-provisioning | pending | PASS | NOT_RUN | NOT_STARTED |
| WP-08 | QA campaign — real PostgreSQL, concurrency, browser E2E | NOT_STARTED | WP-07 | QA | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-09 | Review, exact-SHA CI, develop integration, knowledge and closure | NOT_STARTED | WP-08 | Reviewer, Integrator, Architect | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-10 | Payment-authorised provisioning — BUG-0077 and BUG-0078 | DONE | WP-01 | Backend/API, Integration, Database, Security, QA | agent/self-service-onboarding-provisioning | pending | PASS | NOT_RUN | NOT_STARTED |

WP-01 is the root because every other package depends on the customer being
able to *name* their workspace — which the current flow never asks. G-03 is
therefore not a UI gap; it is a missing field on the commercial record, and the
wizard cannot be built above it until the record can hold the answer.

Its schema footprint is one nullable-unique column, not a migration of the
organization profile. That only became clear after reading `CustomerAccount`,
which is why the reconciliation above carries a correction rather than a tidy
first draft.

WP-06 has no dependency on the onboarding chain and is `PARALLEL_SAFE`: the
switcher consumes `/workspaces/mine`, which already exists and already returns
what it needs.

**WP-10 was not in the original decomposition and is now the critical path.** It
was found while placing WP-02's verification gate, which required reading the
checkout function end to end. Two defects, one root — TASK-0007 WP-07 closed
`DONE` with half its scope unbuilt:

- [[BUG-0077]] — the public path still creates a `Lead`, a second
  `CustomerAccount`, a `Tenant` and a `Subscription` *before payment*, alongside
  the order path that replaced them. Every unpaid submission consumes a workspace
  slug permanently, and `requestedSlug` from WP-01 is ignored because the tenant
  is created with a derived slug.
- [[BUG-0078]] — `PROVISIONING_REQUESTED` is emitted into the outbox and nothing
  consumes it. The only consumer in the codebase handles `PAYMENT_CONFIRMED`.
  Automatic provisioning has never run; the pre-payment tenant is what hides it.

**They must land together, and that constraint is the reason WP-10 exists as one
package rather than two.** Removing the pre-payment tenant without wiring the
consumer takes the platform from "provisions the wrong way" to "does not provision
at all". An implementation of BUG-0077 alone was written during this session and
**reverted rather than committed**, once the missing consumer was discovered.

WP-10 blocks the value of WP-01 and precedes WP-02: there is no point gating a
checkout that provisions the wrong tenant. Plan:
[`EXECPLAN-0001`](../plans/EXECPLAN-0001-tenant-creation-behind-confirmed-payment.md).

## WP-07 — security review of the public onboarding surface

Reviewed at `ffda0e3`, after WP-05 closed the last customer-facing gap. Six
questions, each answered against the code rather than the design.

| Question | Finding |
|---|---|
| Can the slug check be used to enumerate DijiPeople's customers? | **No.** `GET /public/onboarding/:id/workspace-address` refuses to answer without a live order, so a caller must first create a rate-limited, durably recorded row before asking anything. A dead session and a fabricated one both return 404 with the same body — returning "expired" for one and "not found" for the other would hand back the distinction the binding exists to withhold. |
| Is every new public handler rate limited? | **Yes**, and at the class rather than per handler. That is the shape [[BUG-0075]] fixed and the shape that survives the next handler being added beside these. The guard is deliberately *not* repeated on individual handlers: Nest concatenates class- and handler-level guards without deduplicating, so a second decorator would spend two tokens from a one-request budget and halve the limit. |
| Can the client's address be forged to escape the limit? | **No.** `resolveClientIp` trusts `X-Forwarded-For` only behind `isProxyTrusted`, falling back to the socket peer otherwise. But the *forwarding* half of that was a convention with a comment pretending to be a check — [[BUG-0081]], fixed here. |
| Is the checkout return an open redirect? | **No.** `resolvePublicCheckoutUrl` builds from `LANDING_APP_URL` / `PUBLIC_APP_URL` / `WEB_APP_URL` and throws when none is configured. The path is server-constructed; no part of it comes from the request. |
| Does the order id leak once it is in the address bar? | **No.** `Referrer-Policy: strict-origin-when-cross-origin` is set for all three apps in `packages/config/security-headers.js`, so a cross-origin request carries the origin without the path. That includes the "Open DijiPeople" link, which points at a different host. |
| Does the status endpoint over-share with whoever holds the id? | **No.** It returns the order number, a coarse state, four labelled steps, and — only once the workspace can actually be opened — its name and hostname. No email, no amount, no provider identifier, no internal step key, and no failure detail beyond one sentence a customer can act on. |

**Deliberate acceptance.** Holding the order id is holding the capability. It is
an unguessable v4 uuid, it is the same token the buyer's browser carried through
the whole wizard, and everything it unlocks is that buyer's own data. Adding a
second factor to a page somebody reaches by paying would trade a real conversion
loss for no attacker they do not already have.

**One finding, fixed in package.** [[BUG-0081]] — all three apps asserted that a
`forwarded-headers.invariant.test.ts` failed the build when a route handler
forgot to forward the visitor's address. No such file existed. The convention
was intact across all 24 direct-API handlers, which is exactly why nothing had
surfaced it: a missing check with nothing to find produces no failing test, and
the only signal was a comment claiming the opposite of the truth. Regression
[[REG-071]], scenario [[QA-LANDING-010]], mutation-verified.

**One finding recorded, not fixed.** `server-api.ts` in `apps/web` and
`apps/admin` does not forward the client address either. Left out of the new
check's scope on purpose: the endpoints it reaches are authenticated and
`PublicRateLimitGuard` does not run on them, so the gap is attribution rather
than a bypass, and widening the check before deciding what should carry the
address there would only fail the build with nothing to do about it. Noted in
each spec's header rather than left for a reader to rediscover.

## Assumptions

| ASSUMPTION_ID | STATEMENT | EVIDENCE | CONFIDENCE | IMPACT_IF_WRONG |
|---|---|---|---|---|
| A-01 | `SubscriptionOrder` is the right home for self-service onboarding state; `CustomerOnboarding` is the sales-assisted record and must not be repurposed. | `CustomerOnboarding` requires `customerId` and carries `implementationKickoffDone`, `trainingPlanned`, `dataReceived` — an implementation-project record, not a pre-customer one. `SubscriptionOrder` is explicitly the pre-payment snapshot with `submissionHash` and `expiresAt`. | HIGH | WP-01 would extend the wrong model and collide with the sales pipeline. |
| A-02 | The brief's `TenantEnvironment` is satisfied by `Tenant` + `TenantEnvironmentGroup` rather than a new model. | `TenantEnvironmentGroup` groups a customer's production/UAT/sandbox tenants; `TenantDomain` binds hostnames to `Tenant`. Introducing a third level would fork tenant identity. | MEDIUM | Domain and membership models would need an environment dimension; WP-01 widens considerably. |
| A-03 | A customer-chosen slug can be reserved at draft time and released on abandonment, using the same nullable-unique pattern `submissionHash` already proves. | `SubscriptionOrder.submissionHash String? @unique`, released when the order stops being open. | HIGH | Slug reservation needs a separate reservation table with its own expiry sweeper. |
| A-04 | Email verification can be built on the existing notifications module rather than a new delivery path. | `notifications` is the only sanctioned route for tenant email; `user-invitations.service.ts` already issues tokened links. | HIGH | WP-02 grows an delivery and templating surface of its own. |
| A-05 | Local PostgreSQL remains available for DB-backed proof. | TASK-0007 recorded `dijipeople_wp_test` carrying the full migration history. | MEDIUM | WP-08 falls back to CI-only evidence and slows to one round trip per fix. |

## Owner Decisions

### OD-01 — may a customer choose their own workspace slug?

- **Question:** the brief requires a customer-entered slug with live availability
  (`[maseer].dijipeople.com`). The current flow derives a slug server-side from
  the company name and never shows it. A customer-chosen slug is permanent
  tenant identity, publicly visible, and effectively unchangeable once issued.
- **Architect position:** implement it as the brief specifies — customer-entered,
  server-validated, reserved atomically at draft, released on abandonment — with
  the derived slug as the prefilled default so the common case is one keystroke.
  This is the brief's explicit instruction and it is buildable.
- **Blocked work:** none. Recorded because it is a product commitment that is
  expensive to reverse, not because anything waits on it.
- **Owner decision, 2026-08-19:** proceed as specified. Implemented in WP-01.

### OD-02 — the slug availability endpoint is session-bound

- **Question:** the brief asks for live availability (`✓ maseer.dijipeople.com is
  available`) and, separately, that anonymous callers must not be able to
  enumerate which customers exist. A public availability endpoint is exactly a
  tenant-existence oracle: walk a list of company names and the "taken" answers
  map the customer base.
- **Owner decision, 2026-08-19:** session-bound. Availability answers only for a
  caller holding a live onboarding order, so a question costs a rate-limited,
  durably recorded row before it can be asked once.
- **Consequence:** the wizard must open a `DRAFT` order before the workspace step
  is interactive. That is why `openOrder` gained a `mode`, rather than a separate
  draft path being written beside it.

### OD-03 — email verification gates before payment

- **Question:** the brief requires verification before a self-service Tenant
  Owner is activated, but leaves the position open. Before payment costs
  conversion; after payment risks a paid customer stranded unverified, which is
  a support case rather than a form error.
- **Owner decision, 2026-08-19:** before payment. Paid therefore implies
  verified, and provisioning never waits on a human.
- **Blocked work:** WP-02 is now a gate on the checkout transition, not a
  post-provisioning step. WP-04's step order follows from it.

### OD-04 — is one identity allowed to hold several workspaces? — **DECIDED**

- **Question:** `User` is `@@unique([tenantId, email])` with a required
  `tenantId`. The same person in two workspaces is two rows with two passwords,
  and there is no membership model. Three of the brief's requirements — generic
  login, the workspace picker, the workspace switcher — need one.
- **What is blocked:** WP-06 entirely. Nothing else.
- **Why this is not an Architect call.** Every other decision in this parent has
  been an engineering judgement with a defensible default. This one changes what
  an identity *is*, and the migration asks a question only the business can
  answer: **when the same email exists in two tenants today, is that one person
  or two?** Merging them if they are two is a cross-tenant data leak; keeping
  them separate if they are one leaves the feature half-delivered for exactly
  the customers who asked for it.
- **Architect position:** build it, with **no automatic merging** — existing
  rows each become their own membership, and consolidation is a deliberate,
  audited act per identity. That keeps the unsafe direction closed by default.
- **Owner decision, 2026-08-19: one person.** Build identity + membership,
  sequenced **after WP-02/04/05**, and a known identity made owner of a second
  workspace **reuses its credentials with no activation step**.
- **The data made this cheap.** A read-only count found 5 emails spanning more
  than one tenant and every one is a seed identity (`@dijipeople.local`, demo
  tenant + "Maseer Tech"). No real customer shares an email across tenants, so
  the migration is a *link*, not a *merge* — and it only gets harder once the
  first real duplicate exists.
- Design and invariants in [[ITEM-0062]]. The load-bearing one: the JWT stays
  tenant-scoped, so `JwtAuthGuard` and every service reading `user.tenantId` are
  untouched. Login gains a step in front of token issuance; nothing behind it
  moves.

## Repository Health

**PRE_TASK_REPO_HEALTH = PASS**, measured at session start.
`origin/develop` and local `develop` both `494c44d`; `origin/main`
`b90f33e`; `MAIN_SYNC_STATUS = SYNCED`; `DEVELOP_SYNC_STATUS = SYNCED`;
`UNFINISHED_GIT_OPS = none`; `DIVERGED = false`.

`develop` advanced from `aa33524` to `494c44d` during this session's discovery,
when a concurrent session landed the framework-hardening work. The worktree was
cut from `494c44d`, not from the SHA discovery started at.

**MULTI_SESSION.** `session.mjs check` returned `SAFE_PARALLEL` against three
active sessions. No lease is held by this session yet; `schema` will be taken
before WP-01 writes `schema.prisma`.

**POST_TASK_REPO_HEALTH = PENDING.**

## Definition of Done

- Every `PARTIAL` and `ABSENT` row in the reconciliation is `DONE` or carries an
  evidenced disposition.
- Slug reservation, webhook replay and provisioning retry are proven against real
  PostgreSQL under concurrency, not mocks.
- Security review covers enumeration, abuse, redirect safety and rate limiting,
  with material findings promoted to bug records rather than prose.
- Exact-SHA CI passes and `develop` contains the work; `main` is untouched.
- The two drift findings above are corrected in the documents that carry them.

## History

- 2026-08-18 — created at `494c44d`. Reconciled the brief against the repository
  before planning: 33 requirements already built, 11 genuine gaps, 2 documentation
  drift findings. Nine packages sequenced from the gaps rather than from the
  brief's chapter order.
- 2026-08-19 — BUG-0075 found and fixed at `a40f038` while reading the public
  onboarding surface: `POST /public/subscribe` had no rate limit, and the
  ITEM-0013 invariant written to prevent exactly that recurrence passed against
  it because an import satisfied its class-level check. Mutation-tested in both
  directions; REG-065 and QA-BILLING-007 carry the coverage. Not a work package —
  it was a live defect sitting in the surface WP-01 is about to extend, and
  building the wizard on top of an unthrottled endpoint would have widened it.
- 2026-08-19 — reconciliation corrected against `CustomerAccount`. G-02 and G-04
  were written as schema gaps and are capture gaps: every organization and owner
  column the brief asks for already exists on the canonical entity and is simply
  never written by the public path. WP-01's schema footprint drops to the single
  `requestedSlug` column.
- 2026-08-19 — **WP-01 done.** `SubscriptionOrder.requestedSlug`, nullable-unique,
  migration `20260819090000`, proven against real PostgreSQL: a second writer
  blocks on the uncommitted index rather than racing past it, is refused 23505
  on commit, released holds coexist as NULL, and a released name is reclaimable
  by exactly one. `openOrder` reserves and releases it in step with
  `submissionHash`; `abandonExpired` releases it too, without which the sweeper
  would age an order out of the funnel while leaving its address locked forever.
  Session-bound availability added per OD-02. 19 DB-backed order tests, 1376 unit
  tests, 0 lint errors.

  Two things the real database taught that a mock would not have. Prisma 7 with
  `@prisma/adapter-pg` has **no `meta.target`** on P2002 — the constraint is at
  `meta.driverAdapterError.cause.constraint.fields` as `['"requestedSlug"']`,
  quoted — so the collision branch now proves "taken" by querying for the holder
  instead of parsing an undocumented internal that a patch release can move. And
  `prisma migrate diff` returned 600 lines for a 2-line change, which is how
  [[ITEM-0060]] was found.
- 2026-08-19 — **WP-10 added and made the critical path.** Placing WP-02's
  verification gate required reading `createPublicSubscriptionCheckout` end to
  end, which exposed [[BUG-0077]]: the pre-WP-05 block that creates a Lead, a
  second `CustomerAccount`, a `Tenant` and a `Subscription` before payment still
  runs, beside the order path built to replace it. Implementing the removal then
  exposed [[BUG-0078]]: `PROVISIONING_REQUESTED` has no consumer, so nothing
  would have created the tenant instead.

  **The BUG-0077 implementation was reverted rather than committed.** Removing
  the pre-payment tenant without the consumer would strand every paying customer
  — worse than the defect. The durable output of that work is
  [`EXECPLAN-0001`](../plans/EXECPLAN-0001-tenant-creation-behind-confirmed-payment.md),
  the first ExecPlan written in this repository, and the two bug records.

  Two rows of this record's own reconciliation were withdrawn as a result. Both
  had been marked BUILT from the presence of code rather than from following the
  call graph to its end.
- 2026-08-19 — **WP-10 done.** Both defects fixed together, which was the whole
  sequencing constraint. `PlatformOnboardingService.provisionTenantForCustomer`
  is now the shared engine: `onboardCustomer` creates the customer for a
  sales-assisted onboarding and then calls it, and the new
  `ProvisioningRequestedHandler` calls it with the customer a paid order already
  has. The brief's *"one provisioning engine"* is true rather than intended.

  The checkout path lost 110 lines. `handleCheckoutSessionCompleted` branches on
  metadata *shape*, so a checkout started before this change and paid after it
  still completes — there is no cutover moment to get wrong.

  Both regressions are mutation-proven. REG-066 run against pre-fix source
  reproduces the whole defect in the assertion diff, fabricated `"Unknown"`
  columns included. REG-067's invariant, on its first run, found 18 unhandled
  events — 12 consumed through a notification catalog its scan could not see,
  which it now reads as a subscription registry; of the remaining six, four are
  allowlisted with reasons and two became [[ITEM-0061]].

  Full e2e was run twice to separate signal from noise: **8 suites fail against
  unmodified source on this database, 7 with the change**, and the delta is
  exactly the four new tests. The 7 are the pre-existing seed- and
  environment-dependent suites of [[ITEM-0047]].

  The two withdrawn reconciliation rows are not yet reinstated. The code is
  there, but "payment authorises provisioning" is only proven end to end once a
  Stripe webhook can be delivered, and that needs credentials this environment
  does not have. WP-08 owns that.
- 2026-08-19 — **WP-03 done.** `GET /public/onboarding/:id/status` reports the
  provisioning state the buyer is waiting on, session-bound by the order id and
  `no-store`. Every step it reports is read from a row: the brief forbids
  fabricating completed steps, and the temptation is real, because a list that
  advances on a timer looks better than one that sits still for forty seconds
  — and then lies. `workspace` is returned only when the tenant is genuinely
  ready and has a primary domain, so the "Open DijiPeople" button can never
  point somewhere that does not resolve.
- 2026-08-19 — **WP-06 blocked, and two more reconciliation rows withdrawn.**
  WP-06 was scoped as a frontend switcher over the existing `/workspaces/mine`.
  That endpoint reads `user.tenantId` from the session and returns a one-element
  array by construction, because `User` is `@@unique([tenantId, email])` with a
  required `tenantId` and **no membership model exists**. `AuthService` refuses
  to authenticate without tenant context at all.

  So the switcher has nothing to switch between, the picker has nothing to pick,
  and generic login cannot work — not as defects, but because the identity model
  does not have the shape those features need. [[ITEM-0062]] and OD-04.

  Four of this record's rows have now been withdrawn for one recurring reason:
  presence of code read as presence of behaviour. Pages that render, endpoints
  that respond, events that are emitted — none of it proves the path completes.
- 2026-08-19 — **OD-04 answered: one person.** Build identity + membership after
  WP-02/04/05; a known identity made owner of a second workspace reuses its
  credentials with no activation step. A read-only count settled the risk that
  made it a product decision: the only cross-tenant duplicate emails in the
  database are five seed identities, so the migration is a link and not a merge.
  [[ITEM-0062]] moves to `READY`; WP-06 stays blocked on it by sequence, not by
  uncertainty.
- 2026-08-19 — **WP-02 done.** `paidAt` now implies `ownerEmailVerifiedAt`. Six
  digits from `randomInt`, stored hashed and compared in constant time, five
  attempts per code, resends throttled per order rather than per IP — the abuse
  it stops is one order mailing one victim repeatedly, which an IP limit would
  not notice.

  **The gate lives inside `createPublicSubscriptionCheckout`, not beside it.**
  Adding a verified route next to the existing one would have left the
  unverified route as the one everybody kept using; a gate with a way around it
  is not a gate. So the first submission opens the order, mails a code and
  returns no checkout URL, and the same request repeated after verification is
  allowed through.

  Mutation-proven: neutering the condition fails 7 of the 12 cases. The
  load-bearing assertion is that the **Stripe session count is unchanged** —
  returning a warning while still handing back a checkout URL would satisfy a
  weaker test and none of the requirement. [[ITEM-0063]], [[REG-068]],
  [[QA-BILLING-010]].

  The landing form gained the verification step in the same change, so the
  branch can still complete a purchase. WP-04 remains the full wizard.
- 2026-08-19 — **WP-04 split into WP-04 (API) and WP-11 (wizard UI); WP-04
  done.** The split follows the boundary `PLANS.md` prescribes — ownership and
  dependency — and was made deliberately rather than for convenience: the wizard
  is a ~500-line rewrite of the form that takes customers' money, and this
  environment has no browser to verify it in. Shipping that unverified at the end
  of a long session is the risk EXECPLAN-0001 exists to avoid.

  WP-04 closes G-02 and G-04. The organization profile now reaches the canonical
  `CustomerAccount` columns that always existed and were never written — legal
  name, registration number, tax id, industry, company size, employee count,
  address, website. `buildOrganizationProfile` writes only values the caller
  actually supplied, so a returning buyer's second order fills gaps and never
  blanks what the first established: *not asked* and *answered as empty* are
  different facts.

  The owner's name arrives in two fields when the wizard collects them, and the
  whitespace split is then skipped rather than corrected — it works for "Ada
  Lovelace" and not for "Saud Al Thani". Job title lands on
  `SubscriptionOrder.ownerJobTitle` because `CustomerContact` does not exist
  until provisioning; `isPrimaryContact` already carries the relationship, so
  `CustomerContact.role` can hold what the person actually does.

  Agreements become `LegalDocumentAcknowledgement` rows naming the exact
  published version, never a boolean. `acknowledgeMany` drops ids naming no
  published version — an acknowledgement pointing at a draft looks like evidence
  and is not — and is idempotent per subject, since the verification gate makes
  resubmission normal and duplicate rows would read as repeated consent that
  never happened.

  `POST /public/onboarding` opens a draft so the address check has a session to
  bind to, sharing `openOrder` rather than writing a lighter row: the price
  quoted mid-wizard must be the price charged. Attaching a checkout session now
  promotes `DRAFT` to `PENDING_PAYMENT`, because an order the provider is already
  holding must not still read "nothing has been sent to the provider".
- 2026-08-19 — **WP-11 done, `PASS_WITH_RISKS`.** Five steps — organization,
  workspace, owner, agreements, review — then the verification gate and Stripe.

  The rules live in `lib/onboarding-wizard.ts` with 22 tests, following the
  `subscribe-selection.ts` precedent: the expensive defects in a purchase flow
  are *rule* bugs, not rendering bugs, and neither a step that releases the buyer
  without a field the order needs nor one that traps them behind a requirement
  the API never had is visible in a screenshot.

  The slug mirror **deliberately does not know the reserved words**. That list is
  derived from the platform's host labels, and a second copy in the browser would
  drift until a buyer is told `api` is fine and the server refuses it. There is a
  test asserting the silence, so the omission reads as a decision.

  Availability is debounced at 450ms and its "checking" state is *derived* from
  whether the last answer still names the address on screen, rather than set from
  the effect — which removed a `react-hooks/set-state-in-effect` error and the
  cascading render behind it. Two manual `useCallback`s were removed for the same
  reason: they were blocking the React Compiler, which the lint rule flagged.

  **Why `PASS_WITH_RISKS` and not `PASS`.** The component compiles under
  Turbopack and mounts without error — the dev server served `/subscribe` three
  times with zero compile, module-resolution or runtime errors — but the API was
  not running, so what rendered was the no-plans branch. **The five steps have
  not been seen.** Layout, focus order and the live-region announcements are
  asserted only by reading the markup. `apps/landing` has no jsdom or rendering
  library by deliberate scope decision, and adding one is a dependency call that
  is not this package's to make. WP-08's browser E2E owns the visual pass.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0017]], [[BUG-0075]], [[BUG-0077]], [[BUG-0078]], [[BUG-0081]], [[ITEM-0013]], [[ITEM-0047]], [[ITEM-0060]], [[ITEM-0061]], [[ITEM-0062]], [[ITEM-0063]]
- Modules — [[tenant-control-plane]], [[billing]], [[notifications]], [[legal]]

<!-- GRAPH:END -->
