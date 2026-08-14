# Premature completion

**Class:** process / orchestration
**First observed:** 2026-08-14, tenant control plane

A task reports success when the code is written, while the work has not landed
anywhere. Implementation is finished, tests pass, QA and review are done — and
nothing is committed, pushed, merged, documented or synced.

## What it looks like

A confident final report. Files changed, decisions explained, validation
results listed. Nothing in the report is false. The work is simply still sitting
in a working tree, and the report never mentions that because completion was
never defined to include it.

The concrete instance: a tenant control plane — a new API module with 7 spec
files, a migration, 4 new models, ten replaced admin components — was reported
complete while `git status` showed 36 uncommitted paths.

## Why it happens

**Not because Git automation was missing.** The Integrator role existed, owned
Git end to end, and documented a full merge and cleanup lifecycle.

It happens because *the definition of done stops early*, and because a
high-precedence instruction quietly contradicts the role documents. Here,
`AGENTS.md` — which outranks every role file — opened its Working Agreements
with:

> **Do not commit or push unless asked.**

One line, written to protect a user's dirty working tree, disabled the entire
finalization half of the lifecycle. No role document could override it.

## How to detect it

Ask, before writing any completion language:

```bash
git status --porcelain          # anything uncommitted?
git log --oneline origin/main..main   # anything unpushed?
node scripts/finalize-agent-task.mjs  # everything at once
```

A non-empty `git status` at the end of a task is the signature.

## Prevention

- [`.agent/context/task-completion-contract.md`](../../../.agent/context/task-completion-contract.md)
  defines completion as ten resolved fields, not three finished phases.
- `scripts/validate-framework.mjs` fails if the contract is removed, hollowed
  out, unreferenced, or if any document claims completeness with fewer gates.
- The Integrator is mandatory for **any** task that modified tracked files —
  triggered by the file changes, never by the prompt mentioning Git.
- Forbidden phrasing until the contract is evaluated: "complete", "done".
  The required wording is `IMPLEMENTATION COMPLETE — FINALIZATION PENDING`.

## Related

- [`doc-code-drift`](doc-code-drift.md) — the same failure mode applied to
  documentation: a confident statement that stopped being true.
