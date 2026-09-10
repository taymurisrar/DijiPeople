---
ID: BUG-2888
aliases: [BUG-2888]
Title: An externally hosted release is invisible to the desktop agent update feed, because the platform publish route cannot record a SHA-512
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: INTEGRATION
Source: QA_RUN
DetectedDate: 2026-09-09
DetectedInSha: 4ee7b2cd
AffectedModules: [services/api/src/modules/app-releases]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-2888 — An externally hosted release is invisible to the desktop agent update feed, because the platform publish route cannot record a SHA-512

> **Architect triage, 2026-09-11 — `FIX_NOW`.** This fails silently in the one direction that matters: the release looks published, listed and downloadable, and the update feed quietly omits it for ever. Silent breakage of the customer-facing auto-update path is worth more than its MEDIUM severity suggests. Fix now.

## Summary

A release registered through `POST /app-releases` can carry an `externalUrl`,
but cannot carry a SHA-512, because `PublishReleaseDto` has no
`checksumSha512` field. The desktop agent's update feed selects releases with
`checksumSha512: { not: null }`, so such a release is filtered out and
`GET /app-releases/feed/AGENT_DESKTOP/latest.yml` returns 404 — which
electron-updater reads as "no update available".

The result is a release that installs and downloads perfectly, is listed in the
catalogue, and is invisible to automatic updates, with nothing anywhere
reporting a problem.

## Expected Behavior

A release whose artefact is hosted outside DijiPeople should be able to serve the
update feed — or the publish route should refuse to create a release that cannot.

## Actual Behavior

It is accepted, listed, downloadable through the 302 redirect, and silently
omitted from the update feed for ever.

## Reproduction

1. `POST /app-releases` with `appKey: AGENT_DESKTOP`, an `externalUrl`, a
   `checksumSha256`, and no way to supply a SHA-512 — the DTO has no field for
   it, and `forbidNonWhitelisted` would reject one anyway.
2. `GET /app-releases` — the release is listed.
3. `GET /app-releases/{id}/download` — 302 to the artefact; the bytes are served.
4. `GET /app-releases/feed/AGENT_DESKTOP/latest.yml` — 404.

## Evidence

`app-release.controller.ts` — `PublishReleaseDto` declares `checksumSha256` and
no `checksumSha512`, while `schema.prisma`'s `ApplicationRelease` carries both
columns.

`update-feed.service.ts` filters on `checksumSha512: { not: null }` in both of
its query paths, so a row without one can never be selected.

`release-publisher.service.ts` *does* compute and store `checksumSha512` — but
only on the path that uploads the artefact through `StorageService`. So the two
publish routes each support half of what an externally hosted release needs: the
token-authenticated CLI can set the checksum but not the URL, and the platform
route can set the URL but not the checksum.

Observed on production 2026-09-09: `AGENT_DESKTOP 1.0.0` published with an
`externalUrl` and SHA-256 `ac9f1ec6…`; catalogue and download both verified
working, feed not.

## Root Cause

The publish DTO was shaped around the storage-upload path, where the server
computes the SHA-512 itself from bytes it has just received. `externalUrl` was
added later as an alternative artefact source without extending the DTO to carry
the metadata the server can no longer compute for itself.

## Impact

Any release hosted outside DijiPeople cannot auto-update the desktop agent — and
external hosting is currently the only way to publish one that survives a
deploy, because the Render service has no persistent disk and `StorageService`
writes to the container filesystem. Users would install once and never see
another version unless they downloaded it by hand.

Not urgent today: this is the first published agent build, so nothing is stuck
on an older version. It becomes urgent the moment a second version ships.

## Affected Areas

- `services/api/src/modules/app-releases/app-release.controller.ts` — the DTO
- `services/api/src/modules/app-releases/update-feed.service.ts` — the filter
- `services/api/src/modules/app-releases/release-publisher.service.ts` — the
  other publish route, which holds the opposite half of the problem

## Proposed Resolution

Accept `checksumSha512` on `PublishReleaseDto`. It is the smallest change and it
makes the two publish routes symmetric.

Decide the stricter question separately: whether the route should *refuse* an
`AGENT_DESKTOP` release with no SHA-512, since such a release is silently
useless for updates. Refusing is probably right — a release that cannot do the
thing releases exist for should not be creatable — but it is a behaviour change
worth stating rather than sliding in.

## Acceptance Criteria

1. A release published with `externalUrl` and a SHA-512 appears in
   `GET /app-releases/feed/AGENT_DESKTOP/latest.yml`.
2. The emitted `latest.yml` carries that SHA-512 and a URL electron-updater can
   fetch.
3. Publishing an agent release without a SHA-512 either refuses, or is surfaced
   somewhere an operator will see. It is never silently absent from the feed.

## Regression Coverage

A test that publishes an externally hosted agent release and asserts it appears
in the feed. It must fail on the current code, where the feed query excludes it.

## Dependencies

None.

## Related Items

[[BUG-2732]] — the release during which this was found.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-09-09 — found at `4ee7b2cd` while publishing the first desktop agent
  release to production. The download path was verified working; the feed was
  checked because the agent auto-updates, and that is where the gap showed.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
