---
ID: ITEM-0026
aliases: [ITEM-0026]
Title: Desktop agent Windows installer is unsigned
Type: SECURITY
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/agent-desktop]
Source: ARCHITECT
OwnerAgent: release-devops
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: BUG-0034
RelatedQA: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0026 — Desktop agent Windows installer is unsigned

## Summary

`apps/agent-desktop/electron-builder.yml:24` sets `signAndEditExecutable:
false`, and there is no certificate configuration, `afterSign` hook or signing
secret anywhere in the repository or in `.github/workflows/release-app.yml`. The
~95 MB NSIS installer DijiPeople asks employees to run on their work machines is
therefore unsigned.

## Why It Matters

Three costs, in increasing order of seriousness.

1. **Every install shows a SmartScreen "unrecognised app" warning.** For an app
   whose whole premise is workplace trust — it reads window titles and can be
   asked for the employee's location — the first thing it does is teach the
   employee to click past a security warning.
2. **`electron-updater` cannot verify a publisher.** On Windows the updater
   normally checks the downloaded installer's signature against the running
   app's publisher name. With nothing signed there is nothing to check, so the
   only integrity control is the `sha512` in `latest.yml` — which proves the
   bytes match what the feed claimed, not that the feed is legitimate.
3. **Combined with 2, the update channel becomes an unauthenticated
   code-execution path.** The agent is configured with `autoDownload = true` and
   `autoInstallOnAppQuit = true`. Whoever serves the feed — or anyone able to
   take over that hostname or intercept it — can push arbitrary code that
   installs and runs as the employee.

Point 3 is why this is filed as `SECURITY` rather than polish, and why it must
be settled **together with** [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]].
Today the feed URL is dead, so the exposure is latent; the moment somebody makes
auto-update work without solving signing, it becomes live.

## Evidence

- `apps/agent-desktop/electron-builder.yml:24` — `signAndEditExecutable: false`.
- Same file — no `certificateFile`, `certificateSubjectName`, `signtoolOptions`
  or `sign` hook; no `afterSign`; no `mac`/`notarize` block.
- `apps/agent-desktop/src/main/update-manager.ts:14-15` — `autoDownload = true`,
  `autoInstallOnAppQuit = true`.
- `apps/agent-desktop/electron-builder.yml:31-33` — `provider: generic`, which
  performs no publisher verification.
- `.github/workflows/release-app.yml` — no signing secret, and no Electron build
  step at all.

## Proposed Approach

**Needs an ExecPlan**, jointly with BUG-0034 — an update channel and its
authenticity control are one decision, and solving either alone produces a worse
outcome than solving neither.

The plan must cover: which certificate (OV or EV — EV avoids SmartScreen
reputation build-up), where the private key lives so a CI runner can use it
without the key entering the repository, whether signing happens on a developer
Windows machine or in CI, and what the interim guidance to employees is until it
lands.

## Acceptance Criteria

- A released installer is signed and Windows reports a known publisher.
- `electron-updater` verifies the publisher on update.
- No signing material is committed; the key is referenced from secret storage.
- The release procedure in `docs/development/release-publishing.md` states the
  signing step.

## Dependencies

[[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] —
same decision. Acquiring a code-signing certificate is a purchasing action
outside engineering's control, which is the realistic blocker.

## Related Items

[[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] ·
[[desktop-agent-architecture]] · [[desktop-agent]] ·
[[deployment-architecture]] · [[ITEM-0028]].

## History

- 2026-08-16 — created at `78072d2` during the `apps/agent-desktop` deep
  documentation audit (TASK-0002).
- 2026-08-16 — Architect triage: `PLAN_REQUIRED`, sequenced with BUG-0034.
  Deliberately not `DEFER` despite the latent exposure: the cost of doing this
  after auto-update starts working is a live remote-code-execution channel, and
  the certificate has a procurement lead time that makes late a bad time to
  start.
