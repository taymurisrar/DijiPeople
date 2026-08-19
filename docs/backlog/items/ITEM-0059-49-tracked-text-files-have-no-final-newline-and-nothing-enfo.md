---
ID: ITEM-0059
aliases: [ITEM-0059]
Title: 49 tracked text files have no final newline, and nothing enforces one
Type: TECH_DEBT
Status: DEFERRED
Priority: P3
Severity:
AffectedModules: [apps/admin, apps/web, apps/agent-desktop]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DEFER
CreatedAt: 2026-08-19
UpdatedAt: 2026-08-19
RelatedBug: BUG-0076
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0059 — 49 tracked text files have no final newline, and nothing enforces one

## Summary

A scan of every tracked text file at `494c44d` found 49 without a trailing
newline, across `apps/admin`, `apps/web`, `apps/agent-desktop`, `apps/landing`
and `.codex-tmp`. Nothing in the repository enforces one — no `.editorconfig`,
no lint rule, and `.gitattributes` carries only `* text=auto`, which normalises
CRLF but says nothing about final newlines.

Found while resolving [[BUG-0076]]: three of the six unexplained files in the
primary worktree had lost their trailing newline to a hand edit, and the absence
was invisible because it is unremarkable in this repository.

## Why It Matters

Low severity. The cost is diff noise: the next edit to any of these files shows
a spurious `\ No newline at end of file` change on a line the author did not
touch, which makes review harder and hides real changes. It also means "the file
lost its trailing newline" is not a usable signal that something edited a file
by hand — which it briefly was during the BUG-0076 investigation, and would be
again if the repository were consistent.

## Evidence

`.gitattributes` at `494c44d`, in full:

```
# Auto detect text files and perform LF normalization
* text=auto
```

Line-ending policy itself is **correct and needs no change**. `git diff --check`
across this task's branch reports no whitespace errors, and the `LF will be
replaced by CRLF` warnings on Windows are `core.autocrlf=true` working as
intended, not a defect.

The 49 files were found by walking `git ls-files`, filtering to text
extensions, and checking the last byte. A representative sample:

```
apps/admin/app/(internal)/settings/security/page.tsx
apps/admin/app/_components/crm/data-table-header-menu.tsx
apps/agent-desktop/src/main/offline-queue.ts
apps/agent-desktop/tsconfig.json
apps/landing/app/globals.css
apps/web/app/(authenticated)/_components/user-avatar.tsx
```

One related defect **was** fixed here rather than deferred, because it was in a
file this task already changed: `scripts/session.mjs` emitted `TASK_ID: ` with a
trailing space whenever a session had no parent task, which `git diff --check`
flags. Six session records carry it. The generator now trims trailing
whitespace from every frontmatter line; the six existing records are left alone
and will be corrected the next time anything rewrites them.

## Proposed Approach

Not an ExecPlan. Deliberately **not** done in this task — mass-normalising 49
files across four apps would bury a focused repository-health fix under
unrelated churn, and the task instruction was explicit about not
mass-normalising unless technically necessary.

1. Add `.editorconfig` with `insert_final_newline = true` and
   `trim_trailing_whitespace = true`, which every editor in use here honours.
2. Normalise the 49 files in a single mechanical commit that touches nothing
   else, so it can be reviewed as "whitespace only" and skipped with
   `git blame --ignore-rev`.
3. Optionally add the check to CI as a fast, non-gating job first, so the
   backlog is visible before it becomes a blocker.

Order matters: adding the rule before normalising means every subsequent PR
carries unrelated whitespace changes.

## Acceptance Criteria

- Every tracked text file ends with exactly one newline, except formats that
  genuinely forbid it (none are currently known in this repository).
- A configuration file records the rule so editors apply it automatically.
- `git diff --check` is clean across `origin/develop`.
- The normalisation commit changes whitespace only, and is recorded in
  `.git-blame-ignore-revs` if one is introduced.

## Dependencies

None.

## Related Items

[[BUG-0076]] — the repository-health task that surfaced this.
[[ITEM-0057]], [[ITEM-0058]] — the other findings from the same dirty state.
[[SESSION-0017]].

## History

- 2026-08-19 — created at `494c44d`. Scan performed, generator defect in
  `scripts/session.mjs` fixed; the 49 pre-existing files deferred.
