# DEBT — Dead code, orphaned resources and technical debt

Auditor area: **DEAD CODE, ORPHANED RESOURCES AND TECHNICAL DEBT**. Prefix `DEBT`.
Repository: `D:/My Work/hrm-dijipeople/dijipeople-audit`, branch `agent/full-technical-audit`,
cut from `origin/develop` at `f55cf4b2`.

## Methodology note — automated tooling was unavailable

`npx knip`, `npx ts-prune` and `npx depcheck` were attempted (`node_modules` is a
junction back to the primary checkout, which has none of the three installed).
`npx --yes knip --version` was tried twice, both attempts hung past a 40s timeout
with no output — this sandbox has no outbound network access, so nothing could be
downloaded on demand. **No automated dead-code tool ran.** Every finding below is
manual: grep-based reverse-import scans (a Node script matching each candidate
file's basename against every quoted import specifier elsewhere in the same app),
cross-checked against `apps/web/lib/runtime/`, `apps/admin/lib/runtime/`, the
`services/api/src/modules/data/entity-registry.ts` generic entity API, and
`docs/knowledge/` for prior verification. Per the briefing's instruction to report
the tool's raw count alongside a verified count: there is no raw count to report;
treat every number below as the manually verified one, with its own evidence.

---

### DEBT-01 — 24 admin components (3,227 lines) have zero importers anywhere in `apps/admin`

- **Category:** Dead code / Frontend
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/admin/app/_components/crm/*`, `apps/admin/app/_components/ui/*`, `apps/admin/app/_components/*`
- **Evidence:**
  A Node script walked every `.tsx`/`.ts` file under `apps/admin/app/_components`
  (110 candidates, excluding `*.spec.tsx` and `index.*`) and searched all of
  `apps/admin` for any quoted import specifier ending in `/<basename>`. 24 files
  matched zero times. Each was then re-checked individually with an unscoped
  `grep -rn "<basename>" apps/admin` (no path anchoring at all, to catch dynamic
  string references, registry entries, or re-exports) — all 24 still returned
  zero hits outside their own file:
  ```
  apps/admin/app/_components/crm/data-table-header-menu.tsx
  apps/admin/app/_components/crm/filter-bar.tsx
  apps/admin/app/_components/crm/module-detail-layout.tsx
  apps/admin/app/_components/crm/module-list-layout.tsx
  apps/admin/app/_components/crm/owner-selector.tsx
  apps/admin/app/_components/crm/pagination-control.tsx
  apps/admin/app/_components/crm/query-params.ts
  apps/admin/app/_components/crm/search-bar.tsx
  apps/admin/app/_components/crm/sort-control.tsx
  apps/admin/app/_components/crm/status-selector.tsx
  apps/admin/app/_components/crm/sub-status-selector.tsx
  apps/admin/app/_components/invoice-list-table.tsx
  apps/admin/app/_components/lead-create-manager.tsx
  apps/admin/app/_components/lead-detail-manager.tsx
  apps/admin/app/_components/payment-form.tsx
  apps/admin/app/_components/payment-list-table.tsx
  apps/admin/app/_components/permission-assignment-panel.tsx
  apps/admin/app/_components/primary-owner-form.tsx
  apps/admin/app/_components/settings/settings-section.tsx
  apps/admin/app/_components/ui/detail-page.tsx
  apps/admin/app/_components/ui/feature-chip.tsx
  apps/admin/app/_components/ui/lifecycle-tabs.tsx
  apps/admin/app/_components/ui/metric-card.tsx
  apps/admin/app/_components/ui/section-card.tsx
  ```
  `wc -l` on the 24 files totals **3,227 lines**. `apps/admin/app/_components/crm/`
  has no `index.ts` barrel (`find ... -iname "index.ts*"` returned nothing), so
  there is no re-export path that would hide an importer from the scan.
  `apps/admin/app/_components/crm/data-table.tsx` — the file AGENTS.md and
  `docs/knowledge/modules/platform-admin.md:20-21` name as **the** canonical admin
  table (`ProDataTable`) — sits in the same directory as 11 of the 24 dead files
  and does not import any of them; it superseded them in place rather than
  replacing them.
  Last-touch dates span the full project timeline, not one abandoned commit:
  `crm/filter-bar.tsx` 2026-04-21, `ui/section-card.tsx` 2026-05-25,
  `lead-create-manager.tsx` 2026-08-05 — so this accumulated gradually as the
  runtime/`ProDataTable` pattern replaced an earlier hand-rolled "CRM" kit,
  file by file, without the losers being deleted.
- **Current behaviour:** All 24 files build, typecheck and ship in the `apps/admin`
  bundle (Next.js includes anything under `app/` in the route-file graph's module
  scan even when unused, though tree-shaking should drop true dead code from the
  client bundle — this was not verified against a build output, see Not examined).
  They sit beside their replacements with no marker distinguishing them.
- **Expected behaviour:** A superseded component is deleted in the same change
  that replaces it, per "Do not delete or rewrite existing documentation" being
  the opposite instinct for code — AGENTS.md principle 4, "no duplicate sources
  of truth," extends to component kits: `ProDataTable` is documented as the one
  admin table.
- **Risk:** Low — no runtime harm. The cost is entirely reader confusion: a future
  change (or an agent) can `grep` for "table" or "lead form" in `apps/admin`, land
  on `lead-create-manager.tsx` or `payment-form.tsx`, and extend a component
  nothing renders, believing it fixed a live screen.
- **Remediation:** Delete all 24 files after one more check: confirm with `git log
  --diff-filter=A` whether any was scaffolded for an unshipped screen still in
  flight (a session note or ADR would say so; none was found in `docs/` — see
  Evidence). If clean, delete in one commit; there is nothing to migrate since
  there are no callers to update.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### DEBT-02 — `apps/web/app/components/views/` (245 lines, 3 files) and `feedback/notice-types.ts` (24 lines) are wired to nothing

- **Category:** Dead code / Frontend
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `apps/web/app/components/views/`, `apps/web/app/components/feedback/notice-types.ts`
- **Evidence:**
  Same reverse-import scan against all of `apps/web` (121 candidates under
  `app/components`, 3 zero-importer hits). Manually re-verified:
  - `apps/web/app/components/views/types.ts` (69 lines) is imported only by its
    two siblings `formatters.ts` and `shared.tsx` in the same directory — nothing
    outside the directory imports any of the three. `grep -rn
    "DashboardNotification|PriorityItem|ProductivitySummary|ModuleViewSelectorBlock|formatDashboardDate"
    apps/web` (the directory's exported types/functions) returns zero hits outside
    the directory itself.
  - `apps/web/app/components/feedback/notice-types.ts:1-24` exports `NoticeTone`
    and `NoticeAction`. `grep -rn "NoticeTone|NoticeAction" apps/web` returns zero
    hits outside that one file.
  Last-touch dates: `views/shared.tsx` 2026-08-09, `views/formatters.ts`
  2026-05-14, `notice-types.ts` 2026-04-21 — `views/` is the more recent of the
  two and looks like an abandoned dashboard-widget variant (`shared.tsx` imports
  `ModuleViewSelector` from the live runtime and wraps it, but nothing imports the
  wrapper).
- **Current behaviour:** Ships in the bundle graph, renders nothing, is read by
  nobody.
- **Expected behaviour:** Deleted once its intended caller (apparently a dashboard
  widget variant) was abandoned.
- **Risk:** Same as DEBT-01 — reader confusion only, no runtime effect.
- **Remediation:** Delete `apps/web/app/components/views/` (all 3 files) and
  `apps/web/app/components/feedback/notice-types.ts`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### DEBT-03 — 18 environment variables exist only in `turbo.json`'s `globalEnv`, nowhere else in the repository

- **Category:** Config / Dead configuration
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `turbo.json`
- **Evidence:**
  Extracted all 144 entries in `turbo.json:4` `globalEnv` and diffed against every
  `process.env.X` reference across `services/api/src`, `apps/*`, `packages`,
  `scripts`, `gateway` (140 distinct names referenced that way). 70 globalEnv
  entries had no direct `process.env.X` hit; a second pass grepped each of those
  70 as a bare identifier (to catch the `env = process.env` default-parameter
  style used throughout `packages/config`, e.g. `packages/config/index.js:75`
  `function getAppStage(env = process.env)`), which cleared 52 of them as
  false negatives. The remaining 18 have **zero** occurrences anywhere in the
  tree by any pattern, and zero occurrences in `docs/environment-variables.md`
  or `render.yaml`:
  ```
  turbo.json:11   "ADMIN_JWT_ACCESS_TTL"
  turbo.json:13   "ADMIN_JWT_REFRESH_TTL"
  turbo.json:18   "AGENT_JWT_ACCESS_TTL"
  turbo.json:20   "AGENT_JWT_REFRESH_TTL"
  turbo.json:43   "AUTH_CLIENT_ID"
  turbo.json:53   "AUTH_WEB_ACCESS_TOKEN_TTL_SECONDS"
  turbo.json:59   "AUTH_WEB_REFRESH_TOKEN_TTL_SECONDS"
  turbo.json:93   "NEXT_PUBLIC_AUTH_CLIENT_ID"
  turbo.json:94   "NEXT_PUBLIC_DEFAULT_BRAND_NAME"
  turbo.json:95   "NEXT_PUBLIC_DEFAULT_BRAND_SHORT_NAME"
  turbo.json:97   "NEXT_PUBLIC_ENABLE_CLIENT_LOGS"
  turbo.json:99   "NEXT_PUBLIC_ENABLE_SECURE_AUTH"
  turbo.json:101  "NEXT_PUBLIC_ENVIRONMENT"
  turbo.json:109  "NEXT_PUBLIC_SUPPORT_EMAIL"
  turbo.json:112  "NEXT_PUBLIC_TENANT_SLUG"
  turbo.json:136  "TENANT_SLUG"
  turbo.json:145  "WEB_JWT_ACCESS_TTL"
  turbo.json:147  "WEB_JWT_REFRESH_TTL"
  ```
  Several look like they were meant to pair with variables that *are* live —
  `ADMIN_JWT_ACCESS_SECRET`/`ADMIN_JWT_REFRESH_SECRET` exist and are read
  (1 file each), but their `_TTL` counterparts were apparently never wired up and
  a hardcoded default is used instead; same shape for `AGENT_JWT_*_TTL` and
  `WEB_JWT_*_TTL`.
- **Current behaviour:** Turborepo treats each `globalEnv` entry as a cache-key
  input for every task. A change to any of these 18 (were anyone to ever set one)
  would invalidate every cached build/lint/test for no code reason, since nothing
  reads them.
- **Expected behaviour:** `globalEnv` lists only variables something actually
  reads.
- **Risk:** Purely a build-cache-efficiency and documentation-trust issue — a
  developer setting `AUTH_CLIENT_ID` expecting it to do something would be wrong,
  and would spend time debugging a no-op.
- **Remediation:** Remove the 18 entries from `turbo.json:4-148`, or (preferable
  for the `_TTL` pairs) finish wiring them into
  `services/api/src/common/config/auth.config.ts` / `packages/config` if the TTL
  should in fact be configurable — that decision belongs to whoever owns
  `auth.config.ts`, not to this audit.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### DEBT-04 — The reverse gap (vars read but unregistered) still exists at a larger count than the bug that already tracked it

- **Category:** Config / Documentation drift
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** KNOWN (BUG-0042 — "apps/web reads 21 environment variables unregistered in turbo globalEnv," `Status: VERIFIED`, `ArchitectDisposition: DONE`, 2026-08-17)
- **Component:** `turbo.json`, `apps/web`, `apps/agent-desktop`, `scripts/`
- **Evidence:**
  The same diff (see DEBT-03) found **66** `process.env.X` references with no
  `globalEnv` entry, considerably more than BUG-0042's 21 — but BUG-0042 scoped
  itself to `apps/web` only. Re-scoping this run to `apps/web` alone:
  `AUTH_NOTIFICATION_COOLDOWN_SECONDS`, `BOOTSTRAP_ADMIN_EMAIL`,
  `BOOTSTRAP_ADMIN_PASSWORD`, `ENABLE_DEMO_DATA_RESET`, `NEXT_DEV_BUNDLER`,
  `PLATFORM_SUPER_ADMIN_EMAIL`, `PLATFORM_SUPER_ADMIN_PASSWORD` — 7 apps/web-only
  vars still unregistered, down from 21, so BUG-0042's fix was real but partial
  (or new reads were added after the fix landed; `UpdatedAt` on the record is the
  same day it was opened, so no follow-up commit is recorded). The bulk of the 66
  (the `AGENT_*`, `SMOKE_*`, `SYNC_*`, `UAT_*`, `STRIPE_*` families) are read only
  by `apps/agent-desktop` (its own Electron build, not Turborepo-cached the same
  way) or by `scripts/` (not part of any `turbo` task), which is a defensible
  reason they were never added — BUG-0042 did not claim otherwise.
- **Current behaviour:** As BUG-0042 describes: Turborepo cannot invalidate a
  build cache keyed on a variable it does not know about.
  ] **Newly checked, not in BUG-0042:** `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
  and `STRIPE_API_VERSION` are read by `services/api` (billing module, a
  Turborepo-cached workspace) and are also absent from `globalEnv` — that trio
  is a cache-correctness gap `BUG-0042` did not cover, since it audited `apps/web`
  only.
- **Expected/Risk/Remediation:** As BUG-0042. Additionally register the three
  Stripe secrets and the 7 remaining `apps/web` vars in `turbo.json` `globalEnv`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### DEBT-05 — `apps/docs` is a fully dead workspace: builds on every push, ships nothing, deploys nowhere

- **Category:** Dead code / Tooling
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** KNOWN (`docs/knowledge/architecture/docs-application.md`, verified at `78072d2`, 2026-08-16 — no bug/backlog record exists because, per that note, "there is no product behaviour to be wrong")
- **Component:** `apps/docs`
- **Evidence:**
  Re-verified independently rather than trusting the note: `apps/docs` is 4
  content files (`app/layout.tsx`, `app/page.tsx`, `app/globals.css`,
  `app/page.module.css`) plus config. `apps/docs/app/layout.tsx` still carries
  `<title>Create Next App</title>` boilerplate. `grep -n "docs" package.json
  turbo.json` shows no `docs`-specific script, no `render.yaml` entry, no
  `vercel.json`, no Dockerfile anywhere in the tree. `git log -3 --oneline --
  apps/docs` shows its last substantive commit as "website updates" /
  "Changes" with the most recent touch being a dependency-advisory bump
  (2026-08-17, `151ce14f`), not product work. It is the sole consumer of
  `packages/ui` (`apps/docs/app/page.tsx:2`) — deleting one orphans the other.
  `.github/workflows/ci.yml`'s `lint` job names `apps/web`, `apps/admin`,
  `apps/landing` explicitly; `apps/docs` is absent from it but is still built and
  typechecked via the Turborepo-wide `build`/`typecheck` jobs on every push.
- **Current behaviour:** A `create-turbo` starter compiles on every commit to
  every branch and consumes `--concurrency=1` build time for a page nobody
  serves.
- **Expected behaviour:** Either deleted (along with `packages/ui`, per the
  note's own conclusion that the two decisions are linked) or given a real
  purpose, decided by an owner — no ADR or backlog item currently states which.
- **Risk:** Purely CI-minutes and repo-navigation cost; no product risk.
- **Remediation:** Owner decision needed (not this audit's call, per the source
  note): delete `apps/docs` and `packages/ui` together, or repurpose. If deleted,
  remove the workspace from any implicit Turborepo workspace glob (none explicit
  found) and from `.github/workflows/ci.yml`'s workspace matrix if present.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** LATER

---

### DEBT-06 — The SLA module is dead end-to-end: a guarded, permissioned endpoint with zero callers in any frontend

- **Category:** Dead code / API surface
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** KNOWN, and extended — `docs/knowledge/discovery/pending-verification.md:19-33` ("Does any UI offer SLA configuration a tenant cannot save?") explicitly says "**Attempted.** Prisma call-site analysis... **Not attempted in the frontends**" and names this exact check as open work. This audit performed it.
- **Component:** `services/api/src/modules/sla`
- **Evidence:**
  `services/api/src/modules/sla/sla.controller.ts:13-26` — the entire module is
  one route:
  ```ts
  @Controller('sla')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  export class SlaController {
    @Get('trackings')
    @Permissions('sla.read')
    @RequirePermission(ENTITY_KEYS.SETTINGS, 'read')
    listTrackings(...)
  ```
  `grep -rn "[\"'\`/]sla[/'\"\`]" apps/web apps/admin apps/landing
  apps/agent-desktop` — zero hits. No route handler under any app's `app/api/`
  proxies to `/sla`, no `server-api` call references it, no runtime module spec
  in `apps/web/lib/runtime/modules/` or `apps/admin/lib/runtime/` declares an
  `sla` entity. `docs/knowledge/discovery/known-gaps.md:55-63` independently
  confirms the backing models are half-built (`SlaRule` read but never written;
  `SlaPolicy`/`SlaMilestone`/`SlaEscalationLevel` untouched by any module or
  seed) — so even the one live endpoint (`SlaTracking`) reads data nothing in
  the product creates.
- **Current behaviour:** 155 lines of controller+service (`sla.controller.ts` 27,
  `sla.module.ts` 12, `sla.service.ts` 116) exist, pass CI, are reachable over
  HTTP by anyone holding `sla.read` + `SETTINGS:read`, and return rows for a
  feature no screen surfaces.
- **Expected behaviour:** Either a settings/reporting screen consumes
  `GET /sla/trackings`, or the module is removed until one is built.
- **Risk:** None security-relevant (correctly guarded); pure carrying cost, and
  the specific risk the source note flagged (a UI offering unsavable SLA config)
  was **not found** — there is no SLA UI at all, so that particular risk does
  not materialize today.
- **Remediation:** Either build the consuming screen (feature work, not this
  audit's call) or delete `services/api/src/modules/sla/` and its module
  registration. Resolve `pending-verification.md`'s open question either way —
  it can now be marked answered.
- **Difficulty:** LOW (removal) / MEDIUM (building the feature)
- **Regression risk:** LOW
- **Fix now:** LATER

---

### DEBT-07 — `timesheet-jobs` controller (list + manual run) has no frontend caller

- **Category:** Dead code / API surface
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW (adjacent to, but distinct from, BUG-2045 which is about audit-log noise from the same background jobs, not this control surface)
- **Component:** `services/api/src/modules/timesheets/timesheet-jobs.controller.ts`
- **Evidence:**
  ```ts
  // timesheet-jobs.controller.ts:17-31
  @Controller('timesheet-jobs')
  @UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
  @RequireEntitlement(TENANT_FEATURE_KEYS.TIMESHEETS)
  export class TimesheetJobsController {
    @Get()
    @Permissions('timesheets.settings.read')
    list(...)
    @Post('run')
    @Permissions('timesheets.jobs.run')
    run(...)
  ```
  `grep -rn "timesheet-jobs|timesheetJobs" apps/web apps/admin apps/landing
  apps/agent-desktop` — zero hits. The only UI reference to timesheet background
  jobs is the unrelated `timesheets.auditBackgroundJobs` toggle at
  `apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts:1349`
  (subject of BUG-2045, which is about whether job-completion rows should appear
  in the audit trail, not about viewing/running jobs). No settings adapter or
  runtime module spec names `timesheet-jobs`.
- **Current behaviour:** A tenant-scoped, entitlement- and permission-gated
  "manually trigger a timesheet background job" endpoint exists and is callable
  but unreachable from any product surface.
- **Expected behaviour:** Either a timesheet-ops screen in Settings exposes it,
  or it is removed.
- **Risk:** Low — correctly guarded, and a manual-trigger endpoint being
  unreachable is a missing-feature problem, not a security one. Worth noting for
  whoever owns timesheets: this may be the "escape hatch" operators need when a
  background job silently fails, and its absence from the UI could itself be a
  product gap rather than dead code — flagging as REQUIRES REVIEW rather than
  recommending deletion.
- **Remediation:** Product decision: wire a "Timesheet jobs" panel into Settings,
  or delete the controller/service if the ops team drives this by other means
  (e.g., direct API calls, which would make the guard rails here still worth
  keeping).
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO — REQUIRES REVIEW, not a clear removal candidate; see Risk.

---

### DEBT-08 — Two recruitment controllers never adopted the RBAC-matrix half of the dual permission system

- **Category:** Legacy compatibility / Consistency
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `services/api/src/modules/recruitment/job-openings.controller.ts`, `services/api/src/modules/recruitment/recruitment-pipelines.controller.ts`
- **Evidence:**
  Every `@Permissions(...)` decorator in the codebase was checked for a paired
  `@RequirePermission(...)` in the same controller file (947 `@Permissions(`
  call sites vs 883 `@RequirePermission(` call sites, repo-wide). Two controller
  files use `@Permissions` exclusively, with **zero** `@RequirePermission`
  anywhere in the file:
  ```
  job-openings.controller.ts:36        @Permissions('recruitment.read')
  job-openings.controller.ts:49        @Permissions('recruitment.read')
  job-openings.controller.ts:65        @Permissions('recruitment.create')
  job-openings.controller.ts:78        @Permissions('recruitment.update')
  recruitment-pipelines.controller.ts:33  @Permissions('recruitment.read')
  recruitment-pipelines.controller.ts:43  @Permissions('recruitment.read')
  recruitment-pipelines.controller.ts:59  @Permissions('recruitment.update')
  recruitment-pipelines.controller.ts:72  @Permissions('recruitment.update')
  ```
  Traced the effect through `services/api/src/common/security/permission-evaluation.ts:55-60`:
  `hasRbacPrivilege = requirement.rbac.length === 0 || ...` — when no
  `@RequirePermission` is declared, `requirement.rbac` is the empty array and
  this clause short-circuits to `true`. **This is not an authorization bypass**:
  the legacy `@Permissions` check still runs and still gates the route (traced
  end to end through `PermissionsGuard.canActivate` → `satisfiesPermissionRequirement`).
  The cost is purely architectural: these 2 controllers get none of the RBAC
  matrix's row-level access-level machinery (`SecurityAccessLevel`/`ENTITY_KEYS.RECRUITMENT`
  is never checked for these 8 routes), so a role granted matrix-only recruitment
  access (no legacy key) is silently denied here while working everywhere else,
  and the matrix privilege catalog has no entry that actually governs these 8
  endpoints despite the matrix nominally being the newer, intended system.
- **Current behaviour:** Legacy-only gating on exactly these 8 routes; every
  other permissioned route in the 68-module API pairs both decorators.
- **Expected behaviour:** Per AGENTS.md, "Both decorators are normally required."
  These 2 files are the sole exceptions.
- **Risk:** Access-control inconsistency, not a hole: a tenant admin who
  configures a custom role purely through the RBAC matrix (the documented,
  current-generation permission model) and expects it to control recruitment
  screens will find job-openings/pipelines endpoints ungoverned by that
  configuration — the role would need a legacy key too, with no UI signal that
  this one module is different. **Flagging for the AuthZ/RBAC specialist** to
  independently assess whether this constitutes a functional authorization gap
  from the tenant admin's perspective (this audit's remit is the inconsistency
  itself, not the full security implication).
- **Remediation:** Add `@RequirePermission(ENTITY_KEYS.RECRUITMENT, 'read'|'create'|'update')`
  to the 8 routes, matching the pattern every other recruitment controller
  (`candidates.controller.ts`, etc. — not independently verified here) already
  follows.
- **Difficulty:** LOW
- **Regression risk:** MEDIUM (changing a live guard's evaluated set needs a
  regression pass across every role that currently reaches these routes)
- **Fix now:** LATER

---

### DEBT-09 — The dual permission system is not being phased out; it is near-parity and both halves are actively maintained

- **Category:** Legacy compatibility
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW (quantification; the existence of the two systems is documented in AGENTS.md itself, not a discovery)
- **Component:** `services/api/src/common/constants/permissions.ts` (2,594 lines), `services/api/src/common/constants/rbac-matrix.ts` (1,981 lines), and every guarded controller
- **Evidence:**
  `@Permissions(` : 947 call sites. `@RequirePermission(` : 883 call sites, across
  the same 68 modules. The two files backing them are both in the top-30 by line
  count (`permissions.ts` 2,594 lines, `rbac-matrix.ts` 1,981 lines). Only 2
  controllers (DEBT-08) diverge from the paired pattern. There is no
  `@deprecated` marker on either decorator, no comment in
  `common/decorators/permissions.decorator.ts` or `common/guards/permissions.guard.ts`
  suggesting a migration direction, and both files show commit activity within
  the same recent window (not independently diffed for exact dates — see Not
  examined). This is a maintained, dual-write system, not a legacy tail with a
  shrinking user: every new permissioned route pays the cost of updating two
  catalogs (`permissions.ts` legacy keys and `rbac-matrix.ts` `ENTITY_KEYS`
  privileges) and two decorators, in perpetuity, by design.
- **Current behaviour:** As documented in AGENTS.md — both systems run on every
  guarded request.
- **Expected behaviour:** N/A — this is a recorded architectural decision, not a
  defect. Recorded here because the audit brief asked whether one system is
  being phased out: **it is not**, as of this commit.
- **Risk:** None additional beyond DEBT-08's specific gap. The standing cost is
  ~4,575 combined lines of permission catalog plus the discipline of keeping
  1,830 decorator call sites paired correctly — a categorically larger
  legacy-compatibility line-item than anything else found in this audit.
- **Remediation:** Not this audit's call — either commit to the dual system
  long-term (document why in an ADR, since none currently exists explaining the
  two-system design beyond the guard's inline comment) or scope a consolidation
  plan. Flagging for Architecture.
- **Difficulty:** N/A
- **Regression risk:** N/A
- **Fix now:** NO

---

### DEBT-10 — Tenant-aware date/currency formatting is reimplemented locally in at least 21 files instead of using the one documented formatting entry point

- **Category:** Technical debt / Duplicated logic
- **Severity:** MEDIUM
- **Confidence:** CONFIRMED
- **Known:** KNOWN as a recurring bug *symptom* (BUG-1556, BUG-2010, BUG-2626 — three separate incidents of ad hoc formatting producing wrong output), NEW as a consolidated debt finding — no record catalogs the duplication itself as the root cause.
- **Component:** `apps/web/lib/formatting-context.ts` (canonical), `apps/admin/lib/formatters.ts` (canonical), and 21 call-site files
- **Evidence:**
  `grep -rnE "^export function format(Date|Currency|Time|Money|Number)\b|^function format(Date|Currency|Time|Money|Number)\b"` across `apps/web`, `apps/admin`:
  16 files in `apps/web` locally declare their own `formatDate`/`formatTime`/`formatMoney`
  instead of importing `formatDate`/`formatTime`/`formatMoney`/`formatNumber` from
  `apps/web/lib/formatting-context.ts:40-90` (19 local declarations total,
  including 2 in one file — `payroll-payments-workspace.tsx:525,529` and
  `billing-settings-client.tsx:1027,1036`). 5 files in `apps/admin` locally
  declare `formatDate`/`formatCurrency`/`formatMoney` instead of importing from
  `apps/admin/lib/formatters.ts:5-58` (7 local declarations, e.g.
  `invoices/[invoiceId]/page.tsx:162,167` and `payment-list-table.tsx:24,135`).
  BUG-2626's own text confirms the canonical status: *"`formatNumber` /
  `formatMoney` from `apps/web/lib/formatting-context.ts`... is documented as the
  only normal formatting entry point"* — and separately, BUG-2010 (unformatted
  ISO strings on the dashboard) and BUG-1556 (Unix-epoch rendering for empty
  contract dates) are each traceable to a bespoke date-formatting path that
  skipped the shared module. This audit did not re-verify each of the 21 local
  implementations for correctness (that would require driving each screen); the
  finding is the duplication itself, which is the structural reason the same bug
  class recurs.
- **Current behaviour:** 21+ files each own a private, non-tenant-aware (or
  partially tenant-aware) formatting implementation; `apps/admin/lib/formatters.ts`
  itself hardcodes `"en-US"` (`apps/admin/lib/formatters.ts:3,16`) rather than
  reading a tenant locale, so even the "canonical" admin path is narrower than
  web's.
- **Expected behaviour:** One formatting entry point per app, imported
  everywhere a date/money value reaches the DOM.
- **Risk:** Each local reimplementation is a candidate for the same locale/epoch/
  raw-ISO bug class already hit three times in production (BUG-1556, BUG-2010,
  BUG-2626). Concretely: a tenant with a non-US locale or non-UTC timezone
  setting can see inconsistent date/currency formatting depending on which
  screen they're on, since only screens importing the shared module respect that
  setting.
  Flagging for QA/FE to spot-check a sample of the 21 for live incorrect output;
  this audit stopped at confirming the duplication exists and is widespread.
- **Remediation:** Replace each local declaration with an import from the
  canonical module; add an ESLint rule or a `wiring-invariants`-style test
  banning a local function named `formatDate`/`formatMoney`/`formatCurrency` in
  `apps/web/app` or `apps/admin/app` outside the two canonical files, so the
  pattern cannot silently recur a fourth time.
- **Difficulty:** MEDIUM (21+ call sites, each needs its signature reconciled
  with the shared function's)
- **Regression risk:** MEDIUM (formatting output could visibly change per site)
- **Fix now:** NO

---

### DEBT-11 — 29 components render a raw `<table>` instead of the shared data-table kit

- **Category:** Technical debt / Frontend consistency
- **Severity:** LOW
- **Confidence:** LIKELY (pattern confirmed; not every instance individually judged as a genuine list screen — see caveat)
- **Known:** NEW (the *rule* — "a hand-rolled table... is a review failure" — is recorded in `docs/knowledge/architecture/runtime-module-system.md:33` and `docs/knowledge/modules/platform-admin.md:23`, but no record counts violations)
- **Component:** 20 files in `apps/web/app/**`, 9 files in `apps/admin/app/**`
- **Evidence:**
  `grep -rl "<table" apps/web/app --include="*.tsx" | grep -v
  "app/components/data-table/"` → 20 files. Same for admin excluding
  `_components/crm/data-table.tsx` → 9 files. Spot-checked 4 for whether they are
  genuine list screens (state, filtering, many rows) rather than small static
  layout tables that a raw `<table>` is reasonable for:
  - `attendance/exceptions/_components/attendance-exceptions-table.tsx` (237
    lines) — `useState` for busy/error state, status filtering, row actions:
    genuine list screen.
  - `leaves/_components/leave-requests-table.tsx` (130 lines) — same shape.
  - `apps/admin/app/(internal)/operations/provisioning/provisioning-queue.tsx`
    (317 lines) — client-side `.sort()`/`.filter()` over rows: genuine list
    screen.
  - `apps/admin/app/_components/plan-price-manager.tsx` (1,575 lines) — full
    CRUD workspace with 5+ `useState` hooks: genuine list/edit screen.
  All 4 spot-checked are the kind of screen AGENTS.md says must use
  `ModuleDataTable`/`ProDataTable`. The remaining 25 were not individually
  read — some raw `<table>` uses in a 29-file set are plausibly legitimate
  (a fixed 3-row comparison table needs no data-table machinery), so this is
  rated LIKELY rather than CONFIRMED for the full count.
- **Current behaviour:** 29 files maintain their own sort/filter/pagination (or
  lack thereof), keyboard navigation, and empty-state handling instead of
  inheriting it from the shared kit — meaning any accessibility or
  responsiveness fix made to `ModuleDataTable`/`ProDataTable` does not reach
  these 29 screens.
- **Expected behaviour:** List screens use the shared table component.
- **Risk:** Inconsistent accessibility/keyboard behavior and responsive layout
  across 29 screens (AGENTS.md requires both, enforced centrally only in the
  shared components) — a plausible source of the kind of finding an
  accessibility-focused specialist would independently flag; noted for
  cross-reference.
- **Remediation:** Triage the 29 (this list, per file, is the triage input):
  migrate genuine list screens to `ModuleDataTable`/`ProDataTable`; leave fixed
  small tables as-is with a comment explaining why they're exempt, so the count
  doesn't get re-flagged blind next audit.
- **Difficulty:** MEDIUM (per-screen migration, 29 call sites)
- **Regression risk:** MEDIUM
- **Fix now:** NO

---

### DEBT-12 — Root `scripts/`: 2 zero-reference files, 4 more wired only to their own usage comment

- **Category:** Tooling / Dead code
- **Severity:** LOW
- **Confidence:** CONFIRMED
- **Known:** NEW
- **Component:** `scripts/`
- **Evidence:**
  80 top-level files in `scripts/`. Cross-referenced each basename against every
  `package.json` (root + all workspaces), `.github/workflows/*.yml`, and every
  other file in `scripts/`/`docs/` for a call or mention. 17 candidates had zero
  hits in root `package.json`/workflows; broadening the search to all
  `package.json` files and all script-to-script references cleared 15 of them
  (e.g. `next-with-port.mjs` is wired via `apps/docs/package.json`,
  `free-port.mjs` via `services/api/package.json:19`). Two remain **fully
  unreferenced anywhere**, not even in another script or doc:
  ```
  scripts/fold-incoming-regressions.mjs   — last commit 2026-08-30 (active)
  scripts/platform-final-e2e.mjs          — last commit 2026-08-11 (223 lines)
  ```
  `fold-incoming-regressions.mjs:1-8` documents itself as a coordinator-run tool
  ("Ten parallel agents cannot all append to index.md... the coordinator folds
  them in here") — a manually invoked ops script by design, not dead code; its
  recent commit confirms active use. `platform-final-e2e.mjs` has no such
  self-documentation, is the oldest of the e2e/smoke family
  (`admin-runtime-smoke.mjs`, `prod-regression.mjs`, `smoke-deployment.mjs`,
  `stripe-test-mode-smoke.mjs`, `stripe-webhook-smoke.mjs`), and its purpose
  ("drive landing+admin+api against localhost, `codex-final-` run id") looks
  superseded by the newer, better-documented `prod-regression.mjs` (2026-08-23,
  explicitly contrasts itself with `smoke-deployment.mjs` and is read-only
  against production).
  Four further scripts are wired to nothing except a `Usage:` comment inside
  their own file header — confirmed by re-grepping each basename with the
  self-reference excluded:
  ```
  scripts/hydration-probe.js   — last commit 2026-08-10
  scripts/link-audit.js        — last commit 2026-08-10
  scripts/uat-admin.js         — last commit 2026-08-10
  scripts/prod-regression.mjs  — last commit 2026-08-23
  ```
  All four are well-commented, purpose-built diagnostic drivers (Playwright-based
  UAT/hydration/link checkers) with recent commits — they read as intentionally
  manual (agent- or human-run on demand), not abandoned; grouped here because
  the audit brief specifically asked to distinguish "wired into
  package.json/CI" from "one-off leftovers," and by that definition all 6 in
  this finding are one-off/manual, whatever their health otherwise.
- **Current behaviour:** None of these 6 run in CI or via any `npm run` command;
  they only execute if someone (or an agent) types the `node scripts/x.js`
  invocation from the header comment.
- **Expected behaviour:** N/A for the 4 self-documented manual tools — that's a
  legitimate category. `platform-final-e2e.mjs` specifically looks like it should
  either be deleted (superseded) or given a `package.json` script entry.
- **Risk:** None — no runtime exposure, purely a discoverability question.
- **Remediation:** Delete `platform-final-e2e.mjs` if `prod-regression.mjs`
  covers its scenarios (needs a side-by-side read this audit didn't do — REQUIRES
  REVIEW, not a confirmed duplicate). Leave the other 5 as-is; they are
  intentionally manual tools, which is a legitimate pattern this repository uses
  throughout `scripts/`.
- **Difficulty:** LOW
- **Regression risk:** LOW
- **Fix now:** NO

---

### DEBT-13 — `tools/zkteco-poc` is scoped, wired, and not dead — verified, reported as a negative result

- **Category:** Dead code (candidate, ruled out)
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW (verification)
- **Component:** `tools/zkteco-poc`
- **Evidence:** The briefing flagged this as worth verifying. 8 root `package.json`
  scripts (`zkteco:install`, `zkteco:worker:publish`, `zkteco:test`,
  `zkteco:device-info`, `zkteco:users`, `zkteco:attendance`, `zkteco:capabilities`,
  `zkteco:poc`, lines 126-133) call into it, and `.github/workflows/release-app.yml:30`
  lists `zkteco-diagnostic` as a release target. `tools/zkteco-poc/README.md:1-12`
  explicitly scopes it as a **deliberately non-production** read-only diagnostic
  ("no Prisma model, no scheduler, no gateway, no reconciliation, no writes"),
  distinct from the real integration in `services/api/src/modules/attendance-integrations/connectors/zkteco-legacy.connector.ts`.
  Last commit 2026-08-14.
- **Current behaviour:** Maintained, wired, and honest about its own scope.
- **Verdict:** Not dead code. Moved to Healthy.
- **Fix now:** N/A

---

### DEBT-14 — Technical-debt register: top 20 files by line count; 43 services exceed 1,000 lines

- **Category:** Technical-debt register
- **Severity:** INFORMATIONAL
- **Confidence:** CONFIRMED
- **Known:** NEW (quantification)
- **Component:** repo-wide
- **Evidence:**
  `find services/api/src apps/web apps/admin apps/landing packages -type f \(
  -name "*.ts" -o -name "*.tsx" \) -not -name "*.spec.ts" | xargs wc -l | sort -rn`,
  top 20 (excluding `.spec.ts`/`.test.ts`):
  ```
   7,512  apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts
   6,492  services/api/src/modules/contracts/contracts.service.ts
   5,950  services/api/src/modules/customization/customization.service.ts
   5,437  services/api/src/modules/super-admin/super-admin.service.ts
   5,170  services/api/src/modules/attendance/attendance.service.ts
   4,915  apps/admin/lib/runtime/platform-module-registry.ts
   4,038  services/api/src/modules/employees/employees.service.ts
   3,257  services/api/src/modules/payroll/payroll-run.service.ts
   3,120  apps/admin/app/_components/runtime/runtime-record-page.tsx
   3,055  apps/web/lib/runtime/modules/standard-module-specs.ts
   3,006  apps/web/app/components/runtime/module-widget-renderer.tsx
   2,936  services/api/src/modules/payroll/payroll.service.ts
   2,873  services/api/src/modules/dashboard/dashboard.service.ts
   2,863  services/api/src/modules/tenant-settings/enterprise-configuration.service.ts
   2,814  services/api/src/modules/recruitment/recruitment.service.ts
   2,783  services/api/src/modules/leave/leave.service.ts
   2,777  apps/web/app/(authenticated)/settings/_lib/settings-page-config.ts
   2,714  services/api/src/modules/timesheets/timesheets.service.ts
   2,701  apps/web/lib/runtime/modules/employee-metadata.adapter.ts
   2,660  services/api/src/modules/super-admin/platform-lifecycle.service.ts
  ```
  Note on the #1 entry: `settings-adapter-registry.ts` was opened and confirmed
  to be declarative registry data (adapter config objects), not procedural logic
  — large by volume of configuration, not by complexity per line; same caveat
  likely applies to `platform-module-registry.ts` and `standard-module-specs.ts`
  (not individually opened, but named identically to the registry pattern).
  `contracts.service.ts`, `customization.service.ts`, `super-admin.service.ts`
  and `attendance.service.ts` are procedural services and the more meaningful
  entries for a refactor target list.
  Full `*.service.ts` sweep: **43 services exceed 1,000 lines**
  (`find services/api/src -name "*.service.ts" -not -name "*.spec.ts" | xargs
  wc -l | awk '$1>1000'`), out of 221 services repo-wide (per the briefing's
  scale figures) — roughly 1 in 5.
- **Cross-reference:** ARCH-08 (`docs/engineering/audits/.../raw/ARCH.md:496-511`)
  measured 152 of 310 Prisma models (49%) queried from more than one module,
  3,498 total call sites — the coupling counterpart to this size register. A
  large service file and a widely-queried model tend to be the same modules
  (`attendance`, `payroll`, `super-admin`, `tenant-settings` appear in both this
  list and are plausible top entries in ARCH-08's per-model breakdown, not
  independently cross-tabulated here).
- **Risk:** Files over ~2,500 lines raise onboarding cost and merge-conflict
  surface; not independently harmful, but the largest procedural ones
  (`contracts.service.ts` 6,492, `customization.service.ts` 5,950) are credible
  candidates for splitting along the sub-domain boundaries they likely already
  have internally (not verified — would need a per-file read to propose a split).
- **Remediation:** No action recommended without a per-service read to find a
  natural seam; flagging for whoever owns `contracts` and `customization` next.
- **Difficulty:** HIGH (large-service decomposition)
- **Regression risk:** HIGH
- **Fix now:** NO

---

## Healthy — verified good

- **No large commented-out code blocks anywhere in the scanned tree.** A
  heuristic scan (8+ consecutive comment lines containing code-like tokens —
  `;{}()=<>` — outside a leading-capital-letter prose comment) across
  `services/api/src`, `apps/web`, `apps/admin`, `apps/landing` found **zero**
  matches. Consistent with AGENTS.md's documented house style of substantial
  *explanatory* comments rather than disabled code.
- **`TODO`/`FIXME`/`HACK`/`XXX` markers are effectively absent as workflow
  markers.** `grep -rE "\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b"` across the same
  tree returns 5 hits total, and every one is either a test fixture string
  (`legal/draft-self-declaration.spec.ts:150`, testing detection of the literal
  word "TODO" in user-submitted text), a test description name
  (`admin/lib/monitoring-overview.spec.ts:149`), a UI placeholder string
  (`job-opening-form.tsx:229`, `placeholder="XXX-001"`), or a variable/test name
  unrelated to a debt marker (`payroll-operations.service.ts:147`,
  `referral.spec.ts:95`). Not one is a real deferred-work marker in production
  code.
- **`apps/landing` component directories are clean.** The same reverse-import
  scan applied to `apps/landing/app/_components` (9 files) and
  `apps/landing/app/legal/_components` (1 file) found zero zero-importer
  candidates.
- **`tools/zkteco-poc` is correctly scoped and wired** — see DEBT-13. Not dead
  code; a deliberately isolated diagnostic with its own honest scope statement.
- **The Stripe webhook at `billing/stripe` (distinct from ARCH-13's dead
  `super-admin/billing/stripe/webhook`) has zero frontend callers, correctly —
  it is called by Stripe itself, an external service, not by any of this
  repository's own clients.** `services/api/src/modules/billing/controllers/stripe-webhook.controller.ts:15`
  confirms the route; this is the "public API someone external may call" case
  the briefing asked to distinguish from genuine dead code, and it was checked
  specifically because the zero-frontend-caller heuristic would otherwise have
  flagged it.
- **The dual permission system is applied consistently** outside the 2
  controllers in DEBT-08 — 105 of 107 checked controller files pair
  `@Permissions` with `@RequirePermission` as AGENTS.md specifies.
- **No `@Controller` route in `services/api/src/modules` uses a `legacy`/`v1`/
  `v2`/`old`/`deprecated` prefix or path segment** — `grep -rniE
  "@Controller\(['\"].*(legacy|deprecated|v1|v2|old)"` and a follow-up
  case-insensitive `legacy` sweep of every `*.controller.ts` both returned zero
  hits. The one dead duplicate endpoint that does exist (ARCH-13, the second
  Stripe webhook) was not surfaced by naming convention — it required tracing
  behavior, which is Architecture's finding, cross-referenced here rather than
  re-derived.

## Not examined / limits

- **No automated dead-code tool ran** (knip/ts-prune/depcheck) — no outbound
  network access in this sandbox. Every finding above is a manual reverse-grep,
  which has a specific blind spot: dynamic `import()` calls, and any component
  registered by string in a registry this audit didn't specifically check, would
  not be caught as "used" by the basename-matching script. The `apps/web/lib/runtime/`
  and `apps/admin/lib/runtime/` registries were spot-checked for the specific
  candidates in DEBT-01/DEBT-02/DEBT-06/DEBT-07 (grepped for their names) but not
  exhaustively cross-referenced against every export in the repository.
- **No production bundle was built or analyzed.** Whether the 24 admin files in
  DEBT-01 and the 3 web files in DEBT-02 are actually tree-shaken out of the
  shipped JS, or merely unreached-but-bundled, was not verified — `npm run
  build` was explicitly out of scope for this audit.
- **The remaining ~19 of 29 raw-`<table>` files in DEBT-11 were not individually
  read** — only 4 were spot-checked as genuine list screens. The other files
  need per-file judgment before treating the full 29 as violations.
- **`platform-final-e2e.mjs` vs `prod-regression.mjs` overlap (DEBT-12) was
  assessed by reading file headers only, not full content diffing** — a side-by-
  side read would confirm or refute true duplication.
- **Backend controllers beyond the ones individually named** (SLA,
  timesheet-jobs, the two recruitment controllers) were not exhaustively swept
  for zero-frontend-caller status the way the `scripts/` and admin-component
  inventories were — the 105-prefix `@Controller` route list was checked in
  bulk (word-boundary grep per prefix) but only the zero-hit results were
  individually traced; a controller with 1-2 incidental matches (e.g. a false
  positive from an unrelated word containing the same substring) was not
  re-verified beyond the handful cited above (`sla`, `employees/:employeeId`
  false-positive check).
- **Env-var usage inside `.env.example` files, CI secrets, and Render dashboard
  configuration was not cross-checked** beyond `render.yaml` and
  `docs/environment-variables.md` — a var could be legitimately set only in
  Render's UI (not `render.yaml`) and this audit would not see that.
- **`git blame`/authorship analysis was not performed** on any finding — dates
  cited are last-commit-touching-the-file, not necessarily when the code became
  unreferenced (a file's last commit can post-date the commit that removed its
  last caller).
- **Duplicate-utility-function search (DEBT-10) covered only formatDate/
  formatCurrency/formatTime/formatMoney/formatNumber** as named exports — other
  duplicated helpers (validation, string manipulation, etc.) were not
  systematically searched given the time budget; this is a sampled finding, not
  an exhaustive one.
