# SUP — Secrets, Configuration and Dependency / Supply-Chain Security

Specialist audit area: **SECRETS, CONFIGURATION AND DEPENDENCY / SUPPLY-CHAIN SECURITY**.
Prefix `SUP`. Evidence gathered read-only inside
`D:/My Work/hrm-dijipeople/dijipeople-audit` (worktree `agent/full-technical-audit`,
cut from `origin/develop` at `f55cf4b2`). `npm audit` was run against the committed
lockfile only; no `npm install`/`npm ci` was run.

Known context supplied by the orchestrator (not re-derived, cited where relevant):
CI-06 (secret scanning/push protection/Dependabot disabled on a public repo),
INF-03/INF-04 (`render.yaml` drift, Stripe/required keys absent, `SECRET_ENCRYPTION_KEY`
single point of failure), OBS-24 (`SecretEncryptionService` is AES-256-GCM and fails
closed in production).

---

### SUP-01 — A real production database password and a real platform-admin bootstrap password were committed to a public repo; the admin password is still there today

- **Category:** Secret Leakage
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW (not present in `docs/bugs/` or `docs/knowledge/`; the leak is
  acknowledged in `docs/environment-variables.md` and `docs/deployment-env-checklist.md`
  as an operational warning, but no bug record tracks it and the admin-password half
  was never flagged there at all)
- **Component:** `services/api/.env.production.example` (current file and git history)
- **Evidence:**

  Git history — the real secret entering the tree, commit `74d3ea3d` (2026-05-12,
  "tenant slug fixes"):
  ```
  +DATABASE_URL="postgresql://neondb_owner:REDACTED-DB-PASSWORD@ep-crimson-field-amm402fv.c-5.us-east-1.aws.neon.tech/neondb?sslmode=require"
  +
  +JWT_ACCESS_SECRET=dijipeople_dev_access_secret_2026_change_me
  +JWT_REFRESH_SECRET=dijipeople_dev_refresh_secret_2026_change_me
  ...
  +BOOTSTRAP_ADMIN_EMAIL=superadmin@dijipeople.local
  +BOOTSTRAP_ADMIN_PASSWORD=REDACTED-ADMIN-PASSWORD
  ```
  found via `git log --all -p -S'.neon.tech'`. The hostname
  `ep-crimson-field-amm402fv.c-5.us-east-1.aws.neon.tech` is not a placeholder —
  it is the **exact** current production endpoint documented (independently) in
  `docs/deployment/platform-access.md:199-200`:
  ```
  | Endpoint | `ep-crimson-field-amm402fv`, type `read_write` |
  | Host | `ep-crimson-field-amm402fv.c-5.us-east-1.aws.neon.tech` |
  ```
  This is the live project's database host, not a fabricated example (compare the
  genuinely fake hostnames used elsewhere in this repo's tests, e.g.
  `ep-cool-frost-a1b2c3.us-east-2.aws.neon.tech` in `packages/config/database-urls.test.js`).

  Commit `e2b03b69` (2026-07-02) removed the exposed `DATABASE_URL=` line — so the
  real database password sat in the tracked file for **~7 weeks** (2026-05-12 to
  2026-07-02) before that specific line was pulled. It remains permanently readable
  in git history (`git log --all` reaches both commits; history was not rewritten).

  **`BOOTSTRAP_ADMIN_PASSWORD` was never removed.** The current working tree, read
  directly, still contains it:
  ```
  services/api/.env.production.example:159:BOOTSTRAP_ADMIN_EMAIL=superadmin@dijipeople.local
  services/api/.env.production.example:160:BOOTSTRAP_ADMIN_PASSWORD=REDACTED-ADMIN-PASSWORD
  ```
  This sits inside a leftover duplicate "App" config block (lines 110-186) that was
  pasted in whole by the same 2026-05-12 commit and never cleaned up — the file's
  *first* block (lines 1-38) already has the properly-redacted, placeholder version
  of everything (`JWT_ACCESS_SECRET=replace-with-production-global-access-secret-32-plus`,
  `DATABASE_URL=postgresql://ROTATED_USER:ROTATED_PASSWORD@ROTATED_HOST/...`), but
  the stale second block below it, containing the real-looking admin credential, was
  never noticed or removed. Only the top of the file carries the warning:
  ```
  services/api/.env.production.example:2:# SECURITY: The previously exposed Neon DATABASE_URL must be rotated. Store the rotated value only in Render env vars.
  ```
  — nothing comparable exists for `BOOTSTRAP_ADMIN_PASSWORD`.

  `BOOTSTRAP_ADMIN_EMAIL`/`BOOTSTRAP_ADMIN_PASSWORD` are not decorative names in an
  example file — they are read by real operational scripts that authenticate as the
  platform super admin against a live environment:
  ```
  scripts/smoke-deployment.mjs:12:  process.env.SMOKE_LOGIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
  scripts/go-live.sh:131:if [ -n "${SYNC_ADMIN_EMAIL:-${BOOTSTRAP_ADMIN_EMAIL:-}}" ] && ...
  scripts/platform-final-e2e.mjs:23:    password: process.env.BOOTSTRAP_ADMIN_PASSWORD,
  scripts/sync-stripe-prices.mjs:65:const password = process.env.SYNC_ADMIN_PASSWORD || process.env.BOOTSTRAP_ADMIN_PASSWORD;
  ```
  and `docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md:375` records
  `superadmin@dijipeople.local` as an actual test identity used in a QA run as
  recently as 2026-08-15.

- **Current behaviour:** A real (or credibly real, given the adjacent DATABASE_URL
  was proven real from the same paste) production database password was exposed on
  a public repository for roughly seven weeks and has since been redacted for the
  database credential only. The platform super-admin bootstrap email and password
  are still committed in plaintext in the current tree, on a public repository, with
  no warning banner and no evidence of rotation.
- **Expected behaviour:** `.env.*.example` files must never contain a value that was
  ever live. `BOOTSTRAP_ADMIN_PASSWORD` should be rotated immediately (this is the
  same operation `PLATFORM_SUPER_ADMIN_PASSWORD_RESET` already exists to perform —
  see `admin-seed.util.ts`), and the leftover duplicate config block should be
  deleted from the file entirely rather than partially redacted in place.
- **Risk:** If this password is (or was, within its validity window) the real
  platform super admin credential, anyone who cloned this public repository — at
  any point since 2026-05-12, including today — has had a standing path to
  authenticate as DijiPeople's own platform super admin: full cross-tenant access
  to `super-admin`/`platform-*` modules (customers, plans, subscriptions, invoices,
  tenant provisioning). This is the single most severe finding in this audit area.
- **Remediation:**
  1. Treat both the Neon database credential and `BOOTSTRAP_ADMIN_PASSWORD` /
     `superadmin@dijipeople.local` as compromised **today**, independent of how old
     the exposure is — rotation cost is low, and the file's own banner already
     concedes the DB side needs it.
  2. Rotate the live platform super admin password via
     `PLATFORM_SUPER_ADMIN_PASSWORD_RESET=true` (break-glass path already built,
     `render.yaml:132-138`) if `superadmin@dijipeople.local` /
     `REDACTED-ADMIN-PASSWORD` is still valid anywhere.
  3. Delete the entire leftover duplicate block (`services/api/.env.production.example`
     lines ~108-186) rather than editing individual lines — it duplicates every key
     already declared cleanly above it and is the reason this went unnoticed twice.
  4. Add a pre-commit or CI check (gitleaks/trufflehog-class scanner — see SUP
     dependency section on CI-06) so a real Neon/Stripe/JWT-shaped value can never
     land in a tracked `.example` file again; this is the direct, concrete case
     CI-06 (secret scanning disabled) already names as a gap.
- **Difficulty:** LOW (deleting stale text, rotating two credentials)
- **Regression risk:** LOW
- **Fix now:** YES

---

### SUP-02 — `multer` 2.2.0, pinned by `@nestjs/platform-express`, carries four HIGH DoS advisories and is reachable from real upload endpoints; not covered by the existing dependency-security bug record

- **Category:** Dependency / Supply-Chain
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW delta on top of KNOWN (BUG-0052, `Status: VERIFIED`, last verified
  2026-08-22 at `{critical:0, high:4, moderate:2, total:6}` production-only).
  `multer`, `@nestjs/core` and `@nestjs/platform-express` are **not** in that
  record's "what remains" list — these advisories post-date its last verification.
- **Component:** `services/api` — `@nestjs/platform-express` → `multer@2.2.0`
- **Evidence:**

  `npm audit --omit=dev --json` against the committed lockfile (offline, no
  install) reports, beyond BUG-0052's documented six:
  ```
  HIGH  @nestjs/core              direct=true
  HIGH  @nestjs/platform-express  direct=true
  HIGH  multer                    direct=false
  ```
  `@nestjs/platform-express`'s own audit entry shows this is one advisory chain,
  not three independent ones:
  ```json
  "@nestjs/platform-express": {
    "via": ["@nestjs/core", "multer"],
    "effects": ["@nestjs/core"],
    "fixAvailable": { "name": "@nestjs/core", "version": "7.5.5", "isSemVerMajor": true }
  }
  ```
  npm's own suggested fix — downgrading `@nestjs/core` from 11.x to 7.5.5 — is not
  a real option (a four-major downgrade of the entire framework to silence a
  `multer` advisory) and should not be followed.

  The lockfile pins `multer` to an **exact** version under `@nestjs/platform-express`:
  ```
  node_modules/@nestjs/platform-express: dependencies.multer = "2.2.0"
  ```
  matching four separate GHSA advisories, three of which need only `<2.3.0`:
  `GHSA-wc9g-mqfw-jrwm` (DoS via crafted multipart field names, `<2.3.0`),
  `GHSA-qvfw-j98x-7q72` (file-size-limit bypass via async `fileFilter` race,
  `<2.3.0`), `GHSA-535w-7cp7-47q4` (DoS via oversized array index in field names,
  `<2.3.0`), and `GHSA-qfvm-cv95-jqjf` (file-descriptor leak on aborted uploads,
  exactly `=2.2.0`).

  Reachability is real, not build tooling: `FileInterceptor`/multer is wired into
  ten-plus controllers handling authenticated tenant file uploads —
  ```
  services/api/src/modules/documents/documents.controller.ts
  services/api/src/modules/employees/employees.controller.ts
  services/api/src/modules/payroll/payroll-operations.controller.ts
  services/api/src/modules/contracts/contracts.controller.ts
  services/api/src/modules/tenant-settings/tenant-settings.controller.ts
  services/api/src/modules/app-releases/release-publisher.controller.ts
  ...
  ```
- **Current behaviour:** A pinned, four-CVE-vulnerable multipart parser sits behind
  every authenticated file-upload endpoint in the product.
- **Expected behaviour:** `multer` at `>=2.3.0` (or later), which clears all four
  advisories and, as a side effect, clears the `@nestjs/core` /
  `@nestjs/platform-express` "high" entries npm audit derives from it.
- **Risk:** Denial of service (process-level, not data-breach) against upload
  endpoints from an authenticated tenant user — a lower-privilege actor than most
  of this codebase's other findings assume, consistent with the multi-tenant threat
  model in `AGENTS.md` (a tenant user is not a trusted party).
- **Remediation:** Add a root-level `overrides` entry pinning `multer` to
  `^2.3.0` or newer, the same low-blast-radius technique BUG-0052 already used
  successfully for `@mapbox/node-pre-gyp`/`node-gyp` (nested graft, no shared node
  touched). Verify with a scratch `npm ci` + `npm audit --omit=dev` before merging,
  per the lesson BUG-0052 already recorded twice about verifying installed trees
  rather than asserting from the manifest.
- **Difficulty:** LOW
- **Regression risk:** LOW (patch-level bump of a dependency already pinned exactly;
  `@nestjs/platform-express`'s own peer range for `multer` is permissive)
- **Fix now:** YES

---

### SUP-03 — 233 compiled gateway binaries (136 MB, including a `.exe`) are committed to the public repo under `gateway/artifacts/staging/`, invisible to the existing "no tracked build output" guard

- **Category:** Supply-Chain / Repository Hygiene
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `gateway/artifacts/staging/`, `scripts/validate-framework.mjs`,
  `.gitignore`
- **Evidence:**

  ```
  git ls-files gateway/artifacts/ | wc -l   → 233
  du -sh gateway/artifacts                  → 136M
  ```
  including `gateway/artifacts/staging/DijiPeople.Gateway.exe`,
  `DijiPeople.Gateway.dll`, and 231 Microsoft/Serilog/SQLite runtime DLLs for a
  self-contained `net8.0` win-x64 publish.

  This directory is a **build output** directory, not a distribution artifact:
  `gateway/packaging/publish.ps1:47-48` writes to it directly —
  ```
  $staging = Join-Path $gatewayRoot 'artifacts/staging'
  $dist    = Join-Path $gatewayRoot 'artifacts/dist'
  ```
  — and the actual release pipeline (`scripts/publish-release.mjs`) reads the
  packaged zip from `artifacts/dist/`, which is **not** tracked in git
  (`git ls-files gateway/artifacts/dist/` returns nothing). So the tracked
  `staging/` binaries are not even what the release process ships — they are
  leftover intermediate output from some past local `dotnet build`/`publish.ps1`
  run that got committed by accident.

  The repository has already fixed this exact category of problem once and left a
  gap for this specific directory. `.gitignore:63-73`:
  ```
  # .NET Build Outputs (gateway/, tools/)
  # 1,104 of these were tracked — 977 compiled .dll/.exe under bin/ and 127 under
  # obj/, 11 MB ... scripts/validate-framework.mjs now fails if tracked build
  # output returns.
  gateway/**/bin/
  gateway/**/obj/
  ```
  and `scripts/validate-framework.mjs:4415-4434`:
  ```js
  const BUILD_OUTPUT = /(^|\/)(bin|obj)\//;
  ```
  This regex matches only `bin/` and `obj/` path segments. `gateway/artifacts/staging/`
  matches neither, so the guard that was built specifically to prevent "regenerable
  .NET build output tracked in git" does not see this directory at all, and it is
  12x larger (136 MB vs 11 MB) than the problem it was written to catch.
- **Current behaviour:** A public git repository carries 136 MB of unsigned,
  unreviewable, regenerable compiled binaries with no provenance — nobody diffs a
  `.dll`/`.exe` in code review, so a binary swapped in here would be effectively
  invisible until someone extracts and compares it (exactly the technique BUG-0052
  itself used to catch a packaging drift: "The packaged build ... was extracted and
  read").
- **Expected behaviour:** `gateway/artifacts/` (or at minimum `gateway/artifacts/staging/`
  and `gateway/artifacts/dist/`) should be gitignored like `bin/`/`obj/` already are,
  and untracked from history going forward.
- **Risk:** Primarily supply-chain integrity and repo hygiene, not an active
  exploit: (1) no way to verify the committed binary matches any specific source
  commit; (2) repo bloat (136 MB) on every clone; (3) the exact blind spot the
  `bin/`/`obj/` fix was written to close, now open again under a different path.
- **Remediation:** `git rm -r --cached gateway/artifacts/staging` (and `dist/` if
  ever populated), add `gateway/artifacts/` to `.gitignore`, and widen
  `BUILD_OUTPUT` in `scripts/validate-framework.mjs` to also match
  `gateway/artifacts/` (or generalize it to catch any directory a packaging script
  writes to, rather than enumerating `bin`/`obj` by name).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER (hygiene, not an active vulnerability — but cheap, and closes
  a gap in a control the project already built for this exact purpose)

---

### SUP-04 — `SecretEncryptionService`'s "am I in production" check disagrees with the rest of the codebase; a staging deployment configured the way `auth.config.ts` expects would silently store integration credentials in plaintext

- **Category:** Configuration / Secrets Handling
- **Severity:** MEDIUM
- **Confidence:** LIKELY (the divergence is CONFIRMED in code; the consequence is
  unverified because no staging environment currently exists — `docs/deployment/environments.md:14`
  states this explicitly)
- **Known:** NEW (adjacent to, but a different mechanism than, INF-15's "no rotation
  procedure" finding)
- **Component:** `services/api/src/common/security/secret-encryption.service.ts`,
  `services/api/src/common/config/auth.config.ts`, `packages/config/index.js`
- **Evidence:**

  Three different "is this production" checks exist in the API's config layer,
  and they do not agree:

  `secret-encryption.service.ts:44-45` — checks **only** `NODE_ENV`:
  ```ts
  const isProduction =
    this.configService.get<string>('NODE_ENV') === 'production';
  ```
  `auth.config.ts:27,530-536` — treats `staging` as production-like too, and
  checks `APP_ENV` first:
  ```ts
  const PRODUCTION_ENVIRONMENTS = new Set(['production', 'staging']);
  ...
  const appEnv = configService.get<string>('APP_ENV') ?? configService.get<string>('NODE_ENV') ?? 'development';
  return PRODUCTION_ENVIRONMENTS.has(appEnv.toLowerCase());
  ```
  `packages/config/index.js:86-97` — a third definition again, keyed off
  `APP_ENV`/`NEXT_PUBLIC_APP_ENV`/`DIJIPEOPLE_ENV`, `VERCEL`, or `RENDER`, with no
  concept of `staging` at all:
  ```js
  function isProductionLike(env = process.env) {
    const explicitStage = String(env.APP_ENV || env.NEXT_PUBLIC_APP_ENV || env.DIJIPEOPLE_ENV || "").trim().toLowerCase();
    return explicitStage === "production" || env.VERCEL === "1" || env.RENDER === "true";
  }
  ```
  `docs/deployment/environments.md:14` confirms the codebase already anticipates a
  `staging` concept that only `auth.config.ts` actually honours:
  > `assertAuthEnvironment` treats `staging` as production-like, so the *concept*
  > is anticipated in code, but nothing is provisioned.

- **Current behaviour:** Today, on the one real deployment, this is harmless —
  `render.yaml:61-64` sets both `NODE_ENV=production` and `APP_ENV=production`,
  so all three checks agree. But `SecretEncryptionService` is the **odd one out**:
  it is the only one of the three that does not treat `staging` as production-like,
  and it is also the one whose failure mode is silent rather than a boot crash —
  its own comment says why refusing to start is deliberate in production, but the
  same reasoning does not fire outside a literal `NODE_ENV=production`:
  ```ts
  this.logger.warn(
    'SECRET_ENCRYPTION_KEY is not set. Integration credentials will be stored unencrypted. Set it before going live.',
  );
  return null;
  ```
  If a future staging environment is provisioned following `auth.config.ts`'s own
  precedent (`APP_ENV=staging`, `NODE_ENV` left at something other than the literal
  string `production`, e.g. `staging`), `assertAuthEnvironment` would correctly
  demand real JWT secrets and secure cookies, while `SecretEncryptionService` would
  take the opposite path in the same request and log a warning instead of refusing
  to boot — storing every SMTP password, attendance-gateway credential and other
  integration secret written in that environment as plaintext in the database.
- **Expected behaviour:** One shared `isProductionLike()` helper (the codebase
  already has one usable pattern in `auth.config.ts`) used everywhere a
  fail-open/fail-closed decision is made about secrets, rather than three
  independently-maintained heuristics.
- **Risk:** Latent, not currently exploitable (no staging environment exists to
  trigger it). The risk is entirely in the gap between "what the rest of the
  auth layer assumes staging means" and "what the encryption-at-rest layer checks
  for" — exactly the shape of defect this codebase's own `AGENTS.md` warns about
  under doc-code-drift-adjacent classes.
- **Remediation:** Change `SecretEncryptionService.resolveKey()`'s production
  check to reuse `auth.config.ts`'s `isProductionLike` (or a shared helper derived
  from it) instead of a bare `NODE_ENV === 'production'` string compare.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER (no live trigger today; fix before staging is provisioned)

---

### SUP-05 — `electron` is pinned at 39.2.6 in `apps/agent-desktop`, ~30 published CVEs behind the same major; a same-major patch is available

- **Category:** Dependency / Supply-Chain
- **Severity:** HIGH
- **Confidence:** CONFIRMED (advisories); LIKELY for practical exploitability
  (mitigated by `contextIsolation`/`nodeIntegration` config, not independently
  verified against every CVE's precise trigger)
- **Known:** KNOWN (BUG-0052 already tracks Electron-adjacent advisories via
  `active-win`/`tar`, resolved 2026-08-21/22; it did not audit `electron` itself,
  which is a distinct package with its own advisory list)
- **Component:** `apps/agent-desktop/package.json`
- **Evidence:**

  ```
  apps/agent-desktop/package.json:30:    "electron": "39.2.6",
  ```
  `npm audit --json` lists ~30 distinct GHSA advisories against `electron` in the
  range `<=40.10.2 || 41.0.0-alpha.1 - 41.7.1 || ...`, all fixed by later 39.x/40.x
  patch releases (e.g. `GHSA-h7rp-cf8h-j98x` "Context isolation bypass via
  `Function.prototype.bind` hijack", fixed `<39.8.9`; `GHSA-ff2p-hmqr-hxm4`
  "contextBridge object copy honors prototype setters", fixed `<39.8.9`;
  `GHSA-v64r-4m7r-3mvq` "HTTP redirect followed into local file loader", fixed
  `<39.8.8`). A same-major bump (39.2.6 → latest 39.x, e.g. 39.8.10 at the time of
  the advisory data embedded in this lockfile) clears the overwhelming majority
  without crossing to Electron 40.

  Partial mitigation is real and verified: every `BrowserWindow` in the app sets
  the safer defaults —
  ```
  apps/agent-desktop/src/main/main.ts:130-132: contextIsolation: true, nodeIntegration: false, sandbox: false
  apps/agent-desktop/src/main/main.ts:453-455: (same)
  apps/agent-desktop/src/main/main.ts:498-500: (same)
  ```
  `sandbox: false` is present in all three windows, which is worth flagging on its
  own: several of the listed CVEs are use-after-free bugs in the renderer, and
  Chromium's OS-level sandbox is exactly the layer that limits blast radius from
  a compromised renderer process. Whether `sandbox: false` is a deliberate,
  justified choice (e.g. native module access needed by the DLP capture / active-window
  features) was not determined — that call belongs with whoever owns the desktop
  agent's threat model, not this audit.
- **Current behaviour:** The distributed desktop agent runs a ~9-month-old Electron
  build (relative to the advisories' fix versions) with the OS sandbox disabled.
- **Expected behaviour:** Track Electron's latest patch within the 39.x major (or
  the currently-supported stable line) as a routine, low-risk maintenance bump —
  not deferred alongside genuinely hard dependency decisions like `xlsx`.
- **Risk:** The agent-desktop app is distributed to end-user machines outside this
  repository's control (see `docs` referenced in memory as "agent distribution
  pipeline"); an old Electron with disabled sandboxing is a meaningfully larger
  blast radius than the same bugs would be in a sandboxed renderer, for any
  content path that reaches the renderer (update-feed content, rendered HTML from
  attendance/DLP UI, etc. — not independently audited here).
- **Remediation:** Bump `electron` to the latest 39.x patch (non-major, should not
  require Electron API changes), rebuild and re-extract the packaged `app.asar` to
  verify the shipped version the way BUG-0052 already did for the `active-win`
  chain, and record the same "verified by extraction, not by manifest" discipline
  that record established. Separately: get an explicit decision on `sandbox: false`
  recorded (ADR or the desktop-agent's own knowledge doc) rather than leaving it as
  an unstated tradeoff at every `BrowserWindow` call site.
- **Difficulty:** LOW (same-major patch bump) for the version bump; MEDIUM if
  `sandbox: false` turns out to need real rework to remove.
- **Regression risk:** LOW (patch-level)
- **Fix now:** LATER (no active exploit path confirmed; genuinely due for
  maintenance given the volume of fixed CVEs)

---

### SUP-06 — Confirmed via this audit: `STRIPE_*` variables used in real billing code are absent from `render.yaml`, and no CI job scans dependencies

- **Category:** Configuration / CI
- **Severity:** HIGH (inherited from INF-03/INF-04's rating; this entry adds
  SUP-specific confirmation, not a new severity judgment)
- **Confidence:** CONFIRMED
- **Known:** KNOWN (INF-03, INF-04, CI-06 — cited per the briefing's instruction
  not to re-report already-known findings as new, while still confirming them from
  this area's own evidence)
- **Component:** `render.yaml`, `services/api/src/modules/billing/`, `.github/workflows/ci.yml`
- **Evidence:**

  `render.yaml` declares 43 `- key:` entries; none is `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_API_VERSION` or `STRIPE_MODE` (`grep -c STRIPE
  render.yaml` → `0`), while all four are read by real billing code:
  ```
  services/api/src/modules/billing/services/stripe-billing.service.ts
  services/api/src/modules/billing/services/webhook.service.ts
  services/api/src/modules/super-admin/super-admin.service.ts
  ```
  This is not a boot-time crash — `stripe-billing.service.ts:355-384`
  (`buildStripeClient`) constructs the Stripe client **lazily**, specifically
  because an eager construction previously made the entire API un-bootable without
  Stripe credentials (documented in the file's own `ITEM-0047` comment) — so the
  practical effect of the `render.yaml` gap is silent billing failure on first use,
  not a visible deploy failure. This is a healthy design choice on its own (see
  Healthy section) but it also means the `render.yaml` gap would not be caught by
  the deploy pipeline going green.

  CI dependency scanning: `.github/workflows/ci.yml` has no `npm audit`,
  Dependabot, Renovate, Snyk, Trivy or OSV step anywhere. The only "audit" mention
  in the entire workflow is `--no-audit` (`ci.yml:188`), which *suppresses* npm's
  audit network call during an unrelated lockfile-resolvability check, not a scan.
  `find .github -iname "*dependabot*"` and `find . -iname "*renovate*"` both
  return nothing.
- **Current behaviour / Risk / Remediation:** As documented in INF-03/INF-04 and
  CI-06 — not restated here to avoid duplicating those findings' remediation
  sections.
- **Difficulty / Regression risk / Fix now:** See INF-03/INF-04/CI-06.

---

## Part 2 — dependency inventory, notable findings not written up above

Full `npm audit --omit=dev --json` result against the committed root lockfile:
`{critical: 0, high: 8, moderate: 2, total: 10}`. Against the full lockfile
(including dev): `{critical: 0, high: 14, moderate: 3, total: 17}`. `tools/zkteco-poc`
(its own lockfile, outside the npm workspaces) audits clean: `{total: 0}`.

| Package | Severity | Direct? | Reachable in production runtime? | Disposition |
|---|---|---|---|---|
| `multer` (→ `@nestjs/core`, `@nestjs/platform-express`) | HIGH | via NestJS | **YES** — many upload controllers | **NEW — SUP-02, fix now** |
| `electron` | HIGH | direct (agent-desktop) | Yes, shipped to end users | **KNOWN-adjacent — SUP-05, fix later** |
| `prisma`, `@prisma/config`, `deepmerge-ts` | HIGH | `prisma` direct (devDependency) | No — CLI tool only, not `require()`d by the running server; Prisma 6 downgrade "fix" would break the Prisma-7 driver-adapter data layer | KNOWN (BUG-0052) — confirmed unchanged |
| `mysql2` | HIGH | transitive via `prisma` CLI | No — no `mysql2` import anywhere in `services/api/src`, `apps/`; this app is Postgres-only per `AGENTS.md` | KNOWN (BUG-0052) — confirmed unchanged |
| `xlsx` | HIGH | direct | No — `parseFirstWorksheet` moved to ExcelJS; only the write path (workbook export, not parse) still uses `xlsx`; neither advisory applies to writing | KNOWN (BUG-0052, corrected 2026-08-20) — confirmed still true, no `XLSX.read` call site found |
| `exceljs`, `uuid` | MODERATE | `exceljs` direct | Partial — `exceljs` genuinely reachable (it's now the parse path for payroll/timesheet import), but the advisory's fix is a 4-major downgrade of `exceljs` | KNOWN (BUG-0052) — accepted risk unchanged |
| `js-yaml` (old, `<3.15.2`) | HIGH | nested under `@istanbuljs/load-nyc-config` | No — Istanbul coverage tooling, only active under `jest --coverage`; not shipped | NOT OBSERVED as a real risk — test-tooling only |
| `browserslist` | HIGH | nested (postcss/autoprefixer chain) | No — Next.js build-time only, no untrusted input at build time | NOT OBSERVED as a real risk |
| `extract-zip` | HIGH | dependency of `electron` package itself | No — used by Electron's own install-time postinstall to unpack its downloaded binary, not shipped app code | NOT OBSERVED as a real risk |
| `brace-expansion` (in `services/api`) | HIGH | nested under `minimatch` | No — traced to lint/test tooling's `minimatch` usage, not application code | NOT OBSERVED as a real risk |
| `@humanfs/node` | MODERATE | nested (eslint chain) | No — lint tooling | NOT OBSERVED as a real risk |

**Lockfile health.** `package-lock.json` is `lockfileVersion: 3`, present at the
root, and every declared workspace (`apps/*`, `packages/*`, `services/api`, `e2e`)
has a corresponding entry — none missing. `tools/zkteco-poc` is intentionally
outside the npm workspaces glob (`apps/*`, `packages/*`, `services/*`, `e2e` —
`tools/` is not listed) and correctly carries its own separate `package-lock.json`.
No `git`, `file:`/local, or other non-registry dependency sources were found in the
lockfile (`resolved` field check across all packages); the only non-`registry.npmjs.org`
entries are the expected internal workspace self-references (`@repo/config` →
`packages/config`, etc.), which npm resolves from the local filesystem, not the
public registry, as long as `npm ci` is used against an intact lockfile (which
`render.yaml`'s `buildCommand` does).

**Install scripts.** Ten packages in the full tree declare an install script:
`@nestjs/core`, `@prisma/engines`, `active-win`, `electron`, `electron-winstaller`,
`fsevents` (x2, main + nested under playwright), `keytar`, `prisma`, `unrs-resolver`.
All are well-known packages whose install scripts fetch/build native binaries
appropriate to their stated purpose (Prisma engines, Electron's binary, native
keychain access, Windows installer tooling, macOS file-watching). None is an
unexpected or obscure package carrying a script.

**Duplicate library versions.** `react`, `react-dom` (19.2.4), `lodash` (4.18.1),
`zod` (4.3.6) each resolve to exactly one version across the whole tree — no
version-split risk found for the libraries checked. `uuid` resolves to a single
hoisted `8.3.2` (the version the audit flags), reached via `exceljs`.

**Deprecated/abandoned packages.** A targeted check for commonly-deprecated names
(`request`, `moment`, `node-sass`, `babel-eslint`, `tslint`, `har-validator`) found
none present. `uglify-js@3.19.3` is present as a nested build-tool dependency; it
is maintained, not abandoned, and not a direct dependency — not flagged as a
finding.

**.NET gateway.** `gateway/src/DijiPeople.Gateway.Host/DijiPeople.Gateway.Host.csproj`
pins every `PackageReference` to an exact version (`Microsoft.Data.Sqlite 8.0.11`,
`Microsoft.Extensions.Hosting 8.0.1`, `Serilog.Sinks.File 6.0.0`, etc.) — no
floating ranges. No NuGet `packages.lock.json` exists for reproducible restore
verification (`RestorePackagesWithLockFile` is not set). `dotnet list package
--vulnerable` was not run (would require a build/restore, out of scope per the
briefing's no-build constraint) — see Not Examined.

---

## Healthy — verified good

- **No real secrets found in current source, tests, fixtures, scripts, CI config,
  or Dockerfiles** (no Dockerfiles exist in this repo) other than the one exposure
  documented in SUP-01. Every `sk_test_`/`sk_live_`/`whsec_`/`postgresql://user:pass@`
  pattern found elsewhere — in `.env.example` files, `audit-snapshot.spec.ts`,
  `packages/config/*.test.js`, `.github/workflows/ci.yml`, QA scenario docs — is a
  clearly-labeled placeholder, a fabricated example hostname (`ep-cool-frost-a1b2c3...`),
  or an explicitly-named CI test-only value (`ci-test-only-encryption-key-not-a-secret-000000`).
- **No secret is ever placed behind a `NEXT_PUBLIC_` prefix.** Enumerated all
  `NEXT_PUBLIC_*` variables referenced across `apps/*` (28 distinct names) — every
  one is a URL, domain, feature flag, or the Stripe **publishable** key
  (`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, which is designed to be public). This
  matches and confirms `docs/deployment/environments.md:163-164`'s own claim.
- **`PLATFORM_SUPER_ADMIN_PASSWORD` has no insecure default and fails closed.**
  `services/api/src/common/utils/admin-seed.util.ts:30,129-132` enforces a minimum
  12-character length and throws rather than falling back to any built-in value;
  it is also a documented no-op once an active super admin exists
  (`admin-seed.util.ts:114`), so it cannot silently reset a live credential.
- **`JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` fail closed in production.**
  `auth.config.ts:512-527` (`getRequiredOrDevDefault`) only returns the hardcoded
  dev default (`dijipeople-access-secret-dev`) when `isProductionLike()` is false;
  in production/staging it throws `Missing required auth environment variable`.
  `packages/config/index.js`'s `validateDeploymentEnv` independently enforces a
  32-character minimum length for both in production
  (`index.js:379-390`).
- **`SecretEncryptionService` fails closed in production** (confirmed, matching
  OBS-24's characterization) and uses a real construction: AES-256-GCM, random
  12-byte IV per value, auth tag verified on decrypt, versioned format
  (`enc:v1:...`) so the algorithm can change later without guessing at stored
  values (`secret-encryption.service.ts:25-27,38-66`). The one gap found in this
  service is the environment-detection inconsistency in SUP-04, not the
  cryptography itself.
- **Stripe client construction is deliberately lazy**, specifically to avoid a
  previously-real failure mode (`ITEM-0047`: an eager Stripe client made the
  *entire* API un-bootable without Stripe credentials, breaking unrelated e2e
  suites for weeks) — `stripe-billing.service.ts:374-384`. Good example of a fix
  that addressed the actual root cause rather than papering over the symptom.
  Also verified `assertSecretMatchesMode` (`stripe-billing.service.ts:505-513`)
  rejects a `sk_test_` key configured under `STRIPE_MODE=live` and vice versa.
- **Lockfile integrity.** Every workspace declared in `package.json`'s
  `workspaces` array has a matching entry in `package-lock.json`
  (`lockfileVersion: 3`). No git/tarball/local non-workspace dependency sources
  found anywhere in the lock.
- **`BUG-0052`'s dependency-security work is real and holds up.** Independently
  re-ran `npm audit --omit=dev`; its "what remains" disposition for
  `prisma`/`@prisma/config`/`deepmerge-ts` (devDependency, not shipped-and-executed),
  `xlsx` (parse path moved to ExcelJS, verified no `XLSX.read` call site exists
  anywhere in the repo), and `exceljs`/`uuid` (accepted moderate risk) all still
  match the live lockfile exactly. `scripts/check-production-advisories.mjs`
  (referenced in that record) exists and is the kind of durable, machine-checked
  guard this audit generally found missing elsewhere (see SUP-03's parallel gap
  in the `bin`/`obj` guard).
- **No git/tarball/local dependency sources**, confirmed by walking every
  `resolved` field in `package-lock.json`.
- **Frontend `.env.*.example` files (web, admin, landing, agent-desktop) are clean**
  — read every one; none carries a secret-shaped value. The exposure in SUP-01 is
  isolated to `services/api/.env.production.example`.
- **CI environment values are honestly fake and labeled as such** —
  `SECRET_ENCRYPTION_KEY: ci-test-only-encryption-key-not-a-secret-000000`,
  `STRIPE_SECRET_KEY: sk_test_ci_placeholder_not_a_real_key`,
  `PLATFORM_SUPER_ADMIN_PASSWORD: ci-test-only-password-000000` — no ambiguity
  about whether these are real.

## Not examined / limits

- **Whether the leaked Neon password or `BOOTSTRAP_ADMIN_PASSWORD` are still valid
  today** was not tested. This audit is read-only and scoped to the repository;
  I did not attempt to connect to the live database or authenticate against the
  live API with the leaked credential, and no such attempt should be made outside
  an authorized, coordinated rotation/verification exercise. SUP-01's severity
  rating treats "may still be valid" as the operative assumption precisely because
  it cannot be ruled out from the repository alone.
- **Full git-history secret scan was targeted, not exhaustive.** I searched for
  `.env`-named file additions, `sk_live_`, `AKIA`, `BEGIN PRIVATE KEY`/`BEGIN RSA`,
  `.neon.tech` hostnames, and `smtp.gmail`-style patterns across `git log --all -p`.
  A dedicated secret-scanning tool (gitleaks/trufflehog) run against the full
  history would cover more ground than these targeted searches and is the
  concrete remediation CI-06 already calls for.
- **`dotnet list package --vulnerable` was not run** for the .NET gateway — doing
  so requires a NuGet restore, which the briefing's "no builds" constraint rules
  out. Package versions are listed in the report above for a downstream check
  against the NVD/GitHub Advisory database.
- **Dependency-confusion risk for the `@repo/*` scope** (whether that npm scope is
  registered/claimed on the public registry) could not be verified — this
  environment has no outbound network access beyond what `npm audit` itself used
  internally. The practical mitigating control (npm workspaces resolves `@repo/*`
  from the local filesystem via `npm ci` against an intact lockfile, never hitting
  the registry) was confirmed by inspection instead.
- **`electron`'s exact CVE-by-CVE exploitability** against this specific app's
  content model (what untrusted or semi-trusted content, if any, reaches a
  renderer) was not fully traced — I confirmed the `contextIsolation`/`nodeIntegration`/
  `sandbox` settings at each `BrowserWindow` call site but did not audit every
  renderer's content source. That is arguably desktop-agent-architecture territory
  as much as dependency hygiene; flagging for whichever specialist owns
  agent-desktop's own security model.
- **No live infrastructure (Render, Neon, Vercel) was queried.** All findings are
  derived from the repository (current tree + full `git log --all` history) only,
  per the briefing's scope.
