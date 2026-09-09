# Bug Pattern — A Gate That Depends On The Outside World

## Pattern
A required CI check answers a question about **the world**, not about the
commit. The same tree passes and then fails with nothing edited, so a red build
accuses whichever change happened to run next — and a green verdict, once
recorded, keeps authorising merges after it has stopped being true.

## Why it happens in DijiPeople
Two of the fourteen required jobs behind `CI required gate` have an input the
repository does not control:

- **`check:production-advisories`** queries the live npm advisory feed. A CVE
  published upstream turns the job red on every branch simultaneously.
- **A calendar-dependent test** does the same on a date boundary — see
  the REG-393 register entry, where an assertion on `trend[trend.length - 1]` was correct only
  during the month its fixture was pinned to.

Both are legitimate checks doing their job. The defect is not that they fire; it
is that the failure is attributed to the commit under test, and that the gate's
exact-SHA evidence reuse assumes a verdict stays true.

## Example architecture area
**2026-09-08 to 09.** A change touching only `apps/web` returned **two** red
jobs, neither caused by it:

- `API tests` — the calendar-dependent assertion above, red on every branch since
  1 September.
- `Runtime schema tests` — 39 advisories with no disposition, on a lockfile
  byte-identical to the tree that had passed eight days earlier.

Then the sharper case. The advisory sweep in [[ITEM-0122]] took that job from 40
advisories to zero and CI went green at 22:32. The release PR opened on **the
same SHA** ran at 22:48 and failed: three high advisories against `multer` had
been published in the intervening sixteen minutes ([[ITEM-0123]]).

And the consequence that matters most: the 2026-09-08 production release merged
on advisory evidence recorded **2026-08-31**. The gate reuses a green verdict
when the tree is byte-identical, which is right for tests and wrong for a check
that consults a feed. The merge commit then ran fresh and failed, so `main` was
red while production was deployed from it — with nothing reporting that, because
the merge was correctly authorised by the rules as written.

## Detection checklist
- Did the commit touch the failing job's **inputs**? For an advisory job:
  `git diff --name-only <last-green-sha> HEAD -- package-lock.json '**/package.json'`.
  An empty diff means the feed moved, not the code.
- Is the same job red on `main`? If so, say so with the evidence instead of
  fixing it inside an unrelated task.
- Read **every** failing job, not the first. Grouping the check-runs takes
  seconds and the first red job is not always the only one:
  `gh api repos/<owner>/<repo>/commits/<sha>/check-runs?per_page=100 --jq '.check_runs[] | "\(.conclusion)  \(.name)"' | sort | uniq -c`
- Is the green verdict being reused older than the thing it attests to? A
  tree-keyed reuse rule cannot see that.

## What not to do
- **Do not disposition an advisory to make the gate green.** The script's own
  header records that three earlier dispositions were wrong because each rested
  on a reachability claim made by inspection. Name call sites, not files.
- **Do not force a transitive upgrade during a release.** Forcing an override
  requires a from-scratch resolve, and on a repository with caret ranges that is
  not "the same tree plus one fix" — it is today's tree, every upstream release
  since, in one step. Attempted on 2026-09-09 it traded three highs for one
  **critical** plus four highs and 294 unrelated version moves.
- **Do not weaken the control to stop the noise.** Pinning an advisory snapshot
  or moving the feed-dependent half out of the required gate are real options,
  and each trades away some of its bite. That is a decision to take deliberately,
  not a side effect of clearing a red build.

## Related
[[doc-code-drift]] — the same shape in prose: a claim that was true when written
and false when read.
