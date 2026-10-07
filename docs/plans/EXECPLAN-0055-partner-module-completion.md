CONTEXT_FILES_REQUIRED:
  - AGENTS.md, services/api/AGENTS.md, services/api/prisma/AGENTS.md, apps/admin/AGENTS.md
  - docs/architecture/partners.md, docs/knowledge/modules/partners.md, docs/knowledge/modules/partner-onboarding.md
  - docs/decisions/ADR-0026-partner-lifecycle-commission-and-currency.md
  - docs/decisions/ADR-0027-generic-platform-number-sequences.md

SPECIALIST_AGENTS_REQUIRED:
  - database     — PlatformNumberSequence, Partner.partnerNumber + backfill (single writer of schema.prisma)
  - backend-api  — runtime action routing, partner lifecycle, onboarding invitation, delete dependency check, commission, currency endpoint
  - frontend     — admin runtime: action adapter, highlight header, quick-create panel, tabs, delete dialog, numbering settings
  - security     — invitation tokens, action authorization, delete, no secrets in responses or logs
  - qa           — unit, API e2e, browser walkthrough on an isolated local stack
  - reviewer, integrator, knowledge & graph, release/devops

SINGLE_WRITER_FILES:
  - services/api/prisma/schema.prisma (WP-02 only)
  - services/api/src/modules/platform-runtime/platform-runtime.service.ts (sequential across WPs)
  - apps/admin/lib/runtime/platform-module-registry.ts (sequential across WPs)

QA_REQUIRED: yes  (PLATFORM, SECURITY, UI, CONTRACT, DATABASE)

TARGET_BRANCH:            develop, then released to main
ROLLBACK_CLASS:           SCHEMA_ADDITIVE (new table + nullable unique column; code rollback leaves them unused)
INTEGRATOR_REQUIRED:      yes

# EXECPLAN-0055 — Partner module completion

Task: [[TASK-0037-partner-module-completion-delete-numbering-status-lifecycle-]].

## Objective

Make the platform-admin Partner module one coherent, working lifecycle, and fix
the platform-runtime defects it exposed for every module:
- delete
- numbering
- status
- commission
- currency
- onboarding
- every tab and every action

## Business requirement

These are the owner's 26-point brief of 2026-10-07. Partner operators can do
all of the following:
- create, edit and delete partners with clear dependency messaging;
- number partners from a configurable sequence;
- understand and drive status through actions;
- configure commission and currency;
- invite onboarding contacts;
- manage contacts, referral links, commissions and agreements without leaving the record.

## Existing behavior (investigation, 2026-10-07, `898a6ac3`)

The evidence is in the session scratchpad reports (A admin UI, B backend, C frameworks).

1. **Record actions never reach the server.** This affects Send onboarding link,
   Activate, Suspend and 12 other actions on partners, leads, contracts and plans.
   - The admin posts to `/:module/actions/:action`.
   - The id goes only in the body (`http-module-runtime-adapter.ts:99-104`).
   - `PlatformRuntimeService.execute` only dispatches when it receives the
     positional id, so it falls through to "Action X is not available".
2. **Partner Save persists nothing but reports success.**
   - `scripts/lib/runtime-write-contract.mjs:172` captures `PartialType` as the base DTO.
   - As a result, the generated runtime schema marks zero partner fields editable.
3. **Changing Status in the header always returns 400.**
   - It spreads the whole GET record into `UpdatePartnerDto`, which has
     `forbidNonWhitelisted`.
   - If it did succeed, it would bypass `partnerTransition()`.
4. **Delete refusals are hidden.**
   - The API returns `{deleted, refused, message}` inside `data`.
   - Admin reads the top-level `message`, so it never shows the reason.
   - Customer and tenant `originatingPartnerId` (SetNull) are not counted, so a
     delete silently erases attribution.
   - The dependency count runs outside the delete transaction.
5. **There is no partner number.**
   - `code` comes from two random generators (`PTR-…` and `DP-P-…`).
   - The platform has no generic sequence service.
6. **Account status is read-only for a reason, but the reason is not explained.**
   - Only lifecycle actions set it.
   - Create spreads the DTO, including `status`, so an admin can create a
     partner as ACTIVE.
   - `qualifyInquiry` and `rejectInquiry` can demote an ACTIVE partner.
   - The Activate button is hidden in INFORMATION_APPROVED, which is exactly the
     state where activation would succeed.
7. **Onboarding invitation flaws.**
   - A resend is deduplicated by the email idempotency key, so it never arrives,
     yet the token has already been rotated.
   - The raw token is returned to the UI.
   - There is no status guard, and nothing sets ONBOARDING_INVITED.
   - A failed send still reports success.
8. **Default commission.** It is stored 0–100 as Decimal(5,2), which is correct.
   - The agreement placeholder falls back to the partner default at render
     time, so editing the partner changes unsigned agreements.
   - Commissions are created manually only.
   - Status jumps are unconstrained, including PAID back to PENDING.
   - Linked lead, customer and invoice ids are not verified.
9. **Currency.** Values come from the compile-time `PLATFORM_CURRENCIES`.
   - The platform has no "enabled" subset and no endpoint for one.
10. **Tabs.** Contacts and Users, Customers, Tenants and Referred Leads have
    columns the data never fills.
    - No subgrid has an Add action.
    - The referral-link create API exists but nothing in the admin calls it.
    - Onboarding applications are not shown on the record.
    - Timeline notes are written to a table the tab never reads.
    - A Documents tab is declared but never rendered.
    - `partnershipModel` looks editable but is silently dropped on save.

## Decisions

These are recorded in ADR-0026 and ADR-0027.

- **D1 Numbering.** Add a platform-scope `PlatformNumberSequence`, allocated by
  an atomic increment inside the caller's transaction.
  - It is configured from Admin Settings → Numbering: prefix, separator,
    padding, suffix, next number, and a preview.
  - The next number may only increase.
  - Partners get a new immutable `partnerNumber` column (`PART-000001`).
  - Existing partners are backfilled in creation order.
  - `code` stays as the internal and legacy identifier.
- **D2 Status.** Keep the existing enums; no new states.
  - The header shows a derived **Status** phase (Prospect, Onboarding, Active,
    Suspended, Closed).
  - It shows **Sub-status** as the detailed `PartnerStatus`, and **Account**
    as `PartnerAccountStatus`.
  - Status changes only through lifecycle actions, which the server enforces.
    The header status is read-only for partners, with an explanation.
  - Create always starts at DRAFT.
- **D3 Commission.**
  - The canonical form is a percentage 0–100, stored as Decimal(5,2) (already true).
  - A new agreement snapshots the partner default into its own
    `commissionPercentage` when the agreement is created. Later partner edits
    do not change existing agreements.
  - Commissions remain operator-created, through Add Commission. The rate
    defaults to the partner default and the amount is computed by the server.
  - The status machine is: PENDING → APPROVED → PAYABLE → PAID, with VOID
    allowed from any state except PAID.
  - Linked records must belong to the partner.
  - Automatic accrual from payments is not built, because the product has no
    such model. It becomes a backlog item.
- **D4 Currency.** Add `platform-defaults.enabledCurrencies`, a subset of
  `PLATFORM_CURRENCIES` that defaults to all.
  - It is served by one platform endpoint and used by partner, contract and
    commission currency fields.
  - A record whose currency is now disabled still shows its value.
- **D5 Delete.** Add a generic runtime dependency check:
  `GET /platform-runtime/:module/:id/dependencies` returns
  `[{area, count, policy, href}]`, where policy is BLOCKS, CASCADE, DETACH or
  RETAIN. Partners implement it first.
  - Customer and tenant attribution is RETAIN, so it blocks the delete.
  - The count runs inside the delete transaction.
  - Admin shows the dependencies, with links, in the delete dialog, both on
    the list and on the record.
- **D6 Onboarding invitation.**
  - The email idempotency key includes the token hash.
  - Allowed source states are enforced, and a successful send sets
    ONBOARDING_INVITED.
  - The token is never returned or logged.
  - A provider failure becomes a domain error.
  - Resend is rate-limited with a cooldown.
  - Every send is audited.
- **D7 Actions.** The admin posts record actions to `/:id/actions/:action`.
  - The server also accepts `input.id`.
  - A contract test asserts that every admin-declared partner, lead, contract
    and plan record action dispatches.
  - Error surfacing reads `data.message` and `fieldErrors` and shows failures in red.
- **D8 Reusable admin UI.**
  - A `RecordHighlightHeader` driven by a registry `highlight` config.
  - A `RuntimeQuickCreatePanel`, a right-side sheet driven by `relatedRecords[].quickCreate`.
  - A dependency-aware delete dialog.
  - Meaningful subgrid empty states.

## Work packages

| WP | Title | Depends on | Owner |
|---|---|---|---|
| WP-01 | Runtime record-action routing and error surfacing (admin and API) | — | backend-api + frontend |
| WP-02 | Schema: `PlatformNumberSequence`, `Partner.partnerNumber` plus backfill | — | database |
| WP-03 | Numbering service, Admin Settings → Numbering, partner create uses it; enabled currencies setting, endpoint and lookup | WP-02 | backend-api + frontend |
| WP-04 | Partner write path and status lifecycle (write-contract fix, DTO, create at DRAFT, header status, action visibility, inquiry guards, actor on audit) | WP-01 | backend-api + frontend |
| WP-05 | Onboarding invitation (idempotency, state guard, no token, failure, cooldown, audit) | WP-01, WP-04 | backend-api + security |
| WP-06 | Commission and agreement inheritance (snapshot, status machine, link validation, quick-create) | WP-03, WP-04 | backend-api |
| WP-07 | Generic dependency-aware delete (API check endpoint, partner implementation, admin dialog) | WP-01 | backend-api + frontend |
| WP-08 | Admin UX: highlight header, quick-create panel, tabs (Contacts rename, Application, Referral Links, Referred Leads, Customers, Tenants, Timeline, Documents) and the browser E2E pass | WP-03…WP-07 | frontend + qa |

WP-01 and WP-02 are `PARALLEL_SAFE`: they have no overlapping files. All the
others are `DEPENDENCY_BLOCKED` until their dependencies are done. The single
writer files serialise WP-03 through WP-08.

## Database impact

- New table `PlatformNumberSequence`, with columns:
  - `key` (unique), `prefix`, `separator`, `suffix`, `padding`
  - `nextValue` (BigInt-free Int), `resetPolicy` (`NEVER`)
  - `updatedAt`, `updatedById`
- `Partner.partnerNumber String? @unique`.
- The migration backfills partners `ORDER BY createdAt, id` as `PART-` plus a
  six-digit sequence. It then inserts the `partner` sequence row with
  `nextValue = count + 1`.
- The migration is additive and repeatable: guarded by `WHERE partnerNumber IS NULL`.
- No destructive change, so no expand/contract phases are needed.
- Seed: `seed-config` creates the `partner` sequence row only if it is absent,
  and never updates it. This is because seed:config runs on every deploy.

## Backend impact

- platform-runtime: controller, `execute()` id fallback, dependency endpoint, partner header status.
- partners: create, update, deletion, commission, lifecycle guards.
- partner-experience: invitation, qualify and reject guards.
- contracts: commission snapshot at create.
- super-admin: platform-defaults `enabledCurrencies`.
- New `common/numbering`.
- New error catalog codes, one per domain failure.

## Frontend impact

apps/admin runtime:
- `http-module-runtime-adapter`, `runtime-record-action-handler`, `module-action-bar`, `runtime-module-list`;
- the new highlight header, quick-create panel and delete dialog;
- the partner registry entries;
- the Settings → Numbering page;
- currency lookup fields.

## Permission / RBAC impact

The existing keys stay unchanged:
- read: `partners.read`;
- write, contacts, commissions, referral links and invitations: `partners.manage`;
- delete: `partners.manage` plus `platform.administer`;
- numbering settings: `platform.administer`, plus the settings permission the other platform settings use.

The server enforces every check. The UI only hides controls.

## Tenant-isolation impact

Partners are platform-scope. Referral attribution is resolved by code, and the
link must belong to the partner. Lead attribution is checked so that a
referral link can never credit another partner.

## Audit / event / logging impact

Each of these writes a `PlatformAuditLog` row, with no token, secret or raw email body:
- partner created, updated, status changed, deleted or delete refused;
- invitation sent or resent;
- contact created;
- commission created or status changed;
- referral link created or disabled;
- sequence configuration changed.

## Integration impact

Email goes through platform-communications, as it does today.

## Migration / data compatibility

- Existing `code` values are untouched.
- Existing agreements keep their render-time fallback until they are next
  saved. The snapshot applies to agreements created after this release, and
  to drafts when they are saved.
- Existing commission rows are untouched.

## Testing strategy

- **Unit:** sequence allocation, including concurrency on a real database;
  lifecycle guards; invitation states; dependency classification; commission
  machine; currency validation; action routing; write contract.
- **API e2e** (`describeWithDatabase`): create through delete for a partner.
- **Admin jest:** registry and handler contracts.
- **Browser:** the full scenario from the brief on an isolated local stack, in
  a throwaway database `dijipeople_partner_e2e_test`.

## Risks

1. Fixing the write contract makes every partner field editable that the DTO
   allows. Review the DTO whitelist before regenerating.
2. Action routing changes affect leads, contracts and plans. The contract test
   covers all four.
3. The backfill numbering order is a one-time decision: creation order.

## Rollback considerations

Code revert is enough. The new table and column stay; they are additive and
unused by old code.

## Definition of Done

- All 26 brief items are either implemented or recorded with a reason.
- Every validation listed in AGENTS.md passes.
- The browser scenario passes on the local stack.
- Released to main.
- The production deploy is verified.
