---
ID: BUG-3166
aliases: [BUG-3166]
Title: Production deploys before the deployed commit has a CI verdict
Status: OPEN
Severity: HIGH
Priority: P1
Type: INFRA
Source: REVIEWER
DetectedDate: 2026-09-10
DetectedInSha: 23504f4b
AffectedModules: [.github/workflows]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-09-10
UpdatedAt: 2026-09-11
ResolvedAt:
---

# BUG-3166 — Production deploys before the deployed commit has a CI verdict

> **Architect triage, 2026-09-11 — `FIX_NOW`.** Deploying before the commit has a verdict makes the gate decorative. This release proves the point: four CI cycles, three red, and every one of them found something real.

## Summary

Production deploys before the deployed commit has a CI verdict

Identified by the 2026-09-10 full technical audit as CI-01 (confidence: CI-01=CONFIRMED).

## Expected Behavior

the deploy waits for the `CI required gate` check on the
  exact SHA being deployed, or the deploy is triggered by CI itself after the gate
  passes.

## Actual Behavior

any commit landing on `main` starts a production deploy
  immediately. `preDeployCommand` (`npm --workspace api run release` =
  `migrate deploy && seed:config && seed:verify && seed:admin &&
  repair:market-countries && seed:legal && legal:publish --confirm`) runs against
  the production database before the CI verdict for that commit exists.

## Reproduction

This is a code-review finding from a static technical audit, not a QA-run runtime reproduction. To confirm: open the file(s) cited in Evidence and trace the call path described in Actual Behavior.

## Evidence

**CI-01** (Render service `srv-d7js7fqqqhas739v4i7g`, `.github/workflows/ci.yml`, `render.yaml`):

Render service configuration (GET `https://api.render.com/v1/services/srv-d7js7fqqqhas739v4i7g`):
  ```json
  "autoDeploy": "yes",
  "autoDeployTrigger": "commit",
  "branch": "main",
  ```
  Render supports `checksPass` for this field. It is set to `commit`.

  The deploy that produced the currently-live instance
  (GET `/v1/services/srv-.../deploys?limit=5`):
  ```
  dep-dago676417fc73fptpeg  live  890cd96d  created 2026-09-09T16:02:36.356Z
                                            finished 2026-09-09T16:10:01.579Z  trigger new_commit
  ```
  The CI run for that same SHA
  (GET `/repos/taymurisrar/DijiPeople/actions/runs?head_sha=890cd96d...`):
  ```
  34374199661  CI  success  main  created 2026-09-09T16:02:37Z -> 2026-09-09T16:16:30Z
  ```
  The deploy started **1 second before** the run began and went live **6m29s
  before** the run concluded.

  `890cd96d` is a merge commit, not the SHA the gate validated:
  ```
  $ git log -1 --format="%H%nparents: %P" 890cd96d...
  890cd96ded0ecbc77870c5841500d67eafa93aaf
  parents: 4d0635a0b99099af... 6f841a1593...
  ```
  The `CI required gate` ran on parent `6f841a15` (the PR head). The tree that
  deployed is a different object.

  `render.yaml` declares no `autoDeploy` key at all, so this behaviour is invisible
  from a clean clone.

  A fifth deploy in the same listing carries `trigger: deployed_by_render` — a
  dashboard-initiated deploy, which passes through no gate whatsoever.

---


Full finding text: CI-01 in `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CI.md`.

## Root Cause

Not established — the audit's analysis (see Evidence) identifies the mechanism but a full root-cause investigation has not been performed. See Actual Behavior for the closest available explanation.

## Impact

because `strict: true` forces the PR head to be up to date, the merge
  commit's *tree* is normally identical to the validated head's, which is what has
  kept this from biting. It stops being true the moment two PRs merge in the same
  window, a merge conflict is resolved in the merge commit, `strict` is relaxed, or
  someone clicks "Manual Deploy" in the Render dashboard. In any of those cases a
  migration runs against production data with no automated verification of the tree
  that produced it. There is one instance and no automatic rollback (CI-09).

## Affected Areas

.github/workflows

## Proposed Resolution

set the Render service's `autoDeployTrigger` to `checksPass`
  (one dashboard/API field), and add `autoDeploy`/`autoDeployTrigger` to
  `render.yaml` so the setting is reviewable. Longer term, move the deploy trigger
  into a `deploy` job in `ci.yml` gated on `needs: [ci-required]`, using a Render
  deploy hook.

(Difficulty: LOW; Regression risk: LOW; Fix now: YES)

## Acceptance Criteria

- The behaviour described in Expected Behavior holds for Render service `srv-d7js7fqqqhas739v4i7g`, `.github/workflows/ci.yml`, `render.yaml` (audit id CI-01).

## Regression Coverage

No automated test currently fails without this fix. Audit-assessed regression risk of the fix itself: CI-01=LOW. Add a regression test alongside the fix; link its `REG-nnn` entry here once it exists.

## Dependencies

None identified beyond the fix itself.

## Related Items

- Audit finding `CI-01` — `docs/engineering/audits/2026-09-10-full-technical-audit/raw/CI.md`

## Resolution

Not yet resolved.

## QA Retest

Not yet retested.

## History

- 2026-09-10 — created from the 2026-09-10 full technical audit (CI-01) at `23504f4b`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
