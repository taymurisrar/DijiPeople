# Desktop Agent Architecture (`apps/agent-desktop`)

> **Last Verified:** 2026-08-16
> **Verified Against SHA:** `78072d2`
> **Source Paths:** `apps/agent-desktop/src/main/*.ts`,
> `apps/agent-desktop/src/config/env.ts`,
> `apps/agent-desktop/src/renderer/*`,
> `apps/agent-desktop/electron-builder.yml`,
> `apps/agent-desktop/scripts/*.mjs`,
> `services/api/src/modules/agent/agent.controller.ts`
>
> This describes the repository; the code is authority over it.

## CURRENT

Electron **39.2.6** (exact pin), electron-builder `^26`, TypeScript, **Windows /
NSIS only** — there is no `mac:` or `linux:` block and `dist:win` is the only
packaging script.

### Process model

| Layer | Files | Notes |
|---|---|---|
| Main | `src/main/*.ts` except `preload.ts`, plus `src/config/env.ts` | Compiled to `dist/main/`, `dist/config/` |
| Preload | `src/main/preload.ts` | Exposes `window.dijiAgent` over `contextBridge` |
| Renderer | three `loadFile()` windows under `src/renderer/` | **No framework, no bundler** — plain DOM + ES modules |

All three windows share identical `webPreferences`: `contextIsolation: true`,
`nodeIntegration: false`, **`sandbox: false`**, and `webSecurity` left at its
`true` default.

`sandbox: false` is the one to notice. It is mitigated in practice — every
window loads local files, there is no remote content, no `shell.openExternal`
anywhere in `src/`, no navigation handler to bypass, and all three HTML files
carry a CSP — but it removes an OS-level defence layer for no stated benefit,
since the renderers only call `ipcRenderer.invoke` and `getUserMedia`.

### IPC

Eight `ipcMain.handle` channels, **no `ipcMain.on`, no `ipcRenderer.send`**:
`agent:login`, `agent:resume-session`, `agent:update-device-permissions`,
`agent:get-device-permission-config`, `agent:get-location-request`,
`agent:capture-desktop-location`, `agent:probe-location-permission`,
`agent:submit-location-result`.

Input validation in the main process is **thin but low-risk**: `agent:login`
validates properly; `agent:update-device-permissions` and
`agent:submit-location-result` forward untyped values, which the API's global
`ValidationPipe` then rejects. The one place it matters — `deviceId` on the
location result — is **overridden by the main process**, so a renderer cannot
forge a device.

### Timers

| Timer | Interval |
|---|---|
| Heartbeat | server config, clamped 10–3600 s (default 60) **+ 0–10 s jitter** |
| Config refresh | 900 s default, clamped 60–86400 **+ 0–60 s jitter** |
| Session-policy check | 60 s fixed |
| Update check | 6 hours |
| Location poll | piggybacks on every heartbeat |

The jitter spreads steady-state load but does nothing during an outage — see
[[ITEM-0027]].

### Build model, and its hazard

```
build = clean && build:main && build:renderer && copy:renderer
```

`build:renderer` compiles three renderer `.ts` files **in place**, emitting
`.js` next to the sources inside `src/`. Those three `.js` files are
**committed to Git**, and `npm run clean` deletes them.

Running a build therefore leaves deleted tracked files in the working tree —
which collides directly with this repository's `POST_TASK_REPO_HEALTH`
invariant. An agent that builds this app and then reports repository health will
see a dirty tree it did not intend to create. Tracked in [[ITEM-0028]].

`copy-renderer.mjs` copies the whole `src/renderer` directory, so the `.ts`
sources ship inside `app.asar` alongside the `.js`.

## Configuration and tenant association

**The app has no tenant configuration and never sends one.**

| Item | How it is learned |
|---|---|
| API base URL | `AGENT_API_BASE_URL` from `.env`; normalised (trailing `/` stripped, `/api` appended, http/https enforced) |
| `tenantId` | **Never held, never sent.** The server resolves it from the user at login and embeds it in the JWT; the app receives `tenant: { id, name, slug }` for display only |
| Environment / workspace | **Not implemented.** No workspace or subdomain concept exists |
| Device identity | SHA-256 of `hostname\|platform\|arch\|release\|username`, upserted server-side on `@@unique([tenantId, deviceFingerprint])` |
| Gateway | **None.** No gateway concept exists in this app |

`.env` is **not** tracked in Git (`.gitignore:18` matches `**/.env`); only the
three `.env*.example` files are. But `electron-builder.yml` declares
`extraResources: .env → .env`, so **the packaged installer ships whatever `.env`
the person who built it had**, as a plaintext file in a per-user, user-writable
install directory. Anyone with local user access can repoint
`AGENT_API_BASE_URL` at a host they control and harvest the next sign-in. That
is a property of the packaging design, not of any committed value.

**Six declared env vars are never read by runtime code** —
`appName`, `apiOrigin`, `deviceRegistrationEnabled`, `accessTokenTtl`,
`refreshTokenTtl`, `updateUrl`. Four are *required* and crash the app at startup
if absent, for no functional reason. The TTL pair is actively misleading: token
lifetimes are decided entirely server-side.

## Authentication

`POST /agent/auth/login` → bcrypt compare → requires an `ACTIVE` user, an
`ACTIVE` tenant and a **linked `Employee`** → device upsert → HS256 tokens
signed with the agent-specific secrets, `appClientId`/`aud` = `agent-desktop`. A
bcrypt hash of the refresh token is persisted as `AgentRefreshToken`.

Storage: refresh token in the OS credential vault (`keytar`, service
`DijiPeople Agent`); access token in memory only; password never persisted. Only
the remembered e-mail, the heartbeat queue and log lines touch the disk in
plaintext.

Refresh is **proactive** (before each heartbeat, if the access token expires
within the threshold) and **reactive** (one retry after an auth-expired
heartbeat failure). Every refresh rotates and revokes.

Two defects live here: the auth endpoints are unthrottled and disclose whether
an address belongs to a user
([[BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro]]), and
logout is a guaranteed `400` whose failure is swallowed
([[BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token]]).

A third, subtler risk: refresh **rotates before the new token is persisted**.
The server revokes the presented token before returning, and the client then
performs four more network calls before writing the new one to `keytar`. Any
failure in between destroys the saved session and forces a password re-entry.

## API contract

Eleven endpoints, all verified to exist. Every request carries
`X-DijiPeople-App: agent-desktop` plus agent version and platform headers.

```
POST /agent/auth/login | auth/refresh | auth/logout      (@Public)
GET  /agent/config
POST /agent/devices/register        PATCH /agent/devices/permissions
POST /agent/sessions/start | sessions/heartbeat | sessions/end
GET  /agent/location-requests/pending
PATCH /agent/location-requests/:requestId/result
```

A twelfth call — `electron-updater` fetching `<feed>/latest.yml` — has **no
handler anywhere in the API**.

Known contract mismatches beyond the logout defect: the heartbeat DTO caps
`activeApp` at 200 characters while the client truncates at 300, so a long
application name rejects the whole batch permanently ([[ITEM-0027]]); and
`capturedAt` is validated as a bare string then passed to `new Date()`.

## Data and observability

| Store | Location | Plaintext |
|---|---|---|
| Refresh token | Windows Credential Manager | no — DPAPI |
| Access token | process memory | n/a |
| Heartbeat queue | `<userData>/heartbeat-queue.json` | **yes** — window titles, tab titles, exe paths |
| Logs | `<userData>/logs/agent.log`, JSONL, size-rotated | **yes** |
| Remembered e-mail | Chromium local storage | yes |
| Runtime config | `<install>/resources/.env` | yes |

No database, no `electron-store`, no encrypted store. Log redaction is
**key-name based** — it masks values whose key matches `/token|password|secret|
authorization/i`, so a credential embedded inside a free-text `reason` would not
be masked. No call site currently does that.

Observability gaps, verified: `logger.error()` is **never called anywhere** in
the codebase; heartbeat failures go to `console.error` only, which is not
captured to the log file; the update-check failure logs no reason, which is
exactly why a permanently dead feed went unnoticed; there is no crash reporter
and no way to retrieve a user's log for support.

**Orphaned sessions are never reaped.** A graceful quit ends the session, but a
crash or force-kill leaves `WorkSession.endedAt` null forever, and the retention
sweep only deletes sessions that have ended. Orphans accumulate permanently and
skew the live-status classification.

## Aggregation is UTC-bound

`DailyProductivitySummary` keys on a UTC day boundary, and no tenant timezone is
read anywhere in the module. For any tenant not on UTC, an employee's "today"
ends at UTC midnight — mid-afternoon in UTC-8 — and does not line up with the
tenant's own attendance or timesheet day.

## Packaging and release

`npm run dist:win`, on Windows, with a hand-authored `.env`. Artefact
`DijiPeople-Agent-Setup-<version>.exe`, ~95 MB, unsigned
(`signAndEditExecutable: false`, [[ITEM-0026]]). `release/` is gitignored.

`clean-release.mjs` carries three Windows-specific behaviours, each documented
in its own header: it deletes the *contents* of `release/` rather than the
directory (editors hold a recursive watch and Windows returns `EPERM`), retries
`EPERM`/`EBUSY` for up to 60 seconds (Defender holds a handle while scanning a
fresh 90 MB unsigned installer), and never fails the build.

**The CI release workflow cannot publish this app.** `release-app.yml` offers
`agent-desktop` in its app list, but `release-apps.mjs` declares
`packageCommand: null` and `artifactDirectory: null` for it, and the workflow
passes no `--artifact` and has no Electron build step. Selecting it fails at the
dry-run step every time. The source comment acknowledges this is
intentional-for-now.

Version lives in **two unlinked places**: `package.json` `version` (what the
release CLI and `app.getVersion()` use) and `AGENT_APP_VERSION` in `.env`.

## CI coverage

`agent-desktop` is **never named** in `.github/workflows/ci.yml`. It
participates indirectly:

- **covered** by `typecheck` and `build` — it is an `apps/*` workspace declaring
  `check-types` and `build`, so Turborepo includes it;
- **not covered** by `lint` — that job names web, admin and landing only, and
  this app has no `lint` script and no ESLint config;
- **no tests exist** on either side of the boundary ([[ITEM-0028]]).

Its env vars are **not registered in `turbo.json` `globalEnv`**, which root
`AGENTS.md` requires. They are desktop-only and never reach the server, so
`render.yaml` is genuinely not applicable — `turbo.json` is.

## Related

[[desktop-agent]] · [[desktop-api-gateway-relationship]] ·
[[monorepo-application-map]] · [[system-architecture]] ·
[[integration-architecture]] · [[authentication]] · [[multi-tenancy]] ·
[[deployment-architecture]] · [[attendance]]
