---
TITLE: Two verification gaps that let a broken check read as passing
TASK: SESSION-0097
WP: —
CREATED_AT: 2026-09-10
VERIFIED_AGAINST_COMMIT: 11afbd50
---

# Two verification gaps that let a broken check read as passing — 2026-09-10

Produced by [[SESSION-0097]] while shipping durable object storage on
Cloudflare R2 (FILE-01/INF-05, `docs/engineering/REMEDIATION-storage-p0.md`).
Both gaps are about the same failure shape: a verification step that looks
authoritative and is not, discovered only because the real gate — CI, or a
mutation — disagreed with it.

## `validate:framework` is one generator check among several, not all of them

Adding 26 columns and one enum to `schema.prisma` staled two generated files
that `validate:framework` does not read at all:
`packages/config/platform-runtime-schema.generated.json` and the
`docs/knowledge/data-model/` notes `generate-data-model.mjs` writes. Each is
compared against its source by its **own** CI step. Locally, running
`validate:framework` and the test suite both passed; the branch still failed
CI on the first push, because nothing local had asked either generator
whether it agreed with the new schema.

The fix was mechanical — regenerate, commit the diff — but the regeneration
surfaced something the schema change itself did not cause:
`NOT_DELIVERED` had been added to a notification delivery-status enum on an
earlier branch without anyone regenerating the runtime schema, so the
committed file was **already** behind before this task touched it. A
generator check that only runs when someone remembers to run it accumulates
debt from every task that forgot, not just the one that gets blamed for it.

This is the same shape [[stale-generated-artifact]] documents for the Prisma
client and the local database — the source changes, the derived copy does
not, and the error surfaces somewhere that looks unrelated. Here the derived
copies are a JSON manifest and a set of Markdown notes rather than a
generated client, which is why `validate:framework` — built to check the
agent framework's own structural invariants — was never going to catch it.

**The rule this earns:** after any `schema.prisma` change, run every
generator's `--check` script locally, not just `validate:framework` and
`prisma:validate`. The commit that fixed this reported "all nine generator
checks, both runtime-schema checks and framework validation now pass
locally" — treat that as the actual bar, not the one script whose name
sounds like it means everything.

## Piping a verification command through `tail` throws away its exit code

Several verification commands in this session were run inside a shell
construct shaped like `if $cmd | tail; then echo PASS; fi`. `tail`'s exit
code is what `if` sees, and `tail` succeeds whenever it can read its input —
which it can, whether `$cmd` itself failed or not. The construct reported
`PASS` nine times in a row for commands that were, at least some of that
time, genuinely failing. It was caught only because a later, independent
check (CI, and a mutation test) disagreed with a local "PASS" that had no
right to exist.

Nothing about this is specific to storage or to this session — it is a
general shell hazard (a pipeline's exit status is its last command's,
`tail` here, not `$cmd`'s) — but it is worth recording as its own lesson
because of how it fails: silently, repeatedly, and in exactly the verification
step that exists to catch silent failures. A check that launders a
non-zero exit through `tail`, `head`, `grep`, or any other pipe stage is not
a check; it is a command that always reports success.

**The rule this earns:** never pipe a verification command whose exit code
matters. Capture output separately if you need to inspect or truncate it
(`out=$($cmd); status=$?`), or use the shell's own array of pipeline exit
codes (`PIPESTATUS`/`pipestatus`) rather than trusting `$?` after a pipe.

## Related

- [[SESSION-0097]] — the session
- `docs/engineering/REMEDIATION-storage-p0.md` — the remediation record this
  work produced (not synced to the vault; `docs/engineering/` carries no
  Obsidian mapping)
- [[stale-generated-artifact]] — the sibling pattern for the Prisma
  client/database link in the same derived-artifact chain
- [[trust-the-runtime-invariant-over-a-static-scan]] — the neighbouring
  lesson about which check to believe when two disagree
