---
ID: BUG-0051
aliases: [BUG-0051]
Title: Backlog and QA validators accept contradictory record state
Status: VERIFIED
Severity: MEDIUM
Priority: P1
Type: INFRA
Source: ARCHITECT
DetectedDate: 2026-08-17
DetectedInSha: 0051180
AffectedModules: [scripts/lib/backlog-records.mjs, scripts/lib/qa-records.mjs, docs/bugs, docs/backlog, docs/qa]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport:
RegressionId: REG-050
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt: 2026-08-17
---

# BUG-0051 — Backlog and QA validators accept contradictory record state

## Summary

The structural record checks pass while canonical Bugs, backlog items,
regressions and scenarios contradict their own status, disposition, dependency
and evidence. Generated indexes therefore publish misleading active, deferred,
product-decision and verified counts.

## Expected Behavior

`backlog:check`, `qa:check` and framework validation reject semantic states that
cannot be true together or reference missing evidence.

## Actual Behavior

All checks pass with 43 terminal records retaining nonterminal dispositions,
five `READY` items dispositioned `DEFER`, one `READY` item dispositioned
`PRODUCT_DECISION`, a discharged `BlockedBy`, a dangling QA report, malformed
scenario date, stale FAIL/NOT_RUN results, missing regression links and Bugs
whose mandatory body sections are absent or out of order.

## Reproduction

1. Run `npm run backlog:check` and `npm run qa:check`; both pass.
2. Compare source metadata and evidence:
   - 26 VERIFIED Bugs + 17 DONE items retain nonterminal dispositions.
   - ITEM-0023/0031/0033/0039/0042 are READY with disposition DEFER.
   - ITEM-0032 is READY/PRODUCT_DECISION, so the generated decision view is empty.
   - ITEM-0004 still blocks on discharged BUG-0015.
   - BUG-0048 points to a nonexistent QA run.
   - QA-PAY-001 has two dates in `LAST_RUN`.
3. Observe generated views and framework validation remain green for those states.

## Evidence

- `scripts/lib/backlog-records.mjs` declares body/status vocabularies but does
  not enforce terminal status/disposition consistency or Bug section order.
- `scripts/lib/qa-records.mjs` does not validate date shape, Bug QA paths,
  regression↔scenario coverage or stale result evidence.
- `docs/backlog/open.md` lists deliberately deferred/product-decision work as active.
- `docs/backlog/product-decisions.md` is empty despite ITEM-0032.
- `docs/bugs/BUG-0048-*.md` points at missing
  `docs/qa/runs/2026-08-17-framework-remediation-3fe3292.md`.

## Root Cause

Validators check parseability and allowed vocabulary but not cross-field
semantics or evidence reachability. Generated indexes trust those fields, so a
validly formatted contradiction becomes authoritative output.

## Impact

Architects receive false backlog and QA state, resolved work stays apparently
actionable, real product decisions disappear, and stale VERIFIED evidence can
survive indefinitely. This directly undermines autonomous continuation.

## Affected Areas

Bug/backlog/QA parsers, generated indexes, framework validation, dashboards and
Obsidian Generated content.

## Proposed Resolution

First reconcile the current records. Then add focused semantic validation for
terminal disposition, disposition/status bucket agreement, dependency status,
date/path reachability and required Bug body sections. Add tests that fail on
each invalid fixture; do not make the parser silently rewrite source records.

## Acceptance Criteria

- Current source records and generated buckets agree.
- No terminal record retains an actionable disposition.
- Deferred/product-decision dispositions render in their correct generated views.
- QA paths and dates validate; stale results are explicitly re-run or marked.
- Framework simulations fail on every corrected contradiction class.

## Regression Coverage

[REG-050](../qa/regressions/index.md) and [[QA-DEPLOY-012]] —
`scripts/lib/backlog-records.mjs` and `scripts/lib/qa-records.mjs`, exercised by
`backlog:check`, `qa:check` and `validate:framework`.

These were proven against real edits during this remediation rather than against
fixtures, which is stronger evidence: each rule fired on an actual record change
and blocked the index rebuild until the record was corrected.

## Dependencies

Requires the `framework` and `record-indexes` leases during implementation.

## Related Items

[[premature-completion]] · [[doc-code-drift]] · [[TASK-0005]]

## Resolution

Fixed 2026-08-17, across the WP-02 record reconciliation and the validator
hardening that followed it. Every condition this record named was re-checked on
`develop`, and none survives:

| Claim | State now |
|---|---|
| 43 terminal records retaining nonterminal dispositions | 0 |
| ITEM-0023/0031/0033/0039/0042 `READY` but dispositioned `DEFER` | 0 |
| ITEM-0032 `READY`/`PRODUCT_DECISION`, decision view empty | `product-decisions.md` renders its entry |
| ITEM-0004 blocked on discharged BUG-0015 | `BlockedBy` is empty |
| BUG-0048 points at a nonexistent QA run | path resolves |
| QA-PAY-001 has two dates in `LAST_RUN` | single valid date |
| Bug section presence and order unenforced | enforced |

The enforcement gaps are closed in `scripts/lib/backlog-records.mjs` and
`scripts/lib/qa-records.mjs`: a terminal status requires
`ArchitectDisposition: DONE`, a terminal bug must name a regression that exists
in the register, bug bodies must carry every mandatory section in canonical
order, and an active regression must have a reusable QA scenario covering every
root it names.

**`FIXED` remains deliberately outside the terminal set, and that is correct.**
`docs/bugs/README.md` defines it as "code changed — not yet proven by QA" and
names `FIXED → VERIFIED` as the step most often skipped, so a `FIXED` bug
appearing in `open.md` is the design working rather than a miscount. Three
records were sitting in exactly that state — BUG-0009, BUG-0010 and BUG-0044.
They were **retested and promoted**, not reclassified to make a number look
better: REG-032 re-ran at 10/10 for the first two, and QA-RUNTIME-006 was
executed for the third.

## QA Retest

Pass. `backlog:check`, `qa:check`, `tasks:check` and `sessions:check` are all
current, and `validate:framework` passes.

The four rules were exercised against real record edits during this remediation
rather than against fixtures — each fired and blocked the index rebuild until
the record was corrected. The exact messages are recorded on REG-050 and
[[QA-DEPLOY-012]].

## History

- 2026-08-17 — verified closed. Every named condition re-checked on `develop`,
  the enforcement gaps confirmed to fire on real edits, and the three
  `FIXED`-awaiting-QA records retested and promoted. REG-050 and QA-DEPLOY-012
  added.

- 2026-08-17 — found during the global record/QA semantic revalidation.
