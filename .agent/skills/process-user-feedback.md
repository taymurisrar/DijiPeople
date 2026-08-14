# Skill — Process User Feedback

Turn a correction the user made during a task into behaviour that persists after
the session ends.

This is a Skill rather than an agent because the work is a fixed decision table
applied to a known input. The judgement — *was this correction about this task,
or about how the system should behave?* — is the only real decision, and it is
made once, explicitly.

---

## Trigger

Run when the user corrects, redirects or rejects something during a task, and
**before** `knowledge-capture` finishes. Resolves
`FEEDBACK_PROMOTION_STATUS` in
[`../context/task-completion-contract.md`](../context/task-completion-contract.md).

Skip for preference-of-the-moment remarks with no future consequence — but skip
*deliberately*, recording `NOT_DURABLE`, not by forgetting.

## Inputs

- What the user actually said, quoted, not paraphrased into something tidier
- What the agent had done that prompted it
- The diff, the QA run, the Reviewer findings

---

## Steps

### 1. State the correction in one sentence

In the user's terms. If you cannot state it without hedging, you have not
understood it yet — ask rather than guessing at a durable rule.

### 2. Classify it

Exactly one `USER_FEEDBACK_CLASS`:

| Class | The correction was about… | Promote into |
|---|---|---|
| `TASK_SPECIFIC` | This task only | Nothing global, unless it has clear future value |
| `BUG_REGRESSION` | Behaviour that is wrong and could return | Regression test · `docs/qa/regressions/index.md` · a bug pattern if generalisable · QA scenarios |
| `DOMAIN_RULE` | How the business actually works | `docs/knowledge/modules/<module>.md` · requirements · context where agent behaviour depends on it |
| `ARCHITECTURE_RULE` | How the system must be built | An ADR in `docs/decisions/` · architecture context · relevant agent instructions |
| `UI_UX_RULE` | How the product should feel or behave | UI/UX knowledge · module knowledge · regression scenarios where testable |
| `SECURITY_RULE` | An authorization, isolation or exposure rule | A security bug pattern · Reviewer and QA expectations · context or ADR |
| `PROCESS_RULE` | How agents should work | `AGENTS.md` · orchestration · the QA / Integrator / Release process |
| `DOCUMENTATION_RULE` | A document being wrong | Only that document |
| `NOT_DURABLE` | Nothing that generalises | Nothing |

**The classification is the whole Skill.** Everything downstream follows from
it. Two failure modes, both common:

- Under-classifying — filing a real architectural correction as `TASK_SPECIFIC`,
  so the same mistake returns in three weeks.
- Over-classifying — promoting a passing preference to `ARCHITECTURE_RULE`, so
  the framework accumulates rules nobody agreed to and future agents obey
  something the user said once.

When genuinely torn between `TASK_SPECIFIC` and a durable class, ask the user.
It is one question, and it is cheaper than either error.

### 3. Promote it

Write to the destinations for that class. Rules:

- **Update in place** where the target is evergreen (module knowledge, context);
  **append** where it is history (implementations, QA runs).
- **Never paste code.** Reference `path/to/file.ts:line`.
- A `BUG_REGRESSION` is not promoted until a test **fails without the fix**.
- A `PROCESS_RULE` that changes how agents work should be **mechanically
  enforced** where reasonable — a check in `scripts/validate-framework.mjs`
  outlives any sentence in a document.

### 4. Record it

In the final report:

```
USER_FEEDBACK_CLASS:        <class>
FEEDBACK_PROMOTION_STATUS:  DONE | NOT_REQUIRED (<reason>) | BLOCKED (<why>)
```

Name the files written. A promotion nobody can find did not happen.

---

## Worked example

> **User:** "It merged and pushed `main` while CI status was unreadable. That
> must not be allowed for shared protected branches."

1. **Correction:** an unverified CI verdict must not authorise a merge into a
   shared branch.
2. **Class:** `PROCESS_RULE` — about how agents work, not about this task.
3. **Promoted into:** the shared-target CI gate in the completion contract; the
   Integrator's merge gates; `ci.md`; `branch-protection.md`; and **47 new
   checks in `validate-framework.mjs`** so documentation cannot quietly permit
   it again.
4. **Recorded:** `FEEDBACK_PROMOTION_STATUS = DONE`.

The test of a good promotion: **no future agent has to be told this again.**

---

## Stop conditions

- The correction is ambiguous in a way that changes what gets written → ask.
- It contradicts an existing promoted rule → record the conflict and raise it.
  Do not silently overwrite a rule the user set earlier.
- It asks for something unsafe → say so plainly rather than encoding it.
