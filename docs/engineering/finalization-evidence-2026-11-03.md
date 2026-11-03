# Finalization evidence — 2026-11-03

Branch `agent/engineering-governance`, base `origin/develop` @ `214433c1`. Everything below was executed in this session; anything not executed is listed under "Not executed". Nothing was merged or deployed.

## Environment

| | |
|---|---|
| Node / npm | **22.23.4 / 11.9.0** (the repo's `engines` and `packageManager`). The machine's own Node is 24.14; the supported runtime was downloaded and used for every check below. |
| Install | clean `npm ci`: 1,608 packages, exit 0, 468 s. `node_modules/qrcode` present (the earlier "missing" error was stale local modules, not the manifest). |
| Database | a throwaway PostgreSQL 18 cluster (`initdb`, port 5433, trust auth, temp data dir) — **not** the machine's Postgres service, which needs a password I do not have. All 236 migrations applied cleanly, including the new one. `scripts/assert-test-database.mjs` accepted it as ephemeral. |
| Claude Code | `claude.exe` 2.1.314 (the VS Code extension's native binary) |

## Results

| Check | Result |
|---|---|
| `tsc --noEmit -p tsconfig.build.json` (API) | clean |
| `next typegen && tsc --noEmit` (web) | clean (after fixing a real type error in my change) |
| `npm run typecheck` (turbo, all workspaces) | pass (172 s) |
| API unit suite (full, 454 suites) | 8,500 / 8,502 on the first full run: 1 spec asserted the old capabilities shape (fixed, 13/13 now), 1 MFA TOTP-timing flake (passes alone, 21/21). A final full run on the final code is recorded in the PR. |
| Web `lib/runtime` | 595 / 595 |
| `scripts` governance tests (`npm run test:governance`) | 76+ pass |
| `eslint` on every changed API file | 0 errors (warnings within the repo's existing budget) |
| `validate-framework` | passed, 6,516 checks |
| `preflight` (fast) | 9 / 9, **no runtime-mismatch override** |
| `preflight --full` | 11 / 12. The one failure is `check-production-advisories`, red on current `develop` too (see ci-reliability.md §6) |

### Real PostgreSQL

`test/module-provisioning.e2e-spec.ts` — **20 / 20**, plus the repo's existing DB suites run against the same database: `customization-package-alm` 19/19, `custom-module-runtime`, `custom-field-values`, `custom-fields-bound-modules`, `custom-field-list-query` (all pass).

| Property | Proven how |
|---|---|
| Complete creation (4 forms, 7 views, action bar, 1 default each, tenant stamped) | row assertions |
| Kinds: no My Records on non-user-owned kinds; no edit/delete/deactivate commands where forbidden | row + command assertions |
| **Rollback on failure** | a database trigger raises inside the real transaction; no table, form, view or component survives; retry then succeeds. **Mutation-tested**: writing the table outside the transaction makes this test fail. |
| Duplicate and **concurrent** creation | 1 of 4 simultaneous creators wins; the rest get `ConflictException`; no duplicate children |
| Idempotent | second apply changes no row id |
| Partial/legacy module back-filled, **customisations preserved** | renamed form, edited view filters and legacy `active` default survive; one default |
| Conflicts and command-bar drift reported, never rewritten | assertion that rows are unchanged after apply |
| Schema evolution | adding a column later leaves provisioning and the column intact |
| Relationships / field metadata / commands | lookup column survives reconcile; runtime `getModule` returns field, form, view and capability metadata |
| Authorization | the **real** `CustomizationAccessGuard` + `Reflector` refuse a caller without `customization.tables.update` for `createTable` and `reconcileModules` and admit one who holds it; apply refuses without the retyped slug and, on PRODUCTION, without the authorization reference (recorded in the audit entry) |
| **Tenant isolation** | tenant A cannot see, name or change tenant B's module; A's confirmation slug does not authorize B; B's gap survives A's apply; same module key in two tenants never crosses in records |
| Record lifecycle | Active by default, owner = creator, deactivate/activate audited, server-side `status`/`owner` filters with correct totals, bad values rejected, **mass assignment** of owner/tenant/deleted/createdBy ignored, IMMUTABLE never changes, CONFIGURATION never deletes |
| Expand-only migration | a module and record created without the new columns read as STANDARD / Active |

### Regression the real suites caught
The first version of the plan used hyphenated keys (`active-records`, `quick-create`). The Package ALM suite fell from 19/19 to 6/19: the package artifact rejects component keys that are not camelCase. Fixed (camelCase keys), the check message now names the cause, and `module-provisioning.spec.ts` asserts it (LESSON-0004).

### Live Claude Code session (real `claude.exe`, non-interactive, model haiku)
- **Discovery**: the init event listed all 10 `dp-*` agents and all 11 `dp-*` skills / slash commands from the worktree's `.claude/`.
- **Hook activation**: `SessionStart` ran and returned the orientation text (branch, rules pointer, session check, owner decisions).
- **Safe commands**: `node scripts/check-api-completeness.mjs`, `git log --oneline -1` and `git push --dry-run origin agent/engineering-governance` ran normally.
- **Refusal**: `git push --force-with-lease …` (GIT-002), `git checkout -- …` (GIT-003), `git worktree remove …` (GIT-004) and `echo npx prisma migrate reset` (DB-001) were blocked by the real `PreToolUse` hook with the rule id and reason; the model did not rephrase. Only harmless variants were used so a hook failure could not cause damage.
- **Caveat found**: in an *untrusted* workspace Claude Code ignores the project's `permissions.allow` ("this workspace has not been trusted"); agents, skills and hooks still loaded. Documented in the README. Hooks are a guard rail; GitHub protection and required checks remain the authority.
- Cost of both sessions: about US$0.02. The account's five-hour window was already at 81% utilisation, so no further live runs were made.

### Hotfix rehearsal (non-production)
`node scripts/hotfix-rehearsal.mjs --simulate-owner-approval` → `REHEARSED_END_TO_END`, `deployedAnywhere: false`. 13 steps, all pass: baseline from a local `/api/health` (not the branch tip) → hotfix branch from the release SHA → regression **red** on the release → one-file patch → regression **green** → build twice, identical hash → release evidence → approval checkpoint → (simulated, fake target) deploy, health, smoke → rollback → clean cherry-pick onto a diverged develop with the regression re-run there. Without the flag it stops at `AWAITING_OWNER_APPROVAL`. 6 tests, including "never touches the real repository" and "contains no push/merge/deploy invocation".

### API authorization (route level)
1,385 routes: 1,041 declare permission decorators, 91 platform role guard, 17 machine/token guard, 45 public, 11 rate-limited public, 2 `@AuthenticationOnly`. The previously "299 without a visible permission" are now explained with evidence: 162 service-enforced platform checks (e.g. `assertTenantPlatformAccess`, `assertPlatform`, `userHasPlatformPermission`), 4 service-enforced permission checks, 8 self-scoped, **4 tenant-scoped reads with no action authorization** (`runtime-metadata/published`, `organization-hierarchy/tree`, `error-logs/:traceId` + `/download`). **No route was left with no tenant scoping, permission or platform check (zero P0/P1).** `error-logs/:traceId` was read: it fetches by trace id and then verifies tenant (and owner or support role), returning null for foreign ids — correct. Those four are P2 owner-review items due 2027-01-01; the 174 others are P3. Every one is in `api-authorization-register.json` with priority, owner role and due date, and the gate fails after the date. The classifier is regex over source (handler → service → helpers, depth 2): it was wrong several times during development (first-class-in-file, second controller in a file, return-type braces) and each is now a test; treat a classification as evidence to disprove, not a proof.

### QA-branch reproduction
`agent/starter-golive-qa` @ `7fe24a7b` (0 behind `develop`): framework validation **passes** here (full worktree 6,529 checks; `--depth 1` clone 6,528) — the CI failure was **not reproduced** (ci-reliability.md §4). The advisory failure **was** reproduced, and it reproduces identically on `develop`'s own content. The e2e type error belongs to in-flight QA work and was not changed.

## Not executed
- GitHub Actions on this branch (see the PR for the real results).
- Any production access, deployment, or tenant-wide reconciliation.
- Reconcile against a copy of a real tenant's metadata (only fixture tenants were used).
- Browser-level check of the new views (the web runtime is unit-tested only; list pages still filter views client-side — follow-up F-1).
- The nine Dependabot PRs were not modified; the dependency fixes for the advisory gate were not applied.
