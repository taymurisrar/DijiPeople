# DP Platform Remediation — progress and decisions

Session: SESSION-0121 · Branch: `agent/dp-platform-remediation` (from `develop` 4489a3c6)
Main baseline: 32c4b314

## Owner decisions (2026-10-11)

| # | Question | Decision |
|---|---|---|
| D1 | PayFast credentials | The owner meant **Safepay**, not PayFast. WS12 is re-scoped to correcting the Safepay integration (admin Integrations card, checkout provider choice). No PayFast adapter is built. |
| D2 | Release authority | Release to `main` and deploy production once CI passes. |
| D3 | Missing primary signer on Create Agreement | Collect inline in the dialog, persist to the customer record (audited), never infer from `contactName`. |
| D4 | Production backfills | **None.** Owners and timeline apply to new records/events only. No backfill action is shipped. |

## Defaults applied without asking

- Existing workspace slugs never change; final slug check is server-side at provisioning.
- Ownership rules ship disabled with no default owner; a manual owner is never overwritten.
- Testing uses an isolated local stack; production gets non-destructive checks only (no sign-ups, no checkouts).
- Support case statuses keep the existing 12-value enum; a transition table governs them. No enum value is removed.

## Root-cause matrix

| WS | Root cause (verified in code) | Fix direction | Depends on |
|---|---|---|---|
| 01 | `subscribe-form.tsx`: Continue (`type=button`) and Confirm (`type=submit`) share one unkeyed ternary slot, so React mutates the same `<button>` to `submit` during the click; the form then submits from step 5. Enter on steps 1–4 also submits past the step guards. | Keyed buttons, `preventDefault`, step guard and in-flight guard in `submit()`. | — |
| 02 | `suggestSlug` runs only while `requestedSlug` is empty, so the first keystroke freezes the suggestion (reads as "initials"). NFKD without a mark strip drops accented letters. | Track `slugTouched`, use shared normalisation, server alternatives on TAKEN. | — |
| 03 | Stripe orders never reconcile on return (`settleOrder` returns early for Stripe), `session_id` is dropped, the post-payment chain waits for 5 s outbox ticks per hop, there is no `async_payment_succeeded` handling, polling backs off to 15 s, and public orders get no payment email. | Server reconcile on poll (validated session id), inline outbox kick, async events, faster polling, idempotent payment-confirmed email. | — |
| 04 | Bell is a projection of `PlatformEvent` with a static regex title table; provisioning REQUESTED/PENDING is titled "provisioned"; no subject labels; most producers unmatched. BUG-3895 polling after sign-out. | Central template contract, batched subject labels, action-required only when actionable, dedupe. | — |
| 05 | Templates require `customer.primarySigner.*`; `customerSource()` never emits it and `CustomerAccount` had no signer fields; the launcher lists every template. | Signer columns, eligibility endpoint, inline signer capture persisted with audit (D3). | schema |
| 06 | Raw password inputs without `name`/`autoComplete`, so autofill fills one field or bypasses React state; no reveal toggle. | Shared `PasswordField`, FormData fallback compare, policy list. | — |
| 07 | `listCustomers` does not include `assignedToUser` or counts; `fullName` never mapped; self-service customers get no owner; no assignment rules exist. | Fix includes/mapping/columns; `RecordAssignmentRule` + service + admin UI (no backfill, D4). | schema, 10 |
| 08 | Customer timeline falls through to `AuditLog` with entityType `"Customers"` and the operator's tenantId — matches nothing; real events are `PlatformEvent.customerAccountId` and related-entity audit rows. | Dedicated customer timeline merging the authoritative sources. | 04 formatter |
| 09 | Tenant lookup path is static; no server consistency check; `update` spreads the DTO. | `{customerAccountId?}` dependent lookup + API filter + `assertConsistentScope`. | — |
| 10 | Support team is a hard-coded option list stored as free text; no team model. | `PlatformTeam` + members, settings UI, archive/reassign rules. | schema |
| 11 | Actions live in a bespoke in-content panel; Escalate always 400s (`"ESCALATED"` to an int); no transition validation; merge unsafe; link is a raw id. | Transition table, dedicated endpoints, command-bar actions, case lookups, transactional merge, `SupportCaseRelation`. | schema, 10, 07 |
| 12 | Safepay is currency-routed only and missing from Monitoring > Integrations; configuration is env-only. | Integrations card with health, provider choice where more than one provider can collect the currency. | 03 |

Schema (one additive migration `20261011090000_platform_teams_assignment_rules_case_relations`): `CustomerAccount.authorizedSigner*`, `SupportCase.assignedTeamId`, `PlatformTeam`, `PlatformTeamMember`, `SupportCaseRelation`, `RecordAssignmentRule`.

## Progress log

- Migration proven on a fresh local database (`prisma migrate deploy`, full history, 4 tables + 3 columns present).
- WS09 API: `GET /super-admin/tenants?customerAccountId=` filter (blank = all).
- WS06 done: shared `PasswordField`, FormData compare, rate-limited `invitation-status`, which now returns the tenant password policy.
- WS01/02 done: keyed wizard buttons + `decideSubmit` guard; slug re-suggests until touched, accent folding, legal-suffix strip, server `suggestions`.
- WS07 done: customer list includes/counts/fullName; `RecordAssignmentService` + rules API/UI; wired into public lead submission and self-service customer creation.
- WS10 done: `PlatformTeam` API in `platform-users`, settings UI, archive/reassign, seed of the four existing support team names (create-only).
- Local verification limit: the junctioned `node_modules` lacks `qrcode`/`@aws-sdk/*` and has a stale `@repo/config`, so several suites cannot load locally; full verification runs on a real `npm ci` install before push.
