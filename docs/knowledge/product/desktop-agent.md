# Desktop Agent (`apps/agent-desktop`)

> **Last Verified:** 2026-08-16
> **Verified Against SHA:** `78072d2`
> **Source Paths:** `apps/agent-desktop/src/**`,
> `apps/agent-desktop/electron-builder.yml`,
> `services/api/src/modules/agent/`, `services/api/src/modules/app-releases/`,
> `services/api/prisma/schema.prisma` (`WorkSession`, `ActivityEvent`,
> `DailyProductivitySummary`, `EmployeeDevice`, `AgentLocationRequest`)
>
> This describes the repository; the code is authority over it.

## What it actually is

**A workstation activity and productivity telemetry agent — not an attendance
client.**

This distinction is the single most important thing on this page, because the
package description (`apps/agent-desktop/package.json`) calls it the "desktop
attendance and activity agent", and the repository map calls it the "Electron
attendance agent". The code disagrees with the attendance half:

- `services/api/src/modules/agent/agent.module.ts` imports only `JwtModule` and
  `AuditModule`.
- There is **no reference to attendance anywhere** in `agent.service.ts`.
- No heartbeat creates an attendance record, a shift or a punch.

Agent data lands in exactly three models — `WorkSession`, `ActivityEvent` and
`DailyProductivitySummary` — and nowhere else. An agent planning attendance work
should not expect this app to be involved, and an agent changing attendance
should not expect to break it.

## What it does

1. An employee signs in with their work e-mail and password.
2. The workstation registers itself as an `EmployeeDevice`, identified by a
   SHA-256 fingerprint of hostname, platform, arch, release and username.
3. A `WorkSession` opens.
4. Roughly every 60 seconds it sends a heartbeat carrying: activity state
   (`ACTIVE` / `IDLE` / `AWAY`), OS idle seconds, the active application name,
   its executable path and PID, the window title, and a derived browser tab
   title.
5. It optionally answers **manager-initiated, one-time** location requests,
   which require an explicit click by the employee.
6. It lives in the system tray and auto-starts at login.

The business purpose is workforce utilisation reporting:
`DailyProductivitySummary.utilizationPercent = activeSeconds / loggedInSeconds`,
surfaced to the employee through `GET /agent/me/productivity` and to their
manager through `GET /agent/employees/:employeeId/summary`.

## What it deliberately does not collect

`allowScreenshots`, `allowClipboard` and `allowKeylogging` are hardcoded `false`
**twice** — as TypeScript literal types in `src/main/types.ts` and again as
unconditional `false` in `ConfigManager.validateAndNormalize`. The second is the
one that matters: a compromised or misconfigured server **cannot turn them on**.

That double lock is deliberate defensive design and must not be "simplified"
into a single check. No camera or microphone media is ever captured either —
permission *status* is probed and reported, and the `getUserMedia` streams used
to probe it are stopped immediately.

## Who installs it

The individual employee, on their own workstation. There is **no MDM or silent
install path**: the NSIS installer is `oneClick: false`, `perMachine: false`,
and lets the user choose the directory. It is surfaced to tenant users through
`apps/web` → Settings → Apps & downloads, gated on `appDownloads.read`.

There is also **no pairing or enrolment step** — no device code, no admin
approval, no per-device secret. Any valid employee credential registers any
workstation silently.

## What it is not connected to

| Assumed connection | Reality |
|---|---|
| Attendance module | **None.** See above |
| `gateway/` (.NET on-prem) | **None.** Zero references in either direction. The gateway is a separate product for physical ZKTeco devices |
| `tools/zkteco-poc` | **None** |
| `app-releases` catalogue | **None from the app.** The catalogue registers `AGENT_DESKTOP` and serves the human download in `apps/web`, but the agent itself never calls it — see [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] |

The desktop agent talks **only** to the NestJS API, under its own auth client
(`agent-desktop`) with its own JWT secrets and TTLs.

## Where it is strong

Worth stating, because the open records below are all in the wiring rather than
the runtime logic:

- **Tenant isolation is correct by construction.** The app cannot express a
  tenant — it never holds or sends a `tenantId`. The server derives it from the
  authenticated user on every handler.
- **A renderer cannot forge a device.** The main process overrides `deviceId` on
  the location-result path.
- **Credentials are stored properly.** The refresh token goes to the OS
  credential vault via `keytar`; the access token is memory-only; the password
  is never persisted.
- **The offline queue is durable** — atomic temp-file-and-rename writes, a
  promise write-lock, per-event schema validation on both read and write, and a
  bounded size. A corrupt file degrades to an empty queue rather than crashing.
- **There is a working per-tenant kill switch.** Setting
  `AgentTrackingSettings.enabled = false` stops capture.

## Open records

| Record | What it means |
|---|---|
| [[BUG-0033-desktop-agent-login-is-unthrottled-and-enumerates-users-acro]] | Unthrottled login, distinct failure messages, global user lookup |
| [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] | The agent cannot update itself; the feed URL has no server route |
| [[BUG-0035-desktop-agent-logout-never-revokes-the-refresh-token]] | Sign-out is silently a no-op server-side, for up to 90 days |
| [[BUG-0036-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]] | Retried batches permanently inflate utilisation figures |
| [[ITEM-0026]] | The installer is unsigned |
| [[ITEM-0027]] | No retry backoff, no bounded give-up |
| [[ITEM-0028]] | No `AGENTS.md`, no tests anywhere on either side |

## Privacy posture — stated, because nothing else states it

The agent captures **window titles and browser tab titles**, and those routinely
contain customer names, ticket subjects and personal search terms. They are
written to a **plaintext JSON queue** in `%APPDATA%` holding up to 5,000 events,
readable by any process running as that user and by any backup or sync agent.
`safeStorage` is available in Electron 39 and is not used.

Separately, **location capture is not audited.** The only `AuditService.log()`
call in the entire agent module is for settings updates. Device registration,
session start/end, permission changes and geolocation captures leave no audit
trail — and geolocation is precisely the operation an employee-monitoring
regime expects one for.

Neither is filed as a bug: both are design positions that a human should decide
on rather than an agent classifying unilaterally. They are listed as owner
questions in the TASK-0002 report.

## Related

[[desktop-agent-architecture]] · [[desktop-api-gateway-relationship]] ·
[[monorepo-application-map]] · [[attendance]] · [[integration-architecture]] ·
[[authentication]] · [[multi-tenancy]] · [[platform-admin]] ·
[[tenant-application]]
</content>
