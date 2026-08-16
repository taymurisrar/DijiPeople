# Task Router — `DijiPeople Task:` intent classification

> **Last verified:** 2026-08-16
> **Verified against commit:** 6cfac5c
> **Key source files:** AGENTS.md, .agent/agents/architect.md, .agent/context/task-completion-contract.md, .agent/context/task-orchestration.md, docs/development/agent-orchestration.md, scripts/validate-framework.mjs
>
> This document describes the repository, it is not authority over it. If the
> code disagrees, the code is current truth — report the discrepancy and
> recommend a context update.

## CURRENT

A prompt beginning `DijiPeople Task:` means **"use the complete DijiPeople
autonomous engineering framework"** — the whole lifecycle in
[`task-completion-contract.md`](task-completion-contract.md), from knowledge
retrieval through to Obsidian sync and cleanup.

**The user never has to restate the framework rules.** Repeating them is a
symptom that this document is not being read, not a user preference. The
Architect reads this file *before* planning.

---

## Why a router exists at all

The framework is **one unified lifecycle**. It was not split into per-keyword
workflows, and must not be: parallel workflows are how a repository ends up with
a QA path that forgets bug records and a hotfix path that forgets CI.

What a keyword changes is **emphasis** — which specialist leads, which risks are
assumed present until disproven, and what "done" additionally requires. Every
task still runs the same contract.

```
keyword  →  lead agent + risk emphasis + additional definition of done
         ↛  a different lifecycle
```

---

## Recognising the trigger

| Prompt shape | Meaning |
|---|---|
| `DijiPeople Task: <keyword> <description>` | Full framework, with the keyword's emphasis |
| `DijiPeople Task: <description>` | Full framework; the Architect **infers** the type |
| `DijiPeople Task:` alone | Full framework; ask what the task is — this is the one legitimate blocking question |

The keyword is **optional and case-insensitive**. A user who writes
`DijiPeople task: fix the tenant provisioning retry` gets exactly the same
treatment as one who writes `DijiPeople Task: BUG fix the tenant provisioning
retry`.

**An unrecognised keyword is not an error.** Treat the whole line as a natural
language description and infer, exactly as if no keyword had been given. Never
reject a prompt because its keyword is not in the table below.

---

## Supported keywords

Each row states the **lead**, what the task **prioritises**, and what its
[definition of done](#definition-of-done-by-task-type) adds beyond the standard
contract.

| Keyword | Lead | Prioritises |
|---|---|---|
| *(none)* | Architect | Classify the type first, then route as below |
| `BUG` | Architect → owning specialist | reproduction → regression → root cause → fix → QA → merge → knowledge |
| `FEATURE` | Architect | requirements → architecture → implementation → QA → integration → release impact |
| `UI/UX` | UI/UX | Experience analysis leads; Frontend implements what UI/UX verified |
| `QA` | QA | Establishing what is true; **no product change** without a verified defect |
| `E2E` | QA | Whole-journey execution with real evidence |
| `ARCHITECTURE` | Architect | Durable structural decisions, captured as ADRs |
| `DATABASE` | Database | Schema and migration correctness against a real PostgreSQL |
| `INTEGRATION` | Integration | External boundaries: idempotency, retry, failure handling |
| `SECURITY` | Reviewer + Backend/API | authorization · authentication · tenant isolation · sensitive data · negative paths · abuse |
| `PERFORMANCE` | Architect → owning specialist | **Baseline first.** No optimisation without measurement |
| `RELEASE` | Release/DevOps | Release readiness — not necessarily a deployment |
| `DEPLOY` | Release/DevOps | The full deployment lifecycle |
| `HOTFIX` | Architect → owning specialist | Minimal blast radius, regression proof, **CI and branch protection still apply** |
| `BACKLOG` | Architect | Reviewing and technically acting on the backlog |
| `KNOWLEDGE` | Architect | Knowledge only — no product code |
| `FRAMEWORK` | Architect | The agent framework itself — no unrelated product work |
| `AUDIT` | Architect | **Read-only by default**; findings become durable records |

### Per-keyword rules that are not obvious

**`UI/UX`** — UI/UX is read-only by default
([`../agents/ui-ux.md`](../agents/ui-ux.md)); it specifies, Frontend implements.
Backend joins only when behaviour or a contract must change, which is a finding,
not an assumption. Use browser validation where
[`../../docs/development/browser-e2e.md`](../../docs/development/browser-e2e.md)
says it is available; where it is not, say so rather than claiming visual
verification.

**`QA`** — QA establishes what is true and **does not prioritise**. A QA task
that "fixed a few things along the way" has destroyed its own independence.
Every material finding becomes a `docs/bugs/` record and reaches the backlog;
the Architect then triages. If a fix is warranted, that is a decision with a
disposition behind it, not a side effect.

**`SECURITY`** — assume the [Security checklist](../../AGENTS.md#security) items
are violated until each is disproven, rather than looking for evidence of
violation. Negative authorization paths and cross-tenant isolation are
**mandatory** QA scenarios, not risk-based ones. The Reviewer performs a
strengthened pass and can block alone.

**`PERFORMANCE`** — a measurement precedes any change. "This looks slow" is not
a baseline. Record the before number, the after number and how both were
obtained; an optimisation with no measurement is an untested refactor with a
persuasive commit message.

**`HOTFIX`** — speed comes from *narrow scope*, never from skipped gates.
Branch protection, the `CI required gate` and the shared-target CI rule apply
unchanged. A regression proving the defect **fails without the fix** is required
— that is what stops the same hotfix being needed twice.

**`AUDIT`** — read-only means read-only. An audit that changes code has stopped
being an audit and become an unplanned implementation task. Findings go to
`docs/bugs/` and `docs/backlog/`; the Architect triages them; a fix is a
*separate* task unless the audit prompt explicitly asked for one.

**`KNOWLEDGE`** — the one exception to "no product code" is
[verified documentation drift](knowledge-architecture.md), where a document
asserts something the code contradicts. Even then: fix the *document*, and only
touch code if the drift is itself a defect, in which case it needs a record.

**`FRAMEWORK`** — the framework is the product for this task. Do not fold in
unrelated product implementation, and do not build a parallel framework beside
the existing one; extend the roles, systems and scripts that exist.

---

## Natural language inference

Keywords are a convenience. **The user should not have to know them.** When a
`DijiPeople Task:` prompt carries no keyword, the Architect classifies from the
description, states the classification it chose in the plan, and proceeds.

| The user writes | Infer | Because |
|---|---|---|
| "fix the tenant provisioning retry" | `BUG` | "fix" + a named broken behaviour |
| "improve payroll UI" | `UI/UX` + `FEATURE` | an experience judgement plus new work |
| "test complete onboarding" | `E2E` / `QA` | a whole journey, no change requested |
| "add a leave carry-forward rule" | `FEATURE` | new behaviour |
| "why is the employees list slow" | `PERFORMANCE` | a measurable complaint |
| "can support staff read other tenants' logs" | `SECURITY` + `AUDIT` | an authorization question, read-only |
| "ship what's on main" | `RELEASE` | release readiness, no code change |
| "add a column for probation end date" | `DATABASE` + `FEATURE` | schema is the single-writer path |

**More than one classification is normal.** "Improve payroll UI" is genuinely
UI/UX *and* FEATURE; routing it as only one loses either the experience analysis
or the implementation. Combine the emphases and combine the definitions of done.

Two rules keep inference honest:

- **State the inferred type in the plan.** A silent classification cannot be
  corrected by the user, and it is the input to every routing decision that
  follows.
- **When the description implies a broader type than the keyword given, the
  broader one wins, and say so.** A prompt labelled `BUG` whose fix requires a
  migration is a `BUG` *and* a `DATABASE` task. The keyword is the user's hint,
  not a cap on what the work turns out to need.

---

## Definition of done, by task type

These are **additive**. Every task also satisfies
[`task-completion-contract.md`](task-completion-contract.md) in full.

| Type | Additionally requires |
|---|---|
| `BUG` | A reproduction, a regression that **fails without the fix**, a root-cause fix (not a symptom patch), and a QA retest |
| `UI/UX` | Verified UI, with browser evidence where the capability exists — and an explicit statement when it does not |
| `DATABASE` | Migration applied to a **real** PostgreSQL, `DB_CI_STATUS = PASS`, constraints and seeds validated |
| `SECURITY` | Negative authorization tests, cross-tenant isolation tests, and a Reviewer security pass |
| `E2E` | The journey actually executed — not a described plan for executing it |
| `DEPLOY` | A verified deployed SHA, smoke results and health results, in a release record |
| `PERFORMANCE` | A before measurement and an after measurement, both reproducible |
| `FRAMEWORK` | `node scripts/validate-framework.mjs` passes, and the new behaviour is **simulated**, not merely documented |
| `AUDIT` | Durable records for every material finding, each triaged |
| `HOTFIX` | Everything `BUG` requires, plus an explicit statement of the blast radius considered |

`FRAMEWORK`'s simulation requirement is the one that stops this document from
being decorative: a rule that only exists as prose is a rule that has never been
executed. See the routing and recovery simulations in
[`../../scripts/validate-framework.mjs`](../../scripts/validate-framework.mjs).

---

## What routing never changes

No keyword weakens any of these. A prompt that appears to request otherwise is
answered, not obeyed:

- the shared-target CI gate — `MERGE requires REMOTE_CI_STATUS = PASS`
- branch protection, and the prohibition on force-pushing a protected branch
- tenant isolation checks on any query that touches tenant-owned data
- the requirement that every material QA finding becomes a durable record
- the separation between QA (establishes truth) and the Architect (decides
  priority)
- the completion contract's fields, or the honesty of their values

`HOTFIX` is the keyword most likely to be read as an exception to this list. It
is not one. Urgency changes scope, never evidence.
