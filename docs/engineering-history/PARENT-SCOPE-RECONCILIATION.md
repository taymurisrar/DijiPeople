# DijiPeople Commercial Platform — Parent Scope Reconciliation

> **Generated:** 2026-08-16 · **Against:** `45d9b01` (+ the Final Consolidation branch)
>
> This reconciles the original ~100-section commercial-platform brief against
> **what is actually in the repository**, verified by reading code and schema —
> not against what the task list says should exist.
>
> It exists because five waves have shipped and the honest answer to "is the
> parent task done" needs evidence per requirement, not a summary.

## How each status was established

Every `DONE` row cites the merge that delivered it. Every `NOT_STARTED` row was
checked by probing the repository for the model, service or route that would
have to exist — the probes are named so anyone can re-run them.

---

## 1. Delivered and verified

| Requirement | Status | Delivered by | Evidence |
|---|---|---|---|
| Production URL integrity, no loopback fallback | `DONE` | BUG-0026 · `3b77938` | `packages/config` validation, `check-no-hardcoded-urls.mjs`, both CI-gated |
| Commercial config: Plan → PlanPrice → Market → Currency → Interval → Version | `DONE` | Wave 1 · `7b5aeaa` | `Market`, `MarketCountry`, `CommercialPublicationStatus`, `PlanPrice.marketId` |
| One authoritative price; Admin and checkout agree | `DONE` | BUG-0027 | `commercial-offer.resolver.ts`; legacy fallback removed from the money path |
| Market-based currency; no frontend currency map | `DONE` | BUG-0028 | `detectRegionCurrency` deleted; `CommercialConfigService` resolves server-side |
| Publication lifecycle (DRAFT/PUBLISHED/ARCHIVED) | `DONE` | Wave 1 · ITEM-0018 | Enum on Plan, PlanPrice, Market; unpublished never leaves the API |
| Market model, PK launch, US/GCC planned-disabled | `DONE` | Wave 1 · ITEM-0019 | `markets.catalog.ts`; residency/tax refs null, nothing claimed |
| Public commercial configuration API | `DONE` | Wave 1/2 | `GET /api/public/commercial-config`, rate-limited, cached |
| `/features` from the real feature catalogue | `DONE` | Wave 2 · `301a397` | BUG-0029; renders from `TENANT_FEATURE_DEFINITIONS` |
| `/plans` decision page, estimator, comparison, no currency dropdown | `DONE` | Wave 2 | `plans-experience.tsx`; entitlement-derived comparison |
| Per-active-employee wording; Enterprise not hardcoded to sales | `DONE` | Wave 2 | `plan-presentation.ts`; CTA from `salesModel`, no plan-key branch |
| Subscribe handoff preserves plan/interval/team size | `DONE` | Wave 2/3 | `subscribe-selection.ts` + spec |
| Read paths do not mutate commercial state | `DONE` | BUG-0030 · `ee1acec` | `plan-read-path-purity.spec.ts`; real-PG concurrency test **gated** |
| Market-aware PlanPrice uniqueness | `DONE` | BUG-0030 | Partial index + `NULLS NOT DISTINCT` |
| Contact → Lead with real typed data, no fabrication | `DONE` | Wave 3 · `ca18353` | BUG-0021 closed; `public-lead-acquisition.spec.ts` |
| Inquiry intent separate from interest areas | `DONE` | Wave 3 | `LeadInquiryIntent` enum + `Lead.interestAreas` |
| Lead attribution (UTM, referrer, source page, correlation) | `DONE` | Wave 3 | Absent values stay null |
| Notice acknowledgement vs marketing consent, server-owned version | `DONE` | Wave 3 | Separate columns; client cannot set the version |
| Lead submission idempotency | `DONE` | Wave 3 | `Lead.submissionHash` |
| **Partner inquiry: partnership model, consent split, attribution, Admin visibility** | `DONE` | **This wave** | ITEM-0030; `PartnershipModel` wired form → DTO → service → Admin columns |
| **Lead acquisition context visible in Admin** | `DONE` | **This wave** | 17 read-only fields added to the lead record form |

## 2. Started, incomplete

| Requirement | Status | What exists | What is missing |
|---|---|---|---|
| Hidden writes on read paths | `PARTIAL` | BUG-0030 fixed the commercial path | ITEM-0025: 5 remain in `lookups`/`onboarding` |
| Add-on entitlements | `PARTIAL` | `FeatureAccessService`, `PlanFeature` | No purchasable add-on model or effective-entitlement composition |
| Legal contact addresses | `PARTIAL` | `contactInfo` in landing content | No configured per-purpose aliases; mailboxes unverified |

## 3. Not started — verified by probe

| Requirement | Status | Probe run | Result |
|---|---|---|---|
| Legal document system + versioning | `NOT_STARTED` | `grep "^model LegalDocument" schema.prisma` | 0 matches |
| Public legal routes (`/privacy`, `/terms`, +7) | `NOT_STARTED` | `ls apps/landing/app` | No legal routes exist |
| Cookie consent categories | `NOT_STARTED` | — | No cookie model or banner |
| Trust / security page | `NOT_STARTED` | — | Route absent |
| Subprocessor list | `NOT_STARTED` | — | No model or page |
| Stripe transactional outbox | `NOT_STARTED` | `grep -rl "outbox\|Outbox" services/api/src` | 0 matches |
| Stripe reconciliation jobs | `NOT_STARTED` | — | No scheduled reconciliation |
| Active-employee seat engine | `NOT_STARTED` | `grep -rl "activeEmployee\|peakActive"` | Only unrelated hits (benefits, dashboard) |
| Seat overage detection and policy | `NOT_STARTED` | `grep -rl "overage\|Overage"` | No overage model |
| Seat increase / scheduled decrease | `NOT_STARTED` | — | `purchasedSeats` exists; no change flow |
| Plan upgrade / downgrade self-service | `NOT_STARTED` | — | No scheduled-change representation |
| Customer-before-payment lifecycle | `NOT_VERIFIED` | — | `CustomerAccount` exists; ordering not audited this wave |
| Automated onboarding on payment | `NOT_VERIFIED` | — | `CustomerOnboarding` exists; automatic trigger not traced |
| Provisioning SLA thresholds + operations view | `NOT_STARTED` | — | `tenant-control-plane` exists; no SLA model or ops screen |
| Cancellation → paid-through → retention | `NOT_STARTED` | — | `cancelAtPeriodEnd` exists; no retention lifecycle |
| Retention holds + scheduled erasure date | `NOT_STARTED` | — | No retention model |
| Tenant deletion request flow (owner-initiated) | `NOT_STARTED` | — | Erasure service exists; no request/approval flow |
| Refund capability with permission + audit | `NOT_STARTED` | — | No refund path |
| Admin dashboard UX pass | `NOT_STARTED` | — | Original overflow/density issues unaddressed |
| Monitoring Overview UX + default tab | `NOT_STARTED` | — | Not inspected or changed |
| Generic cross-repo duplicate/orphan audit | `PARTIAL` | Landing audited in Wave 2 | `apps/web`, `apps/admin`, `services/api` not swept |
| Production deployment of any wave | `BLOCKED_EXTERNAL` | — | See below |

## 4. Non-engineering dependencies

| Item | Class | Detail |
|---|---|---|
| Pakistan PKR price schedule | `OWNER_DECISION_REQUIRED` | Starter/Growth/Enterprise unit prices. Platform is safe unpriced — resolution fails closed. |
| Legal operator identity | `OWNER_DECISION_REQUIRED` | No registered entity; legal name, address, jurisdiction unknown. |
| Legal text sign-off | `PROFESSIONAL_REVIEW_REQUIRED` | Any published notice needs review before reliance. |
| Production deployment | `BLOCKED_EXTERNAL` | No deploy credentials or platform access from this environment. |
| Email alias provisioning | `BLOCKED_EXTERNAL` | `sales@`/`privacy@`/etc. need DNS + mailbox setup. |
| Stripe live/test credentials | `BLOCKED_EXTERNAL` | End-to-end purchase cannot be exercised without them. |

---

## Honest summary

**19 requirements DONE and evidenced. 3 PARTIAL. 20 NOT_STARTED, each verified
by probe rather than assumed.**

The delivered work is coherent and real: the commercial configuration spine,
the public discovery experience, and the acquisition intake are complete and
regression-tested end to end. What remains is the **transactional and
operational half** — money movement after checkout, the tenant lifecycle after
payment, the legal surface, and the Admin operational UX.

That remainder is not a long tail of polish. Stripe outbox, the seat engine,
provisioning SLA and the retention/erasure lifecycle are each a wave in their
own right, and each needs its own schema, migration, real-PostgreSQL evidence
and QA — the same shape as Waves 1–3.

**The parent task is therefore not complete**, and this document is the
evidence for that statement rather than an estimate.
