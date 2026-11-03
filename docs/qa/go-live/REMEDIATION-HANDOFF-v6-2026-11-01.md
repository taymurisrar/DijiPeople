# Starter go-live remediation handoff v6 - three predefined plans, dynamic custom plans (for QA RUN-007)

Branch `agent/starter-golive-remediation`, local only: not pushed, merged or deployed, no production access.
Starts from `dfd829f3` (v5). **Final application SHA: see the last section.** Status words are developer claims;
only independent QA marks anything Resolved. Decision record: [[ADR-0028-final-subscription-entitlements-import-export-agent-email-branding]] (Amendment 2).
Everything in [[REMEDIATION-HANDOFF-v5-2026-11-01]] (DP-QA-023, 035-042) is preserved except the Custom model of
DP-QA-042, which this handoff replaces.

## Plan architecture

| | Starter | Growth | Enterprise | Custom plan (any number) |
|---|---|---|---|---|
| Exists as | predefined (`Plan.kind = CATALOGUE`) | predefined | predefined | created in the plan console (`kind = CUSTOM`) |
| Features | catalogue | catalogue | every catalogue key | **exactly the keys selected on that plan** |
| `data-import-export` | yes | yes | yes | **always** (baseline, even if unlisted) |
| `advanced-data-management` | no | yes | yes | only if selected |
| `desktop-agent` | no | no | yes | only if selected |
| `email-white-label` | no | no | yes | only if selected |
| `email-template-customization` | no | yes | yes | only if selected |
| Seeded by `seed:config` | yes | yes | yes | **never** (never rewritten, retired or priced by it) |

`enterprise-plus` is not a plan. The catalogue lists exactly three plans; `PlanKind` is an explicit column (new rows
default to CUSTOM), never inferred from key or name. `data-import-export` is also enforced as a baseline in both entitlement
resolvers (`BASELINE_FEATURE_KEYS`), so a custom plan that omits it still has it; role permissions still decide who may use it.

## Removed `enterprise-plus` dependencies

`plans.catalog.ts` (entry), `markets.catalog.ts` (`DEFAULT_PLAN_SALES_MODELS`), `pricing.catalog.ts` (comment),
`tenant-features.ts` (`CONTRACT_PLAN_KEY`, `CONTRACT_GRANT_ONLY_FEATURE_KEYS` - removed), `tenant-modules.service.ts`
(explicit-grant branch and `canEnable` special case - removed; agent-session revocation on withdrawal kept),
`public-feature-catalog.spec` (restored to the plain nesting contract), `plan-entitlement-matrix.spec`,
`commercial-bootstrap.reconcile.spec`, `e2e/remediation/live-check-round3.mjs`, ADR-0028. No code, frontend or seed
references the key any more; the only remaining mention is the migration that converts the legacy row.

## Custom-plan workflow (existing framework, extended)

1. **Create** `POST /super-admin/plans` (admin console: Plans > New): key, name, description, currency, sort order,
   feature selection, optional `eligibleCustomerAccountId`, optional `effectiveFrom` / `effectiveUntil`, optional
   `salesModel` (default SALES_ASSISTED; a plan reserved for a customer or with a window can never be self-service).
   Born DRAFT. Basic import/export is added automatically. Audited (`PLAN_CREATED`).
2. **Price** `POST /super-admin/plans/:id/prices` (existing; currency, cycle, FLAT or PER_SEAT) and publish (existing).
3. **Assign** through the existing onboarding workflow (customer `selectedPlanId` -> onboarding -> create-tenant).
   `create-tenant` now refuses a plan reserved for another customer or outside its validity window.
4. **Modify** `PATCH /super-admin/plans/:id`: features, eligibility, window, active flag. Audited (`PLAN_UPDATED` with
   before/after feature lists); a features change flushes every tenant's entitlement snapshot immediately.
   The key and features of the three predefined plans are refused (the seed would undo them) with a pointer to custom plans.
5. **Lifecycle**: active/inactive, archive/publication and deletion use the existing plan lifecycle rules.
   Public catalogue listings (`/billing/plans`, public commercial catalogue) exclude reserved and out-of-window plans.
- Not built because the product has no such thing: per-feature limits/quotas. Expiry stops a plan being **assigned**;
  it does not terminate a running subscription (no new billing behaviour).
- Removing the Desktop Agent from a plan or a tenant: caches flushed; tenant-level removal also revokes agent refresh
  tokens; login and refresh re-check entitlement on every call.

## Migration `20261102090000_plan_kind_and_custom_plan_metadata` and legacy `enterprise-plus` (consistency review)

Additive: enum `PlanKind`, columns `kind` (default CUSTOM), `eligibleCustomerAccountId` (FK RESTRICT), `effectiveFrom`,
`effectiveUntil`, two indexes; `starter`/`growth`/`enterprise` -> `CATALOGUE`. Then the legacy plan, in one PL/pgSQL block:

| Step | Behaviour |
|---|---|
| Identity | **Renamed in place**, same `id`: key `enterprise-plus` -> `custom-<first 12 hex of id>`, name -> `Custom Plan <first 6 of id>`. Old key/name survive only as `metadataJson.convertedFromLegacyPlan {key,name}`. No `enterprise-plus` key exists afterwards. |
| Kind / sales | `kind = CUSTOM`, `salesModel = CUSTOM_ONLY`, `isPublic = false`. |
| Reservation | Counted over subscribers (via tenant), customers that selected it, and onboardings that carry it. **Exactly one customer -> reserved to that customer**, publication status unchanged. **Several -> not reserved, `ARCHIVED`** (not listed publicly) because a plan can be reserved to one customer only. Existing subscriptions are unaffected either way. |
| Features / prices / subscriptions / orders / agreements / audit | **Not touched** (no statement updates those tables). Contracted features, including the Desktop Agent and white-label e-mail, stay: no silent removal. |
| Deactivation | `isActive = false` only when nothing references the plan (subscription, customer, onboarding, lead, order). |
| Collision | If `custom-<id12>` is already a plan key the migration **raises a specific error and rolls back everything** (proved). |
| Absent legacy plan | No-op (fresh and already-converted databases). |

**Key-based dependencies inspected before renaming.** Stripe prices/products reference the plan by id (`metadata.planId`); every
feature/price/subscription/customer/onboarding/lead/order/promotion table joins on `planId`; no setting, template, seed or
code path addresses the plan by key (the catalogue, markets, pricing and bootstrap sources no longer name it; a spec asserts that).
Text copies of the old key are **historical records and deliberately keep it**: `SubscriptionOrder.commercialSnapshot.planKey`
(what an order was priced against) and `PlatformAuditLog` before/after snapshots. Nothing resolves a plan from those.
No blocker was found; none of this required a business decision.

**Verified on real local databases** (copies of the RUN-006-shaped legacy DB with the migration undone, then `migrate deploy`):
(A) one subscribing customer: same id, neutral key/name, reserved to that customer, 19 features + subscription byte-identical, three
CATALOGUE plans, then `seed:config` leaves the plan, its 19 features and every other custom plan untouched;
(B) a second customer also on it: not reserved, ARCHIVED, still renamed, subscriptions identical; (C) unreferenced: renamed and
deactivated; (D) key collision: fails with "already used by another plan", no column added, legacy plan unchanged;
(E) legacy plan absent: migrates, exactly three CATALOGUE plans. PlanPrice rows were not present in the test data
(none in the QA copy); the migration contains no statement that touches `PlanPrice`, asserted by a spec.

### Existing-tenant impact and OWNER DECISIONS

- Tenants on the legacy plan keep **every capability and billing term today**; nothing moves them. They are on a neutrally named custom
  plan that cannot be sold to anyone else.
- Decisions that remain yours (list the tenants: `select t.slug from "Subscription" s join "Tenant" t on t.id=s."tenantId" join
  "Plan" p on p.id=s."planId" where p."metadataJson" ? 'convertedFromLegacyPlan'`): (1) keep the converted plan and rename/describe it
  as the customer's contract plan in Admin; (2) move each tenant to a purpose-made custom plan carrying exactly the entitlements its
  agreement states; (3) move to Enterprise. Whether any contracted feature (agent, white-label) should be trimmed after the commercial
  review is likewise yours; nothing here does it.
- The earlier `CUSTOM` tenant-override grants on this branch were never deployed; nothing to unwind.
  `entitlement:grandfather` still exists for Growth tenants already using the agent.

### Restricted plan discovery, selection and assignment (backend enforcement)

| Path | Rule | Where |
|---|---|---|
| Public catalogue (`/billing/plans`, commercial catalogue) | reserved and out-of-window plans are not listed | `publiclyOfferablePlanWhere` |
| Self-service checkout | reserved plan -> `CUSTOM_CONTRACT_ONLY`; custom plans are sales-assisted by default and a reserved/windowed plan can never be self-service; out-of-window -> not sellable | `resolveCommercialOffer` (new defence in depth) + `resolveCustomSalesModel` |
| Select on a customer (create/update) | refused unless it is the reserved customer; a not-yet-existing customer cannot hold a reserved plan; expired plans cannot be newly selected | `assertPlanSelectable` (new) |
| Onboarding create/update | same | same |
| Tenant provisioning (`create-tenant`) | same, final authority | `assertPlanAssignable` |
| Running subscription | **not** re-evaluated: expiry stops new assignments only | by design |

### Custom effective entitlement (verified)

`enabled(feature) = live subscription AND (plan lists feature OR feature is baseline) AND NOT (MANUAL override = off)`; a `CUSTOM`-source
override (grandfathering) is the only thing that can add a feature the plan lacks. The snapshot reads only `plan.features`: the plan's kind,
sales model, publication state, window, reservation and key cannot change what an existing subscriber may use (asserted via the Prisma
`select`). A lapsed subscription is reported as `NO_LIVE_SUBSCRIPTION` (billing state, existing design), not re-decided by the plan.
Withdrawal: a plan edit that changes features flushes every tenant snapshot immediately (control plane); a tenant-level withdrawal flushes that
tenant and revokes agent refresh tokens. Cross-process propagation is bounded by the 60 s snapshot TTL (the previously approved maximum).

## Validation

| Check | Result |
|---|---|
| API jest | 483 suites, 8771 tests pass (full run after the final code change) |
| Admin jest / Web jest | 84 suites, 1068 tests / 139 suites, 2358 tests pass |
| API `tsc`, `nest build` | clean / builds |
| API eslint | 0 errors, 786 warnings (ceiling 787) |
| Web `tsc`, admin `tsc`, admin production build | clean / passes (web build unchanged since v5: no web source changed) |
| `prisma validate`, `generate:runtime-schema`, `test:runtime-schema` | pass; generated schema regenerated |
| Live (local API, `ENFORCE`, DB with legacy enterprise-plus): custom plan create / price / list / provision | 9 of 9: custom plan CUSTOM + sales-assisted + reserved + exact features; predefined plan feature edit refused; public catalogue hides the reserved plan; **another customer refused ("reserved for another customer"); the reserved customer provisioned and subscribed** |
| Live entitlement view of that tenant | agent ON (selected), white-label/payroll/advanced data OFF, basic import/export ON; after editing the plan (agent out, white-label in): agent OFF, white-label ON, import/export still ON |
| Regression live (same DB): export/deleted/identifiers/formula, field list, upload with internal columns, CSV import, idle `/auth/me` | all pass (35, 37, 38, 40) |
| Approval routing after the migration + seeds | active steps bound to staffed roles (qa-prov-a/b -> `global-admin`, qa-starter -> `system-admin`) |
| Migration on real databases (legacy DB with the migration undone) | A-E above: 19 of 19 checks pass |
| Live (local API on the converted legacy DB): discovery / selection / assignment | 13 of 13: no `enterprise-plus` plan, three CATALOGUE plans, neutral custom plan with 19 features reserved to its customer, absent from the public catalogue; another customer refused on customer select, customer create and onboarding create; the reserved customer still can; an expired plan cannot be newly selected; the legacy subscription and its 19 features unchanged |
| New specs | `legacy-plan-conversion.spec`, `custom-plan-entitlement.spec`, resolver reserved/expiry tests |
| Not re-run this round | the v5 live regression script (it requires a `*_test` database name; RUN-006 behaviour is covered by the full jest run above, nothing in those paths changed) and | Playwright golive suite; Firefox/tablet; WebKit and 412px sweeps (no web source changed since v5) |

## Risks

- UI for the new fields is minimal (customer id text input, two dates). A customer picker is not built.
- A published, unreserved custom plan set to SALES_ASSISTED is listed in the public catalogue as "contact sales" (not purchasable). Keep a customer-specific plan reserved or DRAFT.
- A published **self-service** custom plan (reusable, no window) is buyable at public checkout like any plan; if that is
  not intended, keep custom plans SALES_ASSISTED (the default).
- Tenant-level `TenantFeature` rows still exist and can only restrict (MANUAL) except grandfather `CUSTOM` rows.

## RUN-007 instructions (updated)

1. Fresh worktree at the final SHA, `npm ci`, new `_test` database, `migrate deploy`, `seed:config` twice, `seed:admin`,
   `seed:demo`. Assert exactly three plans exist and all are `kind = CATALOGUE`; no `enterprise-plus`.
2. Plan lifecycle: create a custom plan in Admin (features without agent/white-label), price, publish, provision a
   customer; assert the entitlement matrix above; add the agent in the plan editor and assert agent login works within
   seconds; remove it and assert login/refresh are refused and existing agent refresh tokens stop working.
3. Reserved plan: another customer cannot be provisioned onto it; it does not appear in the public catalogue.
4. Seed safety: create a custom plan and a tenant on it, run `seed:config` three times; plan, features, prices and
   subscription are unchanged.
5. Legacy path: restore a database from before the migration, put a tenant on `enterprise-plus`, run `migrate deploy` and `seed:config` twice;
   the plan keeps its id, is renamed `custom-<id12>` / `Custom Plan <ID6>`, is reserved to its customer (or ARCHIVED when several customers use it),
   keeps all features, and the tenant keeps its subscription and features. Assert no plan has key `enterprise-plus`.
   Reserved-plan checks: another customer cannot select it (customer, onboarding) or be provisioned onto it; it is absent from the public catalogue.
   and `seed:config`; the tenant keeps its plan and features.
6. Re-run the v5 list (APR, EXP/IMP, SEED, SESS, WebKit SMK, mobile, MAIL/BRAND, AGT). Mark Resolved only on your own evidence.

## Final SHA

**Application candidate for RUN-007: `98f9b025fa8aa57e4288d5df183a7f0aeffeadf3`** (supersedes `38a7b94a`, which still named the legacy key). Commits after it change documents only.
