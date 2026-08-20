# Questions, doubts, assumptions and blockers

> **Last verified:** 2026-08-21
> **Verified against commit:** fc54987
> **Key source files:** scripts/lib/question-records.mjs, scripts/new-question.mjs, scripts/rebuild-questions.mjs, scripts/check-work-packages.mjs, scripts/retrieve-knowledge.mjs
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

Any specialist may raise a question at any point. The route is always the same:

```
specialist  →  Architect  →  user
```

The Architect never absorbs a genuine question to protect its own autonomy, and
never holds one back for the final report. A question that arrives after the
work depending on it was built is not a question, it is an apology.

This document is the cross-role invariant. Role files say *when their own
discipline typically needs to ask*; they do not restate what is here.

---

## The bar for asking

**Repository evidence first.** If reading the code, the records, the context
layer or `node scripts/retrieve-knowledge.mjs <terms>` settles the matter, that
is an assumption to verify — not a question to ask. Asking what the repository
already answers spends the user's attention on work the agent should have done.

**But uncertainty with material consequence is never resolved by guessing.**
The framework previously carried a blanket "do not ask questions" rule. What it
produced was agents inventing business decisions to preserve autonomy, then
disclosing the invention at the end. Autonomy that is purchased by guessing is
not autonomy.

The test is one question: *can this be established from the repository?* If yes,
establish it. If no, and getting it wrong changes what gets built, ask.

---

## Categories

A question must declare one. The list is deliberately specific — "I was unsure"
is not a category, and every entry below names a kind of uncertainty repository
evidence genuinely cannot settle.

| Category | Use when |
|---|---|
| `USER_DECISION_REQUIRED` | A product or business choice with no engineering answer |
| `BUSINESS_RULE_UNCLEAR` | The rule exists but the repository states it two ways, or not at all |
| `MATERIAL_ASSUMPTION` | Work is about to depend on something unproven and expensive to unwind |
| `CONFLICTING_REQUIREMENTS` | Two requirements cannot both be satisfied |
| `CONFLICTING_SOURCES` | Code, docs and Obsidian disagree and the discrepancy is not classifiable |
| `EXTERNAL_CAPABILITY_UNKNOWN` | A provider may not support what the design assumes |
| `DESTRUCTIVE_ACTION_UNCERTAIN` | The next step destroys data or state and ownership is unclear |
| `SECURITY_OR_LEGAL_AMBIGUITY` | The safe reading and the requested reading differ |
| `TECHNICAL_DOUBT_WITH_MATERIAL_CONSEQUENCE` | An engineering choice whose cost of being wrong is large |
| `BLOCKER` | Work cannot proceed at all until somebody outside the framework acts |

---

## Blast radius decides what stops

```
BLOCKING: PACKAGE   →  WP_STATUS   = WAITING_USER   ← the common, desirable case
BLOCKING: TASK      →  TASK_STATUS = WAITING_USER   ← should be rare
BLOCKING: NONE      →  nothing stops; the answer improves later work
```

**`WAITING_USER` is not a kind of `BLOCKED`.** `BLOCKED` means the framework
cannot proceed. `WAITING_USER` means *this package* cannot, while every
independent package continues. Collapsing the two is how a single unanswered
question stalls an entire program — the shape TASK-0004 is still sitting in,
`BLOCKED` on one owner decision with eleven packages behind it.

When a question blocks the parent itself, the decomposition is usually wrong.
Check whether the dependency is real before stopping sixteen packages for one
answer.

**The Architect asks immediately and keeps every independent `READY` package
moving.** `node scripts/check-work-packages.mjs` recomputes the ready queue, so
"what can still proceed" is a computation, not a judgement call that can quietly
resolve to "nothing".

---

## Raising one

```bash
node scripts/new-question.mjs "<the question>" \
  --category USER_DECISION_REQUIRED --agent Backend/API \
  --task TASK-nnnn --wp WP-nn --blocking PACKAGE
node scripts/rebuild-questions.mjs
```

The id is allocated atomically, so concurrent sessions cannot collide.

Then set the waiting package to `WAITING_USER` and name the `QUESTION-nnnn` in
its `## Questions` section. `check-work-packages.mjs` rejects a `WAITING_USER`
package that names no question — without the reference the state is
indistinguishable from "stalled", and nobody can tell whether an answer would
even help.

### A question must carry a recommendation

`rebuild-questions.mjs --check` refuses an `OPEN` question with an empty
`## Agent Recommendation`. Routing options to the user without a recommendation
moves the analysis onto them, which is the opposite of what asking is for. The
agent has read the code; it should say what it would do and why.

Options that nobody would pick do not belong in the table. Three real options
beat six padded ones.

---

## Answers become decisions, or they are lost

An answer that lives only in the question record is an answer the next task will
not find — nothing retrieves questions by module, it retrieves decisions.

For `USER_DECISION_REQUIRED`, `BUSINESS_RULE_UNCLEAR` and
`SECURITY_OR_LEGAL_AMBIGUITY`, `rebuild-questions.mjs --check` **fails** an
`ANSWERED` question with no `DECISION_ID`. Record the ADR under
`docs/decisions/`, put its id in the field, and the loop closes:

```
question  →  answer  →  ADR  →  retrieved by the next task  →  not asked again
```

`docs/decisions` and `docs/questions` are retrieved at authority 2 and 3 — above
QA runs, engineering history and general knowledge — precisely so the source
that prevents a repeat question is the one most likely to surface.

The `## Answer` section carries the reasoning, not only the verdict. "Option B"
tells a future reader nothing about why A was rejected, which is how a settled
decision gets reopened instead of merely re-read.

**Do not ask a settled decision again** unless the source it rested on has
changed — and if it has, say so in the new question.

---

## Assumptions are the other half

Not every uncertainty is a question. Most are assumptions, and every substantial
work package carries a register:

| State | Meaning |
|---|---|
| `VERIFIED` | Proven from the repository, with the evidence named |
| `USER_CONFIRMED` | Settled by an answer, with the `QUESTION-nnnn` or ADR named |
| `UNVERIFIED` | Neither — and nothing material may be built on it |

A material `UNVERIFIED` assumption is resolved before dependent architecture is
built: prove it, or ask. `check-work-packages.mjs` refuses to let a package
reach `DONE` with an `UNVERIFIED` assumption still standing, because that is the
state where a guess has already been built on and nobody noticed.

---

## What the Architect must not do

- Absorb a specialist's genuine question and guess on their behalf.
- Defer a question to the final report.
- Ask a question the repository answers.
- Ask a question the user already settled in an ADR.
- Stop a whole program for a question that blocks one package.
- Route options to the user with no recommendation.
- Mark a package `WAITING_USER` without naming the question it waits on.
