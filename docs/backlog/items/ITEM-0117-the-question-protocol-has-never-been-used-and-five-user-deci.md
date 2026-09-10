---
ID: ITEM-0117
aliases: [ITEM-0117]
Title: The question protocol has never been used and five user decisions are parked in the backlog instead
Type: DOCUMENTATION
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: []
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-30
UpdatedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: ADR-0006
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0117 — The question protocol has never been used and five user decisions are parked in the backlog instead

## Summary

`docs/questions/` contains **only generated files** — `README.md`, `index.md`,
`open.md`. Across 81 sessions, **not one question record has ever been created**.
The index reports `Open: 0 · Answered: 0 · Total: 0`.

Meanwhile **five records sit at `PRODUCT_DECISION`**, each waiting on an answer
only the user can give:

- Projects and customers can be created but never deleted
- An employee cannot use self-service until their manager activates their own account
- Decide whether the roughly one-hour session lifetime is idle or absolute
- The workspace shell states the tenant's identity four times and its purpose twice
- Provisioning seeds four departments with no business unit on every tenant

So the questions are being asked. They are just being filed where the user has to
go looking for them, rather than routed to the user.

## Why this matters

`.agent/context/question-protocol.md` — 174 lines of documented process — exists
precisely for this: *"any specialist may raise a genuine question at any point;
it routes through the Architect to the user **immediately**, and its answer
becomes an ADR so nobody is asked the same thing twice."*

Two things are lost by parking a decision in the backlog instead:

1. **Immediacy.** A `PRODUCT_DECISION` record is passive — it waits until someone
   reads the backlog. A question is meant to reach the user while the work that
   needs it is still in flight.
2. **The ADR.** The protocol's payoff is that an answered question becomes a
   decision record, so the next agent retrieves it instead of asking again. An
   answer given in chat and written into a backlog record does not become a
   retrievable decision.

The supporting machinery all exists and is unused: `scripts/new-question.mjs`,
`scripts/rebuild-questions.mjs`, a `question` kind in the id allocator, and an
Obsidian mapping to `05 - Decisions/Generated/Questions`.

## What this is not

Not necessarily a discipline failure. Agents are correctly told that anything
establishable by reading the repository is an assumption to verify, not a
question to ask — so a low question count is healthy. **Zero** across 81
sessions, standing beside five parked decisions, is the part that does not fit.

## Proposed Resolution

1. **Decide whether the protocol is live or dead.** If it is the intended route
   for user decisions, the five existing `PRODUCT_DECISION` records should be
   raised as questions and their answers captured as ADRs. If it is not, the
   protocol document, the two scripts, the allocator kind and the vault mapping
   should be retired rather than left as machinery nobody uses — an unused
   mechanism in the framework is something later agents read, believe, and route
   around.
2. **If live, close the gap that lets a decision be filed without being asked.**
   `ArchitectDisposition: PRODUCT_DECISION` could require a related question id,
   the way a `FIXED` bug is expected to carry a `RegressionId`.

Option 2 is the durable half. Without it the protocol stays available and unused,
which is the state this item describes.

## Acceptance Criteria

- A record set to `PRODUCT_DECISION` either carries a question id or fails
  validation.
- Answered questions produce ADRs that `retrieve-knowledge` can surface.
- Or: the protocol and its machinery are retired, and the protocol document says
  so plainly.

## Notes

Found on 2026-08-30 when `docs/questions/index.md` appeared as an isolated node
in the vault graph. The isolation was the symptom — the index has nothing to link
because nothing has ever been filed.

## Resolution

Premise confirmed: `docs/questions/` still held only generated files, and five
records — `BUG-2007`, `ITEM-0106`, `ITEM-0108`, `ITEM-0114`, `ITEM-0115` — sat
at `PRODUCT_DECISION`, each waiting on the user.

Took the route this item's own Proposed Resolution named first: decided the
protocol is **live** — the five parked decisions, plus two further scope
questions raised in the same sitting (go-live ownership, QA retest scope), were
routed to the product owner and answered on 2026-09-11. All seven are captured
together in
[ADR-0006](../../decisions/ADR-0006-product-decisions-from-the-2026-09-11-backlog-review.md),
which is durable and retrievable the way a chat answer written into a backlog
record is not.

Each of the five underlying records now carries `RelatedADR: ADR-0006` and has
moved off `PRODUCT_DECISION`: `BUG-2007` and `BUG-2509` (the platform-admin
half of the session-lifetime question, decided alongside `ITEM-0108` in the
same sitting) to `Status: OPEN` / `ArchitectDisposition: PLAN_REQUIRED`;
`ITEM-0106`, `ITEM-0108`, `ITEM-0114` and `ITEM-0115` to `Status: READY` /
`ArchitectDisposition: PLAN_REQUIRED`. The decisions are made; none of the
implied engineering — delete routes and cascade rules, the session policy
store, approval-routing fallback, the shell's naming consolidation, or the
department-seed removal's migration ExecPlan — was built as part of closing
this item, which is about the decision reaching the user and becoming durable,
not about the six pieces of downstream work that decision unblocks.

**Scoped out here, deliberately, rather than hidden:** this item's second
acceptance criterion — "a record set to `PRODUCT_DECISION` either carries a
question id or fails validation" — is the "durable half" the item itself
called out as the harder, more valuable half of a fix. This closure leaves it
for separate follow-up. These five decisions were routed to the user directly
by the Architect in the same conversation that found them, which is the
protocol's intended immediacy working — but `scripts/validate-framework.mjs`
still carries no rule requiring a `PRODUCT_DECISION` record to have gone
through `scripts/new-question.mjs` first, so a future parked decision could
again bypass `docs/questions/` exactly the way these five did. That enforcement
is real, separate engineering and is called out here rather than folded into
this closure to make the report read as more complete than the change is.

## Related Items

[[ITEM-0116]] — the other systemic backlog gap found in the same audit.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
