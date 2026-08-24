# Bug Pattern — Unowned Verification Step

## Pattern

A record cannot reach its terminal state without a verification step, and no
agent's definition of done includes running that step. The engineering finishes.
The record does not. It stays in the backlog reporting outstanding work that is
already built, and every subsequent planning pass reads it as real.

This is not a bug in the software. It is a bug in the workflow, and it costs
exactly as much as a real defect, because the Architect plans against the
backlog and the backlog is lying.

## Why it happens in DijiPeople

`Status: FIXED` requires a QA retest before it may become `VERIFIED`. That rule
is correct — it is what [[ITEM-0071]] exists to enforce, and it stops a record
claiming a fix it cannot describe. But the specialist who wrote the fix has
finished when the fix and its regression test land, and the QA agent is invoked
per task rather than sweeping records other tasks left behind. So the retest sits
between two roles and belongs to neither.

The same shape appears wherever a state transition is gated on evidence somebody
else has to gather:

- A work package blocked on a condition that later becomes true, with no watcher.
  `TASK-0009` WP-09 waited on "WP-02/03 reaching production"; they reached
  production, and the package stayed `BLOCKED` because reaching production is not
  an event that notifies a Markdown file.
- A block reason that was a fact about the environment. `TASK-0007` WP-15 was
  `BLOCKED_EXTERNAL` on "no `RENDER_API_KEY`, no `VERCEL_TOKEN`, neither CLI on
  `PATH`" — true when written, false four days later, and nothing re-derives it.
- An owner decision recorded as outstanding after the owner answered it in a
  different record.
- A deliverable nobody owns end to end. `docs/deployment/release-history/` held
  only its README while eight releases shipped.

## Example

On 2026-08-24, sixteen bug records sat at `Status: FIXED` with a populated
`RegressionId` and an empty `QAReport`. Every one had a named regression test.
Every one of those tests existed and passed — 16 suites, 134 tests, zero
failures, at the branch tip. Nothing was broken and nothing needed writing.

The backlog reported 46 open records. After running the step, it reported 29.

Two of the sixteen were worse than stale: `BUG-0899` and `BUG-0906` were filed as
open **product decisions** blocking production deployment. The decision had been
taken, the copy written, the release shipped and the documents published — and
the records still read as though the owner had never answered.

## Detection checklist

- Any record in a non-terminal state whose `UpdatedAt` is older than the last
  release that touched its module.
- `Status: FIXED` with a populated `RegressionId` and an empty `QAReport` — the
  signature of this pattern in bug records specifically.
- A `BLOCKED` package whose stated dependency is now satisfied. Read the block
  reason as a claim and re-derive it; do not trust that it was true when read.
- A block reason phrased as a fact about the environment rather than about the
  work. Those expire silently.
- An `OWNER_DECISIONS` count that disagrees with the decisions the record's own
  body shows as answered.
- A generated index that has never had a row: an empty directory beside a README
  describing what belongs in it.

## Prevention rule

**A state that requires evidence needs an owner for gathering it, not just a
rule forbidding the transition without it.**

Two concrete forms:

1. Where the gate is a test that already exists, closing the record is a
   mechanical sweep, not a judgement call — and it should be run on a schedule
   rather than waiting for someone to notice. The evidence is already in the
   repository; only the reading of it is missing.
2. Where the gate is a condition about the world (deployed, provisioned,
   configured), record **how to re-check it**, not only that it is unmet. A block
   reason with no re-check procedure is a fact with an expiry date and no label.

And the corollary, which is the part that makes this pattern expensive: **do not
close a record because the work looks done.** Every closure in that 2026-08-24
sweep names executed output — a suite result, an HTTP status from production, a
file and line. One record, [[ITEM-0068]], was deliberately *not* closed despite
its headline being false, because one of its six acceptance criteria genuinely
remained. Sweeping stale records is only safe if the sweep can say no.

## Related

- [[premature-completion]] — the inverse failure, and the reason this one is
  hard to fix carelessly. There a record claims done when it is not; here it
  claims outstanding when it is not. The cure for one is the cause of the other
  unless both are evidence-driven.
- [[doc-code-drift]] — the same decay in prose rather than in a status field. A
  record's `Status` is a claim about the repository exactly as a paragraph in
  `AGENTS.md` is, and it goes stale the same way.
- [[declared-but-unwired-step]] — code written and never called. This is the
  process equivalent: a step defined in the workflow and never invoked.
- [[ITEM-0071]] — the rule that creates the gate this pattern stalls behind.
