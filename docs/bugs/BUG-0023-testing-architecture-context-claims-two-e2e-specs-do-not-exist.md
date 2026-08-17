---
ID: BUG-0023
aliases: [BUG-0023]
Title: The testing-architecture context claims two e2e specs do not exist
Status: VERIFIED
Severity: LOW
Priority: P3
Type: DOCUMENTATION
Source: QA_RUN
DetectedDate: 2026-08-15
DetectedInSha: 7bbab3d
AffectedModules: [.agent/context]
OwnerAgent: qa
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RegressionId: REG-036
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-15
---

# BUG-0023 — The testing-architecture context claims two e2e specs do not exist

## Summary

`.agent/context/testing-architecture.md:128-129` states that
`test/permission-propagation.e2e-spec.ts` and
`test/attendance-integrations-isolation.e2e-spec.ts` — both referenced by root
`AGENTS.md` — **"neither exists."** Both exist.

## Expected Behavior

The context layer describes the repository accurately, or is corrected. It is the
first thing every agent reads.

## Actual Behavior

An agent following the context will not run two isolation suites that are
present and runnable, and may conclude that `AGENTS.md` is the stale document
when the reverse is true.

## Reproduction

```bash
ls services/api/test/
grep -n "neither exists" .agent/context/testing-architecture.md
```

## Evidence

Verified at `main` `ad8f77f`: `services/api/test/` contains
`permission-propagation.e2e-spec.ts` and
`attendance-integrations-isolation.e2e-spec.ts`, among 11 other e2e specs.
The QA run recorded the same discrepancy on 2026-08-15 under the staleness rule.

The same run recorded a second stale claim in that file — that there is no
database on the workstation. A local PostgreSQL `dijipeople` was present,
migrated and seeded, and the entire E2E ran against it. That claim is
environment-specific and may be true again on another machine, so it is a
weaker finding than the two file claims and should be reworded rather than
simply deleted.

## Root Cause

`doc-code-drift`: a context file asserting the absence of files, with no
mechanism to notice when they arrive. Absence claims age worse than any other
kind, because nothing fails when they become false.

## Impact

Two tenant-isolation-relevant suites go unrun by agents that trust the context.
Low severity because both are also in CI, so nothing ships unguarded — but QA
scoping decisions are being made on a false premise.

## Affected Areas

`.agent/context/testing-architecture.md`. Consumers: every agent role that lists
it as Required Context — QA, Architect, Backend/API, Frontend, Database,
Integration, Integrator, Release/DevOps.

## Proposed Resolution

Correct both statements and refresh the file's `Last verified` / `Verified
against commit` metadata. Reword the database claim as environment-dependent
rather than absolute.

Deliberately **not** fixed in this task: this task owns the knowledge framework,
and quietly editing an unrelated context document inside it is the
opportunistic-scope-widening the working agreements forbid. It is recorded here
instead, which is exactly what the record system is for.

## Acceptance Criteria

`testing-architecture.md` makes no false absence claim, and its verification
metadata names the commit it was checked against.

## Regression Coverage

**None** today. The generalisable guard — framework validation failing when a
context file asserts a path does not exist while it does — is tracked as
[[ITEM-0011]].

## Dependencies

None.

## Related Items

Bug pattern [[doc-code-drift]]. Architecture [[qa-and-ci-architecture|QA and CI Architecture]].
Generalised guard: [[ITEM-0011]].

## Resolution

Fixed. The Resolution section still read "Not resolved" long after the fix
landed — a stale leftover, corrected here, and the reason this record sat FIXED
without anyone being able to tell what had been done.

`.agent/context/testing-architecture.md` no longer claims the two suites are
absent. It currently documents **15 `*.e2e-spec.ts` suites** under `services/api/test/`,
describes the jest-e2e configuration, and links this record.

## QA Retest

Verified against the repository at `d1768cb`, not against the record:

- `services/api/test/permission-propagation.e2e-spec.ts` — exists.
- `services/api/test/attendance-integrations-isolation.e2e-spec.ts` — exists.
- `ls services/api/test/*.e2e-spec.ts` returns 13 suites, matching what the
  context now states.
- The link the context carries to this record resolves to the real filename.

No regression test: the artefact is a document, and the drift class it belongs to
is already covered by the `doc-code-drift` bug pattern, which instructs a reader
to re-derive counts rather than trust them.

## History

- 2026-08-17 — linked to active regression `REG-036` during TASK-0005
  record/QA reconciliation.

- 2026-08-17 — Architect reconciliation: terminal `VERIFIED` status normalized
  to `ArchitectDisposition: DONE`; the existing resolution and QA evidence are
  unchanged.

- 2026-08-15 — recorded by the commercial onboarding E2E under the staleness
  rule; the tooling won and the run proceeded.
- 2026-08-15 — re-verified against `main` `ad8f77f` and given a durable record.

- 2026-08-15 — Fixed. `testing-architecture.md` no longer claims the two e2e specs are absent, its `Last verified` metadata names `b2ba383`, and the database claim is reworded as machine-specific rather than absolute — a local PostgreSQL was in fact present, and this task ran both a DB-backed suite and a browser suite against a disposable database on it. The generalisable guard remains ITEM-0011.
