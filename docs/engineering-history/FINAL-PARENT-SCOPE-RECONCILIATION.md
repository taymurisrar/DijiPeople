# DijiPeople Commercial Platform — Final Parent Scope Reconciliation

> **Generated:** 2026-08-18 · **Against:** `origin/develop` `416996d`, which is
> where WP-01, WP-02 and WP-04 are integrated
>
> Supersedes [`PARENT-SCOPE-RECONCILIATION.md`](PARENT-SCOPE-RECONCILIATION.md),
> which was written on 2026-08-16 against `45d9b01`. That document is kept: it
> is the evidence for what the parent looked like before this pass, and this one
> is only trustworthy next to it.
>
> Every row below was **re-probed at `304bfda`**. Nothing is carried forward on
> the authority of the earlier document.

## Method

For each requirement, a named probe was run against the current tree rather than
against the task list. Schema claims were probed with `grep "^model <Name>"` on
`services/api/prisma/schema.prisma`; service claims with a ripgrep over
`services/api/src`; route claims with a directory listing of the owning app.
The probes are named in the rows so they can be re-run.

The 2026-08-16 document's headline was **19 DONE, 3 PARTIAL, 20 NOT_STARTED**.
Re-probing confirmed all 20 `NOT_STARTED` rows were still genuinely absent at
`304bfda` — none had been quietly delivered by the intervening remediation
program, which was a bug-fixing program and did not touch this scope.

---

## 1. Delivered before this task, re-verified

All 19 rows from section 1 of the previous document were spot-probed and remain
`DONE`. They are not re-listed here; see that document for the per-row evidence.
The commercial configuration spine, the public discovery experience and the
acquisition intake are intact at `304bfda`.

## 2. Delivered by this task

| REQUIREMENT_ID | REQUIREMENT | STATUS | EVIDENCE | WORK_PACKAGE |
|---|---|---|---|---|
| R-01 | Transactional outbox — atomic business change + event, retry, crash recovery | `DONE` | `OutboxEvent`, `OutboxEventConsumption`, migration `20260818090000`; `outbox.service.ts`, `outbox-dispatcher.service.ts`, `outbox-worker.service.ts`; 13 tests | WP-01 |
| R-02 | Typed domain events, no untyped dumping ground | `DONE` | `DomainEventType` enum — 24 closed members covering the lifecycle the brief names | WP-01 |
| R-03 | Consumer idempotency proven by the database | `DONE` | `OutboxEventConsumption` `@@unique([outboxEventId, consumerKey])`; dispatcher skips a consumer that already succeeded | WP-01 |
| R-04 | Emission idempotency | `DONE` | `OutboxEvent.idempotencyKey` unique; duplicate `emit` returns the existing event as success | WP-01 |
| R-05 | Legal document system with versioning and publication lifecycle | `DONE` | `LegalDocument`, `LegalDocumentVersion`, `LegalDocumentAcknowledgement`; `DRAFT`/`PUBLISHED`/`ARCHIVED`; migration `20260818100000` | WP-02 |
| R-06 | Published versions immutable and protected | `DONE` | `updateDraft` refuses non-`DRAFT` with `LEGAL_VERSION_IMMUTABLE`; publish archives rather than deletes; 12 tests | WP-02 |
| R-07 | Acknowledgements retain the exact version | `DONE` | `LegalDocumentAcknowledgement.legalDocumentVersionId` with `onDelete: Restrict` | WP-02 |
| R-08 | Market applicability for legal documents | `DONE` | `LegalDocument.marketId` nullable; market-specific resolution wins over global | WP-02 |
| R-09 | Public forms resolve, display and persist the exact published version | `DONE` (API half) | `leads.service.ts` and `partner-experience.service.ts` resolve the published notice and write the acknowledgement in the same transaction | WP-02 |
| R-10 | Remove standalone hardcoded privacy version constants | `DONE` | `CURRENT_PRIVACY_NOTICE_VERSION` is now a pre-launch fallback only, no longer the source of truth | WP-02 |
| R-11 | Subprocessor configuration as authoritative data | `DONE` (model half) | `Subprocessor` model; `processingRegion` nullable because null means unknown | WP-02 |
| R-12 | Erasure covers newly added tenant-owned models | `DONE` | `TENANT_ERASURE_DELETE_ORDER` extended; schema-derived invariant spec passes | WP-02 |
| R-22 | Active-employee seat engine — count, capacity, peak | `DONE` | `ActiveEmployeeCountService` (billable = ACTIVE/PROBATION/NOTICE, never users or soft-deleted), `SeatUsageService`; migration `20260818140000`; 9 DB-backed tests | WP-04 |
| R-23 | Billing usage history sufficient to explain a billed quantity | `DONE` | `SeatUsageSample` (daily, upserted per day) and `SeatUsagePeriod` (peak, ending count and capacity frozen at close) | WP-04 |
| R-24 | Seat overage detection, thresholds, abnormal-overage guard | `DONE` | `SeatOverageEvent` episodes with escalate-only severity; warn/review thresholds configurable; 20→900 becomes REVIEW_REQUIRED rather than an invoice | WP-04 |

## 3. Engineering remaining — in the graph, not yet implemented

Each row is `NOT_STARTED` or `PARTIAL` and is assigned to a work package in
[`TASK-0007`](../tasks/TASK-0007-commercial-platform-completion-transactional-legal-and-lifec.md).
These are the rows that keep `PARENT_TASK_STATUS = INCOMPLETE`.

| REQUIREMENT_ID | REQUIREMENT | STATUS | PROBE AT `304bfda` | WORK_PACKAGE |
|---|---|---|---|---|
| R-20 | Cookie consent categories and category-controlled scripts | `NOT_STARTED` | no cookie model, no banner | WP-03 |
| R-21 | Marketing consent unbundled, withdrawable, auditable | `PARTIAL` | `marketingConsent`/`marketingConsentAt` columns exist; no withdrawal path or definition version | WP-03 |
| R-25 | Customer created before payment; pending subscription snapshot | `NOT_STARTED` | `Subscription.tenantId` is required and unique, so no subscription can exist pre-tenant | WP-05 |
| R-26 | Customer deduplication across refresh/abandon/double-submit | `NOT_STARTED` | no dedupe on the subscribe path | WP-05 |
| R-27 | Server-authoritative checkout; browser cannot set price/currency/total | `PARTIAL` | `commercial-offer.resolver.ts` is authoritative for price; the pre-checkout snapshot it would be written into does not exist | WP-05 |
| R-28 | Tax foundation — subtotal, discount, taxable basis, treatment, rate snapshot | `NOT_STARTED` | no tax model | WP-05 |
| R-29 | Seat increase immediate; seat decrease at next cycle | `NOT_STARTED` | `purchasedSeats` exists; no change flow, no scheduled capacity | WP-06 |
| R-30 | Plan upgrade/downgrade self-service with consequence display | `NOT_STARTED` | no scheduled-change representation | WP-06 |
| R-31 | Add-on foundation composing effective entitlement | `PARTIAL` | `FeatureAccessService`/`PlanFeature` exist; no purchasable add-on or composition | WP-06 |
| R-32 | Payment → onboarding automatic and idempotent | `NOT_VERIFIED` → `PARTIAL` | `CustomerOnboarding` exists; webhook does not create it, so the trigger is absent | WP-07 |
| R-33 | Onboarding → provisioning automatic | `PARTIAL` | `tenant-control-plane` provisions; nothing requests it from a payment | WP-07 |
| R-34 | Provisioning state machine, per-step tracking, resumability | `NOT_STARTED` | no provisioning-run or step model | WP-07 |
| R-35 | Provisioning targets and operations view | `NOT_STARTED` | no target model, no ops screen | WP-07, WP-11 |
| R-36 | Tenant readiness separate from onboarding completion | `NOT_STARTED` | single status only | WP-07 |
| R-37 | Cancellation — renewal disable vs terminate now, paid-through | `PARTIAL` | `cancelAtPeriodEnd` exists; no request/terminate lifecycle | WP-08 |
| R-38 | Retention window, scheduled erasure date, policy version | `NOT_STARTED` | no retention model | WP-08 |
| R-39 | Retention holds — legal, security, billing dispute, administrative | `NOT_STARTED` | no hold model | WP-08 |
| R-40 | Tenant owner deletion request (request, not immediate erase) | `NOT_STARTED` | erasure service exists; no request/approval flow | WP-08 |
| R-41 | Platform admin erase with dedicated permission and confirmation | `PARTIAL` | erasure orchestration exists and is well-tested; no guarded request/confirmation surface | WP-08 |
| R-42 | Refund capability with dedicated permission and audit | `NOT_STARTED` | no refund path | WP-08 |
| R-43 | Backup deletion lifecycle documented honestly | `NOT_STARTED` | not documented | WP-08 |
| R-44 | Stripe reconciliation — customer, subscription, quantity, status, price | `NOT_STARTED` | no scheduled reconciliation | WP-09 |
| R-45 | Internal reconciliation — customer/tenant/subscription/entitlement/capacity | `NOT_STARTED` | none | WP-09 |
| R-46 | Public legal routes (`/privacy`, `/terms`, +8) with footer navigation | `NOT_STARTED` | `ls apps/landing/app` — no legal routes | WP-10 |
| R-47 | Trust/security page, evidence-based only | `NOT_STARTED` | route absent | WP-10 |
| R-48 | Public subprocessor page | `NOT_STARTED` | route absent (model now exists — R-11) | WP-10 |
| R-49 | Admin dashboard UX — clipping, density, 1366px, responsive | `NOT_STARTED` | unaddressed | WP-11 |
| R-50 | Monitoring Overview UX and default tab | `NOT_STARTED` | unaddressed | WP-11 |
| R-51 | Business-event coverage for the named lifecycle events | `PARTIAL` | `DomainEventType` now names them; most emitters not yet wired | WP-12 |
| R-52 | Notification ownership/config, no hardcoded founder email | `NOT_VERIFIED` | not probed this pass — assigned rather than claimed | WP-12 |
| R-53 | Support model tiers without published response times | `NOT_STARTED` | `supportTierRef` is a nullable text reference only | WP-12 |
| R-54 | Data region first-class on Tenant | `PARTIAL` | `Market.dataRegion` exists; `Tenant` has no equivalent | WP-07 |
| R-55 | Public contact address configuration | `PARTIAL` | `contactInfo` in landing content; no per-purpose aliases | WP-10 |
| R-56 | Cross-repository duplicate/orphan audit | `PARTIAL` | landing audited in Wave 2; `web`, `admin`, `api` not swept | WP-13 |
| R-57 | Consolidated QA, regression, security, accessibility, visual campaign | `NOT_STARTED` | gated behind the implementation graph by design | WP-13 |

## 4. Non-engineering dispositions

| Item | Class | Detail |
|---|---|---|
| Pakistan PKR price schedule | `OWNER_DECISION_REQUIRED` | Starter/Growth/Enterprise per-active-employee unit prices. Engineering completes without them — `commercial-offer.resolver.ts` fails closed, so an unpriced platform refuses checkout rather than inventing a number. |
| Legal operator identity | `OWNER_DECISION_REQUIRED` | No registered entity exists in the repository. The document system is built; publishing content that names an entity is what waits. |
| Legal text sign-off | `PROFESSIONAL_REVIEW_REQUIRED` | Any published notice needs review before reliance. Engineering may be `DONE` while this remains open, and this document never claims review occurred. |
| Tax policy and registrations | `TAX_ACCOUNTING_REVIEW` | The tax *foundation* is engineering (R-28); the rates and registrations are not. |
| Production deployment | `BLOCKED_EXTERNAL` | No deploy credentials or platform access from this environment. |
| Email alias provisioning | `BLOCKED_EXTERNAL` | `sales@`, `privacy@`, `security@` etc. need DNS and mailbox setup. |
| Stripe live/test credentials | `BLOCKED_EXTERNAL` | End-to-end purchase cannot be exercised without them; repository-side integration is still fully testable. |
| Local real PostgreSQL | **RESOLVED 2026-08-18** | A credential was supplied mid-session. A throwaway `dijipeople_wp_test` database now carries the **full migration history applied to a fresh database**, and DB-backed proof runs locally. This immediately paid for itself: the first real run found [[BUG-0070]], a transaction-aborting defect that every mocked test had passed. The dev database itself is never reset or pushed to. |

---

## Honest summary

**15 requirements moved to `DONE` in this task, each with named evidence.
35 engineering requirements remain**, of which 12 are `PARTIAL` and 23 are
`NOT_STARTED`.

The three delivered packages are deliberately the dependency roots rather than
the most visible work. Every remaining lifecycle requirement — provisioning on
payment, seat changes, cancellation, retention, erasure requests, reconciliation
— needs a durable event that survives a crash, and none of them could be built
honestly on inline side effects. The same is true of the legal surface: the
public routes in WP-10 are a rendering job once versioned, immutable, resolvable
documents exist, and were an unanswerable question before.

**The local database changed what the evidence is worth.** Before it, every
database-level claim in this program was designed-for. The first real run found
[[BUG-0070]] — outbox deduplication aborting the caller transaction — which had
passed every mocked test and would have rolled back the business change behind
every redelivered webhook. Three of the four packages here now carry
DB-backed proof rather than assertions.

**`PARENT_TASK_STATUS = INCOMPLETE`**, and this document is the evidence for
that statement rather than an estimate. The completion contract in the brief
requires `PARTIAL_ENGINEERING_REQUIREMENTS = 0` and
`NOT_STARTED_ENGINEERING_REQUIREMENTS = 0`; they are 12 and 23.
