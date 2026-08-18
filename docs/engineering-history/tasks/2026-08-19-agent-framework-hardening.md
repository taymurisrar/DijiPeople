# Engineering History — Database Agent, Security Agent, agent reliability and Obsidian ownership

| | |
|---|---|
| **Task Title** | Database Agent, Security Agent, agent reliability and Obsidian ownership |
| **Task Type** | FRAMEWORK |
| **Date** | 2026-08-18 → 2026-08-19 |
| **Session** | SESSION-0016 |
| **Architect Plan** | NOT_APPLICABLE — audit-led. The change set could not be specified before the eleven roles and the real vault were measured. |
| **Agents Used** | Architect (orchestration, triage, Obsidian accountability), Database (preflight, lifecycle, repair), Security (the role itself was the deliverable), QA (invariant suites), Reviewer (gate integrity), Integrator (branch, rebase, merge), Release/DevOps (CI verdicts, repo health). Frontend, UI/UX and Integration NOT_REQUIRED — no app surface, no boundary and no user-facing layout changed. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/agent-framework-hardening` |
| **Base SHA** | `3f6775e`, rebased onto `27eff39` |
| **Target Branch** | `develop` |

## What was audited before anything changed

Eleven permanent roles, against the named gap classes. The result was a table,
not an impression:

| Gap | Roles affected |
|---|---|
| No session awareness | backend-api, frontend, integration, qa, ui-ux — **five** |
| No `KNOWLEDGE_IMPACT` declaration | those five, plus integrator, release-devops, reviewer |
| No instance identity | every role except architect |

The vault was measured the same way: 405 generated notes, 1652 wikilinks.

## The two orphan kinds

The existing verifier walked **repo → vault** only. Every source note must
exist, match and resolve its links — and nothing walked the other direction, so
a generated note whose source was renamed, merged or emptied stayed in the vault
forever, invisible to every check and to every agent reporting
`OBSIDIAN_SYNC_STATUS = PASS`.

That is the ownership defect. Not any particular stale note.

| | Before | After |
|---|---:|---:|
| `OBSIDIAN_SOURCE_ORPHANS` | 0 | 0 |
| `OBSIDIAN_GRAPH_ORPHANS` | **102** | **0** |
| `OBSIDIAN_UNRESOLVED_LINKS` | 0 | 0 |
| `OBSIDIAN_STALE_GENERATED_COUNT` | 4 | 0 |
| `OBSIDIAN_PARITY_DIFFS` | 3 | 0 |

82 of the 102 graph orphans were QA scenarios. The relationships were never
missing — they were in frontmatter (`AREA`, `RELATED_BUGS`, `AFFECTED_MODULES`)
and in task prose naming bug ids in plain text, where Obsidian cannot see any of
it, because a YAML value is not a wikilink and neither is the string
`BUG-0061`.

So the generators project what already exists and invent nothing. A scenario
links to the plan covering its `AREA` — an edge already validated, since a
scenario whose area has no plan is a load error. Module links require an **exact**
name match: `commercial-onboarding` does not become
`commercial-onboarding-lifecycle`, because a plausible-looking wrong edge is
worse than an absent one.

## Four defects found by running the work, not by reading it

**1. The Prisma client was stale on develop.** The new preflight found it
immediately: 28 enums missing from the generated client. Repaired; the API then
typechecked clean — 295 enums, 312 models, 7293 fields, 0 errors.

**2. The local database was nine migrations behind.** Verified all nine
contained zero `DROP`/`TRUNCATE`/`DELETE` statements before applying anything to
a populated database, then deployed. All four database fields `CURRENT`.

**3. `npm run prisma:migrate:deploy` did not exist.** `AGENTS.md:354` instructs
agents to run it; its three siblings (`validate`, `generate`, `status`) all
existed at root and `deploy` did not. Added, so the documented command is true.

**4. `BUG-0067` was never allocated.** It is cited in
`check-prisma-client-fresh.mjs` and, because I copied that citation, in three
places I wrote. The real record is `BUG-0068`. Corrected in all five.

## The loophole in the Architect — which this task exposed in itself

With dependency-ready work remaining, the Architect asked the user whether to
continue. That is not caution. It converts an autonomous framework back into a
supervised one, and hands the user the job of tracking a decomposition the
Architect chose for itself.

```
PARENT_TASK = IN_PROGRESS and NEXT_READY_WORK_PACKAGE exists
  ⇒ continue. USER_CONFIRMATION_REQUIRED is not a terminal state.
```

Three stopping states remain legitimate and are still named — `PRODUCT_DECISION`,
`BLOCKED_EXTERNAL`, `COMPLETE` — or the rule would read as "never stop", which is
a different and worse defect. Execution capacity is a **checkpoint**: finish the
coherent unit, push, persist `CURRENT_PHASE` / `COMPLETED_WPS` /
`NEXT_READY_WP` / SHA / leases, mark `RESUME_REQUIRED`.

## Validation

`node scripts/validate-framework.mjs` — **2679 checks**, from 2609.

Simulations 30–36 added: Architect autonomy, Security routing and blocking
post-review, Database preflight fields and ownership boundaries, session-scoped
role instances, both orphan kinds, projected-not-invented edges,
`KNOWLEDGE_IMPACT`.

**12 mutation tests, 12 caught** — but two only after correcting the *mutation*:

| Mutation | Outcome |
|---|---|
| Delete the Architect continuation rule | caught |
| Make `USER_CONFIRMATION_REQUIRED` terminal | caught |
| Delete `security.md` | caught (after fixing the harness path) |
| Drop Security from the matrix | caught |
| Make the Security post-review advisory | caught (after targeting the real sentence) |
| Let `UNKNOWN` rest in the preflight | caught |
| Allow Backend to author migrations | caught |
| Remove the Database instance block | caught |
| Drop `GRAPH_ORPHAN` detection | caught |
| Remove the standalone classification | caught |
| Remove `KNOWLEDGE_IMPACT` from the contract | caught |
| Stop the Reviewer checking it | caught |

The first "make the post-review advisory" mutation replaced the first occurrence
of *blocks completion*, which lives in Required Context — leaving the actual rule
untouched. The check was right to pass. **A mutation test that passes is
meaningless until you confirm the mutation landed on the thing under test.**

That exercise found a real defect: deleting a tracked file made
`validate-framework` throw `ENOENT` rather than report. Exit 1, so CI still
blocked, but a stack trace hides every other result in the run. Now a named
check.

**Security health**: 27 suites, 218 tests — wiring invariants, RBAC matrix,
tenant isolation. All pass. BUG-0052 (HIGH, P0, dependency advisories) is
pre-existing, already triaged `FIX_NOW`, and not a regression from this work.

## The optimisation I reverted

The Playwright browser cache added the previous day made the step it was meant
to accelerate catastrophically slower:

| Run | `Install the browser` |
|---|---:|
| 32160472427 — before the cache | 27s |
| 32178458380 — cache, first run | 6m41s |
| 32182849325 — cache, next run | **25m55s**, consumed the 30-minute timeout, failed the gate |
| 32186211469 — cache removed | **1m29s** |

`~/.cache/ms-playwright` is exactly where ubuntu-latest already ships the
browser; restoring an empty or partial directory over it appears to shadow the
preinstalled build and turn a fast verification into a full download.

The timeout that caught it stays where it is. It did its job — and it is the
same timeout added the previous day precisely so an unbounded job could not hide.

## Conflicts and Conflict Resolutions

One rebase onto `27eff39`, needed so a `[[ci-architecture]]` wikilink would
resolve. Three conflicts, all in **generated** files (`Engineering Control
Center`, `sessions/active`, `sessions/index`) — resolved by regenerating them,
which is the only correct resolution for generated content.

The rebase left the remote tip `bec5cdf` no longer an ancestor. **Force-pushing
is prohibited under any circumstances**, so the old tip was reconciled with an
explicit `-s ours` merge — accurate here rather than a shortcut, since every
change in `bec5cdf` was already present as its rebased equivalent, and its CI run
had failed on the Playwright timeout this branch reverts.
