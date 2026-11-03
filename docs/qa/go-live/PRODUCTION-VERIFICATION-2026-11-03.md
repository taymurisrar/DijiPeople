# Production verification — release `2a473785` and entitlement enforcement (2026-11-03)

*Written for the owner. Follows [[RUN-008-2026-11-03]]. Everything here was read-only or non-destructive; no deploy, merge, cherry-pick, tenant-wide grandfathering or commercial change was made. **Sanitized** for publication: customer and tenant identifiers, provider hosts and addresses, connection details and authentication artifacts are replaced by generic labels. The original, unredacted evidence is kept only in a private local folder outside the repository.*

## Verdict: **DEPLOYED WITH GAPS**

| | |
|---|---|
| What is true | Release `2a473785` is live and healthy (`/api/health` reports the release commit, `environment production`). **Entitlement enforcement is ON in production**: the database row `PlatformSetting module-settings.entitlementEnforcement` is `ENFORCE`, and the deployed code reads exactly that row. No tenant is cut off by it (zero modules in use outside a plan). |
| The headline gap | **None of the 60 commits QA verified in RUN-001 to RUN-008 (application `4dd29d3a`) is in production.** `4dd29d3a` is not an ancestor of `2a473785`, and until this verification pushed a branch containing it (`agent/smoke-tenant-login`) no remote branch held it at all: the whole remediation existed only on a local branch. RUN-008's "READY for Starter" describes code that has not shipped. |
| Second gap | The Render variable `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE` has **no effect on the deployed code**; it is read nowhere. Production enforces because of the database row alone. |
| Third gap | **No authenticated production smoke was possible**: there are no dedicated test identities, and the only login available (an owner account on the disposable demo tenant) requires MFA. Entitlement denials were therefore not exercised live. |

Go-live of the Starter product to real customers stays **blocked on shipping the QA-verified remediation** (next actions below).

## 1. Where the entitlement mode is actually resolved

In `2a473785`, `TenantEntitlementService.mode()` (`services/api/src/common/security/tenant-entitlement.service.ts:111`) reads `prisma.platformSetting.findUnique({ key: 'module-settings' })` and `parseEnforcementMode` takes the field `entitlementEnforcement`; unreadable or malformed means `REPORT_ONLY`. A search of the whole production API source finds the string `ENTITLEMENT_ENFORCEMENT_MODE` only in a spec file and the constants. There is no `describeEnforcement`, no health field, no release gate (`scripts/verify-entitlement-enforcement.mjs` does not exist; `services/api` `release` starts at `prisma:migrate:deploy`), and `render.yaml` does not declare the variable. Those arrived in the RUN-007 remediation (`4dd29d3a`), which is not deployed. Confirmed against the live service: `/api/health` has **no** `entitlementEnforcement` field.

`seed:config` (run by `release`) merges stored values over its defaults (`{ ...defaults, ...stored }`), so the `ENFORCE` field survives every deploy.

## 2. Production database mode (read-only evidence)

One read-only session (`default_transaction_read_only = on`, SELECT only) against the production database:

```
PlatformSetting 'module-settings' = { exportEnabled: true, defaultPageSize: 25, sharedViewsEnabled: true,
  personalViewsEnabled: true, entitlementEnforcement: "ENFORCE" }     updatedAt 2026-11-03T12:44:14.009Z
```

The same second stamps six other seeded settings, so it coincides with a `seed:config` run, not necessarily with the change. **No audit row records who set the value** (the `PlatformAuditLog` and `AuditLog` searches for `entitlementEnforcement` are empty). Render's service environment (read through the API, secrets not printed): `ENTITLEMENT_ENFORCEMENT_MODE = ENFORCE`, `ENTITLEMENT_ALLOW_UNENFORCED` not set, `NODE_ENV production`, `OUTBOX_WORKER_ENABLED true`.

## 3. Subscriptions and grandfathered features (not modified)

| Tenant | Plan | Subscription | Users / employees |
|---|---|---|---|
| Starter tenant 1 (created 2026-10-10) | starter | ACTIVE | 1 / 0 |
| Starter tenant 2 (created 2026-08-29) | starter | ACTIVE | 1 / 0 |
| Starter test tenant (QA sign-up, 2026-08) | starter | ACTIVE | 1 / 0 |
| Demo tenant | enterprise (complimentary) | ACTIVE | 2 / 12 |

Plans in the database: starter, growth, enterprise and **`enterprise-plus` (still PUBLISHED, listed by the anonymous `/public/plans`, 0 subscribers)**. Four active subscriptions, none lapsed. `TenantFeature` overrides: 16 `CUSTOM` rows, all on the demo tenant (all 16 features, written 2026-09-26); none elsewhere. A read-only replica of the grandfather dry-run (modules with data versus the plan's features) finds **no tenant using a module its plan excludes**. ENFORCE therefore cuts nobody off today, and no grandfathering or reconciliation is needed or was run.

## 4. RUN-008 changes versus production `2a473785`

`git cherry 2a473785 4dd29d3a` lists **60 commits, none patch-equivalent in production**; the merge base is `214433c1` (2026-10-29). A dry-run merge (`git merge-tree`, nothing written) conflicts only in two generated files. Markers absent from production: `assertPlanAssignableToTenant`, `describeEnforcement`, `setPlanPricePublication`, the `/api/` plain-anchor rule in `button.tsx`, `PlanKind`, the migrations `20261101090000_split_data_import_export_entitlement` and `20261102090000_plan_kind_and_custom_plan_metadata` (production's last migration is `20261103090000_custom_module_kind_and_record_status`, 237 applied).

**QA-verified fixes missing from production**, grouped (full list: `git cherry`):
- Security and data: invitation and reset tokens single-use and revocable (DP-QA-027/031); entity data API returns soft-deleted rows (DP-QA-030); exports include deleted employees and sensitive identifiers (DP-QA-037/038); `/auth/me` ignores the idle window (DP-QA-040); backend guards for data-management, agent, attendance integrations, audit logs (DP-QA-010).
- Entitlements and plans: enforcement floor, release gate and health reporting (DP-QA-005); three predefined plans, Custom-plan model, `enterprise-plus` conversion (DP-QA-042); reserved plans, price publication, cache invalidation (DP-QA-043/044/047).
- Tenant correctness: approval routing after seeds (DP-QA-036); `seed:config` overwriting tenant mail configuration (DP-QA-039); leave balance atomicity and approvals (DP-QA-018/019/020/029); WebKit redirects, mobile Settings, import entry points (DP-QA-023/035/041); the logout-link prefetch (SESS-005).

## 5. DP-QA-048 fixed on a separate branch

Branch `agent/smoke-tenant-login` (`f6c1bfbd`, from `4dd29d3a`): `scripts/smoke-login.mjs` builds every sign-in body with `tenantSlug` (`SMOKE_TENANT_SLUG`, `SMOKE_STARTER_TENANT_SLUG`); a missing slug fails with a message naming the variable. Validated against a **compiled** API (`nest build`, `node dist/src/main.js`; a `NODE_ENV=production` boot is refused locally by the candidate's own loopback guard, so the artifact is production-built but the environment mode is development): before the fix the Starter probe and every login check answered 401; after it, with a Starter tenant the probe **passes**, with no slug it fails with the explicit message, and with a **Growth** tenant offered as "Starter" the probe **fails** (a mutation check). Unit tests `npm run test:smoke-login`: 3 of 3 pass.

## 6. Production smoke (non-destructive)

| Check | Result |
|---|---|
| API health, `/api` | 200; release commit `2a47378…`; environment production; outbox worker enabled; no `entitlementEnforcement` field (old code) |
| Marketing, tenant-app, a tenant workspace host, admin console | all 200 (titles correct, served by Vercel) |
| Anonymous `/auth/me`, `/employees`, `/tenant-settings/features` | 401, 401, 401 |
| Sign-in with an unknown user | 401 (no real account touched) |
| Sign-in as a demo-tenant owner | **MFA required**; no token issued, so no authenticated check could run |
| Authentication, employee access, leave, attendance, entitlement denials with a signed-in user | **NOT RUN** — no dedicated test identity exists. Creating one is a production write and needs approval |
| Entitlement denial (a Starter tenant refused a paid module) | **Not exercised live.** Evidence is indirect: database mode ENFORCE, code reads it, and no tenant uses an out-of-plan module |

Side effects of the smoke: one failed sign-in for a non-existent address; one successful password check on an owner account, which issued an MFA challenge (that tenant's mail provider is `CONSOLE`, so nothing is delivered). No data was created or changed.

## 7. Open findings: blockers or accepted limitations

| Finding | Classification for production |
|---|---|
| Remediation not shipped ([[DP-QA-051]]) | **Release blocker** for Starter go-live to real customers |
| Inert Render variable, no audit of the mode row ([[DP-QA-052]]) | **Gap to close** (misleading control); enforcement itself is correct today |
| Tenant mail providers on CONSOLE ([[DP-QA-053]]) | **Blocker for real onboarding** of any tenant that must receive mail |
| [[DP-QA-045]] expired subscription keeps access | **Accepted limitation for now**, owner decision pending: all four subscriptions are active |
| [[DP-QA-046]] five features cannot be withheld | **Accepted limitation**: production has no Custom plans |
| [[DP-QA-049]] price edit runs Stripe | **Accepted** (pre-existing; Stripe is configured in production) |
| [[DP-QA-050]] create-tenant `alreadyExists` | **Accepted limitation** (pre-existing; recovery is the retry-provisioning call) |
| [[DP-QA-048]] smoke login | Fixed on a branch; not a production blocker |

## 8. Email and payment readiness (no live transactions enabled)

**Email.** Platform mail is configured for real SMTP (a transactional provider, STARTTLS, a company sender address, password present). The delivery log holds **46 `SENT` through SMTP, the latest on 2026-11-02**, so the real path has worked recently. But **every tenant that has a provider row is on `CONSOLE`** (three tenants), which does not deliver (log: 8 `SENT` and 4 `NOT_DELIVERED` through CONSOLE, last 2026-09-11); one tenant has no row. `MAIL_DELIVERY_MODE=log` is set on the service. **A real-delivery proof was not run**: it would send a real message and needs approval and a mailbox the owner controls.

**Payments.** `STRIPE_MODE=test`, `SAFEPAY_ENVIRONMENT=sandbox`. 17 published active prices carry Stripe **TEST** ids and **19 published active prices have no Stripe price at all**; 3 historical payments (`SUCCEEDED`, latest 2026-08-29, test mode). Live money cannot move today. Going live needs: owner approval, `STRIPE_MODE=live`, prices synced **after** the mode switch (the environment is baked in at sync time), a live webhook secret, and the legal documents published.

## 9. Exact next actions

1. **Ship the remediation** by reconciled integration (done in the corrective release; see the integrated-release validation record).
2. **Provide a dedicated production test identity** (approval needed): a Starter test tenant with a non-deliverable address and a named synthetic test user without MFA of its own, then run the authenticated smoke with the fixed `smoke:deployment`.
3. **Email:** switch real tenants from `CONSOLE` to the SMTP provider (or remove the row so the platform path applies) and prove one controlled delivery to a mailbox the owner controls.
4. **Owner decisions** DP-QA-045 and DP-QA-046 ([[OWNER-DECISIONS-045-046]]) before the first contract end date or the first Custom plan.
5. **Payments:** keep test mode until a live cutover is approved; then follow the order in section 8.
6. Record who changes `module-settings` in future (it has no audit row in the deployed release; the corrective release adds one).
