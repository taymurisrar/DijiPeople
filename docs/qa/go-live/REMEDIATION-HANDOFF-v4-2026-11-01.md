# Starter go-live remediation handoff v4 - final product alignment (for QA RUN-006)

Branch `agent/starter-golive-remediation`, local only: not pushed, merged or deployed, no production access.
**Final application candidate for RUN-006: `17d0dcaf`** (supersedes `a55bb679`; the only code change is the
`seed:config` email-provider fix below). Later commits on the branch change documents only. Status words are developer claims; only independent QA marks anything Resolved.
Decisions are recorded in [[ADR-0028-final-subscription-entitlements-import-export-agent-email-branding]].

## Requirements implemented

1. **Basic import/export on every plan.** New key `data-import-export` (all plans) gates `DataManagementController`.
   `advanced-data-management` is a separate premium key with no routes yet (nothing premium is unlocked). The
   Growth-only `data-management` key is retired. Module lists and the per-module routes (fields, template, analyse,
   export) follow the tenant's plan: employees, Employees; leaves, Leave; attendance, Attendance. Permissions are
   unchanged: only global/system admin and HR hold `data-management.*`, exports keep the caller's row scope
   (`data-management-access.spec.ts` pins the holders). The web `system.import` command and Settings page key map to the
   new key; Starter now shows Settings, Import & Export.
2. **Desktop agent Enterprise/Custom only.** Removed from Growth. `AgentController` and the previously ungated
   `DlpController` carry `EntitlementGuard`; the public `auth/login` and `auth/refresh` call
   `TenantEntitlementService.assertEntitled` after credentials are proven (no enumeration oracle). Downgrade: the
   already-issued access token, the existing refresh token and a fresh login are all refused. Custom: a `CUSTOM`
   `TenantFeature` grants or withdraws; a `MANUAL` override cannot grant past the plan. Attendance *device*
   integrations (`attendance-integrations`) are untouched.
3. **HR permissions.** `attendance.override` and `customers.delete` are not granted (no requirement was given).
4. **Email branding.** Every plan: organisation name, logo (public logo route, only when configured), tenant primary
   colour used as accent only if it has AA contrast with white button text (else default), consistent frame, "Powered by
   DijiPeople" footer, secure fallback to the unbranded message on any fault. Applied at send time
   (`EmailBrandingService`) so stored templates, links and tokens are untouched. Growth+: `email-template-customization`
   gates create/update/clone of templates in the authoring service. Enterprise/Custom: `email-white-label` drops the
   attribution. No template designer was built.
5. **RUN-005 findings.**
   - DP-QA-023 (WebKit): nine settings navigation hrefs and two plan-state buttons pointed at redirect sources, so
     every prefetch was a redirected RSC fetch. They now point at the final destination, pinned by
     `settings-navigation-redirects.spec.ts`. **WebKit was not run locally, so this is root-cause by inspection,
     unverified in WebKit; QA must retest.**
   - DP-QA-006: located. `AccessDeniedState` defaulted `actionHref` to empty, so `Button` rendered a native
     `<button href="">` (a dead "Back to dashboard" and React's dev-only empty-href error on /my-profile). Production
     builds never print it, which is why production-build runs could not reproduce. Default is now `/`. A dev-mode run
     shows zero console warnings/errors on /my-profile, /employees, /settings/branding. (QA's wording said `src`; the
     attribute is `href`.)
   - DP-QA-007: logout 11-55 ms over 6 samples on the local production build (RUN-001: 600-3900 ms). Production-like
     latency remains a release gate.
   - New Employee API calls: 70 to 61 (public-branding read shared across identical loads, bounded map). The remaining
     11 `tenant-settings/resolved` calls are per-user authenticated reads and were left alone rather than risk
     cross-user caching.

## Entitlement matrix

| Capability | Starter | Growth | Enterprise | Enterprise+ / Custom overrides |
|---|---|---|---|---|
| `data-import-export` | yes | yes | yes | yes |
| `advanced-data-management` (**no routes yet: entitlement only, not a working feature**) | no | yes | yes | per contract |
| `desktop-agent` | no | no | yes | yes (`enterprise-plus` carries every catalog key); a `CUSTOM` override can grant or withdraw |
| `attendance-integrations` | no | yes | yes | per contract |
| essential email branding | yes | yes | yes | yes |
| `email-template-customization` | no | yes | yes | per contract |
| `email-white-label` | no | no | yes | per contract |

## Migration and seed for existing tenants

- Migration `20261101090000_split_data_import_export_entitlement` (data only, idempotent): renames
  `data-management` to `advanced-data-management` on every `PlanFeature`/`TenantFeature` row, and grants
  `data-import-export` to every plan including custom plans the catalog reconcile does not touch. Verified on the local
  database before/after.
- `npm run seed:config` (runs on deploy) reconciles catalog plans: disables `desktop-agent` on Growth, enables the new
  keys. Verified: starter {import-export}; growth {import-export, advanced, email-customization}; enterprise and
  enterprise-plus all keys.
- Growth tenants already using the agent: run `npm --workspace api run entitlement:grandfather` (dry-run first); its
  probe is `AgentRefreshToken`. Without it they lose the agent on the next enforced request.
- `repair:plan-capabilities` and grandfather probes were updated for the renamed keys. No new environment variables.
- **Email provider preservation (fixed in `17d0dcaf`).** `seedTenantConsoleProviders` used to count only *enabled*
  providers, so a tenant whose SMTP provider was configured but disabled (or whose Console row was switched off on
  purpose) had the sink re-enabled and made default on every `seed:config`. It now creates the default Console provider
  only for a tenant with **no provider row at all** and never updates an existing row. Production was already a no-op
  (sink providers retired, BUG-3501). Verified on an isolated copy of an existing database: SMTP enabled, SMTP
  disabled and Console-disabled tenants were byte-identical (including `updatedAt`) after two `seed:config` runs; on a
  fresh database the demo tenant gets one default Console provider and a second run changes nothing. Tests: new tenant,
  existing SMTP, disabled SMTP, repeated seeding (`production-sink-retirement.spec.ts`). The platform relay
  (`PlatformOutboundEmail`) is not touched by any seed. Because of this fix, RUN-006 no longer needs to re-disable
  console providers after re-seeding an *existing* database; a *fresh* database still starts with Console.
- **Migration review** (`20261101090000_...`): data-only, no DDL, no DELETE or disabling. Rerun-safe (guarded by
  NOT EXISTS). Exercised twice against legacy-shaped rows in a rolled-back transaction: a Growth plan on the old key is
  renamed and keeps its access; a plan that had the old key disabled stays disabled under the new premium key; every
  plan gains `data-import-export`; a plan holding both old and new keys keeps both (a harmless unused `data-management`
  row remains, no gate reads it). Existing custom plans get basic import/export; tenant overrides are renamed, never
  created.
- **Feature keys:** `data-import-export`, `advanced-data-management`, `desktop-agent`, `attendance-integrations`,
  `email-template-customization`, `email-white-label`. No `data-management` gate remains.

Notes: there is no `custom` plan key. Custom access is the existing mechanism: the `enterprise-plus` contract plan plus
`TenantFeature` rows with source `CUSTOM`. Attribution text is "Powered by DijiPeople" and is dropped only with
`email-white-label`. Tenant logos in e-mail use `<tenant portal>/api/public/tenants/<slug>/assets/logo`: the web `/api`
path is outside the auth proxy and the API route is `@Public()`, raster-only, cacheable, sent with nosniff and a sandbox
CSP; the logo can only appear when it is configured and never exposes another tenant's asset. Whether a *remote* mail
client fetches it depends on the portal host being publicly reachable, which a localhost sink cannot show.

## Tests performed on `a55bb679` (unchanged by `17d0dcaf` except as listed)

| Check | Result |
|---|---|
| API jest | 475 suites, 8669 tests pass |
| API `tsc` (build config), lint | clean; lint exactly 787 warnings (ceiling 787; two earlier stray warnings fixed) |
| Web jest, `check-types`, production `next build --webpack` | 136 suites / 2347 tests pass; types clean; build passes |
| `validate-framework` | passed, 6515 checks (dashboards and session indexes regenerated) |
| Live round 3 (`live-check-round3.mjs`), four plans + Custom override | 60/60 |
| Live round 3b (`live-check-round3b.mjs`), existing agent credentials after downgrade | 6/6 |
| Playwright golive, Chromium, files 01, 03, 03b, 12, 15 | see triage below |

Round 3 covers per plan: admin import/export reachable, template download, export queued, plain employee refused
(permission, not plan), no advanced route, agent settings/login/refresh/DLP, branded invitation (name, link intact,
attribution), template customization; plus a Custom `CUSTOM` override granting then withdrawing the agent.

## Playwright triage (Chromium)

First run 12 failed / 54 passed; after fixing local environment drift, `15-mail-branding-onboarding` is 13 passed / 2 failed.

- **Superseded premises (QA must update):** ENT-030 (Starter now also reports `data-import-export`), ENT-060 and ENT-061
  (`/data-management/*` is 200 on Starter), and the earlier SMK-004, CMD-022, GRW-001..004 (Import absent / 403 on
  Starter) and any GRW row that makes Growth own the agent.
- **Test or environment:** SMK-020 hardcodes port 4098; INV-102 ages tokens with a local-time fixture on a UTC+5 machine
  (use `now() at time zone 'utc'`); MAIL-002 expects 400 where a consumed token now answers 401 (DP-QA-031); INV-101 and
  MAIL-001/003/004/BRAND-002/005 failed only because a local `seed:config` re-run reset the tenants' default provider to
  console, and pass after the relay is re-pointed (fromEmail `no-reply@qa.dijipeople.test`).
- No Playwright failure was an application defect. WebKit, Firefox, mobile and tablet were not run in this pass.

## Re-verification on `17d0dcaf`

API `tsc` clean; ESLint 0 errors and exactly 787 warnings; jest for notifications, auth, users and security (53 suites,
502 tests) and the seed spec (27 tests) pass; web untouched. Fresh database: migrate deploy, `seed:config`, `seed:admin`,
`seed:demo`, then `seed:config` again - plan keys starter {import-export}; growth {import-export, advanced};
enterprise and enterprise-plus {all}. Full API/web suites were not re-run for a seed-only change.

## Remaining defects, risks, owner decisions

- WebKit fix for DP-QA-023 unverified; production-like logout latency (007) unmeasured; New Employee still 61 calls.
- Owner decisions still open: DP-QA-005 production ENFORCE cutover and grandfathering (now also the Growth agent
  tenants); `attendance.override`/`customers.delete` for HR (not granted).
- Email deliverability (SPF/DKIM) is untested; local sink only. `advanced-data-management` has no features behind it yet.
- Logo rendering in real remote mail clients (image proxying, blocked remote images) is unverified; the unauthenticated route
  is verified by inspection and earlier live branded-mail checks.

## RUN-006 instructions

1. Fresh detached worktree at the application commit, `npm ci`, new `_test` database, `prisma migrate deploy`, then
   `seed:config`, `seed:admin`, `seed:demo`. After seeding a *fresh* database, disable the console email providers (or set a default SMTP
   provider) so tenant mail reaches the sink; re-seeding an existing one no longer undoes that, and set the platform relay `fromEmail` to `no-reply@qa.dijipeople.test`.
2. Production web build and API with `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE`; local SMTP sink only.
3. Update expectations first: Starter is entitled to `/data-management/*` and Import & Export (role-limited); the agent
   is refused on Starter and Growth, allowed on Enterprise and Enterprise+, honoured via `CUSTOM` overrides.
4. Re-run: plan matrix on all four plans (the live scripts are a reference), agent login/refresh/DLP refused after
   downgrade, employee cannot reach import/export, template customization refused on Starter, branded e-mails per plan
   (name, accent, footer, white-label), tenant isolation of the logo route, DP-QA-006 in a `next dev` console, and
   DP-QA-023 on WebKit (the settings navigation no longer links to redirects).
5. Mark Resolved only on your own evidence.
