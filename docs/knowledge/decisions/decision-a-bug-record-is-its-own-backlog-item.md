# Decision — A bug record **is** its own backlog item

> Taken 2026-08-15 while building the durable bug and backlog systems. Recorded
> because the alternative was explicitly on the table and the reasoning matters
> more than the outcome.

## The question

Should a defect produce **two** records — a `BUG-nnnn` describing the defect and
an `ITEM-nnnn` tracking the work — or one?

## Decision

**One.** A bug record under `docs/bugs/` is scanned by
`scripts/rebuild-backlog.mjs` alongside `docs/backlog/items/` and appears in
every backlog view with the same columns, the same triage and the same priority.

A separate item is created only when there is genuinely **separate work**: an
ADR the fix waits on ([[BUG-0017]] → [[ITEM-0006]]), or an infrastructure gap
that blocks the regression test ([[BUG-0009]] → [[ITEM-0002]]). The two link
through `RelatedBug` / `RelatedBacklogItem`.

## Why

Two records for one defect means two statuses, two severities and two owners
that must be kept in step **by hand**. The moment they diverge, the index is
lying about the thing it exists to track — and an index people have learned not
to trust is worse than no index, because they stop reading it before they stop
believing it.

This repository already catalogues that failure mode under its own name:
[[divergent-duplicate-guard]]. `ContractsService.update()` carried an inline copy
of a rule that also lived in a shared assertion; the copy drifted, and a signed
agreement became editable — [[BUG-0011]]. Building a record system whose
correctness depends on manual synchronisation between two sources of truth would
be committing the same error in the framework that exists to catch it.

## Consequences

- `scripts/new-backlog-item.mjs` **refuses** `--type BUG` and points at
  `new-bug.mjs`. The vocabulary still permits `BUG` because bug *records* carry
  it.
- Backlog views mix both record kinds. The `ID` prefix distinguishes them, and
  nothing else needs to.
- A bug's `RelatedBacklogItem` is normally empty. Empty is the expected state,
  not a missing link.

## Related

[[agent-engineering-architecture]] · pattern [[divergent-duplicate-guard]]

Source: `docs/bugs/README.md`, `docs/backlog/README.md`,
`scripts/rebuild-backlog.mjs`, `scripts/lib/backlog-records.mjs`.
