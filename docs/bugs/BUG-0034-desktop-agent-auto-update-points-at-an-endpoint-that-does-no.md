---
ID: BUG-0034
aliases: [BUG-0034]
Title: Desktop agent auto update points at an endpoint that does not exist
Status: OPEN
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [apps/agent-desktop, services/api/src/modules/agent, services/api/src/modules/app-releases]
OwnerAgent: integration
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt:
---

# BUG-0034 — Desktop agent auto update points at an endpoint that does not exist

## Summary

`electron-updater` is fully wired in the desktop agent — `autoDownload = true`,
`autoInstallOnAppQuit = true`, a check every six hours — against a feed URL
supplied by `DIJIPEOPLE_AGENT_UPDATE_URL`. Every committed example sets that to
`.../api/agent/updates`, and **no such route exists anywhere in the API.** The
agent therefore cannot update itself, and the forced-update path strands the
employee at a dialog whose only working button is Quit.

## Expected Behavior

An agent configured to auto-update reaches a feed that serves it. A forced
update offers a remediation the user can actually complete.

## Actual Behavior

`electron-updater`'s `generic` provider requests `<url>/latest.yml` and receives
a 404. `checkForUpdates` swallows the failure and logs
`agent.update.check_failed` **with no reason attached**, so a permanently dead
feed is invisible in the agent's own logs.

## Reproduction

1. `grep -rn "agent/updates" services/api/src` → **zero matches**.
2. Enumerate `AgentController`'s routes: `auth/login`, `auth/refresh`,
   `auth/logout`, `me`, `me/productivity`, `employees/:employeeId/summary`,
   `employees/:employeeId/location-requests`, `location-requests/pending`,
   `location-requests/:requestId/result`, `config`, `devices/register`,
   `devices/permissions`, `sessions/start`, `sessions/heartbeat`,
   `sessions/end`, `settings`. There is no `updates`.
3. Build the agent and inspect `resources/app-update.yml` — it carries the same
   dead URL, baked in at build time.

## Evidence

- `apps/agent-desktop/electron-builder.yml:31-33` — `publish: provider: generic,
  url: "${env.DIJIPEOPLE_AGENT_UPDATE_URL}"`.
- `apps/agent-desktop/src/main/update-manager.ts:14-17` — `autoDownload`,
  `autoInstallOnAppQuit`, `allowPrerelease: false`, `allowDowngrade: false`.
- `apps/agent-desktop/src/config/env.ts:109` — the variable is **required** at
  startup (the app refuses to boot without it), yet `agentEnv.updateUrl` is
  never read by any runtime code; the real value is baked into
  `app-update.yml` at build time.
- The dead URL is committed in four tracked places:
  `apps/agent-desktop/.env.example:25`, `.env.development.example:21`,
  `.env.production.example:21`, and `docs/environment-variables.md:260`. A fifth
  copy sits in `services/api/.env.production.example:166`.
- `services/api/src/modules/agent/agent.controller.ts:43` — the controller, with
  no `updates` route.

## Root Cause

Established: the release catalogue and the desktop updater were built
independently and never connected. `app-releases` exists and **does** register
`AGENT_DESKTOP` as an app key, but:

- it serves `GET /app-releases`, `/latest`, `/:id`, `/:id/download` — not a
  `latest.yml` feed;
- every one of those routes is behind
  `@UseGuards(JwtAuthGuard, PermissionsGuard)` with
  `@Permissions('appDownloads.read')`
  (`app-release.controller.ts:86-123`), while `electron-updater`'s generic
  provider sends **no** `Authorization` header.

So the two systems are not merely unwired — their shapes and their auth models
are both incompatible. `apps/agent-desktop/src` contains **zero** references to
`app-releases`.

## Impact

- **The agent cannot be patched.** No security fix, no bug fix and no
  certificate rotation can reach an installed agent by its own update path.
- **The forced-update lever is a trap.** The server-side version policy
  (`minimumSupportedVersion` / `forceUpdate`) works — it blocks tracking and
  shows a dialog offering "Check for updates" or "Quit". The first does nothing.
  An operator who raises the minimum version disables every deployed agent with
  no route back.
- **The failure is silent** — the log line carries no reason, so nobody
  discovers this from telemetry.

Severity `HIGH` rather than `CRITICAL`: nothing is exposed and nothing is
corrupted; a capability the product believes it has does not exist.

Note the adjacent, separate risk: `electron-builder.yml:24` sets
`signAndEditExecutable: false`, so artefacts are unsigned and the `generic`
provider performs no publisher verification. The `sha512` in `latest.yml` proves
only that the bytes match what the feed claimed. Whoever ends up serving this
path becomes a code-execution trust root. That is tracked separately as
[[ITEM-0026]] because it is a decision about signing, not this wiring defect.

## Affected Areas

`apps/agent-desktop` update manager, `electron-builder.yml`, all four committed
`.env*` examples, `docs/environment-variables.md` ·
`services/api/src/modules/app-releases` · release publishing.

## Proposed Resolution

**Needs an ExecPlan.** This is not a URL correction — there is no correct URL to
substitute. The plan must choose between:

- serving a `latest.yml`-shaped generic feed for the agent, and deciding its
  authentication (an unauthenticated feed is simplest and is a distribution
  decision, not an oversight to be made silently); or
- replacing the generic provider with a custom `electron-updater` provider that
  speaks to `app-releases` and can carry a token; or
- removing `autoDownload`/`autoInstallOnAppQuit` and the required env var until
  one of the above exists, so the product does not claim a capability it lacks.

Whichever is chosen, code signing must be settled in the same plan — an update
channel and its authenticity control are one decision.

Until then, the honest interim change is to stop the forced-update dialog
offering a remediation that cannot work.

## Acceptance Criteria

- A packaged agent performing an update check reaches a real feed and either
  updates or reports "up to date".
- `agent.update.check_failed` records the underlying reason.
- No committed example or document names a route that does not exist.
- The forced-update dialog's actions all function.

## Regression Coverage

**None today.** A check that every URL in a committed `.env*.example` resolves to
a declared route would have caught this and is the generalisable guard.

## Dependencies

[[ITEM-0026]] — code signing, which shares the decision.

## Related Items

[[desktop-agent-architecture]] · [[desktop-agent]] ·
[[desktop-api-gateway-relationship]] · [[ITEM-0026]] ·
[[deployment-architecture]] · bug pattern [[doc-code-drift]] ·
bug pattern [[declared-but-unwired-step]].

## Resolution

**Partially fixed. Still OPEN — the feed does not exist yet.**

Two of the three defects in this record are fixed. The third is a feature build
that turns on unattended software installation on employee machines, and it
carries a decision I should not make silently.

## Fixed

- **The failure was invisible.** `checkForUpdates` logged
  `agent.update.check_failed` with **no reason attached**, so a feed answering
  404 on every check for months looked exactly like a transient network blip in
  the agent's own logs — the one place anyone would look. The reason is now
  captured and logged, bounded and whitespace-collapsed.
- **The forced-update path was a dead end.** "Check for updates" called
  `checkForUpdates`, which failed silently, and the dialog simply closed —
  leaving the employee blocked from tracking with no information and no next
  step. The only button that did anything was Quit. It now reports that the
  update service could not be reached, quotes the reason, and names the installed
  and required versions so an IT administrator can act on it.

## Not fixed, and what it needs

`electron-updater`'s generic provider requests `<url>/latest.yml`, whose entries
must carry a **sha512** of the artefact. `ApplicationRelease` stores
`checksumSha256`. So the feed needs:

1. an additive `checksumSha512` column and a publisher change to compute it —
   `ReleasePublisherService` already receives the artefact as a buffer, so this
   part is straightforward;
2. a feed endpoint rendering `latest.yml` from the latest active STABLE release
   for the requesting platform;
3. an artefact route the updater can fetch.

**The decision.** `GET app-releases/:id/download` is gated behind
`appDownloads.read`. A generic-provider feed is fetched with no session, so
serving it the same way would make the agent installer publicly downloadable —
an exposure change to a deliberate design, not an oversight to correct.

There is a good answer: `autoUpdater.requestHeaders` lets the agent send its own
`Authorization` header, so the feed can stay authenticated. That should be
confirmed as the intended design rather than assumed by me.

**And it cannot be verified here.** There is no published artefact and no storage
backend in this environment, so an implementation would be unrunnable code
shipped into an auto-update path. That is the wrong thing to guess at.

Needs an ExecPlan under [PLANS.md](../../PLANS.md) covering the column, the
publisher change, the two endpoints, the agent's `requestHeaders`, and a staging
verification against a real artefact.

## QA Retest

The two agent-side fixes typecheck (`npx tsc --noEmit` in
`apps/agent-desktop`, exit 0). `apps/agent-desktop` has no test runner —
recorded separately as ITEM-0028 — so neither is covered by an automated
assertion, which is stated here rather than implied.

The feed remains unverified because it remains unbuilt.

## History

- 2026-08-16 — found during the `apps/agent-desktop` deep documentation audit
  (TASK-0002) and verified against source at `78072d2`.
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`. There is no one-line fix; the
  decision is which of three distribution models the product wants, and it is
  inseparable from the signing decision in ITEM-0026.
- 2026-08-16 — the silent failure and the dead-end forced-update dialog are
  fixed. The feed itself stays open: it needs a sha512 column, two endpoints, and
  a decision about whether the artefact is served publicly or behind
  `autoUpdater.requestHeaders`. Left unbuilt rather than guessed at, because it
  installs software on employee machines and cannot be verified here.
