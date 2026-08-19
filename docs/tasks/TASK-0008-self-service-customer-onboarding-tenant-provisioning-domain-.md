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
CURRENT_PACKAGE: WP-10
COMPLETED_PACKAGES: [WP-01]
BLOCKED_PACKAGES: []
OWNER_DECISIONS: 3
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

> **Two rows in this table were withdrawn on 2026-08-19.** Both were read from
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
| Central login and workspace discovery | `/workspaces/mine`; landing header Login → `workspaceUrl/login` (`site-shell.tsx:27`) | BUILT |
| Workspace picker | `apps/web/app/workspace/choose/page.tsx` | BUILT |
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
| WP-02 | Email verification for the self-service Tenant Owner | NOT_STARTED | WP-01 | Backend/API, Security, Integration | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-03 | Onboarding status API for the provisioning experience | NOT_STARTED | WP-01 | Backend/API | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-04 | Public onboarding wizard — organization, workspace, owner, agreements, review | NOT_STARTED | WP-01, WP-02 | Frontend, UI/UX | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-05 | Provisioning progress and workspace-ready experience | NOT_STARTED | WP-03, WP-04 | Frontend, UI/UX | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-06 | Workspace switcher and last-used workspace | NOT_STARTED | — | Frontend, UI/UX, Backend/API | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-07 | Security review — enumeration, abuse, rate limiting, redirect safety | NOT_STARTED | WP-01..WP-06 | Security | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-08 | QA campaign — real PostgreSQL, concurrency, browser E2E | NOT_STARTED | WP-07 | QA | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-09 | Review, exact-SHA CI, develop integration, knowledge and closure | NOT_STARTED | WP-08 | Reviewer, Integrator, Architect | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |
| WP-10 | Payment-authorised provisioning — BUG-0077 and BUG-0078 | NOT_STARTED | WP-01 | Backend/API, Integration, Database, Security, QA | agent/self-service-onboarding-provisioning | — | NOT_RUN | NOT_RUN | NOT_STARTED |

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

<!-- GRAPH:BEGIN — generated by scripts/rebuild-tasks.mjs; edit the record, not this block -->

## Related

- Records — [[BUG-0017]], [[BUG-0075]], [[BUG-0077]], [[BUG-0078]], [[ITEM-0013]], [[ITEM-0060]]
- Modules — [[tenant-control-plane]], [[billing]], [[notifications]], [[legal]]

<!-- GRAPH:END -->
