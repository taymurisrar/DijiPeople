# Failure, adaptation and the budget of two

> **Last verified:** 2026-08-21
> **Verified against commit:** fc54987
> **Key source files:** scripts/validate-framework.mjs, docs/qa/known-bug-patterns/, .agent/context/task-completion-contract.md, .agent/agents/architect.md
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

Every meaningful failure gets classified before anything is changed in response
to it. The classification decides the response — the fix for a tooling gap is
not the fix for a bad assumption, and applying the wrong one produces a change
that looks like progress and prevents nothing.

---

## Classify first

| `FAILURE_CLASS` | The failure was |
|---|---|
| `IMPLEMENTATION_DEFECT` | The code is wrong |
| `BAD_ASSUMPTION` | The code follows an assumption that was never true |
| `MISSING_CONTEXT` | The information existed and was not loaded |
| `STALE_CONTEXT` | The information was loaded and had since changed |
| `AGENT_INSTRUCTION_GAP` | A role file does not say to do the thing |
| `TOOLING_GAP` | No command exists to do the thing correctly |
| `TEST_GAP` | Nothing would have caught it |
| `VALIDATOR_GAP` | A check exists and does not actually detect it |
| `HANDOFF_GAP` | Two agents each assumed the other did it |
| `OWNERSHIP_GAP` | Nobody owns the thing |
| `PROCESS_GAP` | The order of work made it possible |
| `EXTERNAL_FAILURE` | A provider, network or upstream service |
| `TRANSIENT_FAILURE` | It passes on retry with nothing changed |

`MISSING_CONTEXT` and `STALE_CONTEXT` are separated deliberately. The first is
fixed by a context manifest; the second by re-reading source instead of
trusting a summary. They look identical in a post-mortem and have opposite
remedies.

## Then choose the response

`ADAPTATION_ACTION`: `NONE` · `RETRY` · `CODE_FIX` · `TEST_ADDED` ·
`REGRESSION_ADDED` · `VALIDATOR_ADDED` · `AGENT_RULE_UPDATED` ·
`CONTEXT_UPDATED` · `KNOWLEDGE_UPDATED` · `ARCHITECTURE_CHANGED` ·
`BACKLOG_CREATED` · `USER_QUESTION`

`RETRY` is legitimate only for `TRANSIENT_FAILURE` and sometimes
`EXTERNAL_FAILURE`. Retrying anything else is the failure budget being spent
without learning anything.

---

## The budget of two

**After two materially identical failures, the approach changes.**

```
attempt 1 fails   →  fix and retry
attempt 2 fails   →  STOP. classify. inspect assumptions. change method.
attempt 3         →  must be a different approach, not the same one harder
```

Materially identical means the same mechanism failing the same way — not the
same error string. Two different shell-quoting errors from the same quoting
strategy are one approach failing twice.

When the budget is spent:

1. classify the failure;
2. re-examine the assumption underneath it, not the syntax on top of it;
3. change the method — a different tool, a different file-writing path, a
   different selector strategy, a different isolation level;
4. enter research mode if the correct method is genuinely unknown;
5. ask, if the blocker is not technical.

This rule exists because of specific loops this repository has already paid for:
shell quoting that mangled Markdown, Playwright selectors retried against a page
that had already changed, migrations re-run against a database that would never
accept them, and regex parser fixes iterated one character at a time. In each
case the second failure already contained the information that the approach was
wrong.

It applies especially to: shell and quoting problems, CI failures, migration
errors, Playwright selectors, environment issues, and regex or parser fixes.

---

## Systemic change needs more than one incident

A single incidental failure does **not** rewrite a permanent agent instruction.
Role files are read by every future session; editing them in response to one bad
afternoon is how they accumulate contradictory rules nobody can trace.

A systemic change requires the whole chain:

```
failure evidence  →  root cause  →  corrective rule
                  →  behavioural simulation or eval
                  →  Reviewer
                  →  framework validation
```

The simulation is the part most often skipped, and the part that matters: a rule
added without a check that fails when the rule is violated is a rule that will
be quietly dropped. This repository has the proof — a grepped check survived a
mutation that set its detection to a constant `false` while every word it
searched for stayed in place. That is why simulation 39 executes the script
instead of reading it.

---

## Where the lesson lands

| The failure was | The durable record is |
|---|---|
| A defect a future agent could repeat | A bug pattern under `docs/qa/known-bug-patterns/` |
| A behaviour that must never regress | A regression record, allocated with `scripts/allocate-id.mjs regression` |
| A missing engineering fact | The relevant `.agent/context/` document |
| A settled product decision | An ADR under `docs/decisions/` |
| Work that must happen later | A backlog item, owned and prioritised |

A finding that exists only in a report does not exist. The Architect classifies
every one: `FIX_NOW`, `PLAN_REQUIRED`, `DEFER`, `PRODUCT_DECISION`,
`BLOCKED_EXTERNAL` or `ACCEPTED_RISK`.

---

## Discovery has a boundary

An unexpected issue found mid-task is classified, not chased:

```
RELATED + BLOCKING   →  fix it inside this task
RELATED + MATERIAL   →  Architect decides: this task, or the backlog
UNRELATED            →  durable record, then return to the task
```

**Do not recursively expand into a whole-repository audit.** Following every
thread found while pulling one is how a two-package task becomes a program, and
how the thing that was actually asked for never ships.
