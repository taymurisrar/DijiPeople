---
ID: ITEM-0122
aliases: [ITEM-0122]
Title: Fifteen production advisories have no disposition, so the CI advisory gate fails on every branch including main
Type: SECURITY
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [ci, dependencies]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-08
UpdatedAt: 2026-09-08
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0122 — Fifteen production advisories have no disposition, so the CI advisory gate fails on every branch including main

## Summary

`npm run check:production-advisories` — the `No undocumented production
advisories` step of CI's *Runtime schema tests* job — reports **39 production
advisories with no written disposition**, spanning **15 distinct CVEs** and 45
vulnerable packages. The step exits 1, so the `CI required gate` fails.

This is not caused by any code change. It fails on `main`, on `develop`, and on
every branch cut from them, because the advisory database moved while the
repository stood still.

## Why It Matters

**`main` is currently red, and production is deployed from it.** `fe1cd3dd` — the
commit serving production — has `Runtime schema tests: failure`, run 2026-09-08
20:23 UTC. Nothing can pass the required gate until this is resolved, so no
further release can merge.

It also silently widened during a release. `51d48f31`, the source of that
release, has `Runtime schema tests: success` — from **2026-08-31**. The merge to
`main` was authorised on that exact-SHA evidence, which was eight days old and
still valid by the gate's own reuse rule. The evidence was true when it was
written and false by the time it was used, and nothing in the pipeline is
designed to notice that: reuse keys on the tree, and this check depends on the
world.

## Evidence

Reproduced locally on `agent/approvals-inbox-decisions`:

```
check-production-advisories: 39 production advisory(ies) with no written disposition.
```

The commit that triggered it changed **no dependency file** — `git diff --stat
51d48f31 5beea8ba -- package-lock.json '**/package.json'` is empty — so the
lockfile is byte-identical to the tree that passed on 2026-08-31.

Fifteen distinct advisories, by fixability:

| | count |
|---|---|
| fix available, non-breaking | 24 packages |
| fix requires a **major** bump | 20 packages |
| **no fix available** | 1 package |

Direct dependencies, which is where the decisions actually are:

| Package | Severity | Fix |
|---|---|---|
| `@tiptap/*` (13 packages) | moderate | major bump to `3.31.3` |
| `exceljs` | moderate | major bump to `3.4.0` |
| `prisma` | high | audit proposes `6.19.3` — **a major *downgrade*** from the installed 7.8 |
| `sanitize-html` | moderate | non-breaking |
| `xlsx` | high | **none available** (SheetJS prototype pollution GHSA-4r6h-8v6p-xvw6, ReDoS GHSA-5pgg-2g8v-p4x9) |

`npm audit fix --force` must **not** be run here: it would attempt the prisma
move, against a repository whose entire data layer is Prisma 7.8 with
`@prisma/adapter-pg`.

## Proposed Approach

**Needs a decision, then likely an ExecPlan.** Three groups, and they are not the
same problem:

1. **Non-breaking fixes** (`sanitize-html` and the 24 transitive packages) —
   ordinary dependency maintenance. Lowest risk, do first, verify the lockfile
   still regenerates (BUG-0163 made that a CI job of its own).
2. **Major bumps** (tiptap family, exceljs) — real upgrades with real
   regression surface. The tiptap advisory is a `mergeAttributes()` prototype
   pollution; whether it is reachable depends on whether any editor content path
   accepts attacker-controlled attribute keys.
3. **`xlsx`, no fix available** — this one can only be dispositioned or replaced.
   It is `high`, and the script's own message is the right standard: *"An
   advisory with no argument behind it is an advisory nobody decided about."*

**Do not write dispositions to make the gate green.** BUG-0052 is quoted in the
CI step's own comment: seventeen advisories, one critical, and three corrections
to the record before it closed, because *"every disposition that failed had
rested on a reachability claim made by inspection."* Fifteen reachability
arguments written quickly to unblock an unrelated UX fix would repeat exactly
that.

## Acceptance Criteria

- `npm run check:production-advisories` exits 0 on `main`.
- Every surviving advisory has a written argument naming who reaches the
  vulnerable code and why the risk is accepted, not a note saying it seems
  unused.
- A disposition that no longer matches any advisory is removed, per the script.
- The lockfile still regenerates from the manifests.

## Dependencies

None technically. It needs an owner decision on the major bumps, and on `xlsx`
where the only options are accept-with-argument or replace.

## Related Items

Blocks [[BUG-2822]], which is unrelated to it and cannot merge past the gate.

## History

- 2026-09-09 — created at `5beea8ba`, from the CI failure on an unrelated UX fix.
  Confirmed pre-existing: the lockfile is unchanged from the tree that passed on
  2026-08-31, and `main` itself is red.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[ci-architecture]]

<!-- GRAPH:END -->

## Outcome — resolved 2026-09-09

**The premise this record was opened on was wrong, and the correction is the
useful part.**

It stated that 20 packages needed a major bump, including a prisma downgrade.
That was npm's *package-level* count, inflated by `apps/admin` pinning fifteen
tiptap packages at an exact `3.29.2` with no caret: npm reports any move off an
exact pin as out-of-range, and `isSemVerMajor` was `false` for every one of them.
The real fix was **3.29.2 → 3.31.3, a minor bump inside 3.x**, and it cleared 34
of the 40 undocumented advisories on its own.

At the advisory level the shape was: **everything in-range except `mysql2`.**

### What was done

| | |
|---|---|
| `npm audit fix --omit=dev` | in-range upgrades — `@xmldom/xmldom` 0.8.13→0.8.15, `sanitize-html` 2.17.6→2.17.7, `qs`, `fast-uri`, `baseline-browser-mapping`, `brace-expansion`, `js-yaml`, `nodemailer` |
| tiptap pins | fifteen manifests entries, `3.29.2` → `3.31.3` |
| `mysql2` | dispositioned in `scripts/check-production-advisories.mjs` |

Nothing was force-fixed. `npm audit fix --force` was never run.

### The mysql2 disposition, and why it is not an inspection claim

The script's header is explicit that two earlier dispositions failed because they
rested on reachability asserted by reading. This one names checkable facts:

- the chain is `@prisma/client@7.8.0 → prisma → mysql2`, i.e. the CLI package,
  which the existing `prisma` / `@prisma/config` / `deepmerge-ts` entries already
  disposition on the same grounds;
- `schema.prisma` declares `provider = "postgresql"`;
- the runtime adapter is `PrismaPg` from `@prisma/adapter-pg`
  (`common/prisma/prisma.service.ts:29`);
- the only occurrence of the string `mysql` in application source is a CV skill
  keyword in `recruitment/document-parsing.service.ts:1376`.

Both advisories require *connecting to a MySQL server* — an auth-plugin
downgrade that leaks the password to a malicious server, and unbounded zlib
inflate in the compressed protocol. Neither is reachable without a connection
this product cannot make. npm's only offered fix remains `prisma@6.19.3`, which
cannot run the driver-adapter data layer.

### Verification

| Check | Result |
|---|---|
| `check:production-advisories` | 0 critical, 7 dispositioned, **exit 0** |
| `npm ci` from the committed lockfile | clean |
| lockfile regenerates from manifests alone (BUG-0163's job) | clean |
| api / web / admin / landing suites | 304 / 70 / 44 / 14 suites, all passing |
| typecheck, all three apps | pass |
| `npm run build` | 6 of 6 tasks |

The build matters most here: tiptap is the admin contract document editor
(`apps/admin/app/_components/documents/contract-document-editor.tsx`), the only
consumer of any of those fifteen packages, and it compiles on 3.31.3.

### What this does not do

It does not remove `xlsx`, which still has **no fix available** and remains
dispositioned as unreachable via [[ITEM-0070]]. It does not change the exact-pin
policy on tiptap, which is what disguised a minor bump as a major one — worth
revisiting, but it is also what made this upgrade a deliberate act rather than a
silent drift.

## A property of this gate, recorded rather than changed

This check queries the **live** advisory feed, so "green" is a point-in-time
property of the world rather than of the tree. That is not a defect — it found
three genuine, reachable highs — but it has two consequences worth writing down,
because both bit during this work.

**A green verdict expires.** The gate went green on a branch at 22:32 and red on
its own release PR at 22:48, sixteen minutes later, on the identical commit. New
advisories had been published in between. Nothing in the repository changed.

**Exact-SHA evidence reuse keys on the tree, not the world.** The 2026-09-08
release to `main` was authorised by a `CI required gate` verdict from
2026-08-31 — valid by the reuse rule, because the tree was byte-identical. The
merge commit then ran fresh and failed this job, so `main` was red the moment it
was created. The evidence was true when written and false when used.

Deliberately **not** acting on this. Weakening or restructuring a security
control to make a release smoother is the wrong instinct, and the gate behaved
correctly both times. It is recorded here so that whoever next sees a mystery red
on an untouched tree recognises it in seconds instead of bisecting, and so that
any future change to the reuse rule is made knowing this case exists.

See [[ITEM-0123]] for the advisory that is still open.

## A property of the gate, recorded rather than changed

This job went red **twice in one session without a single line of code
changing**, and the second time inside a sixteen-minute window between a
branch's CI run and its own release PR's run. That is not a malfunction — both
times it found real advisories, and one of them (`multer`, [[ITEM-0123]]) is
genuinely reachable. It is a property worth writing down.

**"Green" here is a point-in-time claim, not a property of the tree.** Every
other required job answers a question about the commit; this one answers a
question about the world on the day it ran. The same tree passes and then fails
with nothing edited.

That interacts badly with one thing in particular. The `CI required gate` reuses
a green verdict when the tree is byte-identical — right for tests, and it means
**a stale green can authorise a merge**. It already did: the 2026-09-08 release
merged on advisory evidence from 2026-08-31, and the merge commit then ran fresh
and failed. `main` was red while production was deployed from it, and nothing
reported that, because the merge was correctly authorised by the rules as
written.

Deliberately **not** changed here. Options exist — pin an advisory snapshot so
the check is deterministic, or move the feed-dependent half out of the required
gate into a scheduled job that raises a record instead of blocking merges — but
each trades away some of a security control's bite, and that is not a trade to
make as a side effect of clearing the control. Recorded so the next person
meeting a red gate on an untouched tree recognises it in a minute rather than an
hour, and so the decision is available to take deliberately.

See [[gate-that-depends-on-the-outside-world]] for the operational version:
check whether your commit touched the job's inputs before assuming you broke it,
and read **every** failing job rather than the first.

