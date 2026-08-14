# Bug Pattern — Documentation / Code Drift

## Pattern
An instruction or context document describes a repository state that does not
exist on the branch being worked. Agents plan against fiction.

## Why it happens in DijiPeople
Documentation is written by reading a **working tree**, which routinely contains
substantial uncommitted work. Commit it to a branch and the document ships
alongside code that does not match it. Nothing validates a prose claim, so the
error is invisible until an agent acts on it.

This repository is unusually exposed: the primary checkout regularly carries
50+ modified and 70+ untracked files from parallel feature work.

## Example architecture area
**This framework's own `AGENTS.md`.** Written from the primary working tree, it
described a `gateway/` .NET solution, a `tools/` device POC, and the
`attendance-engine`, `attendance-integrations` and `app-releases` modules — none
of which exist at the commit the framework baseline was cut from. It also quoted
schema figures (~11,800 lines, 285 models, 255 enums, 191 migrations) against an
actual 10,436 lines / 266 models / 222 enums / 183 migrations.

An earlier instance: the original `apps/web/AGENTS.md` and
`apps/admin/AGENTS.md` were identical copies instructing agents **not** to build
payroll, attendance, leave or recruitment — modules that were by then fully
implemented — and describing `packages/database`, `packages/types` and
`packages/utils` as populated shared packages when all three are empty.

## Detection checklist
- Does the document state counts, file lists or directory names? Re-derive them
  on the current branch.
- Was it written from a working tree with uncommitted changes?
- Does it distinguish CURRENT from TARGET, or present intent as fact?
- Does every `.agent/context/*.md` carry a *last verified* date and commit?

## Required regression test
Not unit-testable. The control is the **staleness rule**: every context document
carries `Last verified` and `Verified against commit`, and every agent reports
discrepancies instead of trusting the document.

## Agent responsible
Every agent. Whoever discovers the drift reports it.

## Reviewer check
When a change makes a documented claim false, the document must be corrected in
the same change or an explicit context-update recommendation raised.

## QA check
Not applicable to product behaviour. QA does record, in Known Limitations, any
place where documentation misled the run.

## Prevention rule
**Code is current implementation truth.** Documentation describes; it never
authorises. Never silently reshape code to match a document — report the
discrepancy and fix the document.
