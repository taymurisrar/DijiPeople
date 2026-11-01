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

## Migration `20261102090000_plan_kind_and_custom_plan_metadata` and legacy `enterprise-plus`

Additive: new enum `PlanKind`, columns `kind` (default CUSTOM), `eligibleCustomerAccountId` (FK RESTRICT),
`effectiveFrom`, `effectiveUntil`, two indexes. Then data:
- `starter`, `growth`, `enterprise` -> `CATALOGUE`.
- legacy `enterprise-plus` is **converted, not deleted**: `kind = CUSTOM`, `salesModel = CUSTOM_ONLY`, `isPublic = false`,
  `publicationStatus = ARCHIVED` (withdrawn from sale), `metadataJson.convertedFromCataloguePlan`. Its id, key,
  **PlanFeature rows (including desktop-agent and white-label as they were)**, prices, subscriptions, customers,
  onboardings, leads and orders are untouched. It stays `isActive` while anything references it; if nothing does it is
  also deactivated.
- Tested: (a) RUN-006-shaped database with a tenant subscribed to a legacy `enterprise-plus` carrying all 19 features:
  after `migrate deploy` the subscription still points to it and the feature set is byte-identical; two `seed:config`
  runs change nothing, report 0 retired / 0 withdrawn, and `kind = CATALOGUE` count is 3. (b) copy with no references:
  converted and deactivated. (c) fresh database: `migrate deploy`, `seed:config` x2, `seed:admin`, `seed:demo` -> exactly
  starter, growth, enterprise.
- Seed behaviour change: `retireUnlistedPlans` previously withdrew **any** plan the catalogue did not list - it would have
  retired every custom plan an operator created. It now touches `CATALOGUE` plans only.

### Existing-tenant impact and OWNER DECISIONS (migration steps stopped here)

- Tenants on legacy `enterprise-plus` keep every capability and their billing terms **today**. Nothing in this branch
  moves them. They are on a plan that is archived and CUSTOM_ONLY: it cannot be sold to anyone new.
- **Decide per tenant** (list: `select t.slug from "Subscription" s join "Tenant" t on t.id=s."tenantId" join "Plan" p on
  p.id=s."planId" where p.key='enterprise-plus'`): (1) leave them on the converted plan and rename/describe it in the
  console as their contract plan; (2) create a purpose-made custom plan per customer with the entitlements their
  agreement actually states and move them (plan-change workflow - a commercial act); (3) move to Enterprise. Whether any
  tenant needs the converted plan's current feature list trimmed (e.g. the agent or white-label) is likewise yours.
- The previous round's `CUSTOM` tenant-override grants on this branch were never deployed; nothing to unwind.
  `entitlement:grandfather` still exists for Growth tenants that already use the agent.

## Validation

| Check | Result |
|---|---|
| API jest | 481 suites, 8750 tests pass |
| Admin jest / Web jest | 84 suites, 1068 tests / 139 suites, 2358 tests pass |
| API `tsc`, `nest build` | clean / builds |
| API eslint | 0 errors, 786 warnings (ceiling 787) |
| Web `tsc`, admin `tsc`, admin production build | clean / passes (web build unchanged since v5: no web source changed) |
| `prisma validate`, `generate:runtime-schema`, `test:runtime-schema` | pass; generated schema regenerated |
| Live (local API, `ENFORCE`, DB with legacy enterprise-plus): custom plan create / price / list / provision | 9 of 9: custom plan CUSTOM + sales-assisted + reserved + exact features; predefined plan feature edit refused; public catalogue hides the reserved plan; **another customer refused ("reserved for another customer"); the reserved customer provisioned and subscribed** |
| Live entitlement view of that tenant | agent ON (selected), white-label/payroll/advanced data OFF, basic import/export ON; after editing the plan (agent out, white-label in): agent OFF, white-label ON, import/export still ON |
| Regression live (same DB): export/deleted/identifiers/formula, field list, upload with internal columns, CSV import, idle `/auth/me` | all pass (35, 37, 38, 40) |
| Approval routing after the migration + seeds | active steps bound to staffed roles (qa-prov-a/b -> `global-admin`, qa-starter -> `system-admin`) |
| Not run | Playwright golive suite; Firefox/tablet; WebKit and 412px sweeps (no web source changed since v5) |

## Risks

- UI for the new fields is minimal (customer id text input, two dates). A customer picker is not built.
- Selecting a reserved plan on the **customer record** is not blocked; the refusal happens at tenant creation (the
  enforcement point), as with inactive/unpriced plans.
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
5. Legacy path: on a database restored from before the migration, put a tenant on `enterprise-plus`, run `migrate deploy`
   and `seed:config`; the tenant keeps its plan and features.
6. Re-run the v5 list (APR, EXP/IMP, SEED, SESS, WebKit SMK, mobile, MAIL/BRAND, AGT). Mark Resolved only on your own evidence.

## Final SHA

**Application candidate for RUN-007: `38a7b94a62787bd302e574dd929358530f361e5c`.** Commits after it change documents only.
