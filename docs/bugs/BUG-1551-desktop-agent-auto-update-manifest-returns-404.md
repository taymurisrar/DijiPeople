---
ID: BUG-1551
aliases: [BUG-1551]
Title: Desktop agent auto-update manifest returns 404
Status: BLOCKED
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [agent, app-releases]
OwnerAgent: architect
ArchitectDisposition: BLOCKED_EXTERNAL
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1551 — Desktop agent auto-update manifest returns 404

> **Architect triage, 2026-08-27 — `BLOCKED_EXTERNAL`.** The code is already corrected. What remains is operational: agents installed before 2026-08-18 carry the dead URL baked into the build and the auto-updater is the thing that would replace it, so they cannot repair themselves. Needs a manual reinstall of the deployed fleet, which no code change can deliver.


## Summary

The desktop attendance agent's auto-update manifest returns 404.
`/api/agent/updates/latest.yml` has been failing repeatedly, every few hours,
for at least eight hours before it was observed. Deployed agents cannot discover
a new version, so the auto-update channel is silently inert.

## Expected Behavior

`/api/agent/updates/latest.yml` returns the update manifest for the requesting
agent's channel, so an installed agent can find and apply a newer build.

## Actual Behavior

The endpoint returns 404. The failures recur every few hours, consistent with
installed agents polling on a schedule.

## Reproduction

1. Sign in to `admin.dijipeople.com` as a platform owner.
2. Open Settings → Monitoring and filter the error log for
   `/api/agent/updates/latest.yml`.
3. Observe repeated 404 entries, the oldest at least eight hours old.

Direct reproduction: request `/api/agent/updates/latest.yml` against the
production API.

## Evidence

Observed on production, 2026-08-26, in the platform error log. Entries
approximately two hours and eight hours old, with a recurring pattern between
them.

Note that the incident detail pages are themselves unreachable — see
[[BUG-1542]] — so only the list-level entries were readable.

## Root Cause

Established on 2026-08-27, and it is not a new defect. **This is
[[BUG-0034]] still happening in production after that record was closed.**

`/api/agent/updates/latest.yml` has never existed. The real feed is
`GET /api/app-releases/feed/:appKey/latest.yml`, which is live and healthy —
it answers `401 Unauthorized`, not `404`. The 404 path appears nowhere in the
source; `grep` finds it only in documentation and in this record.

BUG-0034 recorded exactly this in August and is marked `Status: VERIFIED`,
`ArchitectDisposition: DONE`, `ResolvedAt: 2026-08-18`. The fix landed for the
things a build reads today: `.env.example`,
`.env.production.example` and `docs/environment-variables.md` all now carry
`/api/app-releases/feed/agent-desktop`.

Two things nonetheless keep the 404s coming.

1. **The fix cannot reach the agents that need it.** `DIJIPEOPLE_AGENT_UPDATE_URL`
   is baked into an installed build. Any agent installed before 2026-08-18
   still holds the dead URL and polls it every six hours — which matches the
   observed cadence exactly. The mechanism that would deliver the corrected URL
   *is* the auto-updater, so those installs cannot fix themselves. They are
   permanently stranded and need a manual reinstall.

2. **One file was missed.** `apps/agent-desktop/.env.development.example:21`
   still reads `http://localhost:4000/api/agent/updates`. It points at
   localhost, so it is not the cause of the production 404s, but it is a live
   trap for the next developer and the last remnant of BUG-0034.

The confirmed 404s in the production log on 2026-08-26 were, in part, my own
probes while investigating — a request to that URL is recorded as
`Cannot GET /api/agent/updates/latest.yml`. The older entries, hours apart and
predating this session, are the stranded installs.

## Impact

Every installed desktop agent is stranded on its current version. Fixes and
security updates cannot reach the fleet through the intended channel, and
because the failure is a quiet 404 rather than an error the agent surfaces,
nobody learns this from the agent side.

The severity depends on how many agents are deployed, which was not established
during this pass.

## Affected Areas

- `services/api/src/modules/agent` — the updates endpoint
- `services/api/src/modules/app-releases` — release channels and promotion
- `apps/agent-desktop` — the auto-update client

## Proposed Resolution

Determine which of the three candidate causes applies by checking whether a
release exists, whether it is promoted to the channel the agents request, and
whether the route is implemented at all. Fix accordingly.

Whatever the cause, a 404 on this route should raise an operational signal
rather than accumulating in the error log, since a silent auto-update channel is
indistinguishable from a working one.

## Acceptance Criteria

- `/api/agent/updates/latest.yml` returns a valid manifest for a channel with a
  promoted release.
- A channel with no promoted release returns a defined, documented response
  rather than a bare 404.
- An installed agent can discover and apply an update end to end.

## Regression Coverage

None yet. Needs a test asserting the manifest endpoint returns a manifest for a
promoted release. Requires a `REG-nnn` entry once written.

## Dependencies

Diagnosis is hampered by [[BUG-1542]], which prevents opening the incident
detail for these entries.

## Related Items

The unresolved remainder of [[BUG-0034]], which is closed while its symptom
continues in production. Concerns the agent distribution pipeline delivered
under TASK-0025 and TASK-0026. Adjacent to [[BUG-1542]] only in that the
incident detail pages made the log hard to work.

## Resolution

Not yet resolved.

## QA Retest

**The URL half is verified.** The owner rebuilt and reinstalled the agent on
2026-08-27 from a `.env` carrying the corrected feed. Production platform events
show the change directly:

```
10:39:28  Cannot GET /api/agent/updates/latest.yml?noCache=…      <- the old build
11:59:33  GET /api/app-releases/feed/agent-desktop/latest.yml?noCache=…
          category AUTH_TOKEN_MISSING
```

The `noCache` parameter is `electron-updater`'s own, so that is the updater
speaking, not a probe. The dead path stops being requested; the correct one
starts. A 401 rather than a 404 is the expected shape here — the feed is gated
behind `appDownloads.read`, and `UpdateManager.start()` re-reads the access token
before every check, so a check that fires before the employee signs in carries no
header. The six-hour tick after sign-in carries one.

**Two things remain unproven, and neither is this record's fix.**

1. `GET /api/app-releases` returns **zero published releases**. The feed has
   nothing to serve, so a correctly authenticated check still answers 404 —
   which is the right answer to an empty feed, and indistinguishable from the
   defect this record describes. Auto-update cannot be proven end to end until a
   release is published and promoted to the channel the agent requests.
2. Every *other* agent installed before 2026-08-18 still holds the dead URL. This
   verifies one reinstalled machine, not the fleet.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
