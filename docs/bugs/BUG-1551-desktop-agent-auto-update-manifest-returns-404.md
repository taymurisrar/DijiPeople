---
ID: BUG-1551
aliases: [BUG-1551]
Title: Desktop agent auto-update manifest returns 404
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [agent, app-releases]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: 
RegressionId: REG-358
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-1551 — Desktop agent auto-update manifest returns 404

> **Superseded by the 2026-08-30 finding below.** This record was triaged `BLOCKED_EXTERNAL` on 2026-08-27 on the premise that "the code is already corrected" and only a fleet reinstall remained. That premise was false. The URL half was corrected; a second, independent defect in the feed query was not, and it would have kept the endpoint returning 404 even after the owner published a release. It is fixed here.


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

**Fixed 2026-08-30. The remaining cause was ours, not external — and it was not
the one this record had been closed against.**

### What the 2026-08-27 triage missed

That triage concluded the code was already correct and only stranded installs
remained. Two premises were checked against the tree and one of them is now
false:

- **"One file was missed — `apps/agent-desktop/.env.development.example:21`
  still reads `http://localhost:4000/api/agent/updates`."** No longer true.
  That line now reads `.../api/app-releases/feed/agent-desktop`, corrected in
  `914e9ab0` ("remove the last two references to the dead update URL"), which
  is an ancestor of this branch. A repository-wide search for `agent/updates`
  now returns only historical documents — handoffs, QA runs and this record.
  Nothing a build reads still carries the dead path.
- **"The code is already corrected."** False. A second defect sat underneath,
  and the dead-URL fix is what exposed it.

### The actual remaining defect

The publisher and the feed disagreed about what an app is called.

- `release-publisher.service.ts` persists `appKey` from the catalogue —
  `APP_KEYS.AGENT_DESKTOP`, the string `AGENT_DESKTOP`.
- `update-feed.service.ts` filtered on the **raw URL segment**, and the feed URL
  every `.env` example carries is `/api/app-releases/feed/agent-desktop` — the
  `cliAlias`, because that is what a URL segment looks like.

`'agent-desktop'` never matched `'AGENT_DESKTOP'`, so both the manifest query
and the artefact-by-filename query returned nothing and the controller answered
404. **This would have persisted after a release was published**, which is the
part that matters: the fix everyone was waiting on the owner to unblock would
not have worked.

The empty feed is exactly what hid it. With zero published releases, a correct
lookup and a broken one return the same 404, so the mismatch was
indistinguishable from "nothing to serve yet" — and that is the reading this
record's QA Retest section had already settled on.

### The fix

`services/api/src/modules/app-releases/update-feed.service.ts` — both queries
now resolve the URL segment through `resolvePublishableApp()`, the same
catalogue resolver the publisher uses, which normalises case and `_`/`-` in
both directions. Routing the read side through the write side's resolver makes
them agree by construction instead of by a second mapping that could drift. An
unrecognised segment resolves to `null` and the caller answers 404, which is
the right answer for an app that does not exist.

Nothing else changed. The route, the guards, the manifest shape and the
authentication posture were all already correct:

- `update-feed.controller.ts:57` serves
  `GET /api/app-releases/feed/:appKey/latest.yml` with both `@Permissions` and
  `@RequirePermission`.
- `appDownloads.read` is granted to the self-service employee permission set
  (`permissions.ts:2500`), so a signed-in agent user holds it.
- `renderLatestYml` emits the `version` / `files` / `path` / `sha512` /
  `releaseDate` document electron-updater parses, with `version` quoted.
- An empty feed returns `404` carrying "No published release is available.",
  which satisfies the second acceptance criterion: a defined, documented
  response rather than a bare 404.

### Regression coverage

`update-feed.service.spec.ts`, four new tests, and the fixture corrected — it
declared `appKey: 'agent-desktop'`, encoding the very assumption that was
wrong. They assert the **query**, not the response, because a mocked
`findFirst` returns its fixture whatever it is asked, which is why the original
five tests passed over the live defect. Mutation-tested: reverting the
resolution fails two of the four, and leaves the third — which passes the
catalogue key directly — green, as the control it is meant to be.

### What is still outstanding, and who must supply it

Neither item is a code defect and neither blocks this record.

1. **No release has been published**, so the feed correctly serves 404. Proving
   auto-update end to end (the third acceptance criterion) needs a STABLE,
   active `agent-desktop` release for `WINDOWS` carrying `checksumSha512`,
   `fileName` and `fileSizeBytes`. **The platform owner must publish it**: the
   publisher is gated by `RELEASE_PUBLISH_TOKEN`, which fails closed when unset
   (`release-publish-token.guard.ts:42`) and which no agent holds or should.
   This session did not publish a release, upload an artefact, or touch a
   release secret.
2. **Agents installed before 2026-08-18** still hold the dead URL baked into
   their build, and the auto-updater is the mechanism that would replace it, so
   they cannot repair themselves. They need a manual reinstall. No code change
   can reach them; this is the operational remainder the 2026-08-27 triage
   correctly identified.


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

- Regression — REG-358 (see the regression register)

<!-- GRAPH:END -->
