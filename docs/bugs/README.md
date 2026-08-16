# Bug Records

One file per defect. **This is the durable home of every material QA finding in
DijiPeople** — the thing that stops a bug existing only inside a chat report
that nobody can read next month.

```
docs/bugs/
├── README.md                     this file
└── BUG-nnnn-<slug>.md            one record per defect
```

Create one with `node scripts/new-bug.mjs "<title>" --severity HIGH --type …`.
**Never hand-allocate an id.**

> This paragraph used to end "the script reads the highest existing one, so two
> agents cannot collide". That was false, and expensively so: reading the
> highest id *in the working tree* cannot see one a sibling branch already took,
> and this repository renumbered colliding records twice in two consecutive days
> ([[ITEM-0038]]).

The script now delegates to `scripts/lib/id-allocator.mjs`, which scans **every
ref** in one `git log --all` pass, holds a cross-worktree lock, and reserves the
id before the record file exists — closing the window between deciding on an id
and writing it. Reservations are never lowered and never reused: a gap in the
sequence costs nothing, and a reused id costs a merge conflict in a durable
record plus a renumber that invalidates every link pointing at it.

Allocate directly when you need an id without a record:

```bash
node scripts/allocate-id.mjs bug --session SESSION-nnnn --note "<why>"
node scripts/allocate-id.mjs --list      # outstanding reservations
```

`node scripts/rebuild-backlog.mjs --check` additionally fails when two records
share an `ID`, so a collision that somehow reaches a branch is caught at merge
rather than by somebody reading a directory listing. See
[`.agent/context/multi-session.md`](../../.agent/context/multi-session.md).

---

## A bug record **is** a backlog item

There is no parallel `ITEM-nnnn` mirroring each bug. Bug records are scanned by
[`scripts/rebuild-backlog.mjs`](../../scripts/rebuild-backlog.mjs) alongside
[`docs/backlog/items/`](../backlog/items/) and appear in every backlog view with
the same columns, the same triage and the same priority.

This was a deliberate design decision. Two records for one defect means two
statuses, two severities and two owners that must be kept in step by hand —
and the moment they diverge, the index is lying about the thing it exists to
track. See [`docs/backlog/README.md`](../backlog/README.md#one-record-per-thing).

A separate item is created only when there is genuinely separate work: an ADR
the fix waits on, an infrastructure gap that blocks the regression test. Link
them with `RelatedBacklogItem` / `RelatedBug`.

---

## Metadata

Every record opens with a frontmatter block. It is parsed by
[`scripts/lib/backlog-records.mjs`](../../scripts/lib/backlog-records.mjs);
a malformed one fails `rebuild-backlog` and framework validation, so a record
cannot rot into unparseable prose.

```yaml
---
ID: BUG-0001                      # BUG-nnnn, matching the filename prefix
Title: Short, specific, no severity words in it
Status: OPEN
Severity: HIGH
Priority: P1
Type: AUTHORIZATION
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d             # the commit the defect was observed on
AffectedModules: [services/api/src/modules/contracts]
OwnerAgent: backend-api
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: docs/qa/runs/2026-08-15-….md
RegressionId: REG-009              # once a regression test exists
RelatedBacklogItem:                # only when separate work genuinely exists
RelatedDecision: docs/decisions/ADR-….md
RelatedImplementation: docs/knowledge/implementations/….md
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
ResolvedAt:                        # required once VERIFIED or CLOSED
---
```

Every field is **declared** even when empty. An absent field is a field the
author did not consider; an empty one is a field with no value yet, and the
difference matters when you are reading a record you did not write.

### Status

| Status | Meaning |
|---|---|
| `OPEN` | Confirmed, nothing done yet |
| `IN_PROGRESS` | Someone is fixing it now |
| `BLOCKED` | Cannot proceed — access, infrastructure, or another record |
| `DEFERRED` | Deliberately not now, with a reason. **Never valid for CRITICAL** |
| `PRODUCT_DECISION` | The engineering is understood; the correct product behaviour is not decided |
| `FIXED` | Code changed — **not yet proven by QA** |
| `VERIFIED` | QA retested and the fix holds |
| `CLOSED` | Verified and no longer tracked; or resolved by other means |
| `NOT_A_BUG` | Investigated and the behaviour is correct. Keep the record — the investigation is the value |
| `DUPLICATE` | Same defect as another record; name it in `Related Items` |
| `ACCEPTED_RISK` | Real, understood, and explicitly accepted by a human. Never an agent's own call |

`FIXED` → `VERIFIED` is the step most often skipped. A fix nobody retested is a
claim, and the register is the wrong place for claims.

### Severity

| | |
|---|---|
| `CRITICAL` | Cross-tenant exposure or mutation, authn/authz bypass, secret exposure, irreversible data loss, wrong payroll amounts |
| `HIGH` | Object-level authorization gap inside a tenant, sensitive data behind the wrong authorization, unrecoverable migration, contract break for a deployed client, attendance/payroll calculation error, a primary journey blocked |
| `MEDIUM` | Architectural divergence, missing validation, missing UI state, meaningful missing coverage |
| `LOW` | Cosmetic, naming, dead code, an unreachable route that fails closed |

Same scale as [`.agent/agents/reviewer.md`](../../.agent/agents/reviewer.md), so
a Reviewer finding and a QA finding are not ranked on two different rulers.

### Type

`BUG` · `SECURITY` · `UX` · `INTEGRATION` · `DATABASE` · `AUTHORIZATION` ·
`TENANT_ISOLATION` · `STATE_MACHINE` · `PERFORMANCE` · `DATA_INTEGRITY` ·
`TEST_GAP` · `INFRA` · `DOCUMENTATION`

### Architect disposition

Set by the **Architect**, never by QA and never by the implementing specialist.
QA establishes what is true; the Architect decides what happens about it.

`TRIAGE_REQUIRED` (the default — an honest "nobody has looked yet") ·
`FIX_NOW` · `PLAN_REQUIRED` · `DEFER` · `PRODUCT_DECISION` ·
`BLOCKED_EXTERNAL` · `ACCEPTED_RISK` · `DUPLICATE` · `NOT_A_BUG` · `DONE`

A substantial task cannot complete while a record it produced is still
`TRIAGE_REQUIRED` — see
[`.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).

---

## Body

Every record carries these sections, in this order. Write
"Not applicable — <reason>" rather than deleting one: a deleted section reads
as "not considered".

```
Summary · Expected Behavior · Actual Behavior · Reproduction · Evidence ·
Root Cause · Impact · Affected Areas · Proposed Resolution ·
Acceptance Criteria · Regression Coverage · Dependencies · Related Items ·
Resolution · QA Retest · History
```

**Root Cause stays empty until it is actually established.** A guessed root
cause is the most expensive line in the file — everyone downstream builds on it.

**Never record a credential, token, connection string, password or full
national id.** Host and database name are enough to debug; the secret is not.
The same rule as [`.agent/agents/qa.md`](../../.agent/agents/qa.md).

---

## Relationship to the regression register

They answer different questions and neither replaces the other:

| | Answers |
|---|---|
| `docs/bugs/BUG-nnnn.md` | **What is wrong, what is being done about it, and what state is that in** |
| [`docs/qa/regressions/index.md`](../qa/regressions/index.md) | **What broke once and which test stops it returning** |
| [`docs/qa/known-bug-patterns/`](../qa/known-bug-patterns/) | **Which defect *classes* this repository produces, and how to prevent them** |

A fixed bug gets a `REG-nnn` entry and the bug's `RegressionId` points at it. A
bug whose failure mode generalises also updates or creates a pattern. One
defect, three records, each carrying something the others do not.

---

## Lifecycle

```
QA finds a material defect
   ↓  BUG record created — evidence, reproduction, severity
   ↓  appears in the backlog automatically (rebuild-backlog.mjs)
   ↓  Architect triages: FIX_NOW / PLAN_REQUIRED / DEFER /
   ↓                     PRODUCT_DECISION / BLOCKED_EXTERNAL / ACCEPTED_RISK
   ↓  specialist fixes the ROOT CAUSE, or the record moves to a decision state
   ↓  QA proves the regression fails without the fix
   ↓  QA verifies the fix → Status VERIFIED, ResolvedAt set
   ↓  regression register entry added, RegressionId linked
   ↓  known bug pattern updated when the failure mode generalises
   ↓  knowledge capture · Obsidian sync
   ↓  a future agent retrieves it before touching the same module
```

The last line is the whole point. Everything above it is bookkeeping in service
of an agent, six weeks from now, not writing this defect again.
