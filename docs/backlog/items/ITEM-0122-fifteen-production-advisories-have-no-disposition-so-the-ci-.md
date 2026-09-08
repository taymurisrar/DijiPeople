---
ID: ITEM-0122
aliases: [ITEM-0122]
Title: Fifteen production advisories have no disposition, so the CI advisory gate fails on every branch including main
Type: SECURITY
Status: PRODUCT_DECISION
Priority: P1
Severity: HIGH
AffectedModules: [ci, dependencies]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
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
