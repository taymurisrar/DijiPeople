# Engineering History — Admin releases management and channel promotion UI

| | |
|---|---|
| **Task Title** | Admin releases management and channel promotion UI |
| **Task Type** | FEATURE |
| **Date** | 2026-08-26 |
| **Architect Plan** | None — a focused UI + two endpoints on the existing app-releases machinery; the surrounding decisions were settled in [[TASK-0025]]. |
| **Agents Used** | Backend (endpoints), Frontend (admin page). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/admin-releases-ui` |
| **Base SHA** | `92f6fef7` |
| **Final Task SHA** | `8732194b` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — `develop` fast-forwarded (ref-push); tip equals the CI-verified SHA. |
| **Final Target SHA** | `8732194b` |

### Commits

```
feat(admin): releases management + channel promotion UI (TASK-0026)
```

### Files Changed

`app-release.service.ts` (`listForManagement`, `promote`); `app-release.controller.ts`
(`GET /manage`, `POST /:id/promote`, PromoteReleaseChannelDto);
`app-release.service.spec.ts` (+promote tests); `apps/admin` — the
`(internal)/app-releases` page, its API proxy, and the sidebar entry.

## Conflicts

None. Branch already contained `origin/main`; `develop` did not advance.

## Conflict Resolutions

None.

## QA

| | |
|---|---|
| **QA Report** | No separate run. |
| **Bug IDs** | None. |
| **Backlog Items** | None filed. Tenant-assignment editing UI (which tenants receive a release) is a further piece, noted in TASK-0026. |

`app-release.service.spec` 16/16 (adds the promote reuse-storage and no-op
cases); the four app-releases suites 61/61; api + admin typecheck clean; admin
and the new api files lint clean. The two `wiring-invariants` failures are the
pre-existing local `pdf-parse` gap (CI-green).

## CI

| | |
|---|---|
| **CI Run ID** | `32961278553` |
| **CI Result** | PASS on the exact merged SHA `8732194b`. |

## Post-Merge Validation

`develop` fast-forwarded to `8732194b`; the merged SHA is the CI-verified SHA.

## Release / Deployment Impact

None — not deployed. `main` UNTOUCHED. The screen is gated by
`appDownloads.manage`; promotion audits every change and never assigns a release
to a tenant.

## Knowledge Capture

Nothing new durable; the page reuses the self-gating client-panel pattern and the
existing release-publishing model.

## Obsidian Sync

`knowledge:sync` needs a local vault config not present here; NOT_REQUIRED.

## Cleanup

Session SESSION-0063 marked COMPLETE; the worktree is removed after this record
lands; the primary checkout was never written.
