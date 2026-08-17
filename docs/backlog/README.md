# Backlog

The operational, Git-tracked record of everything known to be outstanding:
defects, tech debt, architecture work, test and infrastructure gaps, and open
product decisions.

```
docs/backlog/
├── README.md              this file — the only hand-written one
├── index.md               generated — every record
├── open.md                generated — active work
├── blocked.md             generated
├── deferred.md            generated
├── product-decisions.md   generated
├── completed.md           generated
└── items/                 ITEM-nnnn-<slug>.md — non-defect records
```

**Every file except this README is generated.** Editing one is pointless: the
next `node scripts/rebuild-backlog.mjs` overwrites it. Change the record, then
rebuild.

---

## One record per thing

A **bug** lives in [`docs/bugs/`](../bugs/). A **non-defect item** lives in
[`items/`](items/). The rebuild script scans both and indexes them together, so
a bug appears in the backlog with the same columns, triage and priority as
everything else.

There is deliberately **no mirror item for each bug.** Two records for one
defect means two statuses and two owners kept in step by hand, and the first
time they diverge the index is lying about the thing it exists to track. A
separate item is created only when there is genuinely separate work — an ADR the
fix waits on, an infrastructure gap that blocks its regression test — and the
two link through `RelatedBug` / `RelatedBacklogItem`.

> This was the design decision the framework task had to make, and it went the
> way it did because *manual synchronisation between two sources of truth* is
> the same failure the repository already catalogues as
> [`divergent-duplicate-guard`](../qa/known-bug-patterns/divergent-duplicate-guard.md).

---

## Item metadata

```yaml
---
ID: ITEM-0001                     # ITEM-nnnn, matching the filename prefix
Title: Short and specific
Type: TEST_GAP
Status: TRIAGE_REQUIRED
Priority: P2
Severity: MEDIUM                  # optional for work that is not a defect
AffectedModules: [apps/admin]
Source: QA_RUN
OwnerAgent: qa
ArchitectDisposition: TRIAGE_REQUIRED
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0004
RelatedQA: docs/qa/runs/….md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---
```

### Type

`BUG`¹ · `SECURITY` · `TECH_DEBT` · `ARCHITECTURE` · `UX` · `TEST_GAP` ·
`INFRA` · `PRODUCT_DECISION` · `FOLLOW_UP` · `DOCUMENTATION` · `PERFORMANCE` ·
`DATA_MIGRATION` · `RELEASE`

¹ `BUG` is accepted in the vocabulary because bug **records** carry it. An
`ITEM` may not use it — `new-backlog-item.mjs` refuses, and points at
`new-bug.mjs`.

### Status

| Status | Meaning |
|---|---|
| `NEW` | Captured, not yet looked at |
| `TRIAGE_REQUIRED` | Explicitly awaiting an Architect decision |
| `READY` | Triaged, understood, someone could start now |
| `IN_PROGRESS` | Being worked |
| `BLOCKED` | Cannot proceed until something external changes |
| `DEFERRED` | Deliberately not now, with a reason |
| `PRODUCT_DECISION` | Waiting on a human product call |
| `VALIDATING` | Done, awaiting QA or CI confirmation |
| `DONE` | Complete and verified |
| `CANCELLED` | No longer wanted; the reason stays in the record |
| `DUPLICATE` | Superseded by another record |

**`BLOCKED` is not `DEFERRED`.** Blocked work is wanted now and cannot move;
deferred work could move and was chosen against. Collapsing the two loses the
difference between a queue and an obstacle.

Status and disposition are one decision expressed at two levels. `DONE` and
`CANCELLED` require disposition `DONE`; `DEFERRED` requires `DEFER`;
`PRODUCT_DECISION` requires the matching disposition; and `DUPLICATE` requires
`DUPLICATE`. An item may not keep a terminal record in `BlockedBy`; once that
dependency is discharged, clear the field or name the real remaining blocker.

---

## Who does what

| Role | In the backlog |
|---|---|
| **QA** | Creates bug records for material findings, with evidence and severity. Updates status on retest. Never sets priority or disposition |
| **Architect** | Triages: reads the backlog *before* planning (`BACKLOG_PRECHECK`) and classifies every new finding *after* QA (`BACKLOG_POST_QA_TRIAGE`). Owns priority and `ArchitectDisposition` |
| **Specialists** | Read the records relevant to what they are about to touch; implement fixes. Do **not** triage, defer or re-prioritise |
| **Reviewer** | Catches backlog-worthy issues QA missed, and flags reintroduced records as `REPEATED_REGRESSION` |
| **Integrator / Release** | Reference record ids in engineering-history and release records |

QA is not responsible for product prioritisation, and developers are not
responsible for triage. Those two boundaries are what keep the backlog honest:
QA has no incentive to downgrade its own finding, and a developer has no
authority to defer the bug they would otherwise have to fix.

---

## Generation

```bash
node scripts/rebuild-backlog.mjs           # regenerate the indexes
node scripts/rebuild-backlog.mjs --check   # fail if they are stale (CI)
node scripts/rebuild-backlog.mjs --json    # counts, for a dashboard
```

The script is **idempotent** (a second run writes nothing), **strict** (a
duplicate id, an unknown status, a dangling reference or a malformed
frontmatter block exits non-zero and regenerates nothing), **semantic**
(status/disposition contradictions, impossible date order, dangling evidence,
discharged blockers and incomplete bug sections fail before generation) and
**deterministic** (records sort by severity, then priority, then id, so two
runs over the same input are byte-identical).

Indexes link records with **relative Markdown paths**, which resolve on GitHub
and in an editor. The Obsidian-facing views — the dashboards under
[`docs/knowledge/dashboards/`](../knowledge/dashboards/) — use `[[wikilinks]]`
instead, because the vault resolves notes by name and a relative repository path
means nothing there. Same data, two link dialects, each correct where it is read.

---

## Where this fits

| Question | Answered by |
|---|---|
| What changed? | Git |
| Did this commit pass validation? | CI |
| What behaviour was tested? | [`docs/qa/runs/`](../qa/runs/) |
| What broke once, and what stops it returning? | [`docs/qa/regressions/index.md`](../qa/regressions/index.md) |
| Which defect classes do we produce? | [`docs/qa/known-bug-patterns/`](../qa/known-bug-patterns/) |
| **What is outstanding, and what did we decide about it?** | **here** |
| How does DijiPeople work? | [`.agent/context/`](../../.agent/context/) |
| Why does it work this way? | Obsidian |

See [`.agent/context/knowledge-architecture.md`](../../.agent/context/knowledge-architecture.md).
