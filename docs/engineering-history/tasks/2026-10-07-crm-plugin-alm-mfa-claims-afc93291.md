# Engineering History — CRM plugin: package ALM and MFA discoverability, Claims on the runtime, advisory fix

| | |
|---|---|
| **Task Title** | CRM plugin: package ALM and MFA discoverability, Claims on the module runtime |
| **Task Type** | BUGFIX + REFACTOR: BUG-3843, BUG-3844, and EXECPLAN-0044 wave 2 for Claims. Also SECURITY: BUG-3862, which the owner approved mid-task when CI blocked integration. |
| **Date** | 2026-10-07 |
| **Architect Plan** | `docs/plans/EXECPLAN-0044-record-page-shell-adoption.md` covers the Claims migration. The two navigation fixes are small and local, so they needed no ExecPlan. |
| **Agents Used** | Architect, for orchestration and integration. Three read-only investigation agents covered ALM, MFA and Claims. One implementation agent did the Claims migration. Database and Release/DevOps were not used: there was no schema change and no deployment. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branches** | `agent/crm-plugin-alm-mfa-claims`, `agent/security-advisories-2026-10` |
| **Base SHA** | `9714f85be740ffebf4206254490e2a9c1dd4466e` |
| **Final Task SHA** | `afc93291c8453b1d0bbb91690a4a3ae5b369c05d` |
| **Target Branch** | `develop` |
| **Merge Commit** | None. Both integrations fast-forwarded `develop` by ref-push to the CI-verified SHA. |
| **Final Target SHA** | `afc93291c8453b1d0bbb91690a4a3ae5b369c05d` |

### Commits

```
1e8761eb fix(deps): clear critical Next.js and proxy-addr advisories and cross-tenant nodemailer leak (BUG-3862)
a78af4f8 fix(web,admin): make package ALM and two-factor authentication findable (BUG-3843, BUG-3844)
afc93291 refactor(web): move Claims onto the module runtime (EXECPLAN-0044 wave 2, Claims)
```

### Files Changed

Compared against the base `9714f85b`. Generated indexes are omitted.

- **Customization navigation:**
  - `apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts`
  - `customization-navigation-access.spec.ts`
- **MFA entry points:**
  - `apps/web/app/(authenticated)/_components/user-menu-dropdown.tsx`
  - `apps/web/app/(authenticated)/my-profile/page.tsx`
  - `apps/web/app/components/security/account-security-anchor.ts`
  - `account-security-discoverability.spec.ts`
  - `apps/admin/app/(internal)/settings/page.tsx`
- **Claims:**
  - the eight pages under `claims/` and `me/claims/`
  - `claims/_components/claim-record-page.tsx` and `claim-line-items-editor.tsx`
  - `lib/runtime/modules/claims-runtime-specs.ts`, `claims-data.adapter.ts` and `claims-runtime.spec.ts`
  - `lib/runtime/command-payload-schema.ts` and `custom-fields-server.ts`
  - the conformance spec
  - deleted: `claim-form.tsx` and `claim-actions.tsx`
- **Dependencies:**
  - `package-lock.json`
  - `next` in the four app manifests
  - `services/api/package.json`
  - `scripts/check-production-advisories.mjs`

## Conflicts

Two conflicts came up when `agent/crm-plugin-alm-mfa-claims` was rebased onto
`agent/security-advisories-2026-10`:

1. **Generated indexes** (type: generated-artifact). Each side had regenerated
   these against its own records:
   - `docs/backlog/index.md`
   - the QA coverage matrix, scenario index and test-plan index
   - the remediation inventory
   - the component index
   - the dashboards
2. **`docs/qa/regressions/index.md`** (type: concurrent append). Both branches
   appended at the end of the hand-kept register: REG-644 and REG-645 on one
   side, REG-646 on the other.

## Conflict Resolutions

1. **Generated indexes.** I took the base side wholesale, then re-ran every
   generator with both branches' records present. Hand-merging the hunks would
   have produced an index that matches neither branch.
2. **Regression register.** I kept both sides, placing REG-644 and REG-645
   before REG-646 so the ids stay in order. Taking either side alone would have
   dropped live regression entries that bug records cite, and
   `validate-framework` would have failed.

## QA

| | |
|---|---|
| **QA Report** | Scenarios: QA-SETTINGS-038, QA-AUTH-021, QA-TENANT-067, QA-PLATFORM-045. All automated halves PASS. The browser halves (Customization tiles, the MFA menu path, the Claims flows) were not run, because no isolated database was available in this session. |
| **Bug IDs** | Created and FIXED: BUG-3843, BUG-3844, BUG-3862. Created as PRODUCT_DECISION: BUG-3845. |
| **Backlog Items** | ITEM-0123 is DONE: its multer removal trigger fired. |

## CI

| | |
|---|---|
| **CI Run ID** | 37599209512 (security fix, `1e8761eb`). 37600300760 (CRM branch, `afc93291`). An earlier run, 37591991509 on `e2a9ab99`, failed only on the production-advisory check, which surfaced BUG-3862. |
| **CI Result** | PASS for both SHAs that were integrated. |

## Post-Merge Validation

`develop` was fast-forwarded to exactly `afc93291`. CI run 37600300760 passed
every required job on that SHA, including Build and browser-e2e.

The same tree was also checked locally, in a worktree with a real install:

- web tests: 2,287 of 2,287 passed
- admin tests: 482 of 482 passed
- web typecheck: 0 errors
- `next build`: web and admin build

## Release / Deployment Impact

Released to production on 2026-10-07 through PR #98, merged as `94f65fa4`.
CI on the PR head `d5adbe3b` passed in runs 37602414139, 37604068385 and
37605589653.

- **Vercel:** web, admin and landing were READY on `94f65fa4` at 10:24 UTC.
- **Render:** the API deploy, including the pre-deploy `release` step, went
  live at 10:32 UTC. `/api/health` reports `commitShort` 94f65fa, and
  `/api/public/legal` returns 200.

No migrations or seed changes were included.

A post-deploy browser check on the demo tenant reached the new two-factor login
challenge: the owner account now has MFA on. It went no further without the
owner's authentication code, so the Customization tiles and the Claims screens
were not clicked through in production.

Rollback class: CODE_ONLY. Revert the merge `94f65fa4`.

### Follow-up releases on the same day

**PR #100, merged as `a95a3378` — CRITICAL hotfix BUG-3883.**

The owner turned on MFA, and then My Profile failed. The cause was that
`GET /api/employees/:id` returned the linked User row raw, including
`passwordHash` and the MFA secrets. A BigInt in that row crashed the response
for MFA-enrolled users. The release did not cause this: the same 500 appears in
the logs before `94f65fa4` reached the API.

The fix:

- the user relation is loaded with a safe `select`;
- the profile and list responses share one mapper.

The API was live on `a95a337` at 11:39 UTC. The owner still has to decide on
credentials for the accounts that were exposed (BUG-3883, Dependencies).

**PR #101, merged as `2d728cf9` — BUG-3916 lead Partner tab, plus the monitoring triage records.**

These records are BUG-3888 to BUG-3907 and ITEM-0222 to ITEM-0225. Admin and
web were READY on `2d728cf9`. This release has no API change, so the API stays
on `a95a337`.

## Knowledge Capture

Nothing needed a new `docs/knowledge/` note. The lessons are recorded in these
places instead:

- **BUG-3843.** The settings navigation catalog was a fourth authorization
  layer that ADR-0013 missed.
- **BUG-3862.** The advisory-check dispositions name call sites, not files.
- **The record-page contract.** It now documents the Claims line-item exception.

## Obsidian Sync

`npm run knowledge:sync` ran on the integrated tree: it wrote 33 files, found
1,762 already current, and skipped 7 as empty.

## Cleanup

- The task worktrees are removed with `scripts/remove-worktree.mjs` once this
  record is integrated.
- At the owner's request, the session record stays local and was never
  committed.

## Related

[[BUG-3843]] · [[BUG-3844]] · [[BUG-3845]] · [[BUG-3862]] · [[ITEM-0123]] · [[QA-SETTINGS-038]] · [[QA-AUTH-021]] · [[QA-TENANT-067]] · [[QA-PLATFORM-045]]

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[ADR-0013]] · [[BUG-3843]] · [[BUG-3844]] · [[BUG-3845]] · [[BUG-3862]] · [[BUG-3883]] · [[BUG-3888]] · [[BUG-3907]] · [[BUG-3916]] · [[ITEM-0123]] · [[ITEM-0222]] · [[ITEM-0225]] · [[QA-AUTH-021]] · [[QA-PLATFORM-045]] · [[QA-SETTINGS-038]] · [[QA-TENANT-067]]

<!-- GRAPH:END -->
