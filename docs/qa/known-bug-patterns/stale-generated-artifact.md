# Bug pattern — `stale-generated-artifact`

**A generated file is out of date, and every symptom accuses something else.
The code is correct, the schema is correct, the migrations are correct, CI is
green — and the application will not start. The failure names the innocent, so
the obvious fix writes a real defect to satisfy a stale copy.**

## Pattern

Something in this repository is *derived* from something else: the Prisma client
from `schema.prisma`, the local database from the migration history, the backlog
indexes from the bug records, the coverage matrix from the QA scenarios. The
source changes. The derived copy does not.

The derived copy is what the compiler and the runtime actually read, so the
error messages describe the derived copy's world:

```
Module '"@prisma/client"' has no exported member 'LeadInquiryIntent'.
Property 'requestedSlug' does not exist on type '{ … }'.
```

Sixty of those, all pointing at application code, none of which is wrong. The
natural response — widen the type, cast to `any`, redeclare the enum locally —
writes a genuine defect into the repository in order to agree with an artifact
that is simply old.

## Why it happens in DijiPeople

Three properties combine, and each is individually reasonable:

- **The derived artifact is untracked.** `node_modules/@prisma/client` and the
  local PostgreSQL are not in Git, so no diff, no review and no Git-based health
  check can see them drift. `POST_INTEGRATION_GENERATOR_STATUS` covers
  generators that write *tracked* files, which excludes precisely the generator
  whose staleness stops the API from booting.
- **CI regenerates, so CI is always green.** `npm run build` runs
  `prisma:generate`; the workflow runs it explicitly before typecheck. The
  failure is therefore invisible to the one system everybody trusts, which makes
  a local staleness problem look like a branch defect.
- **Regeneration is deliberately not automatic.** It costs ~20s, and putting it
  on the watch path taxes every reload of every developer to cover a rare event.
  That decision is right; it means something else must notice.

## Its arrivals

| | What was stale | What the guard did |
|---|---|---|
| [BUG-0060](../../bugs/BUG-0060-stale-generated-prisma-client-breaks-local-api-development.md) | The client, by one day — an enum | No guard existed. 60 errors accusing correct code, plus a runtime crash |
| [BUG-0068](../../bugs/BUG-0068-prisma-client-freshness-check-is-blind-to-field-level-drift.md) | The client — a scalar *field* | The guard checked enums and delegates only, and reported healthy |
| [BUG-0083](../../bugs/BUG-0083-the-database-agent-preflight-reports-pass-on-a-database-with.md) | The client **and** the local database | The agent-facing gate reported `PASS` over its own failing fields |

Read down that column: the artifact got staler in more ways each time, and the
guard's blind spot moved rather than closed. That is the characteristic shape of
this pattern — it survives its own fix by relocating.

## How to catch it

**Ask whether every symbol the source declares is reachable on the derived
copy.** Not whether the two files differ — Prisma writes a reformatted schema
into the client directory, so they always differ — and not mtimes, which are
fragile across checkouts. Symbol reachability is the question the failure asks,
so it is the question the guard should ask:

```bash
npm run check:prisma-client    # schema symbols vs the generated client
npm run db:preflight           # all four links, before dependent work
npm run db:postflight          # all four links, after work that changed any of them
```

**Check every link, not the one that broke last time.** The coherence is a
chain, and BUG-0083 was the second link failing while the guard watched the
third:

```
schema.prisma → migration state → generated Prisma Client → local PostgreSQL → application
```

A developer who follows a guard that names only the client will run
`prisma:generate`, boot successfully, and hit a runtime error on columns the
database does not have yet. Half a guard routes people to the next failure.

**Guard the task, not only the human.** BUG-0060 and BUG-0068 both wired the
check into `prestart:dev` and `precheck-types` — the developer's path. That
catches the person who pulls the branch, which is the last possible moment and
the wrong actor. `DATABASE_COHERENCE_STATUS` makes the task that authored the
migration answer for it, against the primary checkout, before reporting done.

**A check that could not run has not passed.** `UNKNOWN` and `INCOMPLETE` are
not `PASS`. A worktree without `node_modules` cannot inspect a generated client,
and saying so is the honest answer — but it must be a loud one, because "nobody
looked" is the state every arrival above started from.

## Related

- [`assertion-without-a-check`](assertion-without-a-check.md) — a comment doing a
  check's job. The sibling failure: here the check exists and is too narrow;
  there it never existed at all.
- [`premature-completion`](premature-completion.md) — reporting done over an
  unresolved field.
- [`doc-code-drift`](doc-code-drift.md) — the same derived-copy problem where the
  derived copy is prose.
