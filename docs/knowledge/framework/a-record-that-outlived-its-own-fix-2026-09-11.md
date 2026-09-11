# A record that outlived its own fix

**2026-09-11 · SESSION-0098 · framework**

Three records in one session claimed work was still owed while the code was
already written, and in two cases already running in production. A fourth and
fifth were overstated rather than false. Nothing mechanical caught any of them.

## What happened

The owner asked a direct question: do tenants inherit the admin application's
email configuration? I read [[ITEM-0129]], saw `Status: READY` and
`ArchitectDisposition: PLAN_REQUIRED`, and answered that it was not implemented.

It was implemented. `EmailExecutionService` had been falling back to the platform
relay since commit `a26fa39e`, which is on `main`. The record was wrong and I
repeated it.

Auditing the rest of the plan-required list against the code found two more:

| Record | Claimed | Actually |
|---|---|---|
| [[ITEM-0115]] | ExecPlan owed for the seed change | Shipped in release `5a1afa64` |
| [[ITEM-0129]] | Plan owed for email inheritance | Live since `a26fa39e` |
| [[ITEM-0135]] | No authenticated endpoint is rate limited | Interceptor live on `main`, applied globally |

And two whose titles had drifted rather than inverted: [[ITEM-0133]] counts
isolation suites that have since grown, and [[ITEM-0134]] says the payroll run
engine has no tests while ten payroll specs exist, five reaching the run path.

## Why nothing caught it

Every mechanical check this repository has verifies that a record is **well
formed**. None verifies that it is **true**.

`backlog:check` validates frontmatter and required sections. `validate:framework`
runs 5,378 structural checks. The remediation inventory reconciles record state
against itself. A record asserting that unwritten code is unwritten passes all
three whether or not the code exists, because the code is not an input to any of
them.

Two mechanisms produced the drift:

- **A merge between a deciding stream and an implementing stream.** ITEM-0115 and
  ITEM-0129 both had one parallel stream recording a decision and another
  implementing it. The conflict resolution kept the deciding stream's text, which
  said the work was owed, and discarded the half that said it was done. Both sides
  were internally consistent; only one was current.
- **A finding's tense outliving its commit.** ITEM-0135 came from an audit taken
  at `890cd96`. The finding was accurate then. The record inherited "no
  authenticated endpoint is rate limited" as a present-tense fact and nothing
  re-read it after the interceptor shipped.

## What to do about it

**Read the code before answering a question about whether something exists.** The
record is a claim about the code; the code is the code. This is the same rule as
"Obsidian carries intent, the code is implementation truth" in AGENTS.md, applied
one level in — a Git-tracked record is not more authoritative than the tree it
describes.

**Re-measure a record's premise before planning from it.** Already the rule for
bugs, and it applies at least as much to items, which age longer because nobody is
chasing them. This session proved it twice over in the other direction too:
[[ITEM-0124]]'s headline was historical, and BUG-3254's premise was wrong about the
code it accused.

**Treat an audit-derived record as dated.** It states what was true at one commit.
Carry that commit in the record and check against it, rather than reading the
finding as a present-tense fact.

**Suspect any record that survived a merge conflict.** Where two streams touch one
record and one of them implemented something, the resolution can silently keep the
stale half. Worth a targeted re-read of every record touched by a conflicted merge
before closing a program.

## What would actually catch it

Nothing cheap and general. "Does this described-as-missing capability exist?" is
not decidable by grep in the general case.

What *is* cheap: recording the commit a finding was measured at, and having
`backlog:review` surface records whose measurement commit is far behind `HEAD` and
which have never been re-measured. That does not prove staleness — it points at
the records most likely to be stale, which is the affordable version.

## Related

- [[doc-code-drift]] — the same failure one level out, where a document describes
  code that has moved. This note is that pattern applied to the backlog itself.
- [[ITEM-0129]], [[ITEM-0115]], [[ITEM-0135]] — the three records.
- [[BUG-3254]] — the mirror case from this session: a record whose premise accused
  code that was correct, rather than exonerating code that was missing.
