---
ID: ITEM-0027
aliases: [ITEM-0027]
Title: apps/agent-desktop has no AGENTS.md and no test coverage
Type: TEST_GAP
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/agent-desktop, services/api/src/modules/agent]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
CreatedAt: 2026-08-16
UpdatedAt: 2026-08-16
RelatedBug: BUG-0034
RelatedQA: docs/qa/runs/2026-08-16-monorepo-app-documentation-78072d2.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0027 — apps/agent-desktop has no AGENTS.md and no test coverage

## Summary

`apps/agent-desktop` is the only application in this monorepo with **neither
scope-specific agent instructions nor a single test** — and it is the one with
native OS capabilities, an OS credential vault, background telemetry that reads
window titles, and geolocation capture. The API module that serves it,
`services/api/src/modules/agent/`, has no specs either.

## Why It Matters

Every other workspace has an `AGENTS.md`: `apps/web`, `apps/admin`,
`apps/landing`, `packages/config`, `services/api`, `services/api/prisma`. This
one does not, so nothing tells an agent working here:

- that `src/renderer/*.js` are **compiled artefacts committed to Git beside
  their `.ts` sources**, that editing the `.js` is wrong, and that
  `npm run build` deletes tracked files — an active hazard against the
  repository's own `POST_TASK_REPO_HEALTH` invariant;
- what the Electron process boundary rules are — `contextIsolation`,
  `nodeIntegration`, `sandbox`, what `preload.ts` may expose, and that IPC input
  is only thinly validated because the API re-validates;
- that the three privacy denials (`allowScreenshots`, `allowClipboard`,
  `allowKeylogging`) are deliberately hardcoded `false` at **both** the type
  level and in `ConfigManager`, so a compromised server cannot enable them —
  and that this double lock must not be "simplified";
- that the app must never hold or send a `tenantId`;
- what may be written to the plaintext offline queue, given it already holds
  window titles and browser tab titles.

The testing gap is what let [[BUG-0034-desktop-agent-logout-never-revokes-the-refresh-token]]
survive: a request whose payload the server rejects on **every single call**,
with the client swallowing the error. One contract test at any layer would have
caught it. There was no layer.

## Evidence

- No `apps/agent-desktop/AGENTS.md` — verified against the set of nested
  `AGENTS.md` files listed in root `AGENTS.md`.
- `apps/agent-desktop/package.json` — no `test` script; scripts are `dev`,
  `build`, `build:main`, `build:renderer`, `copy:renderer`, `clean`, `start`,
  `clean:release`, `dist:win`, `check-types`. No jest/vitest/playwright config
  exists anywhere under the workspace.
- `services/api/src/modules/agent/` — controller, module, service and `dto/`
  only; no `*.spec.ts`.
- `services/api/test/` — no suite covers `/agent/*`.
- `.github/workflows/ci.yml` — `agent-desktop` is never named. It is covered
  **indirectly** by `typecheck` and `build` (it is an `apps/*` workspace
  declaring `check-types` and `build`), and **not** by `lint`, which names only
  web, admin and landing. The workflow header lists `electron` among deliberate
  "Phase 2 candidates".
- `package.json` `clean` script deletes `src/renderer/*.js`, which
  `git ls-files apps/agent-desktop` confirms are tracked.

## Proposed Approach

No ExecPlan needed. Two independent, small pieces of work:

1. **Write `apps/agent-desktop/AGENTS.md`**, covering the points above. The
   material already exists in [[desktop-agent-architecture]]; this is a
   condensation into scope rules, not new research.
2. **Add specs where the contract lives.** The highest-value first tests are
   the API side — the `agent` module's auth, heartbeat and device handlers,
   where jest already runs and CI already gates. Electron-process tests need a
   harness that does not exist and should not block the API-side coverage.

Resolve the committed-build-artefact question in the same change: either stop
tracking `src/renderer/*.js` or stop deleting them in `clean`. The current
combination is the hazard.

## Acceptance Criteria

- `apps/agent-desktop/AGENTS.md` exists and states the process-boundary,
  privacy-flag, tenant and build-artefact rules.
- `services/api/src/modules/agent/` has specs covering at minimum the three
  auth handlers and the heartbeat contract.
- `npm run build` in `apps/agent-desktop` does not leave deleted tracked files.

## Dependencies

None. This is the item that makes the other agent-desktop records cheaper to fix.

## Related Items

[[BUG-0034-desktop-agent-logout-never-revokes-the-refresh-token]] ·
[[BUG-0032-desktop-agent-login-is-unthrottled-and-enumerates-users-acro]] ·
[[BUG-0035-agent-heartbeat-has-no-idempotency-so-retries-double-count-p]] ·
[[ITEM-0025]] · [[ITEM-0026]] · [[desktop-agent-architecture]] ·
[[desktop-agent]] · bug pattern [[doc-code-drift]].

## History

- 2026-08-16 — created at `78072d2` during the `apps/agent-desktop` deep
  documentation audit (TASK-0002).
- 2026-08-16 — Architect triage: `FIX_NOW`. Both halves are small and neither
  needs a decision. Prioritised because four separate defects in this app were
  found by reading it once, which is what an absent instruction file and absent
  tests look like from the outside.
</content>
