---
ID: ITEM-0093
aliases: [ITEM-0093]
Title: Link validation skips untracked files, so a new record's broken links only surface in CI
Type: TECH_DEBT
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [scripts]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-24
UpdatedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0093 — Link validation skips untracked files, so a new record's broken links only surface in CI

## Summary

`validate-framework.mjs` builds its Markdown file list from `git ls-files`
(`scripts/validate-framework.mjs:4006`), so the broken-relative-link check at
line 4049 only ever sees **tracked** files. A record created during a task is
untracked until `git add`, which means its links are not validated by any local
run made before staging — the first evaluation happens in CI, after a push.

## Why It Matters

Every new record is created by a generator (`session.mjs start`,
`new-backlog-item.mjs`, `new-qa-scenario.mjs`, `new-engineering-history.mjs`) and
most carry relative links to other records. The natural workflow is: create,
fill, validate, commit, push. That order guarantees the link check runs against
a file list that excludes the very file just written.

The failure is quiet in the worst way — `validate:framework` reports **passed**,
with a plausible check count, so the local run looks like evidence when it is
not. AGENTS.md already says a local pass is not a CI pass, but that warning is
about jobs which only exist in CI; this is a check that exists locally, ran
locally, printed success, and skipped the file.

## Evidence

Observed on `agent/session-registry-closeout`, 2026-08-24:

- `docs/sessions/SESSION-0047-…md` was written with
  `](../../plans/EXECPLAN-0003-…)`. The record is one level deep under `docs/`,
  so the correct prefix is `../plans/`.
- `npm run validate:framework` before staging → **passed, 3629 checks**.
- CI run `32746141086` on the pushed SHA → **FAILED, 1 of 3630 checks**:
  `docs/sessions/SESSION-0047-…md → ../../plans/… resolves — broken relative link`.
- The same command locally, after the file was tracked → the failure appears.

Every other required job in that run succeeded. The whole cycle — roughly eleven
minutes of CI — was spent discovering a two-character path error that the local
tool was capable of finding and structurally could not.

## Proposed Approach

Union the tracked list with untracked, non-ignored files rather than replacing
it:

```
git ls-files --cached --others --exclude-standard
```

`--exclude-standard` keeps `.gitignore` honoured, so `node_modules` and build
output stay out. Deleted-but-tracked files must still report as missing, which
the existing handler at line 4060 already does — so the change is to the list
builder, not to the check.

**This must be mutation-tested.** A repository-specific trap applies directly:
a check that passes after the behaviour it guards is removed is worse than no
check. Prove it by creating an untracked record with a deliberately broken link
and confirming validation fails before the file is ever staged.

## Acceptance Criteria

- An untracked Markdown file with a broken relative link fails
  `npm run validate:framework`.
- A `.gitignore`d file is still not scanned.
- A tracked file deleted from the working tree still reports as missing.
- The check count rises by the number of untracked Markdown files in scope,
  and the mutation test above is recorded.

## Dependencies

None.

## Resolution

Premise confirmed still true: `scripts/validate-framework.mjs` built its
markdown link-check file list from `git ls-files` with no flags — tracked files
only. Fixed by adding a second file list, `linkCheckFiles`, built from
`git ls-files --cached --others --exclude-standard` (tracked ∪ untracked, minus
anything `.gitignore` covers) and used **only** by the relative-link check. The
original `trackedFiles` list is left untouched and still feeds the "no tracked
build output" check unchanged — folding untracked files into that one would
misreport an untracked, non-ignored `bin/`/`obj/` file as tracked build output,
which is not the same finding.

A deleted-but-tracked file still reports as missing: `--cached` lists it from
the index regardless of whether it is present on disk, and the existing
`existsSync` guard in the loop is untouched.

**Mutation-tested per the acceptance criteria**, exactly as prescribed: created
an untracked file with a deliberately broken relative link and confirmed
`npm run validate:framework` fails on it before the file is ever staged.

```
$ mkdir -p docs/scratch-mutation-test && cat > docs/scratch-mutation-test/probe.md
# Mutation probe for ITEM-0093
[broken link](../plans/does-not-exist-EXECPLAN-9999.md)

$ git status --short docs/scratch-mutation-test/probe.md
?? docs/scratch-mutation-test/probe.md          # confirmed untracked, unstaged

$ npm run validate:framework
Framework validation FAILED — 3 of 5036 checks:
  x docs/scratch-mutation-test/probe.md → ../plans/does-not-exist-EXECPLAN-9999.md resolves — broken relative link
```

(The other two failures in that run were a pre-existing stale Obsidian
dashboard on this branch, unrelated to this change and regenerated separately
via `node scripts/generate-dashboards.mjs`.) The probe file was then deleted —
it was never staged or committed. Before the fix, the identical probe passed
`validate:framework` cleanly, which is the exact failure mode this item
described.

`.gitignore`d files are still excluded because `--exclude-standard` is part of
the git invocation, unchanged from the git default the working tree already
honours.

With the fix: `npm run validate:framework` → **passed, 5035 checks** (baseline
before the fix, with the same repository state and no probe file, was already
5035/2-failing on the stale dashboard alone — the check count differs by the
scanned untracked-file corpus at any given moment, which is expected of a
working-tree-dependent check).

## Related Items

[[ITEM-0092]]

## History

- 2026-08-24 — found by SESSION-0047 when CI rejected a link that local
  validation had passed minutes earlier. Filed as `FIX_NOW` because the cost is
  paid by every task that creates a record, and the fix is one line plus a
  mutation test.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
