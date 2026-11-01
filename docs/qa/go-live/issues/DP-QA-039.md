# DP-QA-039 — `seed:config` overwrites tenant-chosen notification settings on every run

| Field | Value |
|---|---|
| Category | Deployment / configuration integrity |
| Severity / Priority | Medium / **P2** (a tenant's deliberate setting is reverted at every deploy; production runs `seed:config` on release) |
| Status | Open |
| Found | RUN-006 (`17d0dcaf`), tests DPQA-SEED-005, DPQA-SEED-006, DPQA-SEED-010, DPQA-SEED-011 |

**Reproduction (throwaway DB).**
1. Tenant B: set `TenantSetting notifications.emailEnabled = false` (what an administrator choosing "no e-mail" stores). Run `npm run seed:config`. Value afterwards: **`true`**, `updatedAt` bumped.
2. Tenant B: set the tenant-level `NotificationPreference` for `AUTH_PASSWORD_RESET` (channel EMAIL) to `enabled = false`. Run `seed:config`. Afterwards: **`true`**.
Even with the value already `true`, the row is rewritten on every run (`updatedAt` changes), which is what SEED-005/006 detect.

**Cause (read from source).** `seedTenantNotificationSettings` upserts `value: true` in both `create` and `update`; `seedTenantNotificationPreferences` upserts `enabled: true` in both branches for each `AUTH_EVENT_CODES` entry. Compare the fix in `17d0dcaf` for e-mail providers, which correctly creates only when nothing exists.

**Impact.** A tenant that turned e-mail off (or turned off one event) has it switched back on after the next release. The owner's regression requirement "repeated seeding must not reset settings or alter legitimate tenant-specific configuration" is not met.

**Good news recorded alongside.** E-mail provider rows, branding, features, roles, role permissions and privileges are preserved (DPQA-SEED-001..DPQA-SEED-004, SEED-007, SEED-009 pass; no duplicates).

**Fix direction.** `create` only (as for providers), or `update: {}`.

| Run | Result |
|---|---|
| RUN-006 (`17d0dcaf`) | **OPEN** — SEED-005/006/010/011 fail |
