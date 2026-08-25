# Engineering History — DLP capture go-live readiness

| | |
|---|---|
| **Task Title** | DLP capture go-live readiness |
| **Task Type** | FEATURE |
| **Date** | 2026-08-25 |
| **Architect Plan** | None — a follow-up to [[TASK-0020]] closing usability gaps; each package is small and single-owner, so no separate ExecPlan (PLANS.md allows this for localised additions). |
| **Agents Used** | Frontend (rule UI, captures view), Backend (body limit, list endpoint), Integration (validation). |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/dlp-go-live` |
| **Base SHA** | `42435d59` |
| **Final Task SHA** | `5f556842` |
| **Target Branch** | `develop` |
| **Merge Commit** | None — `develop` fast-forwarded (ref-push), so the tip equals the CI-verified SHA. |
| **Final Target SHA** | `5f556842` |

### Commits

```
6b008b30 fix(dlp): format the new spec mock, regenerate stale indexes
b8018b76 feat(dlp): go-live readiness — rule UI, body limit, captures view
(plus a merge of origin/develop for its concurrent admin/layout commits)
```

### Files Changed

Rule UI `dlp-rules-manager.tsx` (+319, new) and its wiring on the desktop-agent
settings page; `dlp-review/page.tsx` (the clipboard-captures section); `main.ts`
(the 25 MB screenshot body limit); `dlp.controller.ts` / `dlp.service.ts` (the
`listClipboardCaptures` endpoint); `dlp-capture.dto.ts` (batch/size bounds);
`dlp-manager.ts` (screenshot flush chunking); `dlp.service.spec.ts` (+list test).

## Conflicts

Two merges of `origin/develop` while the branch was in flight (develop advanced
under concurrent sessions). Conflicts were confined to generated index files
(`docs/sessions/index.md`; dashboards auto-merged). No source-code conflicts.

## Conflict Resolutions

Generated indexes resolved by taking develop's side and regenerating from the
record files (`rebuild-sessions`, `rebuild-tasks`, `generate-dashboards`) — the
only correct resolution for generated files, since a hand-merge is overwritten by
the next generator run. Choosing the branch side instead would have dropped the
other sessions' records that landed on develop.

## QA

| | |
|---|---|
| **QA Report** | Covered by unit + contract specs; no separate run. |
| **Bug IDs** | None. |
| **Backlog Items** | None filed. Two follow-ups remain noted in code/ExecPlan: wiring the monitoring-consent legal document, and the live packaged-agent acceptance run. |

`dlp.service.spec` 8/8 (adds the list-captures test), `agent-client-contract`
12/12, agent-desktop 71/71, all typechecks clean, DLP files lint clean.

## CI

| | |
|---|---|
| **CI Run ID** | `32880557445` |
| **CI Result** | PASS on the exact merged SHA `5f556842`. |

Two earlier runs failed and were fixed forward: (1) a stale spec-mock format and
stale dashboard/session indexes. The first CI's prettier error read as being in
`sanitize-error-log.ts` but was actually in `dlp.service.spec.ts` — the file
header precedes its errors in the ESLint output.

## Post-Merge Validation

`develop` fast-forwarded to `5f556842` — the merged SHA is the CI-verified SHA,
so no unverified integrated result exists. Framework validation 3787 checks pass.

## Release / Deployment Impact

None — not deployed. `main` UNTOUCHED. Capture remains off by default; this task
only makes the already-shipped capability configurable and reviewable.

## Knowledge Capture

[`docs/knowledge/framework/local-prettier-crlf-vs-ci-2026-08-25.md`](../../knowledge/framework/local-prettier-crlf-vs-ci-2026-08-25.md)
— why local `prettier --check` is unreliable on this Windows checkout (CRLF) and
how to read CI's prettier errors correctly.

## Obsidian Sync

`knowledge:sync` needs a local vault config not present here; NOT_REQUIRED. The
Git-tracked records are the durable record.

## Cleanup

Task worktree `D:/My Work/hrm-dijipeople/DijiPeople-dlp2` removed after
integration; SESSION-0054 marked COMPLETE; primary checkout never written.
