---
ID: BUG-0034
aliases: [BUG-0034]
Title: Desktop agent auto update points at an endpoint that does not exist
Status: VERIFIED
Severity: HIGH
Priority: P1
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [apps/agent-desktop, services/api/src/modules/agent, services/api/src/modules/app-releases]
OwnerAgent: integration
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId: REG-056
RelatedBacklogItem: ITEM-0052
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-18
ResolvedAt: 2026-08-18
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

Fixed in two passes. The first closed the two agent-side defects and stopped
short of the feed, because building it turns on unattended software installation
on employee machines and carried a decision that should not be made silently.
The owner took that decision on 2026-08-18 — build it — and the second pass
below did. Both passes are kept here because the reasoning for pausing is worth
as much as the reasoning for proceeding.

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

## Update — the feed is now built

Owner decision taken 2026-08-18: build it. All three parts landed.

**1. `ApplicationRelease.checksumSha512`** — additive, nullable, migration
`20260818090000_application_release_sha512`. Nullable is the correct shape rather
than a concession: a release published before the column cannot have a sha512
computed without its original artefact, and the feed **skips** a release it
cannot let the updater verify instead of advertising one that would download and
then fail. electron-updater retries, so offering an unverifiable build is worse
than offering nothing.

`ReleasePublisherService` computes it from **the bytes that arrived**, beside the
existing sha256 and for the same reason — a digest supplied by the publisher only
ever proves the publisher's own copy was intact. Base64, because that is what
electron-updater compares against; hex would fail every verification while
looking perfectly correct in the database. `promote()` carries it forward, which
matters most: promotion is how a build becomes STABLE, and STABLE is the only
channel the feed serves. `verifyRegistration` checks it too, case-sensitively —
lower-casing a base64 digest would compare two different values as equal.

**2. `UpdateFeedController`** — `GET app-releases/feed/:appKey/latest.yml` and
`GET app-releases/feed/:appKey/:fileName`.

**3. The agent** points `DIJIPEOPLE_AGENT_UPDATE_URL` at
`/api/app-releases/feed/agent-desktop` and supplies its session through
`autoUpdater.requestHeaders`, refreshed before every check rather than captured
at startup — a header taken at launch would be stale by the first six-hour tick,
turning a 404 into a 401 with exactly the same silence.

**The exposure decision this record asked for, answered: the gate stays.**
electron-updater resolves the artefact URL *relative to the feed URL*, so the two
share a base path and an auth posture — serving the feed publicly would have made
the agent installer downloadable by anyone, which is an exposure change to a
considered design rather than an oversight to correct. Both routes keep
`appDownloads.read`, and the artefact streams through `AppReleaseService` so the
same checks apply to the bytes as to the metadata. `findPublishableByFileName`
applies the same publishable conditions as the feed, so the filename route cannot
reach a beta, an inactive or an unverifiable build by guessing.

The cost, stated plainly: an agent that cannot sign in cannot auto-update. That
is acceptable rather than ideal — the agent's whole function needs a session, so
one that cannot obtain a token is not tracking anything either, and its remedy is
a reinstall rather than a background update.

## QA Retest

Pass, with one honest gap.

```text
update-feed.service.spec.ts     6 tests
app-releases suites             4 suites, 61 tests
services/api                    180 suites, 1350 tests
apps/agent-desktop check-types  PASS
validate:framework              2385 checks
```

The feed spec pins what makes it *usable* rather than merely present: the
document carries the fields electron-updater reads, the version is **quoted** so
YAML cannot reinterpret `1.10` as the float `1.1`, and the query demands sha512,
fileName, fileSizeBytes and publishedAt so an unverifiable release is never
advertised.

The two earlier agent-side fixes still have no automated assertion —
`apps/agent-desktop` has no test runner, recorded as ITEM-0033 — which is stated
here rather than implied.

**Not verified end-to-end.** There is no published artefact and no storage
backend in this environment, so no agent has actually downloaded and installed
through this path. That belongs to a staging run against a real build, and it is
the one claim this record does not make.

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
