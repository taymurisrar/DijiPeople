# Starter go-live remediation handoff v5 - RUN-006 defects (for QA RUN-007)

Branch `agent/starter-golive-remediation`, local only: not pushed, merged or deployed, no production access.
Starting point `17d0dcaf` (RUN-006 verdict NOT READY). **Application candidate for RUN-007: see "Final SHA" at the
end.** Status words are developer claims; only independent QA marks anything Resolved. Decisions: [[ADR-0028-final-subscription-entitlements-import-export-agent-email-branding]] (amended 2026-11-01).

## Issue-to-commit matrix (DP-QA-035..042)

| Issue | Cause found | Fix | Commit | Evidence by developer |
|---|---|---|---|---|
| 035 Employees Import dead | `isSafeModuleHref` only allowed hrefs under the module route base, so the Import navigation to Settings was dropped; separately, a plain CSV had its first data row read as the template key row, so a "valid file" imported zero rows | exact-route exception `/settings/data-management` (`lib/runtime/module-href.ts`); key row accepted only when it holds known field keys | `33e956a4`, `55eb38d6` | Chromium: Employees > Data Transfer > Import lands on `/settings/data-management`. API: CSV analyse (CREATE_ONLY) -> execute -> COMPLETED, 1 created, persisted. Specs: `module-href.spec`, `import-sheet-layout.spec` |
| 036 approval route unroutable after `seed:config` | default step hard-wired to `system-admin`; identity-provisioned owners hold only `global-admin` | step binds to the first of `system-admin`, `global-admin` with an ACTIVE holder; nothing seeded while nobody is staffed (fallback route keeps working, next seed retries); existing matrices never touched; unchanged default steps stranded by the old seed are re-pointed (or deactivated if nobody can approve) | `624e8131` | Copy of the RUN-006 database (qa-prov-a/b had active `system-admin` steps, 0 holders): after `seed:config` both route to `global-admin`, qa-starter unchanged, second run byte-identical. 9 specs (empty, provisioned, invited owner, customised, repeated, repair, edited step) |
| 037 deleted employees / identifiers in export | complete export had no soft-delete filter; included `cnic`/`taxIdentifier`; a repeat request within a minute returned the previous finished file | `isDeleted:false` where the model has it; identifiers on `exportOmittedFields`; formula-neutralised cells; finished jobs are no longer re-served | `6dc72c26`, `55eb38d6` | Live: created employee with identifiers and a `=HYPERLINK` name, exported (present, formula prefixed with `'`, no identifier column or value), deleted, exported again (absent). Specs `data-export-safety.spec` |
| 038 storage columns offered | no allowlist; the sensitive flag was name-pattern based and missed `*Enc`/`*Hmac` | explicit per-module `allowedFields` (employees 54, leaves 9, attendance 20) + defence-in-depth name deny (`Enc|Hmac|Hash|Salt|Secret|Token|Ciphertext`); header-mapping is server-derived so an upload column named `cnicEnc` stays unmapped | `6dc72c26` | `/fields` has none of them; upload with `cnicEnc,cnicHmac` columns maps neither |
| 039 `seed:config` overwrote tenant settings | `update:{...}` branches on notification settings/preferences/templates/rules and workforce reference data | create-only; audit below | `624e8131` | recording-client spec over every upsert of 7 seeds; live: `emailEnabled=false` survived two seeds |
| 040 `/auth/me` ignored idle window | `isSessionStillLive` checked revocation/expiry only | also applies absolute lifetime and the tenant idle window (same rule as the guard); idle-expired -> not live -> refresh path refuses | `ec000a20` | Live, policy 15 min: 0 min 200/200, 10 min /auth/me 200, 16 min guarded 401 SESSION_EXPIRED and /auth/me 401. 5 specs |
| 041 zero-width mobile Settings | `SettingsLayout` was a flex row at every width (260px rail + content); bare `grid` page bodies sized by widest child | column below `md`; rail full width; direct bare-grid children get the constrained track; branding preview grid `grid-cols-1` | `33e956a4`, `dfd829f3` | Chromium Pixel-class 412px: every `/settings/*` route has `scrollWidth = innerWidth`; data-management content column 242px (was 0). Spec `settings-mobile-layout.spec` |
| 042 Custom inherits agent/white-label | `enterprise-plus` carried every key | see "Custom model" | `f81517c5` | `plan-entitlement-matrix.spec`, `tenant-modules-contract-grant.spec` |
| 023 WebKit | **reproduced locally** (WebKit over TLS, 6 of 6 direct loads of each of `/employees/import`, `/settings/access`, `/settings/security-access/roles`). Trace: the pages render the authenticated shell, the shell's links start RSC prefetches, then the page-level `redirect()` navigates and WebKit reports every cancelled prefetch (`Load request cancelled`) as an uncaught "access control checks" page error | redirect-only pages answer with an HTTP redirect from `next.config` (exact paths, final destinations, no chains) so nothing renders to be cancelled | `dfd829f3` | after: 0 of 8 on `/settings/access` and `/settings/security-access/roles`, 1 of 8 on `/employees/import` and the one error is the previous page's `notifications/in-app` fetch cancelled by the navigation, first load only. Spec `next-config-redirects.spec` |

## Custom entitlement model (DP-QA-042, owner decision)

- No new plan key. `enterprise-plus` is the contract plan; its catalogue now lists every key **except**
  `desktop-agent` and `email-white-label` (`CONTRACT_GRANT_ONLY_FEATURE_KEYS`). Enterprise keeps both.
- A grant is a `TenantFeature` row with `source: CUSTOM`, written by the existing tenant-modules control plane
  (`PATCH` modules). It accepts the grant only on `enterprise-plus` and only for those two keys; Starter/Growth/Enterprise
  and every other key are still refused ("change the plan"). A missing grant means off.
- Removing the agent grant (row deleted or set off): entitlement cache invalidated immediately; the tenant's
  `AgentRefreshToken` rows are revoked so devices cannot mint new access tokens; an already issued access token ends at
  its next guarded request. Login/refresh re-check entitlement on every call.
- A plan change not made through that control plane (subscription downgrade, catalogue edit) is bounded by the 60 s
  snapshot; no new session can start in the meantime.
- **Before release**: existing production `enterprise-plus` tenants using the agent lose it at the next `seed:config`
  unless `npm --workspace api run entitlement:grandfather` (dry-run first; probe = AgentRefreshToken) has written an
  explicit CUSTOM grant.
- Public pricing contract tests now treat the contract plan as nesting over Enterprise *except* the grant-only keys.

## Seed audit (DP-QA-039) - other routines

Made create-only: notification preferences, notification settings, in-app notification templates, notification rules,
project roles, designations, employee levels, default holiday calendar, standard work schedule, day shift, HQ location,
default approval matrices (+ repair rule above), console e-mail provider (previous commit). Already create-only:
session policy defaults, leave types, e-mail templates (retire-only). Left as-is, system-owned catalogues re-synced on
purpose: countries/states/cities, notification events, customization solutions/default components, platform contract
templates, platform settings. **Trade-off recorded:** a future change to default notification wording or rule channels
no longer reaches existing tenants through `seed:config`; it needs an explicit migration.

## Decisions I made that you may want to reverse

1. `cnic` and `taxIdentifier` stay **importable** (legitimate onboarding data) but are never exported by the standard
   export. QA's EXP-003 treats them as a "sensitive offered column" in the import list/template; if the owner wants
   them out of the template too, remove two strings from `allowedFields` in `module-registry.service.ts`.
   A separately authorised, audited identifier export was **not** built (no stated requirement).
2. Default administrator approver is whichever of `system-admin`/`global-admin` is staffed, not a new grant of
   `system-admin` to anyone.
3. `enterprise-plus` is treated as "Custom". If Custom must be distinguishable from a catalogue Enterprise+, that needs a
   marker on the subscription - not invented here.

## Validation on the final SHA

| Check | Result |
|---|---|
| API jest | 480 suites, 8739 tests pass |
| API tsc (build config) / eslint | clean / 0 errors, exactly 787 warnings (ceiling 787) |
| Web jest / `tsc --noEmit` / production `next build --webpack` | 139 suites, 2358 tests pass / clean / passes (twice) |
| Fresh DB: `migrate deploy` + `seed:config` x2 | idempotent (earlier run on `17d0dcaf` plus the RUN-006 database copy this round) |
| Existing DB copy of RUN-006 state | approval repair, notification setting preserved, second seed identical |
| Live API (local stack `ENFORCE`): export/fields/upload, import, idle policy | all pass (details in matrix) |
| Chromium: Import command, 412px settings sweep (all routes) | pass |
| WebKit over local TLS | see 023 row |
| Firefox, tablet, Playwright golive suite | **not run** by development this round |

## Remaining risks / not done

- WebKit: 1 of 8 residual error on `/employees/import` first load (cancelled notifications fetch of the previous page).
  Unclear whether QA's harness hits it; not hidden or filtered.
- 360px width: sweep reported `/settings` and `/settings/branding` scrollWidth > viewport on the pre-fix build; only
  412px was re-verified after the fixes.
- `entitlement:grandfather` for production Growth *and* `enterprise-plus` agent tenants remains an owner-run step.
- A DB-level quirk found while testing, not changed: the server timezone is UTC+5 and several columns are
  `timestamp without time zone`; ad-hoc SQL must use `now() at time zone 'utc'`.
- Prior session note: while cleaning up stale local API launchers I also stopped one stale `npx` launcher wrapper
  belonging to the `dijipeople-starter-verify5` worktree (its node child was left running).

## RUN-007 instructions

1. Detached worktree at the final SHA, `npm ci`, new `_test` DB, `migrate deploy`, `seed:config`, `seed:admin`,
   `seed:demo`. Provision `qa-probe` through onboarding, leave it untouched, run `seed:config` twice.
2. Production builds, `ENTITLEMENT_ENFORCEMENT_MODE=ENFORCE`, local SMTP sink only.
3. Update expectations: Custom needs explicit grants for agent and white-label (grant through the tenant-modules API);
   export never contains identifiers, deleted people or storage columns; Import command opens Settings.
4. Re-run APR-*, EXP/IMP-*, SEED-*, SESS-023, SMK-004/011/015 on WebKit (HTTPS), mobile project, MAIL/BRAND, AGT matrix.
5. Mark Resolved only on your own evidence.

## Final SHA

**Application candidate for RUN-007: `dfd829f32f12b8b7fc0d0ecebaf6df137bee6a33`.** Commits after it change documents only.
