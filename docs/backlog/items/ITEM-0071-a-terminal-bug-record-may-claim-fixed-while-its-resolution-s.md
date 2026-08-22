---
ID: ITEM-0071
aliases: [ITEM-0071]
Title: A terminal bug record may claim FIXED while its Resolution says pending
Type: TEST_GAP
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [scripts]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug: BUG-0080
RelatedQA: 
RelatedADR: 
RelatedImplementation: TASK-0010
TargetMilestone: 
BlockedBy: 
---

# ITEM-0071 — A terminal bug record may claim FIXED while its Resolution says pending

## Summary

`rebuild-backlog.mjs` validates a bug record's **frontmatter** — that `Status`
is a legal value, that a terminal status carries a `RegressionId`, that
`ArchitectDisposition` agrees with `Status`. It does not read the **body**. So a
record can carry `Status: FIXED` and, twenty lines lower, a `## Resolution`
section reading in full *"Pending a product decision."*

That is not a cosmetic inconsistency. The two halves make opposite claims, and
the prose is the more persuasive one because it explains itself.

## Why It Matters

It happened, and it cost real work.

[[BUG-0080]] was fixed in `e9f977c`. That commit rewrote the Terms of Service,
added REG-075 and a QA scenario, and updated the regression register, the
remediation inventory and three dashboards — but never filled in the bug
record's own `## Resolution` and `## QA Retest` sections.

During TASK-0010's release readiness assessment, a reader checking whether any
HIGH item blocked the release found `Status: FIXED` sitting above
*"Pending a product decision"*, and believed the prose. The consequences:

- the record was reversed to `PRODUCT_DECISION` and committed;
- `commercial-bootstrap.ts` was changed from `FLAT` to `PER_SEAT`;
- the seeded base prices were zeroed;
- **the owner was asked to decide a question that had been settled the same
  day**, on a premise quoting Terms text that no longer existed.

All of it was reverted, but only because `seed-legal.ts` was eventually read
directly. Nothing in the framework would have caught it.

The generated fields were right throughout. The hand-written prose was wrong,
and it is the part nothing checks.

## Evidence

- `docs/bugs/BUG-0080-*.md` at `b43b85c` — `Status: FIXED`,
  `RegressionId: REG-075`, and a Resolution section reading *"Pending a product
  decision."*
- `e9f977c` — the fix, touching 20 files, none of them the record's own body.
- `scripts/rebuild-backlog.mjs` — validates required sections **exist** and are
  **in order**; never inspects what they contain.

## Proposed Approach

No ExecPlan needed. A body check in `rebuild-backlog.mjs`, deliberately narrow:

1. When `Status` is terminal (`FIXED`, `VERIFIED`, `CLOSED`), the `## Resolution`
   section must not be empty and must not match a "not done yet" pattern —
   `pending`, `to be added`, `to be determined`, `TBD`, `awaiting`.
2. The same for `## QA Retest` on `VERIFIED`.
3. Conversely, when `Status` is `OPEN` / `PRODUCT_DECISION` / `DEFERRED`, a
   Resolution section claiming the work is complete is equally wrong, but that
   is harder to detect without false positives — leave it out rather than build
   a check that people learn to work around.

Keep the phrase list short and literal. A cleverer check that fires on real
records is worse than no check, because the response to a noisy gate is to stop
reading it.

**Mutation-test it.** Point it at `BUG-0080` as it stood at `b43b85c` and
confirm it fails; a check that passes on the record that motivated it is not a
check. This repository has already shipped guards that only asserted a file
*mentioned* something and passed after the behaviour was deleted — see the
`assertion-without-a-check` bug pattern.

## Acceptance Criteria

- A record with a terminal `Status` and a Resolution section reading "Pending"
  fails `npm run backlog:check`.
- The check is proven against `BUG-0080` at `b43b85c` — it must fail there.
- No currently-valid record starts failing.

## Dependencies

None.

## Related Items

- [[BUG-0080]] — the record this came from, and the hour it cost.
- [[BUG-0047]] — seven bug records verified while their fixes existed only
  locally. The same family: the record and the reality disagreed, and the record
  was believed.

## Resolution

Implemented 2026-08-20 in `scripts/lib/backlog-records.mjs`.

When a bug's `Status` is `FIXED`, `VERIFIED` or `CLOSED`, its `## Resolution`
must not be empty and must not open with unfinished prose — `pending`, `tbd`,
`to be added/written/determined/decided/filled`, `to follow`, `awaiting`, `not
yet`, `none yet`. `## QA Retest` is held to the same rule on `VERIFIED` only,
because `FIXED` does not claim QA looked.

Deliberately one-directional. "Terminal status, unfinished prose" is
unambiguous; the mirror case — an open record whose Resolution claims completion
— cannot be detected without guessing, and a guess would produce the false
positives that teach people to ignore a gate.

**Mutation-proven, as the acceptance criteria demanded.** Pointed at
[[BUG-0080]] as it stood at `b43b85c`, it fails:

```text
BUG-0080: Status FIXED but "## Resolution" still reads
  "Pending a product decision." — the status and the prose disagree
```

### It found three more on its first run

Not a hypothetical class. Every one was `Status: VERIFIED` above a QA Retest
section saying the opposite:

| Record | What it said | Outcome |
|---|---|---|
| [[BUG-0005]] | *"Pending WP-03 retest of the expanded regression cases"* — **CRITICAL**, cross-tenant error-log read | Prose was stale. The expanded cases exist as `it.each([null, 'platform'])` and pass. Re-verified on executed evidence. |
| [[BUG-0009]] | *"Not yet verified against a live session/database"* | Gap was real. Coverage asserted the route's source shape and never invoked it. Behavioural spec written and mutation-proven. |
| [[BUG-0010]] | *"Not verified by executing the rejected-cookie configuration"* | Same. Same fix. |

BUG-0005 is the one that matters most: a CRITICAL tenant-isolation record
reading `VERIFIED` for three days on prose that said it had not been retested.
The release readiness assessment written an hour earlier had counted zero
unresolved CRITICALs, and it was only true because that record over-claimed.

## History

- 2026-08-20 — implemented, mutation-proven against BUG-0080 at `b43b85c`, and
  three further contradictions found and resolved on the first run.
- 2026-08-20 — created after BUG-0080's stale prose caused a correct `FIXED`
  status to be reversed, a settled product decision to be re-opened with the
  owner, and working code to be changed and then reverted.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0080]]

<!-- GRAPH:END -->
