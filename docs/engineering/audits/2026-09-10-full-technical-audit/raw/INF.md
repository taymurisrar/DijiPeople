# INF — Infrastructure, Deployment, Backup and Disaster Recovery

Auditor scope: deployed topology, environment isolation, the deploy process,
scaling posture, networking/TLS, backup and disaster recovery, operational
runbooks, vendor risk.

Method: read-only inspection of committed configuration, code and documentation
in the audit worktree at `D:/My Work/hrm-dijipeople/dijipeople-audit`
(branch `agent/full-technical-audit`). **No CLI was invoked against Vercel,
Render, Neon or Stripe, and nothing was deployed, mutated or written to any
live service.** Where a claim about the *live* estate is made, it is sourced to
a committed record (a release report, a bug record) that states when and how the
live value was read, and it is labelled with that date — because the central
finding of this area is that the committed configuration and the live estate
have repeatedly diverged.

---

## Summary of the deployed topology (established, with evidence)

| Layer | Provider | Service | Evidence |
|---|---|---|---|
| Frontends | Vercel | `diji-people-web` → `app.dijipeople.com`, `diji-people-admin` → `admin.dijipeople.com`, `diji-people-landing` → `www.dijipeople.com` | `docs/deployment/platform-access.md:137-141` |
| API | Render | `DijiPeople`, `srv-d7js7fqqqhas739v4i7g`, type `web_service`, origin `https://dijipeople.onrender.com` | `docs/deployment/platform-access.md:163-168` |
| Database | Neon | project `dijipeople` / `wispy-dream-20751252`, Postgres 17, region `aws-us-east-1`, single branch `production` | `docs/deployment/platform-access.md:193-204` |
| Datastore on Render | **none** | `render postgres list` → `{"data": []}` | `docs/deployment/platform-access.md:32` |

**Instance count: one.** This is asked for explicitly because other findings
depend on it, so here is the full chain:

1. `render.yaml` declares no `numInstances`, no `scaling`, no `minInstances`
   and no `maxInstances` block — verified by grep across the whole 226-line
   file, which returned nothing for any of those keys. Render's default for a
   service with no scaling block is a single instance.
2. `render.yaml:37-44` attaches a persistent disk, and the file's own comment
   states the consequence: *"a Render disk pins this service to a SINGLE
   INSTANCE — it cannot be attached to a horizontally scaled service. `starter`
   runs one instance, so this is free today"*.
3. `render.yaml:5` declares `plan: starter`.
4. `render.yaml:159-163` sets `OUTBOX_WORKER_ENABLED: "true"` directly on the
   one service, with the comment *"Exactly one deployed service should have it
   true"*.
5. The in-process rate limiter (`services/api/src/common/guards/public-rate-limit.guard.ts:10`)
   keeps state in a module-level `Map`, which is only a coherent control on one
   process.

Nothing anywhere in the repository describes, configures or contemplates a
second API instance. **The API runs exactly one instance, and that is a
deliberate constraint of the current design, not an accident of the plan tier.**

**Region:** Neon is `aws-us-east-1` (`platform-access.md:196`). `render.yaml`
declares **no `region:` key**, so the service takes Render's account/dashboard
default. The repository does not state the API's region anywhere. See INF-10.

---

### INF-01 — Database migrations do not run on deploy; the live service has no `preDeployCommand`

- **Category:** Deployment / Data integrity
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED (from the project's own release records; not
  re-verified live, per the read-only constraint)
- **Known:** KNOWN (BUG-0767 — fixed 2026-08-23, then regressed; ITEM-0084 is
  the never-built detector)
- **Component:** `render.yaml`, Render service `srv-d7js7fqqqhas739v4i7g`
- **Evidence:**

  `render.yaml:30` declares the contract:
  ```yaml
  preDeployCommand: npm --workspace api run release
  ```

  `docs/deployment/release-history/2026-09-08-production-fe1cd3d.md:46-56` —
  the most recent release carrying a migration:
  > **It was applied manually, and that is the most important thing in this report.**
  >
  > The live Render service has **no `preDeployCommand`**. `render.yaml` declares
  > `preDeployCommand: npm --workspace api run release` … but render.yaml is not
  > synced to the service, and the deploy history shows a `pre_deploy_failed` on
  > 2026-09-01 after which the command was evidently removed. So **migrations
  > have not been applying automatically**, and nothing in the pipeline says so.

  `docs/deployment/release-history/2026-09-09-production-1c04776.md:151-153`
  (the most recent release of all, one day before this audit):
  > 2. **`preDeployCommand`** — still absent from the Render service, so any
  >    future release carrying a migration needs the manual `prisma migrate
  >    deploy` step.

  `docs/deployment/release-history/2026-09-09-production-1c04776.md:118-121`:
  > **No migrations in this release.** … so the missing `preDeployCommand` —
  > which cost a manual step last release — did not bite this one. That gap is
  > still open and still the owner's call.

- **Current behaviour:** A merge to `main` triggers a Render deploy that builds
  and starts the new code. Nothing applies migrations. The operator must
  remember to run `prisma migrate deploy` against `DIRECT_DATABASE_URL` by hand,
  and must remember to do it *before* the new code takes traffic. Nothing in the
  pipeline detects, warns about or blocks a release whose migrations have not
  been applied.
- **Expected behaviour:** `preDeployCommand` runs `npm --workspace api run
  release` (migrate → seed:config → seed:verify → seed:admin → seed:legal →
  legal:publish) on every deploy, and a non-zero exit aborts the deploy while
  the previous instance keeps serving. That is what `render.yaml` says happens.
- **Risk:** This is the highest-consequence infrastructure finding in the audit,
  and it has three distinct failure modes:

  1. **Code that expects a column that does not exist.** The 2026-09-08 record
     spells out the near-miss verbatim: *"Left alone, this release would have
     shipped code that writes `NOT_DELIVERED` against a database whose enum does
     not contain it. The write throws, the catch block records `FAILED` … and
     every schedule on a sink tenant starts failing."* The generic form is a
     `P2022` on whichever screen reaches the new column first, which reads as a
     regression in that screen and is not one (this is the project's own
     `doc-code-drift` / BUG-0283 pattern). On a payroll platform the affected
     screen could be a payroll run.
  2. **Silent skipping of the entire seed and legal-publication chain.** This is
     exactly BUG-0767, whose impact was that *no purchase could record consent*
     for weeks, invisibly, because the visible half of the pipeline (migrations,
     bolted onto the build command) still worked.
  3. **It depends on a human remembering.** The safety property Render's
     pre-deploy gate provides — a failed migration aborts the deploy and leaves
     the old instance serving — does not exist. A hand-run migration that fails
     halfway leaves a partially-migrated database with new code already live or
     about to go live, and there is no automated detector for that state.

  The mitigation that has actually held so far is that the last two releases
  carried no migrations. That is luck, not control.
- **Remediation:**
  1. Restore `preDeployCommand: npm --workspace api run release` on the live
     service — but **land the code first, then change the setting**, because a
     Render service update is itself a deploy of the *current* `main`
     (`docs/deployment/platform-access.md:85-109`). Read `deploys?limit=5`
     afterwards and confirm the `service_updated` entry did what was intended.
  2. Before doing so, fix the reason the previous attempt failed on 2026-09-01.
     The 2026-09-08 record names the most likely cause: the pooled-endpoint
     `P1002` that `DIRECT_DATABASE_URL` exists to avoid. Setting
     `DIRECT_DATABASE_URL` on the service (see INF-03) is a prerequisite, not a
     follow-up.
  3. Add `npm run prisma:migrate:status` as an explicit, blocking step of the
     release runbook until (1) and (2) hold, so "migrations pending: none" is
     asserted rather than assumed.
- **Difficulty:** LOW (the change is one dashboard field)
- **Regression risk:** MEDIUM (restoring it makes a failing seed abort a deploy,
  which is stricter than today — that is the intended design, and it is what
  broke on 2026-09-01)
- **Fix now:** YES

---

### INF-02 — There is no database backup: the only recovery mechanism is a six-hour Neon history window, and no restore has ever been documented or tested

- **Category:** Disaster recovery / Data loss
- **Severity:** CRITICAL
- **Confidence:** CONFIRMED
- **Known:** NEW (the six-hour window is recorded in `platform-access.md`; the
  absence of any backup, runbook or tested restore is not tracked as a record
  anywhere)
- **Component:** Neon project `wispy-dream-20751252`, `docs/deployment/`
- **Evidence:**

  `docs/deployment/platform-access.md:204` — read from the live Neon API on
  2026-08-22:
  ```
  | History retention | **21600s — 6 hours** |
  ```

  `docs/deployment/platform-access.md:214-218` states the consequence plainly:
  > **History retention is six hours.** Instant restore reaches back six hours and
  > no further. It is not a backup, and it will not recover a bad migration
  > discovered the next morning. Anything destructive needs its own backup first.

  Searching the entire repository for any other backup mechanism returns
  nothing. `grep -rniE "backup" docs/ .agent/ DEPLOYMENT_CHECKLIST.md README.md`
  produces only *references to a backup that is assumed to exist*:

  - `docs/deployment/deployment-runbook.md:29` — "confirm the backup"
  - `docs/deployment/rollback-runbook.md:13` — `DATABASE_DESTRUCTIVE` →
    "restore from backup"
  - `docs/deployment/rollback-runbook.md:28` — "**Code rollback will not restore
    service.** Restore from backup, or forward-fix."
  - `docs/deployment/readiness-checklist.md:34` — an unticked checkbox reading
    `- [ ] Backup strategy confirmed`
  - `.agent/agents/release-devops.md:424` — "confirm the backup path"

  Not one of those five names a mechanism, a location, a retention period, a
  command, or a procedure. There is no `pg_dump` anywhere in `scripts/`, no
  backup workflow in `.github/workflows/`, and no `docs/deployment/` document
  describing backup or restore. `grep -rn "pg_dump\|PITR\|point-in-time"` across
  `docs/`, `.agent/` and `scripts/` returns nothing operational — the only hit
  is `docs/plans/EXECPLAN-0028…:407`, which says *"a Neon point-in-time restore
  is the only"* remedy for a class of damage, i.e. it too points at the six-hour
  window.

  The project's own reconciliation register carries the matching admission,
  `docs/engineering-history/FINAL-PARENT-SCOPE-RECONCILIATION.md:104`:
  ```
  | R-43 | Backup deletion lifecycle documented honestly | `NOT_STARTED` | not documented | WP-08 |
  ```

- **Current behaviour:** The database's only recovery mechanism is Neon's
  instant-restore history, configured at 6 hours. There is no periodic logical
  dump, no off-provider copy, no long-retention snapshot, no documented restore
  procedure, and no restore has ever been performed or rehearsed.
- **Expected behaviour:** A payroll platform holding salary, bank and national-id
  data has a backup that survives operator error discovered days later, lives
  somewhere other than the primary provider's own control plane, and has a
  written restore procedure that somebody has actually executed at least once.
- **Risk:** Concretely, three scenarios that are unrecoverable today:
  - A bad data migration or a mis-scoped `deleteMany` run at 22:00 and noticed
    at 09:00 the next morning: **11 hours old, no recovery point exists**. Every
    tenant's data as of the previous evening is gone permanently.
  - A destructive schema migration (the `DATABASE_DESTRUCTIVE` rollback class
    the runbook explicitly routes to "restore from backup"): the runbook's
    prescribed remedy does not exist.
  - Account compromise or accidental deletion at the provider: the production
    Neon branch is not protected (INF-09), and 6 hours of history dies with the
    branch.
- **Derived RPO and RTO, as they actually stand:**

  | | Today | What a payroll platform needs |
  |---|---|---|
  | **RPO — infrastructure failure** (Neon storage loss) | ≈0. Neon's storage is internally replicated; this is the one case that is genuinely covered, and it is covered by the vendor, not by us. | ≈0 — met |
  | **RPO — logical error found within 6h** | Up to 6 hours, via instant restore. Untested. | ≤ 15 minutes |
  | **RPO — logical error found after 6h** | **Total and permanent loss.** There is no recovery point at all. | ≤ 15 minutes, with ≥ 35 days of retention — a payroll error is routinely discovered at the *next* month's run |
  | **RPO — file storage** | **100% loss on every deploy** — see INF-05. No backup of any kind. | ≤ 24 hours |
  | **RTO** | **Unknown and unbounded.** No procedure exists, nothing has been tested, and all three provider credentials live as User-scope environment variables on one maintainer's Windows workstation (`platform-access.md:41-49`). A realistic first attempt is measured in hours-to-days and includes discovering how. | ≤ 4 hours, with a rehearsed procedure |

- **Remediation:**
  1. Raise Neon history retention from 6 hours to the plan maximum, and state
     the resulting figure in `platform-access.md`. This is one setting and is the
     single highest-value change in this report.
  2. Add a scheduled logical dump — a GitHub Actions cron running `pg_dump`
     against `DIRECT_DATABASE_URL`, writing to storage outside Neon, with
     ≥35-day retention. Simplest sufficient thing; no new platform.
  3. Write `docs/deployment/backup-and-restore.md` covering: what exists, where
     it lives, retention, the exact restore commands, and the expected duration.
  4. **Rehearse a restore into a throwaway Neon branch and record the measured
     RTO in that document.** Until that is done the position is "we have a
     backup we have never opened", which is the position this finding is about.
  5. Protect the production Neon branch (INF-09).
- **Difficulty:** LOW for (1), MEDIUM for (2)-(4)
- **Regression risk:** LOW
- **Fix now:** YES

---

### INF-03 — `render.yaml` is not the source of truth for the live service, and no detector exists for the drift

- **Category:** Configuration management / Deployment
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** KNOWN (BUG-0767 `Status: VERIFIED`, `ArchitectDisposition: DONE`;
  ITEM-0084 `Status: READY`, `ArchitectDisposition: FIX_NOW`, raised 2026-08-22
  and still not built)
- **Component:** `render.yaml`, Render service `srv-d7js7fqqqhas739v4i7g`
- **Evidence:**

  `docs/deployment/release-history/2026-08-31-production-cace6cd.md:53-61` — a
  live read on 2026-08-31:
  > `render.yaml` declares the four `REPORTS_*` variables with literal values, and
  > it is **not synced to this service**. Thirteen of the sixteen literal-valued
  > keys it declares are absent from the live environment:
  > ```
  > declared and live     NODE_ENV, APP_ENV, OUTBOX_WORKER_ENABLED
  > declared but MISSING  FILE_STORAGE_DIR, PLATFORM_ENVIRONMENT, TRUST_PROXY_HEADERS,
  >                       OUTBOX_WORKER_POLL_INTERVAL_MS, OUTBOX_WORKER_BATCH_SIZE,
  >                       SEAT_OVERAGE_*, TENANT_RETENTION_DAYS, EMAIL_*
  > ```

  Drift runs in the other direction too — the live service carries keys the file
  has never heard of. `docs/bugs/BUG-0905…md` (live read 2026-08-23):
  > `DIRECT_URL` is present, `DIRECT_DATABASE_URL` is not.

  and `packages/config/database-urls.js:77` reads only the latter:
  ```js
  const direct = typeof env.DIRECT_DATABASE_URL === "string" ? env.DIRECT_DATABASE_URL.trim() : "";
  ```

  `docs/bugs/BUG-0903…md` (live read 2026-08-23) shows `STRIPE_MODE` and
  `STRIPE_API_VERSION` set on the service; **neither `STRIPE_MODE` nor
  `STRIPE_SECRET_KEY` nor `STRIPE_API_VERSION` appears anywhere in
  `render.yaml`** — verified by extracting all 43 declared keys from the file.

  `docs/bugs/BUG-0767…md` "Resolution" shows `NODE_OPTIONS` memory caps
  (`6144` for build, `4096` for pre-deploy) set live and absent from the file.

  The detector proposed as step 3 of BUG-0767's own resolution does not exist:
  `ls scripts/check-render-config.mjs` → *No such file or directory*, and
  `grep -rn "render" scripts/repo-health.mjs` returns nothing.

- **Current behaviour:** `render.yaml` is a committed, reviewed, heavily
  commented document that describes a deployment nobody applies. The live
  service is configured by hand in a dashboard. The two have diverged in both
  directions — missing keys, extra keys, differently-named keys, a missing
  pre-deploy command — and nothing compares them.
- **Expected behaviour:** Either the file is applied as a Render Blueprint and
  is authoritative, or a check reads the live service and fails when the two
  disagree. ITEM-0084 specifies exactly the latter and has been `FIX_NOW` for
  nineteen days.
- **Risk:** Every other finding in this section is downstream of this one.
  INF-01 (no migrations on deploy), INF-05 (file storage on an ephemeral disk),
  BUG-0904 (no workspace provisioned after payment, CRITICAL) and BUG-0767 (no
  purchase recorded consent, HIGH) are all the same defect surfacing in
  different subsystems. The class of failure is the dangerous one: the visible
  half of the pipeline keeps working, so deploys look correct while a subsystem
  is silently off.
- **Remediation:** Build `scripts/check-render-config.mjs` exactly as ITEM-0084
  specifies — read the live service, diff `buildCommand`, `startCommand`,
  `preDeployCommand`, `healthCheckPath`, `autoDeploy`, `branch`, `plan`,
  `region`, the disk, and the declared env-var *keys* (never values); report the
  field name and both sides; exit non-zero on a real difference. Run it from
  `npm run repo:health` when `RENDER_API_KEY` is present and skip *loudly* when
  it is not. Record `NODE_OPTIONS` and the Stripe keys in `render.yaml` rather
  than allowlisting them, because an allowance is a hole.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### INF-04 — The Render service cannot be rebuilt from the repository: seven boot-required environment variables are absent from `render.yaml`, and `SECRET_ENCRYPTION_KEY` exists in exactly one place

- **Category:** Disaster recovery / Configuration
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `render.yaml`, `services/api/src/config/env.validation.ts`
- **Evidence:**

  `services/api/src/config/env.validation.ts:8-23` lists the variables whose
  absence throws at boot in production:
  ```ts
  const PRODUCTION_REQUIRED_ENV = [
    'NODE_ENV', 'API_BASE_URL', 'API_ORIGIN', 'DATABASE_URL',
    'CORS_ALLOWED_ORIGINS', 'JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET',
    'ADMIN_APP_URL', 'WEB_APP_URL', 'LANDING_APP_URL',
    'ACCOUNT_ACTIVATION_LINK_BASE_URL', 'PASSWORD_RESET_LINK_BASE_URL',
    'COOKIE_SECURE', 'COOKIE_SAME_SITE',
  ] as const;
  ```
  and `env.validation.ts:45-49` makes each a hard failure:
  ```ts
  for (const key of PRODUCTION_REQUIRED_ENV) {
    if (!hasValue(env[key])) { errors.push(`${key} is required in production.`); }
  }
  ```

  Extracting all 43 `- key:` entries from `render.yaml` and diffing against that
  list, **seven are absent**: `API_BASE_URL`, `ADMIN_APP_URL`, `WEB_APP_URL`,
  `ACCOUNT_ACTIVATION_LINK_BASE_URL`, `PASSWORD_RESET_LINK_BASE_URL`,
  `COOKIE_SECURE`, `COOKIE_SAME_SITE`. The Stripe trio is absent as well
  (INF-03).

  `docs/deployment/platform-access.md:41-49` — every credential lives in exactly
  one place:
  > All three are **User-scope Windows environment variables** on the
  > maintainer's workstation.

- **Current behaviour:** Recreating the API service from `render.yaml` alone
  produces a service that fails `validateApiEnvironment` at boot with seven
  errors, and — once those are guessed — a service that cannot take payments
  because the Stripe configuration is undeclared. The values themselves exist
  only in the Render dashboard and in one person's Windows user environment.
- **Expected behaviour:** `render.yaml` declares every key the application
  requires at boot (values `sync: false`), so the file is a complete recipe and
  the dashboard supplies only secrets.
- **Risk:** The specific data-loss case is worth stating on its own.
  `SECRET_ENCRYPTION_KEY` is `sync: false` — held only in the Render dashboard —
  and `render.yaml:118-121` records that `SecretEncryptionService` uses it to
  encrypt third-party integration credentials at rest in the database. **If the
  Render service is deleted or the key is lost, every encrypted integration
  credential in the production database becomes permanently undecryptable**, and
  the database backup (such as it is) does not help, because the ciphertext is
  what is backed up. There is no documented escrow for this key.

  More broadly: the recovery story for "the Render service is gone" is
  "one person reconstructs it from memory", and that person holds all three
  provider tokens on one laptop.
- **Remediation:**
  1. Add the seven missing keys plus `STRIPE_MODE`, `STRIPE_SECRET_KEY`,
     `STRIPE_WEBHOOK_SECRET` and `STRIPE_API_VERSION` to `render.yaml` with
     `sync: false`.
  2. Add a boot-time or CI assertion that every name in `PRODUCTION_REQUIRED_ENV`
     appears in `render.yaml` — a ten-line test in `services/api/src/config/`
     that reads the YAML, so the two lists cannot drift again.
  3. Escrow `SECRET_ENCRYPTION_KEY` and the three provider tokens somewhere
     other than one workstation (a password manager shared with a second person
     is sufficient; this does not need a KMS).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### INF-05 — File storage is on the instance's ephemeral filesystem: `FILE_STORAGE_DIR` is not set on the live service, so uploaded documents and published installers are destroyed by every deploy

- **Category:** Data loss / Storage
- **Severity:** CRITICAL
- **Confidence:** LIKELY — the unverified link is whether the `disk:` block in
  `render.yaml` was ever applied to the live service. The evidence that
  `FILE_STORAGE_DIR` is unset live is a direct quotation of a live read; the
  inference that the disk is therefore also absent follows from INF-03 but was
  not read from the provider (read-only constraint).
- **Known:** NEW (routes to the storage specialist — see the routing note at the
  end)
- **Component:** `render.yaml`, `services/api/src/common/storage/storage.service.ts`
- **Evidence:**

  `render.yaml:33-44` states the design and the stake:
  > Durable file storage (TASK-0025). StorageService writes uploaded files —
  > tenant documents, branding assets, and published app-release installers —
  > under FILE_STORAGE_DIR. **Without a persistent disk that path is on the
  > instance's ephemeral filesystem and every deploy wipes it**, so a published
  > agent installer (or any uploaded document) vanishes on the next deploy.

  `docs/deployment/release-history/2026-08-31-production-cace6cd.md:56-58` —
  live read, 2026-08-31, `FILE_STORAGE_DIR` in the **MISSING** column, and
  lines 69-73 make it deliberate:
  > `FILE_STORAGE_DIR` was deliberately **not** set: it is missing today for
  > every existing upload too, and changing it would relocate where all existing
  > files are read from. That is a pre-existing platform question, not this
  > release's to answer.

  `services/api/src/common/storage/storage.service.ts:21` shows the fallback:
  ```ts
  this.configService.get('FILE_STORAGE_DIR') ?? 'storage/uploads',
  ```
  — a relative path, resolved against the process working directory, i.e. inside
  the container image.

- **Current behaviour:** Every tenant document, branding asset, generated report
  artifact and published desktop-agent installer is written to a relative path
  inside an ephemeral container filesystem. Render replaces the container on
  every deploy. The release record confirms this has been true "for every
  existing upload".
- **Expected behaviour:** Uploads land on durable storage that survives a deploy.
- **Risk:** Silent, total, recurring data loss on a customer-facing feature.
  A tenant uploads an employment contract; the next release deletes it; the
  database row still points at a file that no longer exists, so the failure
  surfaces as a broken download weeks later rather than as an error at the time.
  There is no backup of these bytes at all — INF-02's RPO row for file storage
  is 100% loss on every deploy, not "6 hours".
- **Remediation:** Two viable paths, and the second is the one to prefer:
  1. Apply the `disk:` block from `render.yaml` and set `FILE_STORAGE_DIR` to
     `/var/data/storage`. This works today and permanently forecloses running
     more than one API instance (see the tradeoff comment at `render.yaml:37`).
     Existing files are already lost, so there is no migration to do — but say
     so explicitly rather than letting it look like a lossless change.
  2. Move `StorageService` to object storage (S3 or Cloudflare R2) behind the
     same interface. It removes the single-instance pin, gives the bytes a
     provider-level durability guarantee, and makes the backup question answer
     itself. `render.yaml:37-42` already anticipates this as the scale-out path.
  Whichever is chosen, **verify from the live service that it took effect** —
  that is the whole lesson of INF-03.
- **Difficulty:** LOW for (1), MEDIUM for (2)
- **Regression risk:** LOW
- **Fix now:** YES

---

### INF-06 — The production rate limiter can be bypassed with a client-supplied `X-Forwarded-For`, because the API is directly reachable and reads the leftmost hop

- **Category:** Networking / AuthZ
- **Severity:** HIGH
- **Confidence:** LIKELY — every code link is read end to end; the one
  unverified link is whether Render's edge *appends* to an incoming
  `X-Forwarded-For` (the standard behaviour, which makes the attack work) or
  *replaces* it (which would not). That check needs a live request and was not
  performed.
- **Known:** NEW
- **Component:** `services/api/src/common/security/client-ip.ts`,
  `packages/config/client-ip.js`, `packages/config/forwarded-host.js`
- **Evidence:**

  `packages/config/forwarded-host.js:49-64` — trust proxy is on for Render even
  when `TRUST_PROXY_HEADERS` is unset (and the release record at INF-03 shows it
  *is* unset live):
  ```js
  if (configured) { … }
  return env?.RENDER === "true" || env?.VERCEL === "1" ? 1 : false;
  ```

  `services/api/src/common/security/client-ip.ts:26-34`:
  ```ts
  export function resolveClientIp(request: Request): string {
    if (isProxyTrusted(request)) {
      const forwarded = readForwardedForClientIp(request.headers['x-forwarded-for']);
      if (forwarded) return forwarded;
    }
    return request.ip ?? request.socket?.remoteAddress ?? 'unknown';
  }
  ```

  `packages/config/client-ip.js:31-39` reads the **leftmost** entry:
  ```js
  const first = raw.split(",")[0];
  ```

  `services/api/src/common/guards/public-rate-limit.guard.ts:53` keys the budget
  on it:
  ```ts
  const key = `${resolveClientIp(request)}:${request.path}`;
  ```
  with `DEFAULT_WRITE_LIMIT = 20` per ten minutes on `login`,
  `forgot-password`, `activate-account`, `public/subscribe` and `public/leads`
  (guard lines 15-25).

  And the API is directly reachable — `docs/deployment/platform-access.md:167`
  gives the origin `https://dijipeople.onrender.com` alongside the
  `api.dijipeople.com` alias, with no WAF, no Cloudflare and no edge protection
  configured anywhere in the repository.

- **Current behaviour:** A caller sending `X-Forwarded-For: 203.0.113.<n>` to
  `POST /api/auth/login` gets a fresh 20-request bucket for each value of `n`,
  because Render appends its own hop to the right and the reader takes the left.
  The credential-stuffing control the guard exists to provide is defeated by one
  header.
- **Expected behaviour:** Behind a single trusted proxy, the client address is
  the *rightmost* entry the trusted hop wrote — or, equivalently, `trust proxy: 1`
  semantics counting from the right. The leftmost entry is the one an untrusted
  client controls.
- **Risk:** Unlimited password attempts against a payroll platform's login,
  and unlimited `public/leads` / `public/subscribe` submissions. The code's own
  comment (`client-ip.ts:15-20`) states the requirement correctly — *"reachable
  directly, it is an attacker-controlled string and trusting it would hand any
  caller an unlimited supply of identities to rotate through"* — and then
  the deployment is precisely the reachable-directly case.
- **Remediation:**
  1. Read the client hop from the right, counting the number of trusted hops
     (`resolveTrustProxySetting` already returns a hop count — use it in
     `readForwardedForClientIp` instead of always taking index 0). The
     first-party Next proxies that motivated the leftmost read
     (`packages/config/client-ip.js:42-55`) preserve the incoming chain without
     appending, so a right-indexed read still finds the visitor for that path —
     but verify that with the existing `client-ip` specs before changing it.
  2. Separately, the limiter's `Map` is process-local. On one instance that is
     correct; it is listed here so the constraint is visible if INF-11's
     scale-out is ever taken.
- **Difficulty:** MEDIUM (the header-position change is small; proving both the
  proxied and direct paths still work is the effort)
- **Regression risk:** MEDIUM (getting it wrong collapses every visitor behind a
  Next proxy into one bucket — BUG-0032, which is why the leftmost read exists)
- **Fix now:** YES — **routes to the AuthZ/security specialist for severity
  adjudication; the infrastructure half of it is the direct reachability.**

---

### INF-07 — There is exactly one environment: no staging, one Neon branch, one Stripe account, one email sender, and demo data in the production database

- **Category:** Environment isolation
- **Severity:** HIGH
- **Confidence:** CONFIRMED
- **Known:** KNOWN in part (`docs/deployment/environments.md` records "No
  staging environment | **Medium**"); the single-Neon-branch and demo-tenant
  aspects are NEW
- **Component:** whole estate
- **Evidence:**

  `docs/deployment/environments.md:11-16`:
  > | **STAGING** | **Does not exist** | No configuration … nothing is provisioned |
  > | DEV / UAT | Not configured | Historical `uat-*` log files exist at the repo root, but no committed configuration |
  >
  > Do not assume a staging environment is available. Promotion today is
  > local → production.

  `docs/deployment/platform-access.md:198` — the Neon project has one branch:
  ```
  | Branch | `production`, `br-snowy-mud-am2378xn` — default, **not protected** |
  ```

  `docs/bugs/BUG-0903…md` — one Stripe account, currently in test mode:
  ```
  STRIPE_MODE = test
  ```
  with `Status: ACCEPTED_RISK`, `Severity: HIGH`.

  `render.yaml:206-224` — a single set of `EMAIL_SMTP_*` credentials and one
  `EMAIL_FROM`, used as the fallback for both platform and tenant mail.

  `DEPLOYMENT_CHECKLIST.md` and `render.yaml` both provision the demo tenant
  into the same database: `seed:demo` "creates or updates one explicitly tagged
  disposable demo tenant", and the demo tenant is the one the 2026-09-08 release
  record signs into *on production* to verify approvals.

- **Current behaviour:** Code goes from a developer's laptop to production. The
  demo tenant that QA drives lives in the production database alongside real
  tenants. One Stripe account, one SMTP sender.
- **Expected behaviour:** At minimum a preproduction target that shares the
  code path and shares nothing else, so a migration, a seed and a release chain
  can be exercised before they touch customer data.
- **Risk:** Every operational finding above is amplified by this. INF-01's
  manual migration has no rehearsal target. INF-02's untested restore has
  nowhere safe to be tested. BUG-0899 (release chain always failed, production
  frozen 14 commits behind `main` for days) is the archetype: the failure was
  only discoverable in production because production is the only place the
  release chain runs. Live tenant email is also in scope — a test run against
  production sends real mail to real addresses.
- **Remediation:** The cheap version is genuinely cheap and should be done
  before any of the expensive ones:
  1. Create a Neon **branch** (`staging`) from production — Neon branches are
     copy-on-write and cost close to nothing — plus a second Render service on
     the free/starter tier pointed at it, with `PLATFORM_ENVIRONMENT=staging`,
     Stripe test keys and an SMTP sink. This gives the release chain, the
     migrations and the restore rehearsal a target. It is one service and one
     branch, not a platform.
  2. Point Vercel *preview* deployments at that service (see INF-08).
  3. Move the demo tenant to it once (1) exists.
  **Measurable trigger for anything larger:** build a full pre-production
  replica when the platform has more than one paying tenant, or when a release
  first has to be scheduled around a customer's payroll date.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER (but before the first paying customer)

---

### INF-08 — Vercel preview deployments: whether they point at production data cannot be determined from the repository, and nothing in the codebase would prevent it

- **Category:** Environment isolation
- **Severity:** HIGH (if confirmed) / MEDIUM (as an unverifiable gap)
- **Confidence:** NOT OBSERVED — searched for specifically, and the
  configuration that would answer it is not committed
- **Known:** KNOWN in part (`docs/deployment/environments.md:154` — "Frontend
  deployment configuration is not committed | **Medium** — not reproducible from
  a clean clone")
- **Component:** `apps/web`, `apps/admin`, `apps/landing`, Vercel dashboard
- **Evidence:**

  No `vercel.json` exists anywhere: `git ls-files | grep -i vercel.json` returns
  nothing, and `.agent/context/deployment-runtime.md:47-48` states it:
  > **Only component 1 has committed deployment configuration.** There is no
  > `vercel.json`, no Dockerfile and no docker-compose.

  `.agent/context/deployment-runtime.md:174-183`:
  > The install scope, build command and environment values live in the Vercel
  > dashboard and cannot be read from a clean clone.

  Searching the three apps for any code that distinguishes a preview deployment
  — `VERCEL_ENV`, `VERCEL_URL` — returns **no hits** outside test fixtures.
  There is no guard, no banner, no environment gate and no refusal anywhere in
  the frontends that behaves differently on a preview build.

  What *is* determinable: `NEXT_PUBLIC_API_BASE_URL` is build-time and baked into
  the bundle (`docs/deployment/environments.md:139-143`). Vercel's default is
  that Preview environments inherit Production environment variables unless a
  Preview-scoped value is set. So the default configuration — the one nothing in
  this repository overrides — produces preview builds that call the production
  API.

- **Current behaviour:** Unknown, and the repository contains nothing that would
  make it safe.
- **Expected behaviour:** Preview deployments target a non-production API and a
  non-production database, and the application says so visibly.
- **Risk:** If confirmed, every pull-request preview of `apps/web` is a working,
  publicly-reachable client of the production payroll database, authenticating
  against production sessions, on an unlisted but guessable `*.vercel.app`
  hostname. `CORS_ALLOWED_ORIGINS` supports wildcards
  (`services/api/src/config/env.validation.ts:132`,
  `matchesWildcardOrigin`), so a `*.vercel.app` entry — if one exists — would
  admit every preview of every project on that account.
- **Remediation:**
  1. **Verify first** (this is for the orchestrator's live-verification pass):
     read the Preview-scoped `NEXT_PUBLIC_API_BASE_URL` for all three Vercel
     projects, and read the live `CORS_ALLOWED_ORIGINS` for a `*.vercel.app`
     wildcard.
  2. If previews point at production, set Preview-scoped variables pointing at
     the staging service from INF-07, and remove any `*.vercel.app` wildcard from
     the production CORS list in favour of the three exact production origins.
  3. Commit a `vercel.json` per app so the deployment is reproducible from a
     clean clone, closing the finding `environments.md` has carried since August.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES (verify), then YES if confirmed

---

### INF-09 — The production Neon branch is not protected, and a single project-scoped key can delete it

- **Category:** Disaster recovery / Access control
- **Severity:** HIGH
- **Confidence:** CONFIRMED (from a live read recorded 2026-08-22)
- **Known:** NEW as a finding; the fact is recorded in `platform-access.md`
- **Component:** Neon project `wispy-dream-20751252`
- **Evidence:**

  `docs/deployment/platform-access.md:198`:
  ```
  | Branch | `production`, `br-snowy-mud-am2378xn` — default, **not protected** |
  ```
  `docs/deployment/platform-access.md:219-220`:
  > **The production branch is not protected.** Nothing at the provider level
  > prevents deleting it.

  `docs/deployment/platform-access.md:72-75`:
  > **Default posture is read-only.** None of the three tokens is technically
  > read-only … a Neon project-scoped key can drop branches. **The restraint is a
  > working agreement, not a permission boundary.**

- **Current behaviour:** The one branch holding all customer data has no
  provider-level deletion protection, and the key that can delete it is a
  User-scope environment variable on a workstation that also runs autonomous
  agents.
- **Expected behaviour:** Branch protection on, so deletion requires an
  explicit, deliberate un-protect step.
- **Risk:** Deletion of the production branch destroys the database *and* the
  six-hour history that is the only recovery mechanism (INF-02). Combined, those
  two findings mean a single API call is capable of total, permanent,
  unrecoverable loss of every tenant's payroll data.
- **Remediation:** Enable branch protection on `br-snowy-mud-am2378xn`. One
  setting. Do it in the same sitting as raising history retention.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES

---

### INF-10 — The API's region is undeclared, so a cross-region API↔database round trip on every query cannot be ruled out

- **Category:** Performance / Topology
- **Severity:** MEDIUM
- **Confidence:** LIKELY — `render.yaml` declaring no region is CONFIRMED;
  the resulting live region is unverified because reading it needs the Render
  API
- **Known:** NEW
- **Component:** `render.yaml`, Render service, Neon project
- **Evidence:**

  Neon is in `aws-us-east-1` — `docs/deployment/platform-access.md:196`:
  ```
  | Region | `aws-us-east-1` |
  ```
  and the endpoint hostname confirms it (`platform-access.md:200`):
  `ep-crimson-field-amm402fv.c-5.us-east-1.aws.neon.tech`.

  `render.yaml` declares **no `region:` key** — grep over the whole file returns
  nothing for `region`, `autoDeploy`, `branch`, `numInstances` or `scaling`.
  Render's default region for a service created without one is Oregon
  (`us-west-2`). No document in the repository states the API's region;
  `platform-access.md:163-168` gives the workspace, service id, origin and
  health URL, and no region.

- **Current behaviour:** Undetermined from the repository. If the service is in
  Oregon, every Prisma query pays roughly 60-80 ms of cross-continent round trip,
  and a request issuing ten sequential queries pays it ten times.
- **Expected behaviour:** The API runs in the same region as its database, and
  `render.yaml` says which region that is.
- **Risk:** If cross-region, this is the largest single latency term in the
  system and it is invisible in application profiling — every query looks
  uniformly slow, which reads as "the database is slow" rather than "the
  database is 4,000 km away". It also multiplies with the N+1 patterns the
  performance specialist is looking for.
- **Remediation:**
  1. Read the live service's region (orchestrator's live pass).
  2. Declare it in `render.yaml` either way, so it stops being unknown.
  3. If it is not `ohio`/`virginia`, move the service to a region co-located with
     `aws-us-east-1`. Note this is a service recreation, not a setting — plan it
     with the storage decision from INF-05.
  **Measurable trigger:** if median API latency measured at the edge exceeds
  200 ms while server-side handler time is under 50 ms, the gap is transit and
  this is the cause.
- **Difficulty:** MEDIUM
- **Regression risk:** MEDIUM (a region move recreates the service — see INF-04
  on whether it can be rebuilt at all)
- **Fix now:** YES for the measurement; LATER for the move

---

### INF-11 — Scaling posture: no autoscaling, one instance, a Node heap ceiling that exceeds the declared plan's memory

- **Category:** Scaling / Availability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED for the configuration; LIKELY for the live plan
- **Known:** NEW
- **Component:** `render.yaml`, `services/api/package.json`
- **Evidence:**

  `render.yaml:5` — `plan: starter`, with no scaling block anywhere in the file.
  Render's Starter instance type provides 512 MB RAM / 0.5 CPU.

  `services/api/package.json:55`:
  ```json
  "start:prod": "node --max-old-space-size=1536 dist/src/main.js",
  ```

  Meanwhile `docs/bugs/BUG-0767…md` "Resolution" records the live commands
  carrying `NODE_OPTIONS="…6144"` (build) and `NODE_OPTIONS="…4096"`
  (pre-deploy) — figures that a 512 MB instance cannot host, which is strong
  evidence the live plan is **not** `starter` and that `render.yaml:5` has
  drifted like everything else (INF-03).

  Neon compute: `docs/deployment/platform-access.md:202-203`:
  ```
  | Autoscaling | 0.25 – 2 CU |
  | Scale to zero | **disabled** (`suspend_timeout_seconds: 0`) |
  ```

  Prisma pool: `services/api/src/common/prisma/prisma.service.ts:28-31` passes
  only a connection string to `PrismaPg`, with no `max`:
  ```ts
  super({ adapter: new PrismaPg({ connectionString }), … });
  ```
  so `node-postgres` applies its default pool size of 10.

- **Current behaviour and the answers to the specific questions asked:**

  - **Autoscaling:** none on the API. Neon's *compute* autoscales 0.25–2 CU;
    the API does not scale at all.
  - **Cold starts:** **scale-to-zero is disabled** (`suspend_timeout_seconds: 0`),
    so there are no Neon cold starts and a slow first request is not one.
    `platform-access.md:209-210` says exactly this, and it is a useful negative
    result: *"A slow first request is *not* a cold start."*
  - **Connection ceiling:** the pooler is **disabled**
    (`platform-access.md:201`), so connections go direct. One API instance ×
    a 10-connection pool = 10 concurrent connections against a Neon compute
    whose `max_connections` at the 0.25 CU floor is in the low hundreds. **This
    is not the binding limit today and will not be at 10x.**
  - **What breaks first at 10x traffic:** the single 0.5-CPU Node process. It is
    the only instance, it runs the outbox worker, the reports scheduler and the
    workforce snapshot job in-process alongside request handling, and it cannot
    scale out while a disk is attached (INF-05). CPU saturation on that one
    process is the first ceiling, well before Postgres connections, well before
    Neon compute (which autoscales to 2 CU on its own), and well before Vercel.
  - **Heap:** `--max-old-space-size=1536` on a 512 MB instance means V8 will not
    begin aggressive GC until it believes it has 1.5 GB, so the container is
    OOM-killed by the platform before the runtime ever applies memory pressure.
    On a larger live plan this is merely mis-declared; on the declared plan it is
    a latent crash.

- **Risk:** Single point of failure with no redundancy — a deploy, a crash or an
  OOM is a full platform outage for every tenant, not a degraded one. There is
  no alerting to notice it (INF-13).
- **Remediation:**
  1. Reconcile `plan:` and the heap flag with the live instance so the two agree
     — set `--max-old-space-size` to roughly 75% of the actual instance memory.
  2. Do **not** add instances yet. Horizontal scaling is blocked by the disk
     (INF-05) and by the in-memory rate limiter (INF-06); resolving INF-05 via
     object storage is the prerequisite, and that ordering matters.
  3. **Measurable trigger for scaling out:** sustained CPU above 70% for 15
     minutes, or p95 API latency above 1 s with server handler time under
     200 ms. At that point: object storage first, then two instances behind
     Render's load balancer, then move the three background workers to a
     dedicated single-instance worker service so exactly one of each still runs.
- **Difficulty:** LOW for (1), MEDIUM for (3)
- **Regression risk:** LOW
- **Fix now:** LATER

---

### INF-12 — The health check Render gates traffic on is a hardcoded literal that tests nothing

- **Category:** Deployment / Observability
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN (ITEM-0009 `Status: READY`, `PLAN_REQUIRED`; recorded in
  `deployment-runtime.md`, `incident-response.md` and `smoke-tests.md`)
- **Component:** `services/api/src/config/env.validation.ts`,
  `services/api/src/main.ts`, `render.yaml`
- **Evidence:**

  `render.yaml:31` — `healthCheckPath: /api`, which is what Render polls to
  decide whether a new instance is healthy enough to take traffic.

  `services/api/src/config/env.validation.ts:227-242`:
  ```ts
  export function getRuntimeHealthPayload(env: NodeJS.ProcessEnv) {
    const commit = resolveDeployedCommit(env);
    return {
      app: 'dijipeople-api',
      status: 'ok',            // ← a literal
      environment: env.NODE_ENV || 'development',
      …
  ```

  `services/api/src/main.ts:81-87` — three express routes answer before Nest's
  router, so this is what production actually serves:
  ```ts
  expressApp.get('/', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api', (_req, res) => res.json(healthPayload()));
  expressApp.get('/api/health', (_req, res) => res.json(healthPayload()));
  ```
  No database probe, no dependency check.

- **Current behaviour:** The API returns `status: "ok"` with the database
  unreachable, and Render treats that instance as healthy and routes traffic to
  it. This is a liveness probe being used as a readiness gate.
- **Expected behaviour:** A readiness probe that touches the database with a
  bounded timeout and reports `degraded` on failure, so Render can withhold
  traffic from an instance that cannot serve.
- **Risk:** A deploy that boots but cannot reach Postgres — a rotated credential,
  a Neon incident, a connection-limit exhaustion — passes the gate, takes
  traffic, and 500s every request. Nothing detects it. `ITEM-0009:39-42` puts it
  well: *"the one automated signal that does exist can be green during an
  outage."*
- **Remediation:** Add a readiness route (`/api/ready`) that runs
  `SELECT 1` with a ~2 s timeout and returns 503 on failure, point
  `healthCheckPath` at it, and leave `/api` as the liveness/version endpoint it
  already is. Guard it with a spec written against the **express handler that
  actually answers**, not against `AppController` — BUG-0904's correction note
  records a fix that shipped, passed CI and had no effect for exactly that
  reason.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM (a probe with the wrong timeout semantics can turn
  a slow database into a restart loop — ITEM-0009 already flags this)
- **Fix now:** YES

---

### INF-13 — Nothing alerts on a failed deploy, a failed migration or an error spike

- **Category:** Observability / Incident response
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN (ITEM-0009)
- **Component:** whole estate
- **Evidence:**

  `docs/backlog/items/ITEM-0009…md:27-29`:
  > There is no Sentry, Datadog, OpenTelemetry, Prometheus or log-shipping
  > dependency anywhere in this repository.

  `docs/deployment/incident-response.md:49-57` lists the resulting blind spots,
  including:
  > There is **no error-tracking platform**; `ErrorLog` in the database is the
  > primary signal, and reading it requires database access.

  The consequence is demonstrated in the record itself. `docs/bugs/BUG-0899…md`:
  > Every deploy fails at pre-deploy with exit 2. The previous instance keeps
  > serving, so **the service looks healthy while being two weeks of work out of
  > date.** … Production is therefore frozen at commit `ef57b2a` — **14 commits
  > behind `main`**.

  And the `pre_deploy_failed` on 2026-09-01 that caused INF-01 was noticed a
  week later, on 2026-09-08, while investigating something else.

- **Current behaviour:** A failed deploy is silent. A failed migration is
  silent. An error spike is visible only to someone who queries the `ErrorLog`
  table. Deployment success is verified by a human running `curl /api/health`
  and comparing `commitShort` by eye.
- **Expected behaviour:** A failed deploy notifies someone within minutes.
- **Risk:** The mean time to *detect* is currently measured in days, which
  dominates any RTO target (INF-02). It is also why INF-01 persisted unnoticed
  through two releases.
- **Remediation:** Proportionate, in order of value per unit of effort:
  1. Turn on Render's built-in deploy notifications (Slack or email). Zero code,
     covers the highest-frequency failure.
  2. Add an external uptime check against the new `/api/ready` from INF-12 —
     any free uptime service; this is one HTTP GET on a schedule.
  3. Defer error aggregation. ITEM-0009 correctly wants an ADR for it, and it
     is a dependency added to four deployables. It is not the missing piece;
     (1) and (2) are.
  **Measurable trigger for error aggregation:** more than one production
  incident per month whose root cause needed database access to find.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES for (1) and (2)

---

### INF-14 — No tenant-level restore is possible: restoring one tenant from a full-database recovery point has no mechanism and no procedure

- **Category:** Disaster recovery / Operational runbooks
- **Severity:** HIGH
- **Confidence:** CONFIRMED (searched specifically; no mechanism exists)
- **Known:** NEW
- **Component:** `docs/deployment/`, `services/api/src/modules/data-management/`
- **Evidence:**

  There is no restore runbook of any kind:
  `git ls-files | grep -iE "runbook|disaster|backup|restore"` returns exactly two
  runbooks — `docs/deployment/rollback-runbook.md` and
  `docs/deployment/incident-response.md` — and neither describes a restore. No
  file in `docs/` covers backup or restore at all.

  The nearest capability is per-module CSV export, and it is narrow.
  `services/api/src/modules/data-management/export-execution.service.ts:81-89`
  wires exactly two modules:
  ```ts
  this.employeesService.exportEmployees(user, { … });
  const result = await this.attendanceService.exportAttendance(user, { … });
  ```
  with `:113` and `:119` throwing `"${module.label} does not support export yet."`
  for everything else. That is a data-portability feature for employees and
  attendance, not a restore path — it cannot round-trip payroll runs, approvals,
  documents, audit history or any relational structure.

  There is a *deletion* order (`TENANT_ERASURE_DELETE_ORDER`, referenced at
  `docs/deployment/release-history/2026-08-31-production-cace6cd.md:105`) — the
  platform knows how to remove one tenant across every table. Nothing knows how
  to put one back.

- **Current behaviour:** If one tenant's data is corrupted or wrongly deleted,
  the only recovery is a whole-database point-in-time restore, which would roll
  back **every other tenant** to the same moment. Within six hours that is
  technically possible and commercially unacceptable; after six hours it is not
  possible at all (INF-02).
- **Expected behaviour:** A documented procedure: restore the full database into
  a Neon branch, connect to it, and extract one tenant's rows in
  foreign-key-safe order into the live database.
- **Risk:** The scenario is ordinary, not exotic. A tenant admin runs a bad
  bulk import or a mistaken bulk delete and asks for yesterday's data back. The
  honest answer today is that it cannot be done, and nobody has written that
  down or told anybody.
- **Remediation:** This is genuinely hard and should be scoped honestly rather
  than promised:
  1. The enabling primitive is cheap and already available: **Neon branching**.
     Restoring a point-in-time branch and connecting to it read-only is minutes
     of work and destroys nothing. Document that as step one.
  2. `TENANT_ERASURE_DELETE_ORDER` already enumerates every tenant-owned table
     in dependency order. **Reversed, it is the insert order.** A
     `scripts/extract-tenant.mjs` that walks it against a restored branch and
     emits per-table data is a bounded piece of work and reuses an ordering the
     project already maintains and tests.
  3. Write `docs/deployment/tenant-restore-runbook.md` stating what is possible,
     what is not, and the expected duration — including the case where the
     answer is "no".
  Do (1) and (3) now; (2) when a customer first asks.
- **Difficulty:** HIGH
- **Regression risk:** LOW (all of it operates on a branch, never on production)
- **Fix now:** LATER — but INF-02's retention increase is the prerequisite and
  is YES

---

### INF-15 — No key-rotation procedure exists for any secret, including the one whose loss is irreversible

- **Category:** Operational runbooks / Security
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED (searched; absent)
- **Known:** NEW
- **Component:** `docs/deployment/`, `render.yaml`
- **Evidence:**

  `git ls-files | grep -iE "rotation"` returns nothing. No document in
  `docs/deployment/` describes rotating `JWT_ACCESS_SECRET`,
  `JWT_REFRESH_SECRET`, `SECRET_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, the SMTP
  password, `RELEASE_PUBLISH_TOKEN`, or the three provider API keys.

  `render.yaml:118-121` establishes what rotating one of them would mean:
  > Required in production: SecretEncryptionService refuses to start
  > without it rather than storing integration credentials in plaintext.

  There is a break-glass path for exactly one credential — the platform super
  admin password, via `PLATFORM_SUPER_ADMIN_PASSWORD_RESET`
  (`render.yaml:143-148`) — and it is well documented. Nothing comparable exists
  for anything else.

- **Current behaviour:** No procedure. Rotating `SECRET_ENCRYPTION_KEY` in
  particular has an unstated but real requirement: every integration credential
  in the database must be decrypted with the old key and re-encrypted with the
  new one, in one operation, or those credentials are lost. No script does this.
  Rotating the JWT secrets invalidates every live session across three client
  applications and the Electron agent simultaneously, with no documented
  expectation of that.
- **Expected behaviour:** A short runbook per secret class: what it protects,
  what breaks when it changes, the order of operations, and how to verify.
- **Risk:** The realistic trigger is a credential leak, i.e. exactly the moment
  when improvising is worst. Without a re-encryption script, the pressure at
  that moment is to *not* rotate `SECRET_ENCRYPTION_KEY`, which is the wrong
  outcome.
- **Remediation:** Write `docs/deployment/key-rotation.md` covering the JWT
  secrets (session impact, and whether a dual-key grace period is feasible),
  `SECRET_ENCRYPTION_KEY` (**and write the decrypt-and-re-encrypt script before
  it is needed** — it is a bounded piece of work against
  `SecretEncryptionService`), the Stripe keys, SMTP, and the three provider
  tokens.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### INF-16 — Custom tenant domains can be registered but can never be verified or given a certificate; the feature is inert by construction

- **Category:** Networking / TLS
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/tenant-domains/tenant-domain.service.ts`
- **Evidence:**

  `tenant-domain.service.ts:426-455` — verification is a no-op that says so:
  ```ts
  /**
   * This repository has no DNS resolver or certificate provider integration, so
   * this does NOT confirm anything: it records that verification was attempted
   * and leaves the domain PENDING with a stated reason.
   */
  ```
  ```ts
  const reason =
    'DNS verification is not automated in this deployment. Confirm the TXT record with the DNS provider, then mark the domain verified through platform operations.';
  ```
  and it returns `{ success: false, verified: false, … }` unconditionally.

  System subdomains take a different path and rely on a wildcard certificate,
  gated by a manually-set flag — `tenant-domain.service.ts:355-359`:
  ```ts
  /* Covered by the platform wildcard certificate; no per-tenant issuance. */
  tlsStatus: wildcardReady ? TenantDomainTlsStatus.ACTIVE : TenantDomainTlsStatus.PENDING,
  ```
  where `isWildcardDnsReady()` (`:564-573`) reads a boolean out of a
  `platformSetting` row keyed `tenant-provisioning` — an operator toggle, not a
  probe.

  Certificate expiry is not modelled at all: grepping `schema.prisma` for a
  certificate or TLS expiry field on the domain model returns nothing.

- **Current behaviour:** `POST` a custom hostname and it is stored `PENDING`
  with a TXT challenge token. Every verification attempt fails by design. The
  domain never becomes routable. System subdomains work, covered by a single
  platform wildcard certificate whose renewal is Vercel's (for
  `*.dijipeople.com` fronting the apps) and about which the platform stores
  nothing.
- **Expected behaviour:** Either the feature is finished — DNS resolution plus
  ACME issuance, or delegation to Vercel's Domains API which does both — or the
  UI states that custom domains are not yet available.
- **Risk:** Low technical risk; the design fails closed and the code is honest
  about why, which is the right call. The real risk is commercial: a tenant is
  offered a custom-domain field that cannot ever succeed, and support absorbs
  the confusion. Note the healthy counterpoint: **there is no expiring
  per-tenant certificate to go unrenewed**, because none is ever issued. The
  "expiring cert nobody renews" scenario does not currently exist here.
- **Remediation:** Preferred, and it is the operationally simple one: delegate to
  Vercel's Domains API from `attemptCustomDomainVerification` — Vercel already
  fronts the tenant app, already performs DNS verification, and already issues
  and renews certificates. Do not build ACME. If that is not scheduled, gate the
  custom-domain UI behind a feature flag that is off.
- **Difficulty:** MEDIUM
- **Regression risk:** LOW
- **Fix now:** LATER

---

### INF-17 — The API origin sets no security response headers, and is reachable on two hostnames with no edge protection

- **Category:** Networking / Security headers
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW (BUG-0040 fixed this for the three Next apps; the API was not
  in its scope)
- **Component:** `services/api/src/main.ts`, `packages/config/security-headers.js`
- **Evidence:**

  The three frontends are well covered. `packages/config/security-headers.js:70-75`:
  ```js
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains",
  },
  ```
  plus `nosniff`, `Referrer-Policy`, `X-Frame-Options: DENY` and a report-only
  CSP, applied by all three apps via `securityHeadersForApp`.

  The API applies none of it. `grep -rn "helmet" services/api/src services/api/package.json`
  returns **nothing**, and `grep -rn "Strict-Transport-Security\|X-Content-Type-Options" services/api/src`
  returns **nothing**. `main.ts` configures CORS, cookie parsing, body parsing,
  a validation pipe and an exception filter — no security headers.

  Two hostnames answer: `https://api.dijipeople.com` and
  `https://dijipeople.onrender.com` (`docs/deployment/platform-access.md:167`).
  No WAF, CDN or edge proxy is configured anywhere in the repository.

- **Current behaviour:** API responses — which include JSON containing employee
  and payroll data, and file downloads from `StorageService` — carry no
  `X-Content-Type-Options: nosniff` and no HSTS. The onrender.com hostname is a
  second, unprotected front door to the same service.
- **Expected behaviour:** `helmet()` (or the equivalent handful of explicit
  headers) on the API, matching the posture the frontends already have; the
  `*.onrender.com` hostname either blocked or accepted as a documented decision.
- **Risk:** Moderate and mostly compounding rather than standalone. Missing
  `nosniff` on a file-download route is the sharpest edge — an uploaded document
  served with a guessable content type can be sniffed into executable script,
  which is precisely the risk the frontends' own comment
  (`security-headers.js:26`) cites. Missing HSTS on the API leaves the first
  request to `api.dijipeople.com` downgradeable.
- **Remediation:**
  1. Add `helmet` to the API bootstrap with `contentSecurityPolicy: false`
     (the API serves no HTML) — roughly three lines in `main.ts`, and it reuses
     a dependency posture the project already accepts on the frontends.
  2. Decide explicitly about `dijipeople.onrender.com`: either leave it as the
     documented operational origin (it is what health checks and release
     verification use) or reject requests whose `Host` is not an expected one.
     Leaving it undecided is the current state.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** YES for (1)

---

### INF-18 — `DEPLOYMENT_CHECKLIST.md` is a third, stale description of the deployment that contradicts `render.yaml`

- **Category:** Documentation / Configuration
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `DEPLOYMENT_CHECKLIST.md`
- **Evidence:**

  `DEPLOYMENT_CHECKLIST.md` prescribes a build command that is not
  `render.yaml`'s, and a release chain missing its last two steps:
  ```bash
  npm ci
  npm --workspace api run prisma:generate
  npm --workspace api run build
  ```
  ```bash
  npm --workspace api run prisma:migrate:deploy
  npm --workspace api run seed:config
  npm --workspace api run seed:verify
  npm --workspace api run seed:admin
  ```
  against `render.yaml:20-30`, which specifies
  `npm ci && npm --workspace api run build` and
  `preDeployCommand: npm --workspace api run release` — a chain that also runs
  `seed:legal` and `legal:publish --confirm`, the two steps whose omission was
  BUG-0767's headline impact.

  It also omits `SECRET_ENCRYPTION_KEY`, `FILE_STORAGE_DIR`, `TENANT_BASE_DOMAIN`
  and `PUBLIC_BASE_DOMAIN` from its "Required Environment Variables" list while
  including `ENABLE_DEMO_DATA_RESET`, which appears in neither `render.yaml` nor
  `turbo.json`.

- **Current behaviour:** Three documents describe the deployment —
  `render.yaml`, `.agent/context/deployment-runtime.md` and
  `DEPLOYMENT_CHECKLIST.md` — and the third is stale. It sits at the repository
  root, which makes it the one a newcomer finds first.
- **Expected behaviour:** One authority. `render.yaml` is it.
- **Risk:** Low but real: this is the document that would be followed while
  rebuilding a service under pressure, and following it produces a deployment
  that never publishes legal documents — the exact BUG-0767 failure.
- **Remediation:** Replace `DEPLOYMENT_CHECKLIST.md`'s command and variable
  sections with pointers to `render.yaml` and `docs/deployment/environments.md`,
  keeping only the genuinely additive material (the Neon setup notes and the
  Common Issues list, which are good).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### INF-19 — Eighteen of the forty-three variables `render.yaml` declares are absent from `turbo.json` `globalEnv`, violating the repository's own registration rule

- **Category:** Configuration
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `turbo.json`, `render.yaml`
- **Evidence:**

  `docs/deployment/environments.md:145-152` states the rule:
  > A new variable must be added in **four** places or it will misbehave:
  > 1. `turbo.json` `globalEnv` — otherwise Turborepo caches across differing values

  Diffing the 43 `- key:` entries in `render.yaml` against `turbo.json`'s
  `globalEnv` array, **18 are missing**: `EMAIL_FROM`, `EMAIL_FROM_NAME`,
  `EMAIL_PROVIDER`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PASSWORD`, `EMAIL_SMTP_PORT`,
  `EMAIL_SMTP_SECURE`, `EMAIL_SMTP_USER`, `FILE_STORAGE_DIR`,
  `PLATFORM_SUPER_ADMIN_EMAIL`, `PLATFORM_SUPER_ADMIN_PASSWORD`,
  `PLATFORM_SUPER_ADMIN_PASSWORD_RESET`, `PUBLIC_SITE_URL`,
  `REPORTS_ARTIFACT_RETENTION_DAYS`, `REPORTS_SCHEDULER_ENABLED`,
  `REPORTS_SCHEDULER_POLL_INTERVAL_MS`, `REPORTS_WORKFORCE_SNAPSHOT_ENABLED`,
  `SECRET_ENCRYPTION_KEY`.

- **Current behaviour:** These 18 are outside Turborepo's cache key.
- **Expected behaviour:** Registered, per the project's own rule.
- **Risk:** Genuinely low, and worth saying so rather than inflating it: all 18
  are API *runtime* variables, read at boot or per request, not at build time.
  Turborepo caching across differing values of a runtime variable does not
  produce a wrong artifact. The finding is that a documented invariant is not
  enforced, so the *next* variable — which might be build-time — will drift the
  same way unnoticed.
- **Remediation:** Add the 18 to `globalEnv`, and add a check to
  `scripts/validate-framework.mjs` asserting that every `- key:` in
  `render.yaml` appears there. The framework validator already enforces
  comparable cross-file invariants (the module table against
  `services/api/src/modules/`), so this fits an existing pattern.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### INF-20 — Vendor concentration and lock-in

- **Category:** Vendor risk
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** whole estate
- **Evidence:** Four vendors, from `docs/deployment/platform-access.md:26-30`
  and `docs/bugs/BUG-0903…md`: Vercel (three frontends), Render (the API and
  its file storage), Neon (all data), Stripe (all payment).
- **Assessment, kept proportionate:**

  | Vendor | Outage means | Lock-in | Exit cost |
  |---|---|---|---|
  | **Neon** | Total outage. Every request fails. | **Highest, and it is the one that matters.** Not the Postgres wire protocol — that is standard and portable — but the *recovery model*: branching and instant-restore are Neon-specific, and INF-02's remediation deliberately leans on them. | Low for the data (`pg_dump`/`pg_restore` to any Postgres). High for the operational habits built on branching. |
  | **Render** | Total API outage. Frontends render shells and every call 500s. | Low. A Node service with a build and start command runs anywhere. The `disk:` is the only Render-specific coupling, and INF-05 already recommends removing it. | Low |
  | **Vercel** | Frontends down; the API and any non-browser client (the Electron agent, the .NET gateway) keep working. | Medium. Next.js App Router with route handlers is portable in principle; the ISR/edge behaviour and the build pipeline are not, and none of it is committed (INF-08). | Medium |
  | **Stripe** | Checkout unavailable. Existing tenants unaffected. Fails safely — `deriveCheckoutReadiness` refuses an unsynced price, so the site says checkout is unavailable rather than charging wrongly (`docs/deployment/first-production-launch.md:27-31`). | Medium-high, as with any PSP. | High, and normal |

- **Position:** The vendor selection is sound and appropriate for the platform's
  size, and **no migration is recommended.** Three managed providers with one
  operator is the right trade. The concentration risk that actually deserves
  attention is not any vendor — it is that **all three credentials live on one
  workstation and one person holds them** (`platform-access.md:41-49`), which is
  INF-04's remediation, and that the DR posture depends on a Neon-specific
  feature configured to six hours (INF-02).
- **Remediation:** Nothing structural. The single portability improvement worth
  making is the off-provider `pg_dump` already recommended in INF-02 — it
  doubles as the exit path from Neon, which is why it is worth more than its
  cost.
- **Fix now:** NO

---

## Healthy — verified good

These were checked specifically and found correctly implemented. Several are
notably better than the surrounding average.

- **The deployment documentation is unusually honest about its own limits.**
  `docs/deployment/smoke-tests.md:44` marks S1 (`GET /api`) as insufficient and
  adds S3 specifically because *"the health endpoint returns a hardcoded `ok`
  and tests no dependency"*. `incident-response.md:49-57` enumerates the blind
  spots before an incident rather than after. This is the opposite of the usual
  audit finding.
- **The rollback runbook classifies by change type rather than assuming
  "redeploy the previous commit".** `docs/deployment/rollback-runbook.md:9-18`
  distinguishes `CODE_ONLY`, `CONFIG`, `DATABASE_ADDITIVE`,
  `DATABASE_DESTRUCTIVE`, `DATA_MIGRATION`, `EXTERNAL_INTEGRATION` and
  `MULTI_COMPONENT_CONTRACT`, and correctly states at `:26-28` that a code
  rollback across a destructive migration *"will not restore service"*.
- **The migration-vs-code ordering problem is correctly understood and
  correctly documented.** `rollback-runbook.md:33-35` requires destructive
  changes to be staged expand → migrate → contract with the contract step in a
  *later* release. The rule is right; INF-01 is that the mechanism enforcing the
  first half is currently switched off.
- **Migration drift is detected at boot.**
  `services/api/src/common/prisma/prisma.service.ts:116-127` compares
  `_prisma_migrations` against the migrations on disk and warns, with
  `rolled_back_at IS NULL` handled correctly (`:138-140`). This is the exact
  mitigation INF-01 needs and it already exists — it warns rather than refuses,
  which is the right call for a warning at boot.
- **The pooled-vs-direct connection distinction is understood in depth and
  encoded in the config.** `docs/deployment/environments.md:75-112` explains the
  session-scoped advisory lock, why transaction pooling makes it unobtainable,
  and why the failure is deterministic at any timeout. `prisma.config.ts` fails
  at config load with a message naming the variable to set, rather than letting
  the deploy die ten seconds later on `P1002`.
- **Boot-time environment validation fails closed.**
  `services/api/src/main.ts:31-39` runs three gates in order —
  `validateDeploymentEnv`, `validateApiEnvironment`, `assertAuthEnvironment` —
  and a missing required variable aborts startup instead of degrading.
  `env.validation.ts:71-81` additionally refuses `CORS_ALLOWED_ORIGINS: *` when
  credentials are enabled, and refuses origins containing `/api` paths.
- **CORS refusal is a policy decision, not a server error.**
  `env.validation.ts:137-161` documents the fix for BUG-0976 at length: handing
  the `cors` middleware an `Error` produced a 500, buried real 500s, and — the
  sharp part — *"is an unauthenticated write amplification"* because the
  exception filter persisted every one to the error-log table. `callback(null,
  false)` is correct.
- **Security response headers on the three Next apps are complete and
  well-reasoned.** `packages/config/security-headers.js` — one shared
  definition, HSTS at two years with `includeSubDomains`, `nosniff`,
  `Referrer-Policy`, enforced `X-Frame-Options: DENY`, and a CSP deliberately
  shipped Report-Only with the reasoning written down (`:79-96`) and enforcement
  tracked as ITEM-0039 rather than left as an intention. The
  `assertUsableApiOrigin` build-time guard against a plain-http API origin
  (`:138-157`) is a good example of catching a config mistake at build rather
  than in production.
- **The deployed commit is exposed in the health payload.**
  `env.validation.ts:227-241` returns both `commit` and `commitShort`, and every
  release record since 2026-08-24 verifies the served commit against `main`.
  This closes what `deployment-runtime.md` still lists as an open gap — the
  context document is stale here in the *safe* direction.
- **Release records are genuinely evidential.**
  `docs/deployment/release-history/` holds nine dated records that document
  tree-hash equality between the CI-verified commit and the merge, the exact
  gates run, post-deployment verification, and — critically — failures and
  near-misses. The 2026-09-08 record's frank account of the manual migration is
  the single most useful artifact in this audit.
- **A Render service update is understood to be a deploy.**
  `docs/deployment/platform-access.md:85-114` documents the 2026-08-23 incident
  where changing `preDeployCommand` redeployed the *old* commit and republished
  ten withdrawn documents, and derives two rules from it. This is a subtle
  platform behaviour that most teams learn the same way and never write down.
- **Neon scale-to-zero is disabled and the consequence is documented.**
  `platform-access.md:203, 209-210` — `suspend_timeout_seconds: 0`, so cold
  starts are ruled out as an explanation for a slow first request. A useful
  negative result, recorded where a debugger will find it.
- **The transactional outbox is safe under multiple instances.**
  `render.yaml:159-163` — *"several is safe (claims use FOR UPDATE SKIP LOCKED)
  but none means events accumulate undelivered"*. The report scheduler uses the
  same discipline: `services/api/src/modules/reporting/schedule/report-scheduler.worker.ts`
  claims by advancing `nextRunAt` with the old value still in the `where`
  (asserted at `report-scheduler.worker.spec.ts:406-420`), which produces one
  winner. Both would survive the scale-out INF-11 defers.
- **Background workers are off unless explicitly enabled**
  (`render.yaml:171-186`), so a deploy that omits the flag changes nothing
  rather than quietly starting background work.
- **Tenant custom-domain verification fails closed and says why.**
  `tenant-domain.service.ts:426-431` refuses to mark a domain VERIFIED without
  evidence, with the reasoning that *"a verified domain is exactly the thing
  that becomes routable"*. Inert (INF-16), but inert in the safe direction.
- **Hostname spoofing has a bounded blast radius.**
  `services/api/src/modules/tenant-domains/request-hostname.ts:18-20` —
  *"Nothing here reads a tenant id from a header. The hostname is the only
  routing input, and it is resolved against the database — a caller that lies
  about the host can only ask about a workspace it could already ask about."*
  Verified against `workspace-resolution.service.ts`; the claim holds. (The
  *address* half of the same trust decision does not fare as well — INF-06.)
- **No secrets are committed.** `platform-access.md:14-17` records that
  `validate-framework.mjs` scans `docs/deployment/` for connection strings; a
  manual scan of `render.yaml`, `turbo.json`, `DEPLOYMENT_CHECKLIST.md` and the
  release history found no credential, and every secret in `render.yaml` is
  `sync: false`.
- **Release publishing fails closed.** `render.yaml:150-155` — leaving
  `RELEASE_PUBLISH_TOKEN` unset means `ReleasePublishTokenGuard` refuses, so an
  environment not meant to receive releases cannot be published to at all.
  `.github/workflows/release-app.yml:1-20` is `workflow_dispatch` only, with the
  reasoning stated: *"'the tests passed' is not the same statement as 'ship this
  build to customers'."*

---

## Not examined / limits

- **No live provider state was read.** Per the task constraint, no Vercel,
  Render, Neon or Stripe CLI or API call was made. Every statement about the
  live estate is sourced to a committed record and carries the date that record
  was written. The most recent such reads are 2026-08-31 (Render env vars),
  2026-09-08 and 2026-09-09 (`preDeployCommand` absent, deploy verification).
  **The following need the orchestrator's live pass:**
  1. Is `preDeployCommand` still absent? (INF-01)
  2. Neon `history_retention_seconds` and branch protection — still 21600 / off?
     (INF-02, INF-09)
  3. The Render service's **region**, **plan** and whether the **disk** is
     attached (INF-05, INF-10, INF-11)
  4. Is `FILE_STORAGE_DIR` set? (INF-05)
  5. Preview-scoped `NEXT_PUBLIC_API_BASE_URL` on the three Vercel projects, and
     whether the live `CORS_ALLOWED_ORIGINS` contains a `*.vercel.app` wildcard
     (INF-08)
  6. Whether Render's edge appends to or replaces an incoming
     `X-Forwarded-For` — one `curl` with a spoofed header against a rate-limited
     route settles INF-06
- **Vercel build configuration is not in the repository at all**, so the
  frontends' build command, install scope, Node version, function regions and
  environment values could not be assessed. This is itself finding INF-08 and a
  standing item in `environments.md`.
- **DNS is not inspectable from here.** The wildcard record for
  `*.dijipeople.com`, its registrar, and the certificate covering it were not
  examined. `isWildcardDnsReady()` reads an operator-set database flag, not a
  probe, so the repository cannot tell me whether the wildcard actually resolves.
- **The .NET gateway's deployment** (`gateway/`, on-premise, packaged via
  `npm run gateway:package`) was not assessed. It ships to customer sites on its
  own schedule and its backup/DR posture is a separate question.
- **No load testing or latency measurement was performed**, so INF-10's
  cross-region cost and INF-11's 10x analysis are reasoned from configuration,
  not measured.
- **`.github/workflows/ci.yml` was inspected only for deployment-relevant
  structure** (it deploys nothing; it is a merge gate of fifteen checks). Its
  correctness as a quality gate belongs to another specialist.

---

## Routed to other specialists

- **Storage specialist** — INF-05. `FILE_STORAGE_DIR` unset live means
  `StorageService` writes to a relative path on an ephemeral container
  filesystem; the release record confirms this has been true for every existing
  upload. Their conclusion about durability should be reconciled with this
  infrastructure evidence.
- **AuthZ / security specialist** — INF-06. Leftmost `X-Forwarded-For` read on a
  directly-reachable API defeats the login rate limiter. Also INF-17 (no
  `nosniff` on API file-download responses) and INF-04's
  `SECRET_ENCRYPTION_KEY` single-copy problem.
- **Billing specialist** — BUG-0903 (`STRIPE_MODE = test` live,
  `ACCEPTED_RISK`) and the fact that `STRIPE_*` appears nowhere in
  `render.yaml`, so the Stripe configuration is undeclared and unreviewable.
- **Performance specialist** — INF-10. If the API is not co-located with
  `aws-us-east-1`, every query carries a cross-continent round trip that
  multiplies with any N+1 pattern they find.
- **Database specialist** — ITEM-0120 (`schema.prisma` and the migrations
  disagree about several Timesheet constraint names and seven unique
  constraints), noted at
  `docs/deployment/release-history/2026-09-08-production-fe1cd3d.md:157-159`
  as the reason a migration had to be produced with `migrate diff` rather than
  `migrate dev`.
