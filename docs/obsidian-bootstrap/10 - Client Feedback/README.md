# 10 - Client Feedback

What users, clients and prospects actually said.

Naming: `<Client or persona> — <YYYY-MM-DD>.md`

## Why this is separate from Requirements

Feedback is **evidence**. Requirements are **decisions**. Keeping them apart
means a requirement can always be traced back to what someone actually reported,
and a requirement that has no supporting feedback is visibly an assumption.

## Suggested shape

```markdown
# <Client / persona> — YYYY-MM-DD

## Source
Demo · support case · onboarding call · sales conversation · in-app feedback

## Context
Who they are, tenant size, which modules they use, which roles were present.

## What they said
Direct quotes wherever possible. Do not clean up the language.

## What they meant
Your interpretation — clearly separated from the quotes above.

## Severity / frequency
Blocking · painful · annoying · nice-to-have.
Is this the first time this has come up, or the fifth?

## Related
Requirements, bugs, modules this touches.

## Action
What was done, or deliberately not done, and why.
```

## Rules

- Quote first, interpret second, and keep the two visibly separate.
- Do not convert feedback straight into a requirement without a decision step —
  that is how a single loud customer becomes a product direction.
- Note when the **same** feedback recurs across clients. Repetition is the
  strongest signal available here.
