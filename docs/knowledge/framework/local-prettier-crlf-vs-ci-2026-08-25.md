---
TITLE: Local prettier --check is unreliable on the Windows checkout; read CI's errors instead
TASK: TASK-0023
WP: WP-04
CREATED_AT: 2026-08-25
VERIFIED_AGAINST_COMMIT: 5f556842
---

# Local prettier --check vs CI on this Windows checkout — 2026-08-25

Produced by [[TASK-0023]] while chasing a CI Lint failure.

## The trap

`npx prettier --check "services/api/src/**/*.ts"` on this Windows worktree flags
**almost every file** as unformatted, because the working tree has CRLF line
endings (git `autocrlf`) while prettier compares against LF. This is noise — the
committed content is LF-normalised, and CI (on Linux) only sees the genuinely
unformatted files. So local `--check` cannot tell you what CI will fail on.

What *is* reliable:

- `prettier --write <specific file>` still fixes real formatting (indentation,
  wrapping) correctly; the EOL difference is normalised on commit.
- To find what CI will actually reject, read the CI ESLint log, not local
  `--check`.

## Reading a CI ESLint prettier failure

The ESLint output lists a **file path on its own line**, then the errors for
that file on the following lines. When you grep for the error lines, the
**preceding** file header is the owner — it is easy to misattribute an error to
the file listed just above the error if that file only had *warnings*. In this
task the error read as `sanitize-error-log.ts` but was really in
`dlp.service.spec.ts` (the next file header down): a `findMany` mock added after
the last `prettier --write` run had never been formatted.

Lesson: after editing a file post-format (adding a mock, a case), re-run
`prettier --write` on **that** file before pushing; and when a CI prettier error
names a file you did not touch, check the *next* file header down — the error
usually belongs to your file, not the one above it.

Related: the same push also failed framework validation because new session/task
records were committed without regenerating the dashboard and session indexes —
always run the generators (`rebuild-sessions`, `generate-dashboards`) in the same
commit as the records.
