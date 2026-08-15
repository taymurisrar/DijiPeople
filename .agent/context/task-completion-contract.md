# Task Completion Contract

> **Last verified:** 2026-08-15
> **Verified against commit:** ad8f77f
> **Key source files:** scripts/validate-framework.mjs, scripts/finalize-agent-task.mjs, scripts/rebuild-backlog.mjs, .agent/agents/integrator.md, .agent/agents/architect.md, .agent/agents/qa.md, docs/bugs/README.md, docs/backlog/README.md, docs/engineering-history/README.md, docs/development/agent-orchestration.md, docs/development/final-report-template.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

This is the **authority on when a DijiPeople task may be called complete.**
Every other role document defers to it. `scripts/validate-framework.mjs`
enforces its existence, its fields and its ordering, so removing or hollowing it
out fails CI rather than silently reverting the framework.

## CURRENT

### Why this exists

A task shipped a complete, tested tenant control-plane implementation and then
stopped. Nothing was committed, branched, pushed, merged, documented as a QA
run, captured as knowledge, or synced. Every role document already said the
Integrator owns Git and that knowledge capture follows integration — but
completion was defined as:

```
IMPLEMENTATION COMPLETE + REVIEW COMPLETE + QA COMPLETE
```

so the task was, by the framework's own definition, complete while its output
sat uncommitted in a working tree. The gap was not a missing capability. It was
a **definition of done that ended before finalization began.**

---

## The mandatory lifecycle

Every substantial task runs this in order. Later phases may be `NOT_REQUIRED`,
but they are never skipped silently.

```
REQUEST
  ↓
RELEVANT KNOWLEDGE RETRIEVAL
  ↓
ARCHITECT  ──────────────────────  BACKLOG_PRECHECK
  ↓
SPECIALIST IMPLEMENTATION  ───────  KNOWN_MISTAKES_TO_AVOID
  ↓
LOCAL VALIDATION
  ↓
QA
  ↓
QA FINDING EXTRACTION  ───────────  BUG RECORDS + BACKLOG UPDATE
  ↓
ARCHITECT TRIAGE  ────────────────  BACKLOG_POST_QA_TRIAGE
  ↓
FIX / PLAN / DEFER / PRODUCT DECISION / BLOCK
  ↓
QA RETEST
  ↓
REVIEWER  ────────────────────────  REPEATED_REGRESSION CHECK
  ↓
INTEGRATOR
  ↓
REMOTE CI
  ↓
MERGE
  ↓
POST_MERGE_VALIDATION
  ↓
ENGINEERING HISTORY RECORD
  ↓
KNOWLEDGE CAPTURE
  ↓
BACKLOG REBUILD
  ↓
OBSIDIAN SYNC
  ↓
CLEANUP
  ↓
FINAL REPORT
```

The loop between QA and the Reviewer is not optional decoration. **No material
QA finding may exist only inside a chat report**, and no substantial task may
complete while a finding it produced is still unclassified. Those two rules are
what turn a QA run from a report into a system that gets stronger.

**No phase before FINAL REPORT may declare the overall task complete.** An agent
that finishes implementation has finished *its* phase, not the task.

The ordering after MERGE is deliberate and is machine-checked: knowledge is
captured from the code that actually landed, and Obsidian publishes the captured
knowledge. Syncing before the merge would publish a state that may never exist.

---

## Task state machine

```
RECEIVED
  → ANALYZING
  → PLANNED
  → IMPLEMENTING
  → VALIDATING
  → QA
  → REVIEW
  → INTEGRATING
  → WAITING_FOR_CI
  → MERGING
  → POST_MERGE_VALIDATION
  → CAPTURING_KNOWLEDGE
  → SYNCING_OBSIDIAN
  → CLEANING_UP
  → COMPLETE
```

Any state may transition to **BLOCKED** (waiting on access, a decision, or
another agent) or **FAILED** (a gate failed and the task cannot proceed).

`COMPLETE` is reachable **only** from `CLEANING_UP`, and only once every field
in the completion contract below is resolved.

### Qualified terminal states

Real tasks end in conditions that are neither clean success nor failure. Naming
them is what stops an agent rounding them up to "complete".

| State | Meaning |
|---|---|
| `COMPLETE` | Every contract field is `PASS`, `DONE` or `NOT_REQUIRED` |
| `COMPLETE_WITH_UNVERIFIED_CI` | **Narrow.** Only where remote CI genuinely does not apply — `SHARED_TARGET = false`, or no CI configured, or a documented local-only policy. **Never** for work integrated into a shared branch. See [Shared targets](#shared-targets-and-the-ci-merge-gate) |
| `COMPLETE_WITH_DOCUMENTATION_WARNING` | Code, Git and validation all succeeded; `OBSIDIAN_SYNC_STATUS = FAILED`. Documentation automation is non-blocking |
| `IMPLEMENTATION_COMPLETE_BUT_UNMERGED` | Implementation and validation passed; the work is committed on a task branch that has not merged |
| `BLOCKED_FINALIZATION` | Implementation is done but a finalization step is blocked — push access, merge access, or **an unreadable CI verdict on a shared target**. **Not** a form of complete |
| `BLOCKED` / `FAILED` | Blocked awaiting something external, or a gate failed outright |

---

## Shared targets and the CI merge gate

A task merged into `main` while its CI verdict was unreadable. Local gates were
green and nothing broke, but the merge was authorised by *inference* — the exact
substitution this contract forbids everywhere else. On a branch other people
pull from, that is not an acceptable risk to take on their behalf.

### `SHARED_TARGET`

Every plan and every finalization report classifies its target branch:

```
SHARED_TARGET = true | false
```

**`true` by default** — other people's work depends on it:

- `main`, `master`
- `develop`, when used collaboratively
- `release/*`
- `production`, `staging`
- any branch repository policy marks protected or shared

**`false`** — the branch belongs to this task:

- `agent/*`, `chore/*`
- a personal `feature/*` branch nobody else pulls from

When uncertain, it is `true`. The cost of wrongly treating a private branch as
shared is one blocked merge; the cost of the reverse is unverified code on a
branch a team builds from.

### The rule

When remote CI is configured **and** `SHARED_TARGET = true`:

```
MERGE requires REMOTE_CI_STATUS = PASS
```

Nothing else authorises it. Specifically, **none** of these permit a merge into
a shared target:

| Value | Why it does not authorise |
|---|---|
| `BLOCKED_BY_ACCESS` | CI ran; nobody read it. An unread result is not a pass |
| `UNAVAILABLE` | No verdict exists |
| `UNKNOWN` | Same, stated less precisely |
| `PENDING` | Still running — a verdict that has not happened yet |
| `FAILED` | It ran and failed |
| `ASSUMED_PASS` | Not a value at all |

Local validation passing does **not** substitute. That is what happened the last
time, and it is why this section exists.

### What to do when CI cannot be read

Push the task branch — always. That starts CI, preserves the work on the remote,
and costs nothing. Then stop:

```
MERGE_STATUS   = BLOCKED_CI_UNVERIFIED
TASK_STATUS    = BLOCKED_FINALIZATION
```

- **Do not merge.**
- **Do not push the target branch.**
- Report the exact command that could not be run, and the SHA whose verdict is
  needed.

The work is safe on its pushed branch. A human — or a later agent with CI
access — reads the verdict and completes the merge. Nothing is lost, and
nothing unverified reaches a branch other people pull from.

### When the gate does not apply

| Situation | Flow |
|---|---|
| No remote CI configured | `REMOTE_CI_STATUS = UNAVAILABLE`; repository policy determines the local flow, and local gates carry the merge |
| `SHARED_TARGET = false` | Local integration may proceed where policy permits; record the CI status honestly regardless |
| Documented local-only repository policy | Follow it, and cite it in the report |

**Branch protection is the other half of this.** These rules govern agent
behaviour; branch protection governs everyone — humans, other Git clients,
direct pushes, and agents that ignore their instructions. Neither replaces the
other, and this repository currently has only the first. See
[`../../docs/development/branch-protection.md`](../../docs/development/branch-protection.md).

---

## The completion contract

A task may output `TASK_STATUS = COMPLETE` only when **every** field below is
resolved. "Resolved" means it carries one of the allowed values — not that it
was omitted, and not that it was assumed.

```
IMPLEMENTATION_STATUS
LOCAL_VALIDATION_STATUS
QA_STATUS
QA_FINDINGS_CLASSIFIED_STATUS
BUG_RECORD_STATUS
ARCHITECT_TRIAGE_STATUS
BACKLOG_UPDATE_STATUS
REVIEW_STATUS
REMOTE_CI_STATUS
MERGE_STATUS
POST_MERGE_VALIDATION_STATUS
ENGINEERING_HISTORY_STATUS
FEEDBACK_PROMOTION_STATUS
KNOWLEDGE_CAPTURE_STATUS
OBSIDIAN_SYNC_STATUS
CLEANUP_STATUS
```

### The finding-classification gates

Four of these are new, and they exist for one reason: **a QA finding that lives
only in a report is lost when the session ends.** The next agent to touch that
module reads the backlog, not your prose — so a defect nobody recorded is a
defect that gets found again, at full cost, by someone who had no way to know.

| Field | Resolved when | May be `NOT_REQUIRED` when |
|---|---|---|
| `QA_FINDINGS_CLASSIFIED_STATUS` | **Every** material QA finding carries exactly one disposition: `FIXED`, `OPEN`, `DEFERRED`, `BLOCKED`, `PRODUCT_DECISION`, `ACCEPTED_RISK`, `NOT_A_BUG`, `DUPLICATE` | QA produced no findings, or `QA_STATUS = NOT_REQUIRED` |
| `BUG_RECORD_STATUS` | Every finding needing a durable record has one under `docs/bugs/`, with evidence and reproduction — or an existing record was updated | No finding required a record; state which findings were considered and why not |
| `ARCHITECT_TRIAGE_STATUS` | No record produced by this task is still `ArchitectDisposition: TRIAGE_REQUIRED` | No new records |
| `BACKLOG_UPDATE_STATUS` | `node scripts/rebuild-backlog.mjs` ran clean and the indexes are current | The task created and changed no record |
| `ENGINEERING_HISTORY_STATUS` | A record exists under `docs/engineering-history/tasks/` with no unresolved TODO | The task modified no Git-tracked files |

**`QA_STATUS = PASS` is not permitted while `QA_FINDINGS_CLASSIFIED_STATUS` is
unresolved.** A run may pass with recorded, dispositioned defects — frequently it
should. What it may not do is pass while something QA saw has nowhere to live.

**`ARCHITECT_TRIAGE_STATUS` cannot be resolved by QA or by the implementing
specialist.** QA establishes what is true; the Architect decides what the project
does about it. Collapsing those two roles gives the person who found the defect,
or the person who would have to fix it, authority over whether it counts.

A `CRITICAL` finding left `DEFERRED` never resolves this field. See the severity
rules in [`../agents/architect.md`](../agents/architect.md).

`FEEDBACK_PROMOTION_STATUS` is evaluated **before** knowledge capture finishes.
A correction the user made during the task is often the most valuable thing the
task produced; capturing knowledge without it loses exactly that. Allowed
values: `DONE`, `NOT_REQUIRED` (with a reason), `BLOCKED`. See
[User corrections become durable behaviour](#user-corrections-become-durable-behaviour).

### Allowed values

| Value | Use when |
|---|---|
| `PASS` | The gate ran and passed |
| `DONE` | A non-gate action completed (a merge, a sync, a cleanup) |
| `NOT_REQUIRED` | Genuinely inapplicable — **with a stated reason** |
| `BLOCKED_<REASON>` | Attempted and prevented, e.g. `BLOCKED_BY_ACCESS`, `BLOCKED_BY_POLICY`, `BLOCKED_BY_CONFLICT`, `BLOCKED_CI_UNVERIFIED` |
| `FAILED` | Ran and failed |

`SKIPPED_NO_LOCAL_CONFIG` is additionally allowed for `OBSIDIAN_SYNC_STATUS`.

**`NOT_REQUIRED` needs a reason.** "QA_STATUS = NOT_REQUIRED" on a task that
changed an API response is a false gate, not an exemption.

**`ASSUMED_PASS` is not a value.** Neither is leaving a field out. A field an
agent cannot evaluate is `BLOCKED_<REASON>`, which is honest and visible.

### Which fields may be `NOT_REQUIRED`

| Field | May be `NOT_REQUIRED` when |
|---|---|
| `QA_STATUS` | Copy, comment or docs-only change (see `docs/qa/README.md`) |
| `REVIEW_STATUS` | Never for code. Docs-only changes may waive it |
| `REMOTE_CI_STATUS` | No remote exists, or no CI is configured |
| `MERGE_STATUS` | The task never modified Git-tracked files |
| `POST_MERGE_VALIDATION_STATUS` | Nothing merged |
| `FEEDBACK_PROMOTION_STATUS` | No user correction occurred, or every correction classified `NOT_DURABLE` |
| `ENGINEERING_HISTORY_STATUS` | The task modified no Git-tracked files |
| `QA_FINDINGS_CLASSIFIED_STATUS` | QA produced no findings |
| `BUG_RECORD_STATUS` | No finding required a durable record — name the findings considered |
| `ARCHITECT_TRIAGE_STATUS` | No new records were produced |
| `BACKLOG_UPDATE_STATUS` | No record was created or changed |
| `KNOWLEDGE_CAPTURE_STATUS` | Nothing durable was learned — an explicitly valid outcome |
| `OBSIDIAN_SYNC_STATUS` | Use `SKIPPED_NO_LOCAL_CONFIG`, not `NOT_REQUIRED` |
| `CLEANUP_STATUS` | No temporary worktree or branch was created |

`IMPLEMENTATION_STATUS` and `LOCAL_VALIDATION_STATUS` are never
`NOT_REQUIRED` on a task that changed a file.

---

## Git finalization is not optional

**For every substantial task that modifies Git-tracked files, the Integrator is
mandatory.** It runs because the task modified tracked files — never because the
prompt happened to ask for Git operations. A user should never need to append
"push it", "merge it", "sync Obsidian" or "clean the worktree" to a normal task.

### If a remote exists

Do not stop after local commits. The safe autonomous flow is:

```
task branch → local validation → QA → Reviewer
  → push task branch          ← always allowed, even with no CI-read access
  → wait for / read remote CI
  → CI PASS                   ← required when SHARED_TARGET = true
  → fetch and re-verify the target
  → merge
  → push target
  → post-merge CI / validation
  → knowledge capture → Obsidian sync → cleanup
  → COMPLETE
```

**Pushing the task branch is always permitted**, including when the CI verdict
cannot be read. It starts CI, preserves the work remotely, and endangers
nothing.

**Merging and pushing a shared target are not.** If CI cannot be read:

```
task branch stays safely pushed
  → no merge
  → no target push
  → MERGE_STATUS = BLOCKED_CI_UNVERIFIED
  → TASK_STATUS  = BLOCKED_FINALIZATION
```

If any step is blocked by authentication, network or policy, record:

```
GIT_FINALIZATION = BLOCKED_BY_ACCESS
```

with **the exact command that was blocked and its output**, and set
`TASK_STATUS = BLOCKED_FINALIZATION`. Do not call the task complete.

### Local-only completion

Permitted only when **no remote exists**, or repository policy explicitly
declares a local-only workflow. A remote existing while push was simply never
attempted is a framework failure, not a local-only task.

### Push must be verified, not inferred

Git prints reassuring things. Verify the refs instead:

```bash
git rev-parse <task-branch>                     # local task SHA
git rev-parse origin/<task-branch>              # remote task SHA — must match
git rev-parse <target>                          # local target SHA
git rev-parse origin/<target>                   # remote target SHA — must match
```

A push whose remote SHA was never read is `BLOCKED_<REASON>`, not `DONE`.

---

## CI must be observed, never assumed

When remote CI is configured, the Integrator obtains an **actual verdict** on the
pushed commit before an automatic merge.

| `REMOTE_CI_STATUS` | Meaning |
|---|---|
| `REMOTE_CI_STATUS` | Meaning | Authorises a shared merge? |
|---|---|---|
| `PASS` | The `CI required gate` check succeeded **on this commit** | **Yes — only this** |
| `FAILED` | It ran and failed — classify per `docs/development/ci.md` before acting | No |
| `PENDING` | Still running; no verdict yet. Wait, or stop | No |
| `BLOCKED_BY_ACCESS` | CI exists but its verdict is unreadable from here (no `gh`, no API reachability) | No |
| `UNKNOWN` | State could not be determined at all | No |
| `UNAVAILABLE` | No remote, or no CI configured | No |
| `NOT_REQUIRED` | The task modified nothing CI covers | No |

**`ASSUMED_PASS` is forbidden.** Local tests do not substitute for remote CI when
remote CI is available — a local run uses a different Node build, filesystem and
cache.

`PASS` must be read **on the exact SHA being merged**. A verdict from an earlier
commit on the same branch is a verdict about different code.

Where `SHARED_TARGET = true`, anything other than `PASS` yields
`MERGE_STATUS = BLOCKED_CI_UNVERIFIED` and `TASK_STATUS = BLOCKED_FINALIZATION`
— see [Shared targets](#shared-targets-and-the-ci-merge-gate). Where
`SHARED_TARGET = false`, or no CI is configured, local gates may carry the
integration and the report states plainly that no CI verdict was read.

---

## Merge completion

Work implemented on a task branch and left unmerged is
`IMPLEMENTATION_COMPLETE_BUT_UNMERGED`. That is a legitimate reportable outcome
— it is not "complete".

Conflicts are classified with the existing nine-type taxonomy in
[`../agents/integrator.md`](../agents/integrator.md). Mechanical and additive
conflicts are resolved; contract, business-logic, database and security
conflicts are escalated. The taxonomy is unchanged by this contract.

---

## Post-merge validation is mandatory

Tests that passed on a task branch prove the branch, not the integrated result.
After merging, validate against the **merged SHA**. At minimum, whichever apply:

- `node scripts/validate-framework.mjs`
- the tests covering the modules that changed
- `npm run typecheck`, and `npm run build` where build inputs changed
- integration regression checks for the affected contract
- task-specific QA smoke checks

Record `POST_MERGE_VALIDATION_STATUS` with the commands actually run. A
post-merge failure is an incident on the target branch: fix forward or revert
the merge, and do not start new work on a red target.

---

## Knowledge capture runs automatically

After successful integration, invoke
[`../skills/knowledge-capture.md`](../skills/knowledge-capture.md) **without
being asked**, whenever the task carries durable knowledge.

Inputs: the Architect's plan, the final **merged** diff, the QA report, the
Reviewer findings, and the implementation report. Decide whether the task
produced architecture changes, module behaviour changes, domain rules, bug
lessons, regression knowledge, UI patterns, integration rules or deployment
lessons, and write to `docs/knowledge/`.

Nothing durable is a valid outcome — record `KNOWLEDGE_CAPTURE_STATUS =
NOT_REQUIRED` with that reason. Silently skipping it is not.

## User corrections become durable behaviour

A correction made in chat changes one task. A correction that is **classified
and promoted** changes every future task. Without this step the user has to
repeat themselves, which is the clearest possible signal that the system is not
learning.

Every substantial correction gets a `USER_FEEDBACK_CLASS`:

| Class | Promote into |
|---|---|
| `TASK_SPECIFIC` | Nothing global — unless it has clear future value |
| `BUG_REGRESSION` | Regression test · `docs/qa/regressions/index.md` · a bug pattern if generalisable · QA scenarios |
| `DOMAIN_RULE` | `docs/knowledge/modules/<module>.md` · requirements · context where agent behaviour depends on it |
| `ARCHITECTURE_RULE` | An ADR in `docs/decisions/` · the architecture context · relevant agent instructions |
| `UI_UX_RULE` | UI/UX knowledge · module knowledge · regression scenarios where testable |
| `SECURITY_RULE` | A security bug pattern · Reviewer and QA expectations · context or ADR |
| `PROCESS_RULE` | `AGENTS.md` · orchestration · the QA / Integrator / Release process |
| `DOCUMENTATION_RULE` | Only the specific documentation source that was wrong |
| `NOT_DURABLE` | Nothing. Recording it would be noise |

**Classify honestly.** Marking a real architectural correction `TASK_SPECIFIC`
is how the same mistake returns in three weeks. Marking a passing preference
`ARCHITECTURE_RULE` is how the framework fills with rules nobody agreed to.

Run the [`process-user-feedback`](../skills/process-user-feedback.md) Skill and
record `FEEDBACK_PROMOTION_STATUS`.

> Worked example. The user said pushing `main` on an unread CI verdict was not
> acceptable. That is `PROCESS_RULE`, not `TASK_SPECIFIC` — it promoted into the
> shared-target CI gate above, the Integrator's merge gates, and
> `validate-framework.mjs`. No future agent needs to be told again.

## QA output must be durable

Validation that exists only in a chat response is lost when the session ends. A
QA run file under `docs/qa/runs/` is **required** when a task involves any of:
live database validation, API endpoint checks, role or security validation,
migration validation, UI tests, or negative-path tests. See
[`../../docs/qa/README.md`](../../docs/qa/README.md).

The run file is necessary and **not sufficient**. A run records what was tested;
a bug record records what is wrong and what is being done about it, and it is the
one a future agent reads before touching the module. Every material finding gets
both — see [`../agents/qa.md`](../agents/qa.md) and
[`../../docs/bugs/README.md`](../../docs/bugs/README.md).

## The bug learning loop is part of completion

```
QA finds a material issue
   ↓ a BUG record is created (or an existing one updated) with evidence
   ↓ it appears in the backlog automatically — rebuild-backlog.mjs
   ↓ the Architect triages: FIX_NOW / PLAN_REQUIRED / DEFER /
   ↓                        PRODUCT_DECISION / BLOCKED_EXTERNAL / ACCEPTED_RISK
   ↓ a specialist fixes the ROOT CAUSE, or the record moves to a decision state
   ↓ QA proves the regression FAILS without the fix
   ↓ QA verifies the fix → Status VERIFIED, ResolvedAt set
   ↓ the regression register gains its REG-nnn entry
   ↓ the known bug pattern is updated where the failure mode generalises
   ↓ knowledge capture · Obsidian sync
   ↓ a future agent retrieves the lesson before writing the same defect
```

Every arrow is somebody's stated responsibility —
[`qa.md`](../agents/qa.md), [`architect.md`](../agents/architect.md),
[`reviewer.md`](../agents/reviewer.md), the specialist roles' `Step 0`, and this
contract. The loop is not advice; the four classification fields above are what
make skipping a step visible.

## Obsidian sync runs automatically

After knowledge capture — never before, because the vault should reflect what
landed:

```bash
node scripts/sync-obsidian.mjs
```

Run it without prompting whenever `.obsidian-sync.local.json` exists.

| Condition | `OBSIDIAN_SYNC_STATUS` | Effect |
|---|---|---|
| Config exists, sync succeeds | `PASS` — record files written, files current, destination vault | none |
| Config absent | `SKIPPED_NO_LOCAL_CONFIG` | non-blocking |
| Config exists, sync fails | `FAILED` | caps at `COMPLETE_WITH_DOCUMENTATION_WARNING`, provided code, Git and validation succeeded |

**Never omit the sync silently.** A documentation-automation failure never rolls
back healthy work, and never hides either.

---

## Cleanup

**Worktrees** — after a successful merge, remove the temporary task worktree,
verifying it is clean first, and prune worktree metadata where safe. Never
remove a dirty worktree, an unmerged worktree, or one another agent is using.

**Branches** — delete merged temporary local branches where policy permits.
Before deleting, verify: fully merged, remote state known, no worktree attached,
no unique commits. Never automatically delete long-lived branches, user-created
branches, release branches, or branches with unresolved work.

`scripts/finalize-agent-task.mjs` reports the state every one of these decisions
depends on. It deliberately does not make them — see
[`../agents/integrator.md`](../agents/integrator.md).

---

## Prohibited completion language

Do not write "work is complete", "task complete", "done" or "fully complete"
until the contract has actually been evaluated.

When implementation is finished but finalization is not, the required phrasing
is:

```
IMPLEMENTATION COMPLETE — FINALIZATION PENDING
```

This is not a style rule. The previous failure was a report that read as
finished while ten tracked files, a migration and a new API module sat
uncommitted — and the wording is what made that invisible.
