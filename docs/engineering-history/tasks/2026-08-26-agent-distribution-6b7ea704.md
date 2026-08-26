# Engineering History — Agent app distribution and auto-release pipeline

| | |
|---|---|
| **Task Title** | Agent app distribution and auto-release pipeline |
| **Task Type** | INFRA |
| **Date** | 2026-08-26 |
| **Architect Plan** | None — infra/config wired to the existing app-releases machinery; the four owner decisions are recorded in [[TASK-0025]] rather than a separate ExecPlan. |
| **Agents Used** | Release/DevOps, Backend (RBAC), Integration. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/agent-distribution` |
| **Base SHA** | `837ec8ed` |
| **Final Task SHA** | `6b7ea704` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — `develop` fast-forwarded (ref-push); tip equals the CI-verified SHA. |
| **Final Target SHA** | `6b7ea704` |

### Commits

```
feat(release): agent distribution + auto-release pipeline (TASK-0025)
```

### Files Changed

`render.yaml` (persistent disk + FILE_STORAGE_DIR); `scripts/lib/release-apps.mjs`
(agent packageCommand + artifact pattern); `.github/workflows/release-app.yml`
(.env generation, signing secrets); `.github/workflows/agent-auto-release.yml`
(new — version-bump → BETA); `apps/agent-desktop/electron-builder.yml` (drop-in
signing); `services/api/src/common/constants/rbac-matrix.ts` +
`permissions.ts` (employee download + update-feed access);
`docs/environment-variables.md`.

## Conflicts

None. The branch already contained `origin/main` at its base, and `develop`
did not advance during the run — the ref-push was a clean fast-forward.

## Conflict Resolutions

None.

## QA

| | |
|---|---|
| **QA Report** | No separate run. |
| **Bug IDs** | None. Addresses the substance of the open items ITEM-0026 (signing — now a drop-in) and the storage/permission gaps identified in the deployment analysis; those items are not formally closed here because the end-to-end run has not happened. |
| **Backlog Items** | None filed. |

Validated: `release-apps.test` and `test:release-cli` pass; `rbac-matrix.spec`
9/9 (employee grant does not break the matrix); api typecheck clean. The two
`wiring-invariants` failures are the pre-existing local `pdf-parse` gap (CI-green).

## CI

| | |
|---|---|
| **CI Run ID** | `32957783845` |
| **CI Result** | PASS on the exact merged SHA `6b7ea704`. |

**What CI does NOT prove here.** CI runs on Linux and does not execute the
Windows Electron build, the release publish, or a deploy. The two workflows
(`release-app.yml`, `agent-auto-release.yml`) are authored to the existing
patterns but their first real run — after the owner sets the release secrets,
configures the `release-production` environment, and promotes `develop` → `main`
so the disk exists — is where they are actually proven. This is stated plainly
rather than implied.

## Post-Merge Validation

`develop` fast-forwarded to `6b7ea704`; the merged SHA is the CI-verified SHA.

## Release / Deployment Impact

**Deferred to the owner.** Nothing reaches production until `develop` is promoted
to `main`, which is when the Render disk is provisioned and the RBAC change takes
effect. The owner's remaining steps (release credential on Render + GitHub, the
`release-production` environment, the first version bump, and later a signing
certificate) are listed in TASK-0025 and were handed over directly.

## Knowledge Capture

Nothing new durable beyond the task record and the owner step-guide; the pipeline
reuses the established release-publishing machinery documented in
`docs/development/release-publishing.md`.

## Obsidian Sync

`knowledge:sync` needs a local vault config not present here; NOT_REQUIRED.

## Cleanup

Session SESSION-0062 marked COMPLETE. The worktree is retained briefly for the
follow-up admin UI work ([[TASK-0026]]) and removed after that; the primary
checkout was never written.
