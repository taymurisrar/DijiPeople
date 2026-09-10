---
ID: ITEM-0084
aliases: [ITEM-0084]
Title: Detect drift between render.yaml and the live Render service
Type: INFRA
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [render.yaml, scripts]
Source: DEPLOYMENT
OwnerAgent: release-devops
ArchitectDisposition: DONE
CreatedAt: 2026-08-22
UpdatedAt: 2026-09-11
RelatedBug: BUG-0767
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0084 — Detect drift between render.yaml and the live Render service

## Summary

[[BUG-0767]] was that the live service did not match `render.yaml`: no
`preDeployCommand` at all, and `prisma migrate deploy` bolted onto the build
command instead. It is fixed — somebody made them agree — and **nothing fails
when they diverge again**.

## Why It Matters

The file is committed, reviewed and reasoned about. The service is edited in a
dashboard. Those two facts guarantee divergence over time, and the divergence is
invisible: migrations kept applying, so deploys looked correct while
`seed:config`, `seed:verify`, `seed:admin`, `seed:legal` and `legal:publish` had
never executed on production.

The cost of not noticing was not abstract. No purchase could record consent,
because the subscribe wizard requires agreements carrying a published version
and nothing had ever been published.

## Proposed Approach

A script — `scripts/check-render-config.mjs` — that reads the live service and
compares the fields `render.yaml` declares:

1. `buildCommand`, `startCommand`, `preDeployCommand`, `healthCheckPath`,
   `autoDeploy`, `branch`.
2. Report a diff, not a boolean. "They differ" sends somebody to a dashboard;
   naming the field and both values sends them to the fix.
3. Normalise the noise that is not drift — `NODE_OPTIONS` memory caps are set on
   the service deliberately and are not in the file. Either allow an annotated
   prefix or record the caps in `render.yaml`; the second is better, because an
   allowance is a hole.

**Not in CI**, at least not as a required job. It needs `RENDER_API_KEY`, which
CI does not hold and should not. Run it from `repo:health` when the key is
present, and skip loudly when it is not — a check that silently does nothing is
worse than one that is absent.

## Acceptance Criteria

- The script names every field where the file and the service disagree.
- It exits non-zero on a real difference and zero on an explained one.
- `repo:health` runs it when `RENDER_API_KEY` is available, and says it skipped
  when it is not.

## Resolution

Premise confirmed and, if anything, understated: BUG-0767 is fixed, and
render.yaml has drifted from the live service again already — more of it than
the "13 of 16" figure that motivated this item.

Built `scripts/check-render-config.mjs` (wired as `npm run check:render-config`)
exactly to the Proposed Approach:

1. Reads `render.yaml`'s one service block (a small hand-written reader, not a
   YAML dependency — the file has one service and a flat structure, and it
   fails loudly rather than mis-parsing if that ever stops being true) and
   compares `name`, `plan`, `buildCommand`, `startCommand`, `preDeployCommand`
   and `healthCheckPath` against the live service (`GET /v1/services`, matched
   by `rootDir === 'services/api'` and repo, never by name — name is one of the
   fields being compared).
2. Compares every env var key `render.yaml` declares against
   `GET /v1/services/:id/env-vars`, reporting each declared key absent on the
   live service, and (for keys with a literal `value:`, not `sync: false`)
   flagging a value mismatch.
3. Names every disagreement rather than returning a boolean, per the
   acceptance criteria — see the sample output in
   [[deployment-architecture]] for exactly what it found on this run.
4. Normalises the one known, deliberate difference — a `NODE_OPTIONS`
   memory-cap prefix on `preDeployCommand` — into its own "annotated" bucket
   instead of a silent allowlist. It is still printed, just not counted as
   drift, so the allowance itself stays visible rather than becoming a hole.
5. Exits non-zero only on real drift; `autoDeploy`/`branch` (not declared in
   the file at all) and the count of live-only env vars are printed as context,
   not failures.

**Never writes to Render** — every call is a `GET`; there is no code path that
constructs a `POST`/`PATCH`/`PUT`/`DELETE` to the Render API anywhere in the
script.

**Wired into `repo:health`**: runs `check-render-config.mjs`'s exported
`runCheck()` when `RENDER_API_KEY` is set, adds a `RENDER_CONFIG_STATUS` line
to both the human and `--json` report, and a `PASS_WITH_WARNINGS` (never a
blocker — this is infrastructure drift, not this task's to fix by fiat) warning
line when drift is found. Confirmed both paths: with the key present it
reported `DRIFT (29 field(s))`; with it unset it reported
`SKIPPED_NO_API_KEY` — never silent, per the acceptance criteria.

**What it found, run for real against the live service** (`RENDER_API_KEY` was
available in this environment) — full detail moved to
[[deployment-architecture]] rather than duplicated here, since that document
already owns this exact subject and is where recurring drift gets checked
against: `name`, `plan`, `buildCommand`, `startCommand` and `healthCheckPath`
all disagree, and 24 of 51 declared env vars — including the entire email
provider configuration — do not exist on the live service at all. **Not
corrected as part of this item.** The item asked for detection; the service is
production, and changing what it runs is a separate, deliberately reviewed
action with its own risk, not a side effect of shipping a script.

Validated: `node scripts/check-render-config.mjs` and `--json` against the real
service (both exit codes confirmed: 1 on drift, 0 when skipped with no key),
`node scripts/repo-health.mjs` with and without `RENDER_API_KEY` set.

## Dependencies

None. [[BUG-0767]] is fixed; this stops it recurring.

## Related Items

[[BUG-0767]] · [[BUG-0714]] · [[deployment-architecture]].

## History

- 2026-08-23 — raised as the third step of BUG-0767’s resolution, which fixed
  the drift without adding anything that would detect the next one.
- 2026-08-23 — Architect triage: FIX_NOW. The two sources will diverge again by
  construction, and the last divergence hid a consent failure for weeks.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-0767]]

<!-- GRAPH:END -->
