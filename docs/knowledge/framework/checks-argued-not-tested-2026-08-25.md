---
TITLE: Two framework checks that were argued correct rather than tested
TASK: TASK-0022
WP: follow-up
CREATED_AT: 2026-08-25
VERIFIED_AGAINST_COMMIT: 5f2648d6
---

# Checks argued correct rather than tested — 2026-08-25

Produced by the follow-up to [[TASK-0022]], from [[BUG-1203]] and [[BUG-1208]].

Two defects found hours apart, in different scripts, written by different
authors months apart. They are the same defect.

## The shared shape

Both were validation checks. Both carried a long, correct, well-reasoned
comment explaining what they guarded against. Neither had a test. In both
cases a later edit — a fallback in one, an initial implementation in the other
— walked straight into the failure the comment described.

`repo-health.mjs` is the sharper of the two, because the comment is not merely
adjacent to the bug, it *predicts* it:

> the first implementation compared the baseline against `origin/main` and
> reported CHANGED for exactly that case — it fired on its own first real run,
> for a task that had not touched `main` at all. A production-safety field that
> cries wolf when a colleague merges is a field people learn to ignore.

Someone hit that failure, understood it exactly, fixed it, and wrote it down.
Then a `supplied || 'HEAD'` fallback was added below, and the field cried wolf
again — for the same reason, in the same words, at the same field.

**A comment is not a constraint.** It records what an author knew; it does not
prevent the next author from not knowing it. This repository already believes
this about documentation — every `.agent/context` file carries provenance lines
and `validate-framework.mjs` checks the claims they vouch for — and the lesson
transfers directly: an untested decision guarded by a good explanation is a
defect waiting for its second author.

The fix in both cases was extraction, not logic. The decisions moved to
`lib/task-sha-ref.mjs` and `lib/index-drift.mjs` and became testable units.
Neither behaviour changed beyond the bug itself; what changed is that a future
edit now fails loudly.

## Pin the direction you are not fixing

`MAIN_CHANGE_STATUS` had a false positive: it blamed a task for a colleague's
release. The obvious fix — attribute less — has a much worse failure mode than
the bug, because the same field is what would report an *actual* unauthorised
mutation of the production branch.

So the regression pins both directions, and the QA scenario says outright that
step 3 (the true positive still fires, with its blocker) is the case to re-run
first if the logic is ever touched again. A test suite that only proves the
bug is gone licenses the overcorrection.

## A platform-dependent check is two checks, and only one runs

`generate-component-index.mjs --check` compared bytes. The generator writes
`\n`; Git checks the file out as `\r\n` on Windows. So it failed on every
Windows worktree and passed in CI, which runs on `ubuntu-latest`.

CI could not have caught this. The failure requires a checkout the runner does
not produce, so the green tick was not weak evidence — it was evidence about a
different situation. The regression covers it by constructing both line endings
**in memory** rather than relying on the checkout, which is the only way the
runner can test a platform it does not have.

Worth checking for wherever a script compares file contents: the provenance
stamp was already excluded from this comparison for precisely the same reason —
it is a property of the commit, not of the content — so the defect was an
incomplete idea rather than a missing one.

## Two smaller things, both about believing evidence

**A mutation test only counts if the mutation applied.** The first attempt at
mutating `index-drift.mjs` was a `sed` whose escaping silently failed to match.
The suite stayed green, which reads exactly like "the test does not catch this"
and would have been recorded as such. It was re-run, confirmed applied, and
then failed 2 cases. Verify the mutation landed before believing what its
result tells you.

> This paragraph originally cited that rule as a wikilink to
> `framework-validation-must-be-mutation-tested`, which is an **agent memory
> slug and not a note in this vault** — so it resolved to nothing, and
> `knowledge:verify` caught it. Precisely the defect the record beside this one
> attributes to a prior release note. Worth stating rather than quietly fixing:
> the two link namespaces look identical and are not, and a wikilink is only a
> link if something in the vault answers to it.

**The validators are worth losing an argument to.** The first draft of
[[BUG-1208]] asserted that no regression was needed, reasoning that a test
could only restate the fix. `rebuild-backlog.mjs` refused the record — `Status
FIXED requires RegressionId` — and it was right. The argument was a
rationalisation, and the suite it forced turned out to cover the case on every
platform, including the runner that could never reproduce it. The rule knew
something the reasoning did not.

## Related

- [[BUG-1203]] — repo-health blamed this task for another session's merge
- [[BUG-1208]] — the drift check that failed only off the runner
- [[TASK-0022]] — the task whose verification surfaced both
