---
ID: ITEM-0017
aliases: [ITEM-0017]
Title: buildWorkspaceUrl still carries an internal loopback fallback
Type: TECH_DEBT
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [pkg:config]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-17
RelatedBug: BUG-0026
RelatedQA: docs/qa/runs/2026-08-16-production-url-integrity-344a832.md
RelatedADR: 
RelatedImplementation: agent/production-url-integrity
TargetMilestone: 
BlockedBy: 
---

# ITEM-0017 — buildWorkspaceUrl still carries an internal loopback fallback

## Summary

`packages/config/platform-domains.js:337` falls back to a literal
`"http://localhost:3001"` when it can build no workspace hostname and the caller
supplied no `developmentOrigin`. This is the last instance of the defect class
[[BUG-0026]] addressed, and it is the one instance that was deliberately left
in place.

## Why It Matters

Low, and bounded — but not zero. Both production call sites
(`services/api/src/modules/tenant-domains/tenant-domain.service.ts:193` and
`:202`) now pass `developmentOrigin: getAppOrigin('web', process.env)`, which
throws in production rather than returning loopback, so **the fallback is
currently unreachable from production code**. The cost is that a future caller
that forgets `developmentOrigin` silently reacquires the original defect, and
`buildWorkspaceUrl` is exported from `@repo/config` where anything may call it.

## Evidence

- `packages/config/platform-domains.js:337` —
  `const origin = options.developmentOrigin ?? "http://localhost:3001";`
- Only callers, both now guarded:
  `services/api/src/modules/tenant-domains/tenant-domain.service.ts:193,202`.
- Present in the built landing bundle
  (`.next/server/chunks/_0f99f6d._.js`) as a code path, not as an emitted href —
  verified by grep against the production build during BUG-0026 QA.
- Allowlisted with a reason in `scripts/check-no-hardcoded-urls.mjs`.

## Proposed Approach

Make `buildWorkspaceUrl` throw when it has neither a hostname nor a
`developmentOrigin` and `resolvePlatformEnvironment(env) === PRODUCTION`.

**Deliberately not done in BUG-0026.** `resolvePlatformEnvironment` treats bare
`NODE_ENV=production` as production, which a local `npm run build` and the CI
build job both set — so this change can fail builds that must keep working, and
it edits the hostname resolution that decides which tenant a request belongs to.
That is the same surface as [[BUG-0017]]. It needs its own change with the
platform-domains suite extended, not a drive-by edit inside an unrelated fix.

## Acceptance Criteria

- `buildWorkspaceUrl` with no hostname and no `developmentOrigin` throws in a
  production platform environment.
- Local `npm run build` and the CI `build` job still pass.
- `npm run test:platform-domains` covers both the throwing and the development
  case.
- The entry can be removed from the `scripts/check-no-hardcoded-urls.mjs`
  allowlist.

## Dependencies

None. Independent of [[BUG-0026]], which has landed.

## Related Items

[[BUG-0026]] — the defect class this is the residue of.
[[BUG-0017]] — the tenant base domain setting not driving hostname issuance;
same file, and a reason to treat changes here carefully.
[[ITEM-0006]] — ADR for one source of truth for the tenant base domain.

## History

- 2026-08-17 — Architect reconciliation: terminal `DONE` status normalized to
  `ArchitectDisposition: DONE`; no runtime behavior changed.

- 2026-08-16 — created at `344a832` while fixing [[BUG-0026]]; deferred with the
  reason recorded above rather than bundled into that fix.

## Resolution

Fixed. `buildWorkspaceUrl` no longer falls back to a literal
`http://localhost:3001`.

This was the one instance of BUG-0026's defect class deliberately left in place,
and the reason it was left is real: the branch is the development path, where
there is no wildcard DNS and so no workspace hostname, and the tenant app is
addressed by slug on the local web origin.

The problem was that the *literal* made it a silent fallback in production too. A
deployment reaching this branch with no tenant base domain configured would hand
a customer a loopback link rather than failing — which is precisely BUG-0026.

It now resolves through `getAppOrigin("web", env)`, which returns the same
answer in development and **throws** in production when the web URL is not
configured. Same behaviour where it was wanted, fails closed where it was not.

`require("./index")` is deliberately lazy: `index.js` requires
`platform-domains.js` at load time, so requiring it back at the top would be a
cycle. By the time anything calls `buildWorkspaceUrl` both modules are loaded.

The `check-no-hardcoded-urls` allowlist entry for `platform-domains.js` is
**kept**, and checked rather than assumed: the file still contains
`host === "localhost"` comparisons, which are loopback *detection* and exactly
what that exemption is for.

## Verification

`npm run test:platform-domains` — 13 assertions passing.
`npm run test:app-urls` — 16 passing.
`npm run check:no-hardcoded-urls` — clean, 7 allowlisted files.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0026]]
- Modules — [[deployment-architecture]]
- QA run — [[2026-08-16-production-url-integrity-344a832]]

<!-- GRAPH:END -->
