# Agent Orchestration

How a request becomes shipped, reviewed, tested and remembered work.

Roles: [`.agent/agents/`](../../.agent/agents/).
Planning contract: [`PLANS.md`](../../PLANS.md).
Parallelism rules: [`parallel-work.md`](parallel-work.md).

---

## Default workflow

```
User request
     │
     ▼
ARCHITECT ──── loads .agent/context/*, bug patterns, regression register
     │         ExecPlan: FACT / INFERENCE / PROPOSAL
     │         classifies tasks, names specialists, plans branches
     ▼
   human approval of the plan
     │
     ▼
SPECIALISTS ── Backend/API · Frontend · UI/UX · Database · Integration
     │          one bounded task each, on agent/<feature>-<scope>
     │          PARALLEL_SAFE concurrent · DEPENDENCY_BLOCKED waits
     ▼
QA ─────────── independent scenarios, documented run in docs/qa/runs/
     │
     ▼
REVIEWER ───── independent findings, CRITICAL → LOW, read-only
     │
     ▼
PUSH ───────── task branch pushed to origin (when a remote is available)
     │
     ▼
CI ─────────── GitHub Actions: 8 required jobs + 2 report-only baselines
     │          red required gate → STOP, classify, fix. Never bypass.
     ▼
INTEGRATOR ─── classifies every conflict, resolves TYPE 1-2, escalates 3-9
     │          merges only when every gate passes, CI included
     ▼
POST-MERGE CI  re-runs on the target branch after the merge lands
     │
     ▼
INTEGRATED QA  validation on the merged result, not the branches
     │
     ▼
RELEASE/DEVOPS readiness gates, environment revalidation, deploy order
     │          deploys where credentials and policy allow
     ▼
DEPLOYMENT QA  smoke tests, health checks, deployment QA run
     │
     ▼
KNOWLEDGE ──── knowledge-capture Skill → docs/knowledge/
     │
     ▼
OBSIDIAN ───── node scripts/sync-obsidian.mjs (non-blocking)
     │
     ▼
CLEANUP ────── remove temporary worktrees, delete merged local branches
     │
     ▼
FINAL REPORT ─ docs/development/final-report-template.md
```

A task is complete only when **IMPLEMENTATION**, **REVIEW** and **QA** are all
complete. Any of the three can block.

Integration and release are separate stages with their own gates — see
[`.agent/agents/integrator.md`](../../.agent/agents/integrator.md) and
[`.agent/agents/release-devops.md`](../../.agent/agents/release-devops.md).
Neither runs on a task whose QA verdict is FAIL.

---

## CI in the loop

CI is a machine-enforced participant, not a self-report. When a remote is
available the Integrator pushes the task branch, waits for the
`CI required gate` check, and merges only if it passed **on that commit**.

- **Red required gate → STOP.** Classify the failure first
  (`DETERMINISTIC_FAILURE`, `ENVIRONMENT_FAILURE`, `FLAKY_TEST`,
  `KNOWN_BASELINE`, `EXTERNAL_DEPENDENCY_FAILURE`). Only the last justifies an
  automatic retry.
- **No remote, or CI cannot run** → report `REMOTE_CI = UNAVAILABLE`, fall back
  to local gates, and say so explicitly. Never imply CI ran when it did not.
- **`security-invariant-report` and `lint-api-report` are non-gating** known
  baselines — see [`ci.md`](ci.md).
- **Branch advanced while CI ran** → the run is against a stale base. Rebase or
  merge the target in, push, and let CI re-run. Do not merge on a green run
  against an older base; branch protection can enforce this with "require
  branches to be up to date".
- **Post-merge CI fails** → treat it as an incident on the target branch, not a
  task-branch problem. Fix forward or revert the merge; do not start new work on
  a red target.

---

## Git and deployment autonomy

The user should not normally need to ask for a branch, a worktree, a commit, a
push, a merge, a readiness check or a cleanup. The orchestration decides:

- **Substantial task** → isolated worktree + `agent/<task>` branch, by default.
- **Trivial safe change** (copy, comment, docs) → a simpler path is permitted.
- **Pushing task branches and reading CI** → Integrator, automatically, when a
  remote and credentials exist.
- **Merging** → Integrator, once every gate passes, CI included.
- **Cleanup** → temporary worktrees removed, merged *local* branches deleted;
  remote branches left per repository policy.
- **Deployment readiness, ordering, smoke checks and release records** →
  Release/DevOps.

Never automatic, under any circumstances: force-pushing a shared branch,
overwriting remote history, deleting an unmerged remote branch, bypassing a
required check, or merging while required CI is red.

Still requires a human: approving the ExecPlan, accepting a `PASS WITH RISKS`
QA verdict, and production deployment — which this repository does not yet
authorise agents to perform (see
[`../deployment/README.md`](../deployment/README.md)).

---

## Choosing specialists

The Architect names who is needed **and who is deliberately not**. Invoking
every role for every task produces documentation nobody reads and hides which
roles actually mattered.

| Request | Specialists |
|---|---|
| Backend bug, one module | Backend/API |
| New endpoint | Backend/API |
| Schema + API change | Database → Backend/API (sequential) |
| New product screen | Frontend, plus UI/UX if there is a real experience decision |
| Field added to an existing runtime spec | Frontend only — no UI/UX |
| Device / gateway / webhook | Integration |
| Authorization change | Backend/API + `authorization-dry-run` Skill |
| Copy or styling | Frontend |

QA and Reviewer are **always** invoked for anything beyond a copy change.

---

## Good parallelisation, in this repository

Verified safe, because the files are disjoint and neither needs the other's
output:

- Backend work in `modules/leave` alongside backend work in `modules/claims`
- A frontend adapter under `lib/runtime/modules/` alongside an unrelated one
- Documentation, ADRs and test-plan authoring alongside implementation
- Security analysis (read-only) alongside anything
- Context-document research across different layers — used to build this
  framework: four agents, fourteen documents, zero conflicts

## Bad parallelisation, in this repository

Each of these has a concrete reason, not a theoretical one:

- **Two tasks touching `schema.prisma`** — one 10,000-line file; concurrent
  edits conflict constantly and a bad merge silently changes the database.
- **Backend work that needs a regenerated Prisma client, started before the
  schema lands** — it cannot compile.
- **Two tasks editing `permissions.ts` or `rbac-matrix.ts`** — single-writer
  sources of truth.
- **Two agents running `prisma migrate dev`** against the shared dev database —
  they corrupt each other's migration state.
- **Frontend integration before the API contract is merged** — UX preparation
  against an agreed contract is fine; wiring to a real endpoint is not.
- **Two "parallel" tasks in the same file** — that is one task with one owner.

> Real example: in the Batch 0 remediation, five issues looked parallel. Two of
> them lived in `attendance.service.ts`, so they were merged into a single work
> item. The other three were genuinely disjoint and ran independently. The
> classification, not the agent count, is what made it safe.

---

## Worktrees

One substantial task → one isolated worktree → multiple logical commits.

Multiple worktrees only for genuinely parallel-safe work. Do not create a branch
per tiny issue. Mechanics and the baseline requirement:
[`git-worktrees.md`](git-worktrees.md).

---

## Verification discipline

Two rules that carry disproportionate weight:

1. **Subagent output is evidence, not truth.** The orchestrator verifies
   material claims before acting on them. During this framework's own
   construction, context agents reported four significant discrepancies —
   including a header name that appeared in five documents and zero lines of
   code. Each was verified before correction.
2. **Code is current implementation truth.** When a context document disagrees
   with the code, follow the code, report the discrepancy, and fix the document.
   Never reshape code to match documentation.

---

## When to escalate instead of proceeding

Stop and report rather than improvising when:

- A permission dry-run shows legitimate users would lose access
- No existing permission key or matrix entity fits
- A task turns out to need a single-writer file the plan did not allocate
- A migration would be irreversible without an agreed backfill
- The requirement is ambiguous in a way that changes the design

Each of these has produced a correct stop in practice. Stopping is a successful
outcome, not a failure.
