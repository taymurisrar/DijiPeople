---
ID: BUG-0036
aliases: [BUG-0036]
Title: Integration patterns context denies four subsystems that exist
Status: FIXED
Severity: MEDIUM
Priority: P2
Type: DOCUMENTATION
Source: QA_RUN
DetectedDate: 2026-08-16
DetectedInSha: 78072d2
AffectedModules: [.agent/context]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RegressionId:
RelatedBacklogItem: ITEM-0011
RelatedDecision:
RelatedImplementation: docs/knowledge/implementations/2026-08-16-monorepo-app-documentation.md
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
ResolvedAt: 2026-08-16
---

# BUG-0036 — Integration patterns context denies four subsystems that exist

## Summary

`.agent/context/integration-patterns.md` asserted, under "Known exceptions",
that four things do not exist. All four exist, three of them substantially:

| Claim | Reality |
|---|---|
| "There is no connector registry and no `attendance-integrations` module" | The module exists with **exactly** the `connectors / devices / gateways / ingestion / integrations / mapping / operations / provisioning / work-sites` structure the claim said was absent |
| "There is no `gateway/` .NET solution and no `gateway-auth.guard.ts`" | `gateway/DijiPeople.Gateway.sln` with `src/`, `tests/`, `packaging/`, `artifacts/` — **1,387 tracked files**. `gateway-auth.guard.ts` exists under `attendance-integrations/gateways/` |
| "no `gateway:build` / `gateway:test` npm scripts" | Both exist in the root `package.json`, alongside `gateway:package` |
| "There is no `tools/zkteco-poc/`" | Exists — 35 tracked files, with `zkteco:*` npm scripts |

The file additionally instructed agents to avoid "writing code that assumes
`gateway/`, `attendance-integrations` or a connector registry exists", and told
them a device-gateway integration "does not exist to extend today".

## Expected Behavior

The context layer describes the repository accurately, or is corrected. It is
the first thing every specialist reads, and `AGENTS.md` ranks it above the
source only for orientation — never for facts the source can settle.

## Actual Behavior

An Integration or Backend specialist reading this file before planning device
work would conclude the entire integration surface was unbuilt. The two
available responses are both bad: refuse the work as needing an ExecPlan for
something that already exists, or build a **second** connector surface beside
the real one — which root `AGENTS.md` prohibits as the "competing architecture"
anti-pattern.

## Reproduction

```bash
ls services/api/src/modules/attendance-integrations/
ls gateway/ && git ls-files gateway | wc -l
git ls-files tools | wc -l
grep -n "gateway:build" package.json
grep -n "There is no" .agent/context/integration-patterns.md
```

## Evidence

Verified at `main` `78072d2`:

- `services/api/src/modules/attendance-integrations/` contains the nine
  subdirectories named above.
- `services/api/src/modules/attendance-integrations/gateways/` contains
  `gateway-auth.guard.ts`, `gateway-runtime.service.ts` (+ spec),
  `gateway-credential.service.ts` (+ spec), `gateway-configuration.service.ts`
  (+ spec), `gateway-admin.controller.ts`, `gateway-runtime.controller.ts`,
  `gateway-service.controller.ts`.
- `git ls-files gateway` → 1,387; `git ls-files tools` → 35.
- Root `package.json` declares `gateway:build`, `gateway:test`,
  `gateway:package`, and eight `zkteco:*` scripts.
- The stale text was at `integration-patterns.md:166-179`, `:199-200` and
  `:216-217`, with a reinforcing instruction at `:229-231`.

The same absence-claim pattern also survives in
`.agent/context/repo-map.md` and `.agent/context/system-overview.md`, which
both state `git ls-files gateway tools` returns 0 entries. Those are corrected
in the same change.

## Root Cause

`doc-code-drift`, in its worst-ageing form: **a claim that something is absent.**
A reference to a deleted file produces a broken link somebody notices; a claim
that a file is missing simply misleads every reader for as long as it survives,
and nothing fails when it becomes false.

This is the **second recorded instance** of exactly this failure mode in the
context layer. [[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist]]
was the first, and [[ITEM-0011]] was raised then as the generalisable guard. It
remains unbuilt, and this record is the evidence that it should not stay that
way — one occurrence is bad luck, two is a pattern with a known fix already
specified.

## Impact

Bounded but real, and it is the highest-leverage kind of documentation defect:
it does not mislead a user, it misleads the agents that write the code. Nothing
shipped wrong because of it — the drift was found before any device work was
planned against it — so this is `MEDIUM`, not `HIGH`.

## Affected Areas

`.agent/context/integration-patterns.md` — primary reader: the Integration
specialist. Also `repo-map.md` and `system-overview.md`, read by everyone.

## Proposed Resolution

Replace each absence claim with the verified present state, refresh the
verification metadata, and leave a short note recording that the claims were
false so a future reader can see the correction rather than wonder whether the
file was always right. Then prioritise [[ITEM-0011]].

## Acceptance Criteria

- No context document asserts the absence of a path that exists.
- `integration-patterns.md`, `repo-map.md` and `system-overview.md` carry
  verification metadata naming the commit they were checked against.
- The Electron agent and the on-premise gateway are described as the separate
  ingestion paths they are.

## Regression Coverage

**None**, and that is the substance of [[ITEM-0011]] — framework validation
should fail when a context file asserts a path is absent while it exists. The
record's own warning stands: keep the check narrow, because a validator that
tries to interpret prose produces false failures, and a validation nobody trusts
gets bypassed.

## Dependencies

None.

## Related Items

[[BUG-0023-testing-architecture-context-claims-two-e2e-specs-do-not-exist]] ·
[[ITEM-0011]] · bug pattern [[doc-code-drift]] ·
[[desktop-api-gateway-relationship]] · [[integration-architecture]] ·
[[monorepo-application-map]].

## Resolution

Fixed on `agent/knowledge-monorepo-app-documentation` (TASK-0002).
`integration-patterns.md` now describes the four subsystems as present, names
the gateway guard and the nine-directory structure, states that the Electron
agent and the gateway share no data path, and carries `Last verified: 2026-08-16`
against `78072d2`. `repo-map.md` and `system-overview.md` were corrected in the
same change.

## QA Retest

Verified by re-reading each corrected file against the directory listings and
`git ls-files` counts quoted under Evidence. No runtime behaviour is involved.

## History

- 2026-08-16 — found during the cross-application relationship mapping for
  TASK-0002, while establishing whether the desktop agent talks to the gateway.
- 2026-08-16 — Architect triage: `FIX_NOW`. In scope for a `KNOWLEDGE` task,
  which permits correcting verified documentation drift, and the correction was
  required to answer the question the task was asked.
- 2026-08-16 — Fixed and verified in the same change.
</content>
