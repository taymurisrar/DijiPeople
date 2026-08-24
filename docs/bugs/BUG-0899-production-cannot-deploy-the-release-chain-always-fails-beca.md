---
ID: BUG-0899
aliases: [BUG-0899]
Title: "Production cannot deploy: the release chain always fails because seeded legal documents declare themselves drafts"
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/prisma]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-24-record-state-reconciliation-0a5586f.md
RegressionId: REG-244
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-24
ResolvedAt: 2026-08-23
---

# BUG-0899 — Production cannot deploy: the release chain always fails because seeded legal documents declare themselves drafts

## Summary

The release that was merged to `main` on 2026-08-23 (`1dd74a25`, PR #40) never
reached production. Render's `preDeployCommand` runs `npm run release`, whose
last step is `legal:publish --confirm`. That script refuses to publish any
document whose own text declares it a draft, and exits `2` when **any** document
is skipped. `seed-legal.ts` writes a `REVIEW_BANNER` reading *"Draft — not
published, and not legal advice … It has not been reviewed by a lawyer"* into
all ten documents, on every run. So `legal:publish` skips all ten, exits 2,
`release` fails, and the deploy aborts.

The two scripts sit in the same chain and cannot both succeed. Production is
therefore frozen at commit `ef57b2a` — **14 commits behind `main`** — and no
fix, including the fixes in this run, can ship until the legal text is replaced.

## Expected Behavior

A merge to `main` deploys. Where a genuine precondition is unmet the deploy
fails loudly — but the pipeline must have a reachable success state.

## Actual Behavior

Every deploy fails at pre-deploy with exit 2. The previous instance keeps
serving, so the service looks healthy while being two weeks of work out of date.

## Reproduction

Locally, against any freshly seeded database:

```bash
npm --workspace api run seed:legal      # writes 10 drafts, each carrying the banner
npm --workspace api run legal:publish -- --confirm
```

Reproduced exactly on the isolated stack in this run.

## Evidence

Render deploy list for `srv-d7js7fqqqhas739v4i7g`:

```
pre_deploy_failed  1dd74a2  2026-08-23T00:15:27  "Release: regional pricing, features page, forms, checkout a…"
live               ef57b2a  2026-08-22T22:15:19  "Release: the draft-publication guard, so the new preDeployC…"
```

Production `/api/health` still reports the older commit:

```json
{"environment":"production","commitShort":"ef57b2a"}
```

Pre-deploy log, ten times over then the exit:

```
{ "slug": "terms", "action": "SKIPPED",
  "reason": "the document declares itself an unpublished draft; states it has not
             been reviewed by a lawyer; calls itself a draft — remove that text
             before publishing" }
…
npm error Lifecycle script `legal:publish` failed with error:
npm error code 2
npm error command sh -c ts-node prisma/publish-legal.ts --confirm
==> Pre-deploy has failed
==> Exited with status 2
```

The two halves that cannot agree:

- `services/api/prisma/seed-legal.ts:39` — `const REVIEW_BANNER = "> **Draft — not published, and not legal advice.** … It has not been reviewed by a lawyer"`
- `services/api/prisma/publish-legal.ts:181` — `findDraftSelfDeclarations(draft.contentMarkdown)` → `SKIPPED`
- `services/api/prisma/publish-legal.ts:239` — `if (skipped.length) process.exit(2);`

## Root Cause

The guard added in the previous release (correctly, after ten draft documents
were once published to production) treats *any* skip as a failure, and the seed
guarantees a skip. The comment above the exit anticipates the case it does not
cover:

```ts
/*
 * A skip is not a failure — an already-published document is the expected
 * state on a re-run. But a skip for any *other* reason means an operator
 * asked for ten documents and got fewer …
 */
```

"An operator asked for ten and got fewer" is the right rule for a human running
the command. It is the wrong rule for an unattended deploy gate, where the only
possible input is the seed's own draft text.

The deeper problem is not the exit code: it is that **there is no real legal
copy**. The documents are placeholders awaiting review, and publishing them is
blocked for good reason.

## Impact

Nothing can be released. Every fix in this run — including two CRITICAL ones —
is undeployable until this is resolved. Production also has no published legal
documents at all, which is [[BUG-0906]].

## Affected Areas

- `render.yaml` (`preDeployCommand: npm --workspace api run release`)
- `services/api/prisma/publish-legal.ts`
- `services/api/prisma/seed-legal.ts`
- every deployment of the API

## Proposed Resolution

Two decisions, and the first is not an engineering one:

1. **Replace the placeholder legal text with reviewed copy.** This is a product
   and legal decision — an agent must not write the terms a company sells
   under, nor strip a banner that says a lawyer has not read them.
2. **Separate "publish what is ready" from "the deploy must fail".** Options,
   in order of preference:
   - Move `legal:publish` out of `preDeployCommand` and run it as a deliberate
     operator step, leaving the deploy chain to migrations and seeds.
   - Keep it in the chain but exit non-zero only when a document that *should*
     be publishable could not be — i.e. treat a self-declared draft as an
     expected skip, and surface unpublished documents through
     `smoke:deployment` instead.

This warrants an ExecPlan: it changes what a production deploy is allowed to
fail on.

## Acceptance Criteria

- A deploy of `main` reaches `live` with the current commit serving at
  `/api/health`.
- Either the legal documents are published, or their absence is reported by a
  check that does not block unrelated deploys.

## Regression Coverage

None yet. The check that would have caught it is a CI or smoke assertion that
`npm run release` can complete against a freshly seeded database.

## Dependencies

Blocks deployment of [[BUG-0900]], [[BUG-0901]] and [[BUG-0902]].

## Related Items

[[BUG-0906]], [[BUG-0903]], [[BUG-0904]]

## Resolution

Fixed in `2852855e` (feat(legal): the real legal copy, and a test so it can
never fail a deploy again), released to `main` in PR #42 and deployed.

The owner supplied real legal copy, so `seed-legal.ts` no longer writes a
`REVIEW_BANNER` declaring each document a draft. `legal:publish --confirm`
therefore publishes rather than skipping, and the release chain completes.

Verified against production on 2026-08-24: `/api/health` reports commit
`6ed7a44`, which is `origin/main` — the deploy that this bug blocked has run.
The deploy log shows the full chain, with `legal:publish` reporting
`ALREADY_PUBLISHED` for all ten documents.

## QA Retest

Retest by merging to `main` and confirming the Render deploy reaches `live` and
`/api/health` reports the new commit.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[database-architecture]]
- Regression — REG-244 (see the regression register)

<!-- GRAPH:END -->
