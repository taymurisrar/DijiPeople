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
RETRIEVAL ──── node scripts/retrieve-knowledge.mjs <terms>
     │          relevant history only — never the whole vault
     ▼
ARCHITECT ──── BACKLOG_PRECHECK: open bugs, backlog, regressions,
     │          patterns, product decisions, prior user corrections
     │          → KNOWN_ISSUES_TO_AVOID · RELATED_OPEN_BACKLOG
     │            RELATED_REGRESSIONS · RELATED_PRODUCT_DECISIONS
     │          ExecPlan: FACT / INFERENCE / PROPOSAL
     ▼
   human approval of the plan
     │
     ▼
SPECIALISTS ── Backend/API · Frontend · UI/UX · Database · Integration
     │          each opens with KNOWN_MISTAKES_TO_AVOID
     │          PARALLEL_SAFE concurrent · DEPENDENCY_BLOCKED waits
     ▼
QA ─────────── independent scenarios, documented run in docs/qa/runs/
     │
     ▼
FINDING ────── every material finding → docs/bugs/BUG-nnnn (or an update)
EXTRACTION    evidence · reproduction · severity · linked scenario id
     │         node scripts/rebuild-backlog.mjs
     ▼
TRIAGE ─────── Architect: BACKLOG_POST_QA_TRIAGE
     │          FIX_NOW / PLAN_REQUIRED / DEFER /
     │          PRODUCT_DECISION / BLOCKED_EXTERNAL / ACCEPTED_RISK
     ▼
QA RETEST ──── verifies fixes; regression proven to fail without them
     │
     ▼
REVIEWER ───── independent findings, CRITICAL → LOW, read-only
     │          REPEATED_REGRESSION checks against bugs/patterns/corrections
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
HISTORY ────── docs/engineering-history/tasks/ — branches, conflicts,
     │          resolutions, merge SHA, CI run. Integrator owns it.
     ▼
RELEASE/DEVOPS readiness gates, environment revalidation, deploy order
     │          deploys where credentials and policy allow
     ▼
DEPLOYMENT QA  smoke tests, health checks, deployment QA run
     │          → docs/deployment/release-history/ (deployed state)
     ▼
KNOWLEDGE ──── knowledge-capture Skill → docs/knowledge/
     │
     ▼
BACKLOG ────── node scripts/rebuild-backlog.mjs (indexes reflect reality)
     │
     ▼
OBSIDIAN ───── node scripts/generate-dashboards.mjs
     │          node scripts/sync-obsidian.mjs (non-blocking)
     ▼
CLEANUP ────── remove temporary worktrees, delete merged local branches
     │
     ▼
FINAL REPORT ─ docs/development/final-report-template.md
```

**No material QA finding may exist only in a chat report**, and no substantial
task may complete while a finding it produced is unclassified. Those two rules
are enforced by `QA_FINDINGS_CLASSIFIED_STATUS`, `BUG_RECORD_STATUS`,
`ARCHITECT_TRIAGE_STATUS` and `BACKLOG_UPDATE_STATUS` in the completion contract.

Integration and release are separate stages with their own gates — see
[`.agent/agents/integrator.md`](../../.agent/agents/integrator.md) and
[`.agent/agents/release-devops.md`](../../.agent/agents/release-devops.md).
Neither runs on a task whose QA verdict is FAIL.

---

## What `DijiPeople Task:` means

A prompt beginning `DijiPeople Task:` requests the **complete engineering
lifecycle** — the framework activates itself. **The user never restates these
rules.**

### Keyword routing

An optional keyword after the colon is an **intent hint**, not a separate
workflow. The lifecycle above stays one and unified; what a keyword changes is
which specialist leads, which risks are assumed present until disproven, and
what the definition of done additionally requires.

```
BUG · FEATURE · UI/UX · QA · E2E · ARCHITECTURE · DATABASE · INTEGRATION
SECURITY · PERFORMANCE · RELEASE · DEPLOY · HOTFIX · BACKLOG · KNOWLEDGE
FRAMEWORK · AUDIT
```

**Keywords are optional, and an unrecognised one is not an error.** With none,
the Architect infers the type from the description and states what it inferred:
"fix the tenant provisioning retry" → `BUG`; "improve payroll UI" → `UI/UX` +
`FEATURE`; "test complete onboarding" → `E2E`/`QA`.

Full table, inference rules and per-type definitions of done:
[`../../.agent/context/task-router.md`](../../.agent/context/task-router.md).

**No keyword weakens a gate** — not the shared-target CI rule, not branch
protection, not tenant isolation, not durable findings. `HOTFIX` is the one most
often read as an exception; urgency narrows scope, never evidence.

### Sizing, work packages and automatic continuation

The Architect classifies size — `SMALL`, `MEDIUM`, `LARGE`, `PROGRAM` — by
dependency and architectural scope, never by file count. `LARGE` and `PROGRAM`
get a durable parent record under [`../tasks/`](../tasks/), decomposed into work
packages whose boundaries follow ownership (schema, backend, frontend, security,
integration, migration, QA, browser E2E, deployment) — never file ranges.

When a package reaches `DONE`, the Architect recomputes what is `READY` and
**starts the next one without asking.** A task stops only when *every* remaining
package is blocked by `OWNER_DECISION_REQUIRED`, `BLOCKED_EXTERNAL`,
`UNRECOVERABLE_TOOL_FAILURE` or `SAFETY_BLOCK` — and it then reports every block
at once. **One blocked package never stops an independent one.**

Rules:
[`../../.agent/context/task-orchestration.md`](../../.agent/context/task-orchestration.md).

### Progress reporting

Large tasks emit concise checkpoints when a package changes state — not
engineering logs, and not on a timer. Detailed evidence stays in the repository:
QA runs, bug records, engineering history, the task record. The format includes
`Main:` (`MAIN_SYNC_STATUS`) and `Deployment:` so repository and environment
drift surface early rather than at the end.

### Repository health

Release/DevOps runs `npm run repo:health` **before** a branch is created and
**after** the merge, on every substantial task — including tasks that deploy
nothing. `main` is protected with no admin bypass; a rejected direct push is
`PROTECTED_BRANCH_REQUIRES_PR`, which the Integrator recovers automatically via
a task branch, a PR and the exact-SHA CI verdict, ending with local `main`
synchronised. See
[`../../.agent/context/repository-health.md`](../../.agent/context/repository-health.md).

### It also implicitly means all of

- **retrieve relevant historical knowledge** before planning
  (`RELEVANT_KNOWLEDGE_RETRIEVAL` — see
  [`../../.agent/context/knowledge-architecture.md`](../../.agent/context/knowledge-architecture.md))
- **review the backlog and open bugs** for the affected modules
  (`BACKLOG_PRECHECK`), and **triage every new finding afterwards**
  (`BACKLOG_POST_QA_TRIAGE`)
- **turn every material QA finding into a durable record** under `docs/bugs/`
- **inspect known regressions** for the affected modules
- **process user corrections durably** (`USER_FEEDBACK_CLASS`)
- **use browser QA** when relevant and available
- **use isolated-database QA** when relevant and available
- **use the CI and Git gates**
- **capture new lessons**, then **sync knowledge**

The user should never have to append "push it", "merge it", "sync Obsidian",
"clean the worktree", "remember this", "don't make this mistake again", "check
previous bugs", "look at Obsidian", "open a PR", "wait for CI", "continue with
the next part" or "fix main being ahead". Those are phases of the task, not
extras.

The Integrator runs because the task **modified Git-tracked files**, never
because the prompt asked for Git operations. Release/DevOps runs because the
task was substantial, never because the prompt mentioned deployment.

## Completion is defined by the contract

Implementation, review and QA finishing is **not** completion. It once was, and
the result was a task that reported success while a new API module, a migration
and ten deleted components sat uncommitted in a working tree. The capability was
never missing — the definition of done simply ended before finalization began.

Completion is now defined by
[`.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md),
enforced by `scripts/validate-framework.mjs`. A task is complete only when every
one of these is resolved:

```
IMPLEMENTATION_STATUS           REVIEW_STATUS                 ENGINEERING_HISTORY_STATUS
LOCAL_VALIDATION_STATUS         PR_STATUS                     FEEDBACK_PROMOTION_STATUS
QA_STATUS                       REMOTE_CI_STATUS              KNOWLEDGE_CAPTURE_STATUS
QA_FINDINGS_CLASSIFIED_STATUS   MERGE_STATUS                  OBSIDIAN_SYNC_STATUS
BUG_RECORD_STATUS               POST_MERGE_VALIDATION_STATUS  CLEANUP_STATUS
ARCHITECT_TRIAGE_STATUS         MAIN_SYNC_STATUS
BACKLOG_UPDATE_STATUS           POST_TASK_REPO_HEALTH
PRE_TASK_REPO_HEALTH            DEPLOYMENT_STATUS
PARENT_TASK_STATUS              DEPLOYMENT_DRIFT_STATUS
WORK_PACKAGE_STATUS
```

Resolved means `PASS`, `DONE`, `NOT_REQUIRED` (with a stated reason),
`BLOCKED_<REASON>` or `FAILED`. Never `ASSUMED_PASS`, and never omitted.

Two are terminal invariants rather than ordinary fields: after a completed
substantial task, **`MAIN_SYNC_STATUS` must be `SYNCED`** and
**`POST_TASK_REPO_HEALTH` must be `PASS`** — no stuck push, unfinished merge or
rebase, unexpected local-`main` commit, or unverified divergence left behind.

Until the contract has been evaluated, the phrasing is
**`IMPLEMENTATION COMPLETE — FINALIZATION PENDING`** — not "done".

Run `node scripts/finalize-agent-task.mjs` to collect the finalization facts:
SHAs, push parity verified against the remote refs, CI observability, QA and
knowledge presence, Obsidian sync, and cleanup candidates. It reports; it never
merges, pushes or deletes.

---

## CI in the loop

CI is a machine-enforced participant, not a self-report. When a remote is
available the Integrator pushes the task branch, waits for the
`CI required gate` check, and merges only if it passed **on that commit**.

- **Red required gate → STOP.** Classify the failure first
  (`DETERMINISTIC_FAILURE`, `ENVIRONMENT_FAILURE`, `FLAKY_TEST`,
  `KNOWN_BASELINE`, `EXTERNAL_DEPENDENCY_FAILURE`). Only the last justifies an
  automatic retry.
- **Shared target + unreadable verdict → STOP.** For `main`, `develop`,
  `release/*`, `production`, or anything policy marks protected, a merge requires
  `REMOTE_CI_STATUS = PASS` on the exact SHA. `BLOCKED_BY_ACCESS`, `UNAVAILABLE`,
  `UNKNOWN`, `PENDING` and `FAILED` do not authorise one, however green the local
  run was. Push the task branch — always allowed — then record
  `MERGE_STATUS = BLOCKED_CI_UNVERIFIED` and
  `TASK_STATUS = BLOCKED_FINALIZATION`, and leave the target untouched.
- **No remote, or CI cannot run** → report `REMOTE_CI = UNAVAILABLE`, fall back
  to local gates where the target is not shared, and say so explicitly. Never
  imply CI ran when it did not.
- **`security-invariant-report` and `database-e2e-report` are non-gating** known
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
  remote and credentials exist. Pushing the **task branch** stays allowed even
  when the CI verdict cannot be read — it starts CI and preserves the work.
- **Merging** → Integrator, once every gate passes, CI included. Into a shared
  target, only on a verified CI `PASS`.
- **Cleanup** → temporary worktrees removed, merged *local* branches deleted;
  remote branches left per repository policy.
- **Deployment readiness, ordering, smoke checks and release records** →
  Release/DevOps.

Never automatic, under any circumstances: force-pushing a shared branch,
overwriting remote history, deleting an unmerged remote branch, bypassing a
required check, merging while required CI is red, or **merging into a shared
target on anything other than a verified CI `PASS`**.

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
