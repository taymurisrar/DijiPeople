---
ID: ITEM-0125
aliases: [ITEM-0125]
Title: The .NET Integration Gateway ships to customers with no CI coverage at all
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [gateway]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0125 — The .NET Integration Gateway ships to customers with no CI coverage at all

> **Architect triage, 2026-09-11 — `FIX_NOW`.** The gateway is the only software installed as a binary on a customer network, talking to their hardware, and it is the least verified component in the pipeline. The scripts and the runner capability both already exist; the gap is a job, not a capability. Cheap, and it closes a genuine hole in the required gate.

## Summary

`.github/workflows/ci.yml` never builds or tests the .NET Integration Gateway.
The workflow says so in its own header — the gateway is listed as a "Phase 2
candidate" alongside e2e and electron — so nothing in the required gate compiles
`gateway/`, runs its 104 xunit tests, or notices if it stops building.

This is the one piece of software DijiPeople installs as a binary onto someone
else's network, where it talks to their hardware.

## Why It Matters

The gateway is the least verified component in the pipeline and the only one
running outside infrastructure we control. A change that breaks it is caught by
whoever happens to run `npm run gateway:test` locally, or by a customer.

Concretely: the fix for [[BUG-2732]] — the deadlock that stopped every
on-premise attendance integration from going live — was almost entirely a
gateway change. CI validated the API, web, admin, landing, typecheck, lint,
framework, browser e2e and database migration halves of that release, and had
nothing whatever to say about the part that mattered. The evidence for it is a
local test run and a live rehearsal. Both are real, but neither is reproducible
by CI on the next change, which is the whole point of a gate.

`npm run gateway:build` and `npm run gateway:test` already exist. GitHub's
`windows-latest` runners already carry the .NET SDK. The gap is a job, not a
capability.

## Evidence

`.github/workflows/ci.yml:15` — "Phase 2 candidates (e2e, gateway, electron,
migration-against-ephemeral-db)". No job in the file references `gateway`,
`dotnet`, or `DijiPeople.Gateway.sln`.

CI run `34315627919` lists 15 jobs, none of which touch `gateway/` — while that
run's commits changed `GatewayWorker.cs`, `GatewayCommands.cs`, the FakeWorker
fixture and the gateway test project.

`package.json` already defines `gateway:build` and `gateway:test` against
`DijiPeople.Gateway.sln`. The suite is 104 tests and completes in about 13
seconds locally.

## Proposed Approach

Add a `windows-latest` job running `npm run gateway:build` and
`npm run gateway:test`, and add it to the `CI required gate` `needs` list. No
`continue-on-error` — a fail-open job on a customer-installed binary is worse
than no job at all, because it reads as coverage.

Worth deciding at the same time whether the packaging step (`publish.ps1`) also
runs, so a release artefact cannot silently stop building. That one is slower —
it publishes two self-contained binaries totalling roughly 160 MB — so it may
belong on a tag rather than on every push.

## Acceptance Criteria

1. A CI job builds `DijiPeople.Gateway.sln` and runs its tests on every push.
2. The job is in the required gate's `needs` and carries no `continue-on-error`.
3. Deliberately breaking a gateway source file turns the gate red.

## Dependencies

None.

## Related Items

[[BUG-2732]] — the gateway fix that shipped with no CI coverage of the gateway.

## Resolution

Premise re-verified before implementing: `.github/workflows/ci.yml` still had
no job touching `gateway/`, `dotnet` or `DijiPeople.Gateway.sln` — unchanged
from when this record was written.

Added a `gateway` job to `.github/workflows/ci.yml`, on `windows-latest` (the
solution targets `net8.0-windows`, which cannot build on `ubuntu-latest`):
`actions/setup-dotnet@v4` pinning the 8.0.x SDK, then `npm run gateway:build`
and `npm run gateway:test` — no `npm ci` needed, since those scripts only
shell out to `dotnet` and touch no Node package. **No `continue-on-error`**,
as the record required. Added to `ci-required`'s `needs` list.

Verified rather than assumed:

- `npm run gateway:build` — succeeds, 0 warnings, 0 errors, ~29s.
- `npm run gateway:test` — 104/104 passed, ~9s, matching the record's own
  measurement.
- The YAML parses (`js-yaml`) and the new job's presence in `ci-required.needs`
  was read back directly from the file rather than assumed.
- `node scripts/validate-framework.mjs` was re-run after the change: it counts
  required jobs from `ci-required.needs` itself (not a hardcoded list) and
  separately asserts no required job carries `continue-on-error` — both checks
  passed against the 15-job gate this change produces, confirming the
  framework's own fail-open check agrees the new job is not fail-open.

Documentation updated for the same count: `AGENTS.md`'s CI section,
`docs/development/ci.md`'s job table, and the one stale sentence in
`docs/development/ci-recommendation.md` still listing "the .NET gateway" as
unstarted work — all said fourteen/gateway-pending; both said outdated things
this change made false.

Out of scope for this closure: packaging (`publish.ps1`) as its own job. The
record raised it as a separate, slower question worth deciding on its own
terms, not as part of closing this gap.

## History

- 2026-09-09 — created at `4ee7b2cd`, while releasing a gateway-only fix.
- 2026-09-11 — closed: `gateway` job added to the required CI gate on
  `windows-latest`, running the same `npm run gateway:build`/`gateway:test`
  the record named, with no `continue-on-error`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[desktop-api-gateway-relationship]]

<!-- GRAPH:END -->
