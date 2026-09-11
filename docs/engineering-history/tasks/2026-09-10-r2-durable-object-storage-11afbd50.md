# Engineering History — Durable object storage on Cloudflare R2 (FILE-01/INF-05)

| | |
|---|---|
| **Task Title** | Durable object storage on Cloudflare R2 (FILE-01/INF-05) |
| **Task Type** | FEATURE |
| **Date** | 2026-09-10 |
| **Architect Plan** | NOT_APPLICABLE — driven directly from FILE-01/INF-05, two CRITICAL findings of the 2026-09-10 full technical health audit (`docs/engineering/full_technical_audit.md` is the audit *standard*; the audit *report* itself is deliberately unpublished — see the provenance note at the top of [`docs/engineering/REMEDIATION-storage-p0.md`](../../engineering/REMEDIATION-storage-p0.md)), not from a `PLANS.md` ExecPlan. No ExecPlan was required because the one schema change is expand-only — 26 nullable columns and one enum, no drops, no narrowing, no `NOT NULL` without a default — which is exactly the class `PLANS.md` reserves the ExecPlan gate for. |
| **Agents Used** | Backend/API (storage provider abstraction, 16 domain services migrated, 9 controllers given upload limits), Database/Prisma (the `20260910121838_add_object_storage_metadata` migration, applied by hand to production ahead of the merge), Security (an independent adversarial review that found 4 defects, fixed in `c15e95d5`), QA (the production restart/redeploy persistence proof — the actual acceptance test for this P0 — plus tenant-isolation and R2-outage unit coverage), Release/DevOps (`render.yaml`, PR #71, polling the deploy to `live`, reading `/api/health` back), Documentation (`docs/architecture/object-storage.md`, the remediation record), Integrator (ref-push to `develop`, PR #71 into `main`, the back-merge of `main` into `develop`). **Frontend** touched only two shared file-proxy helpers to stream downloads instead of buffering them — not a UI change, so no dedicated Frontend or UI/UX pass ran. **Not used, and arguably should have been:** Product & Backlog Steward. The independent review's 4 defects and the self-review's 3 were real, material security findings — a client-facing storage-key leak, a stored-content-type XSS vector, an unscoped export read — fixed directly on the branch with no `BUG-nnnn` record and no backlog entry. AGENTS.md's "No finding may exist only in a report" rule is written for exactly this shape of finding; see Knowledge Capture and QA below for why this session did not follow it. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/r2-durable-storage` |
| **Base SHA** | `f55cf4b2eaa6faed1fe8222c0dc06e6cee60640e` |
| **Final Task SHA** | `11afbd509d0923776423aa9b65e7897bca5f2f26` |
| **Target Branch** | `develop` (feature commits), then `main` (release, PR #71) |
| **Merge Commit** | `6b2cd007abba5f2ae763685d60b559b540a46e1b` — PR #71 (`main` ← `develop`), CI verdict read on the exact head being merged, `f26fb28e`; merged 2026-09-10T17:51:52Z |
| **Final Target SHA** | `develop` reached `59c0f9fa6cffdfc9c680c0f75252efb103935a6b` (the back-merge of `main` into `develop`, see Conflicts). One further local commit, `11afbd509d0923776423aa9b65e7897bca5f2f26` (closing SESSION-0097's own record), sits on `agent/r2-durable-storage` in this worktree and **has not been pushed to `origin/develop`** as of this filing — see Cleanup. |

### Commits

```
f4278f17 feat(storage): durable object storage on Cloudflare R2 (FILE-01/INF-05)
3b351032 feat(storage): stream file downloads, add readiness probe and scoping tests
8631a133 docs(storage): architecture reference, and close the SVG branding hole at both ends
812eeedc chore(storage): register R2 configuration and add a reconciliation report
010649bc docs(storage): remediation record, and satisfy the prettier gate
bb141f08 fix(storage): close the upload limits my own first pass missed
2befd1e0 fix(storage): staging must have durable storage too
2c38e383 chore(records): regenerate session indexes and control center
19caf26c chore: land the pending instruction and landing-page work from the primary checkout
c15e95d5 fix(security): four holes the independent review found
c9233a2d fix(lint): bring the branch under the CI warning budget
f26fb28e chore(generated): regenerate the artifacts the schema change staled
6b2cd007 Release: durable object storage on Cloudflare R2 (FILE-01/INF-05)
ab4e36e4 docs(remediation): FILE-01/INF-05 verified resolved on production
59c0f9fa Merge main into develop after the R2 storage release
11afbd50 chore(session): close SESSION-0097
```

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            c22889ab [develop]
C:/Users/hp/AppData/Local/Temp/claude/wt-framework              20eec75a [agent/agent-framework-hardening]
D:/My Work/hrm-dijipeople/dijipeople-admin-fx                   2ee22c79 [agent/reconcile-main-into-develop]
D:/My Work/hrm-dijipeople/dijipeople-admin-qa                   1b85b0b5 [agent/admin-console-e2e-qa]
D:/My Work/hrm-dijipeople/dijipeople-agent-os                   dc8c532b [agent/agent-operating-system]
D:/My Work/hrm-dijipeople/dijipeople-attendance-loc             2a1a1e06 [agent/attendance-location-capture]
D:/My Work/hrm-dijipeople/dijipeople-audit                      911be0fa [agent/full-technical-audit]
D:/My Work/hrm-dijipeople/dijipeople-authz-batch0               7f5eacda [agent/authz-feature-availability]
D:/My Work/hrm-dijipeople/dijipeople-bugs                       953ab110 [agent/provisioning-ops-and-qa]
D:/My Work/hrm-dijipeople/dijipeople-ci-e2e                     b7382f00 [agent/ci-e2e-remediation]
D:/My Work/hrm-dijipeople/dijipeople-db-coherence               3221625a [agent/db-coherence-postflight]
D:/My Work/hrm-dijipeople/dijipeople-depsec                     08b8661a [agent/lockfile-resolution-and-tar]
D:/My Work/hrm-dijipeople/dijipeople-global-remediation         423a7a8a [agent/global-remediation-program]
D:/My Work/hrm-dijipeople/dijipeople-integration-wp02           3f9063f5 (detached HEAD)
D:/My Work/hrm-dijipeople/dijipeople-monitoring                 c18b5024 [agent/prod-monitoring-triage]
D:/My Work/hrm-dijipeople/dijipeople-qa                         2df0e3a6 [agent/qa-verify-and-burndown]
D:/My Work/hrm-dijipeople/dijipeople-r2-storage                 11afbd50 [agent/r2-durable-storage]
D:/My Work/hrm-dijipeople/dijipeople-recon                      2d609724 [agent/record-state-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-record-reconciliation      03f30cb7 [agent/remediation-record-reconciliation]
D:/My Work/hrm-dijipeople/dijipeople-release                    9cd2f40f [agent/release-site-ux-and-admin]
D:/My Work/hrm-dijipeople/DijiPeople-relprep                    ead6638c [agent/develop-hygiene-and-release]
D:/My Work/hrm-dijipeople/dijipeople-remediation-authorization  257622ed [agent/dependency-and-desktop]
D:/My Work/hrm-dijipeople/DijiPeople-selfservice                d6aa7380 [agent/go-live-readiness]
D:/My Work/hrm-dijipeople/dijipeople-ux2                        c1d3d7b0 [agent/plans-reset]
D:/My Work/hrm-dijipeople/wt-landing-e2e                        004ee666 [agent/release-landing-e2e]
D:/My Work/hrm-dijipeople/wt-open-bug-sweep                     1003a2ac [agent/release-closeout]
```

### Files Changed

96 file(s) against `f55cf4b2eaa6faed1fe8222c0dc06e6cee60640e`.

```
M	.env.development.example
M	.env.example
M	.env.production.example
M	AGENTS.md
M	CLAUDE.md
M	apps/admin/lib/server-api.ts
M	apps/landing/app/partners/partner-inquiry-form.tsx
M	apps/web/app/(authenticated)/recruitment/_components/cv-upload-parse-flow.tsx
M	apps/web/app/(authenticated)/settings/branding/_components/branding-settings-form.tsx
M	apps/web/app/api/me/payslips/[id]/download/route.ts
M	apps/web/app/api/payroll/employer-bank-accounts/actions/export-template/route.ts
M	apps/web/app/api/payroll/employer-bank-accounts/actions/export/route.ts
M	apps/web/app/api/payroll/operations/[...path]/route.ts
M	apps/web/app/api/payslips/[id]/download/route.ts
M	apps/web/lib/server-api.ts
M	docs/README.md
M	docs/architecture/README.md
A	docs/architecture/object-storage.md
A	docs/engineering/REMEDIATION-storage-p0.md
A	docs/engineering/full_technical_audit.md
A	docs/engineering/object-storage-implementation.md
M	docs/environment-variables.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/knowledge/data-model/domain-map.md
A	docs/sessions/SESSION-0097-durable-object-storage-move-persistent-files-to-cloudflare-r.md
M	docs/sessions/completed.md
M	docs/sessions/index.md
M	package-lock.json
M	package.json
M	packages/config/platform-runtime-schema.generated.json
M	render.yaml
A	scripts/storage-reconcile.mjs
M	services/api/.env.example
M	services/api/package.json
A	services/api/prisma/migrations/20260910121838_add_object_storage_metadata/migration.sql
M	services/api/prisma/schema.prisma
M	services/api/prisma/seed-payroll-flow.ts
M	services/api/src/common/constants/wiring-invariants.spec.ts
M	services/api/src/common/errors/error-catalog.ts
M	services/api/src/common/filters/http-exception.filter.ts
A	services/api/src/common/storage/object-storage.types.ts
A	services/api/src/common/storage/providers/local-object-storage.provider.ts
A	services/api/src/common/storage/providers/r2-object-storage.provider.ts
A	services/api/src/common/storage/storage-keys.spec.ts
A	services/api/src/common/storage/storage-keys.ts
A	services/api/src/common/storage/storage.config.spec.ts
A	services/api/src/common/storage/storage.config.ts
M	services/api/src/common/storage/storage.module.ts
A	services/api/src/common/storage/storage.service.spec.ts
M	services/api/src/common/storage/storage.service.ts
A	services/api/src/common/storage/storage.tokens.ts
A	services/api/src/common/storage/upload-limits.ts
M	services/api/src/config/env.validation.ts
M	services/api/src/modules/agent/dlp/dlp.service.ts
M	services/api/src/modules/app-releases/app-release.controller.ts
M	services/api/src/modules/app-releases/app-release.service.ts
M	services/api/src/modules/app-releases/release-publisher.service.spec.ts
M	services/api/src/modules/app-releases/release-publisher.service.ts
M	services/api/src/modules/attendance/attendance.controller.ts
M	services/api/src/modules/attendance/attendance.service.ts
M	services/api/src/modules/contracts/contracts.controller.ts
M	services/api/src/modules/contracts/contracts.service.ts
M	services/api/src/modules/data-management/data-management.controller.ts
M	services/api/src/modules/data-management/export-execution.service.ts
M	services/api/src/modules/data-management/import-analysis.service.ts
M	services/api/src/modules/documents/documents-object-authorization.spec.ts
M	services/api/src/modules/documents/documents.controller.ts
M	services/api/src/modules/documents/documents.service.ts
M	services/api/src/modules/employees/employee-profiles.service.ts
M	services/api/src/modules/employees/employees.controller.ts
M	services/api/src/modules/payroll/payroll-operations.controller.ts
M	services/api/src/modules/payroll/payroll-output-document.service.ts
M	services/api/src/modules/payslips/payslips.controller.ts
M	services/api/src/modules/payslips/payslips.download.spec.ts
M	services/api/src/modules/payslips/payslips.service.ts
M	services/api/src/modules/platform-communications/platform-communications.service.ts
M	services/api/src/modules/platform-monitoring/platform-monitoring.module.ts
A	services/api/src/modules/platform-monitoring/storage-readiness.controller.ts
A	services/api/src/modules/recruitment/candidate-document-projection.spec.ts
M	services/api/src/modules/recruitment/candidates.controller.ts
M	services/api/src/modules/recruitment/dto/register-candidate-document.dto.ts
M	services/api/src/modules/recruitment/recruitment.service.ts
M	services/api/src/modules/reporting/export/report-artifact.service.spec.ts
M	services/api/src/modules/reporting/export/report-artifact.service.ts
M	services/api/src/modules/reporting/reporting.controller.ts
M	services/api/src/modules/super-admin/super-admin.service.ts
M	services/api/src/modules/support-cases/support-cases.controller.ts
M	services/api/src/modules/support-cases/support-cases.service.ts
M	services/api/src/modules/tenant-control-plane/tenant-erasure.service.spec.ts
M	services/api/src/modules/tenant-control-plane/tenant-erasure.service.ts
M	services/api/src/modules/tenant-settings/branding-assets.service.ts
M	services/api/src/modules/tenant-settings/tenant-settings.controller.ts
M	services/api/src/modules/tenants/public-tenants.controller.ts
M	services/api/src/modules/tenants/public-tenants.service.ts
M	services/api/src/modules/timesheets/timesheets.controller.ts
M	turbo.json
```

## Conflicts

None, at every hand-off.

- **`agent/r2-durable-storage` → `develop`.** The fourteen feature/fix/docs
  commits (`f4278f17` … `ab4e36e4`) landed by ref-push, the pattern this repo
  uses to keep a shared branch's tip equal to the CI-verified SHA. `develop`
  had not moved since the branch was cut from `f55cf4b2`, so this was a
  fast-forward, not a three-way merge — there was nothing to conflict with.
- **`develop` → `main`, PR #71.** `main` was strictly behind `develop` (its
  last commit was the settings-entitlements release, already an ancestor of
  `f26fb28e`), so the PR merge commit `6b2cd007` is additive: `git show
  6b2cd007 --stat` reports the same tree as `f26fb28e` plus merge metadata.
  GitHub performed an ordinary merge, not a squash or rebase, so every
  original commit SHA is preserved on `main`.
- **`main` → `develop` back-merge (`59c0f9fa`).** `develop` had continued one
  commit past the PR (`ab4e36e4`, the production-verification record) while
  `main` only had `f26fb28e`'s tree, so `main` was already fully contained in
  `develop`'s history except for the merge-commit metadata itself. `git show
  59c0f9fa --stat` reports **zero files changed** — confirmed by inspection,
  not assumed — so this reconciliation was mechanical, not a judgement call.

## Conflict Resolutions

None — there were no conflicts to resolve at any of the three hand-offs
above. The one non-mechanical decision was ordering, not merging: the
`20260910121838_add_object_storage_metadata` migration was applied by hand to
the production database **before** PR #71 was merged, because the live
Render service has no `preDeployCommand` and therefore cannot apply a
migration at deploy time. Applying the migration after the deploy would have
had the new code query columns that did not exist yet; applying it before the
merge, while `main` still ran the old code, is safe only because the
migration is expand-only and the old code simply ignores columns it does not
select.

## QA

| | |
|---|---|
| **QA Report** | **None filed under `docs/qa/runs/` or `docs/qa/scenarios/`.** The acceptance evidence for this P0 — production upload, instance replacement by redeploy, byte-identical download, anonymous access refused before and after, bucket privacy confirmed from two directions — lives entirely inside [`docs/engineering/REMEDIATION-storage-p0.md`](../../engineering/REMEDIATION-storage-p0.md) (`## Restart/redeploy persistence verification`), not in the QA record system `qa:new-run` / `qa:new-scenario` exist for. This is a real gap: the evidence is genuine and specific, but it is not discoverable through `npm run qa:select` the way `QA-SETTINGS-017` was for the settings-entitlements release, and no regression scenario now guards restart persistence going forward. |
| **Bug IDs** | **None created.** The ten audit findings this task closed (FILE-02/03/05/07/09/11/12/14/17/18) and the seven review-found defects (4 adversarial + 3 self-review) were fixed directly on the branch and described only in commit messages and the remediation record — never filed as `BUG-nnnn` records. AGENTS.md is explicit that "every material QA finding becomes a durable record under `docs/bugs/`"; a client-facing storage-key leak (`recruitment` candidate documents) and a stored-content-type XSS vector both meet that bar and have no record. |
| **Backlog Items** | None created. The unresolved risks the remediation record itself lists under "Remaining risk" — no malware scanning (FILE-04 still open), 14 unrecoverable legacy files needing a product/customer-communication decision, no Cloudflare token to verify bucket privacy as a standing check, no reverse (bucket→database) reconciliation — have no `ITEM-nnnn` tracking them forward. They exist only as prose in one Markdown file. |

## CI

| | |
|---|---|
| **CI Run ID** | `34509281692` (`pull_request` event, head `f26fb28e`) — `CI required gate` verdict that authorised merging PR #71. Post-merge, `34510807837` re-ran the full gate on `main` at `6b2cd007` itself, all 15 jobs green. |
| **CI Result** | **PASS**, on the third round. Two earlier rounds on this branch failed: `34499284644` (head `19caf26c`, the first push) failed `Lint (check only)`, `Framework validation`, `Runtime schema tests` and the gate itself; `34505590918` (head `c9233a2d`, after the lint fix) still failed `Framework validation` and `Runtime schema tests` because two generated files — `packages/config/platform-runtime-schema.generated.json` and the `docs/knowledge/data-model/` notes — had gone stale from the schema change and neither is checked by `validate:framework` locally. `f26fb28e` regenerated both and passed everything (`34507403949`, then `34509281692` on the PR itself). The back-merge push, `34514489561`/`34514480658` on `59c0f9fa`, also completed **success**. |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Post-Merge Validation

| Check | Result |
|---|---|
| CI `CI required gate`, all 15 jobs, on `main` at `6b2cd007` (the merge commit itself, not just the PR head) | PASS — run `34510807837` |
| CI `CI required gate` on `develop` at `59c0f9fa` (post back-merge) | PASS — run `34514489561` |
| `api` test suite (final state) | 311 suites, 6466 tests passing |
| `api` lint | 786 warnings against a cap of 789 (the CI `--max-warnings` ratchet) |
| `api` typecheck | clean |
| `web` / `admin` test suites (as of `8631a133`/`3b351032`) | web 1598 tests, admin 399 tests, all passing |
| `npm run validate:framework` | 5020 checks passing at the state described in the release PR body |
| Production restart/redeploy persistence proof | **PASSED**, 2026-09-10, on `6b2cd007` — the actual acceptance test for this P0. Document uploaded through the deployed app, row confirmed `storageProvider: r2` with a tenant-prefixed key and a checksum, object confirmed in the bucket, downloaded byte-for-byte, API instance replaced by a fresh deploy, downloaded byte-for-byte **again** from the new instance. Anonymous access refused before and after. Full detail: `docs/engineering/REMEDIATION-storage-p0.md`. |
| Migration column verification | 28 columns verified present across 14 tables, plus the `FileScanStatus` enum, read from the production database after applying `20260910121838_add_object_storage_metadata` by hand |
| `/api/health` | confirmed serving `6b2cd007` after the Render deploy reached `live` |

Tests that passed on the task branch prove the branch; the restart/redeploy
proof above is the one check in this list that specifically proves the
**integrated, deployed** result, because it could only be run after the code
was live in production.

## Release / Deployment Impact

**Deployed to production.** `ROLLBACK_CLASS: CODE_ONLY` — the schema
migration is expand-only and is designed to be left in place regardless of
which application code is running; a rollback reverts the API deployment
only, never the migration.

Sequence, and the ordering matters:

1. `20260910121838_add_object_storage_metadata` applied by hand to the
   production database, against `DIRECT_DATABASE_URL`, **before** the merge —
   the live Render service (`srv-d7js7fqqqhas739v4i7g`) has no
   `preDeployCommand`, so nothing else would ever have applied it. Verified
   present: 28 columns across 14 tables, plus `FileScanStatus`.
2. PR #71 merged into `main` at 17:51:52 UTC. `STORAGE_PROVIDER=r2` and the
   four R2 credentials were already set on the service from earlier
   provisioning — this release is the first commit that ever reads them.
3. Render auto-deployed `main`; the deploy reached `live`.
4. `/api/health` confirmed the running instance served `6b2cd007`.
5. The restart/redeploy persistence proof (above) ran against that live
   instance, then a second deploy replaced the instance and the same file
   was downloaded again, proving the fix rather than assuming it from the
   diff.
6. The test document created for step 5 was archived afterward and is no
   longer retrievable, so no fixture data was left live in production.

**What a rollback would and would not undo.** Reverting the application code
is safe and needs no schema change — the added columns are simply unread by
the previous build. What a rollback **cannot** do is make files uploaded
*after* R2 was enabled readable again, because the previous code only reads
the filesystem; any post-cutover upload becomes unreachable until the new
code is restored. The remediation record's Rollback procedure explicitly
warns against ever re-pointing `FILE_STORAGE_DIR` at a disk as a "fix" for
that, since doing so recreates FILE-01.

**Nothing was migrated for pre-existing files, by explicit decision, because
nothing could be.** The service never had a persistent disk, so bytes
written before this change were already destroyed by earlier deploys.
Fourteen rows across four models (11 `ContractDocument`, 1 `Document`, 1
`Invoice`, 1 `ReportRun`) hold a storage key with `storageProvider = NULL`,
meaning their bytes are gone. No row was altered. What to tell affected
customers — the eleven contract documents in particular — is a product
decision this task explicitly does not make.

## Knowledge Capture

**Generated artifacts only reached `develop`.** `docs/knowledge/data-model/`
(325 models · 306 enums, `EmployeeDocumentReference` reclassified from
Unattributed to Platform ops) and `docs/knowledge/dashboards/Engineering
Control Center.md` were regenerated by `f26fb28e` as a mechanical
consequence of the schema change, the same class of change CI's generator
checks require. Neither is prose knowledge; both are derived indexes staying
in sync with `schema.prisma`.

**The prose knowledge this session should have captured was written and
then never committed.** While filing this record, three pieces of
uncommitted work were found sitting in this worktree — created by
SESSION-0097's own agents, never staged, never part of any commit on this
branch, and (confirmed by `git log -- <path>`) never committed to any
branch at all:

- [`docs/knowledge/framework/security-fix-at-the-finding-not-the-pattern-2026-09-10.md`](../../knowledge/framework/security-fix-at-the-finding-not-the-pattern-2026-09-10.md)
  — the durable lesson from the independent review: three of its four
  findings were one mistake (an allowlist, a `select` projection and a scope
  predicate each fixed in one module and left exposed in another), mapped
  onto the existing "divergent duplicate guard" and "sensitive field
  overexposure" bug patterns, plus the point that a green security test
  proves nothing until it has been made to fail on purpose.
- [`docs/knowledge/framework/verification-gaps-found-shipping-r2-storage-2026-09-10.md`](../../knowledge/framework/verification-gaps-found-shipping-r2-storage-2026-09-10.md)
  — `validate:framework` is one generator check among several, not all of
  them (the proximate cause of the second CI failure), and a `if $cmd | tail`
  pipeline construct used during this session's own local verification
  silently launders a non-zero exit code through `tail`.
- An uncommitted edit to `docs/knowledge/architecture/deployment-architecture.md`
  adding a section on `render.yaml` describing intent rather than the live
  service's actual configuration — the root cause of FILE-01/INF-05 in one
  paragraph, written for the next task that touches Render config.

None of these are ready to commit as-is: the two `framework/` notes contain
wikilinks (rendered here with the double brackets removed, deliberately, so
this record does not itself create the broken links it is describing) to
four target note names that do not exist anywhere in this repository's
knowledge base — committing them unmodified would fail `knowledge:verify` as
unresolved wikilinks. They are left exactly as found, untouched, for the
reasons in Cleanup — but the
content is genuine, specific, and worth a follow-up commit rather than being
lost when this worktree is eventually removed.

**This is itself the durable lesson worth naming**, and it is not captured
anywhere yet: a session that writes knowledge-capture notes in its final
working session but closes (`STATUS: COMPLETE`, `docs/sessions/` moved to
`completed.md`) without committing them has captured nothing. The commit
that closes a session record and the commits that carry its knowledge notes
need to land together, or the second half silently evaporates the moment the
worktree is reused or removed. No note in `docs/knowledge/` yet names this
pattern generally; it is recorded here in prose rather than invented as a
wikilink to a note that does not exist.

## Obsidian Sync

**No evidence `node scripts/sync-obsidian.mjs` ran during this session** — it
is not part of the CI workflow (confirmed: no reference to it in
`.github/workflows/ci.yml`) and needs a local vault config this environment
does not carry, so it is a manual step and there is no commit or log to
verify it against. Not run as part of filing this record either, for the
same reason.

Two of this task's own outputs sit outside the sync scope by design:
`docs/engineering/REMEDIATION-storage-p0.md` and
`docs/architecture/object-storage.md` live under `docs/engineering/` and
`docs/architecture/`, neither of which `sync-obsidian.mjs`'s mapping list
(`docs/knowledge`, `docs/qa`, `docs/bugs`, `docs/backlog`,
`docs/engineering-history`) includes — the same thing the uncommitted
`verification-gaps-found-shipping-r2-storage-2026-09-10.md` note says of
itself. Once this record and the three uncommitted knowledge notes above are
committed, they *would* be in scope for a future sync.

## Cleanup

**Not done, and deliberately not attempted as part of filing this record.**
The worktree (`D:/My Work/hrm-dijipeople/dijipeople-r2-storage`) and the
local branch `agent/r2-durable-storage` both still exist, because this
record was filed from inside that worktree and removing it would have taken
the record with it. Outstanding, for whoever performs cleanup next:

- **One local commit is unpushed.** `11afbd50` (`chore(session): close
  SESSION-0097`) sits on `agent/r2-durable-storage` ahead of
  `origin/develop`. It must be pushed (or its content otherwise merged into
  `develop`) before the worktree is removed, or the session-closure edit is
  lost along with it.
- **Three pieces of genuine knowledge-capture work are uncommitted**, listed
  in full under Knowledge Capture above: two new notes under
  `docs/knowledge/framework/` and one edit to
  `docs/knowledge/architecture/deployment-architecture.md`. All three were
  recovered mid-session in this filing task after a concurrent process
  stashed them (`git stash` entry `wip-knowledge-capture-check`, popped
  without loss) — they are real, but not yet fit to commit as-is because
  their wikilinks target notes that do not exist (see Knowledge Capture).
  They must not be discarded; a future session should either finish them
  (create or retarget the missing notes) or commit them as-is and accept the
  `knowledge:verify` orphan warning explicitly.
- **This record itself** (`docs/engineering-history/tasks/2026-09-10-r2-durable-object-storage-11afbd50.md`)
  is untracked and staged/committed by nobody yet, per this task's explicit
  instruction not to commit.

**The primary checkout was not touched and was not inspected beyond what the
task briefing already stated.** `D:/My Work/hrm-dijipeople/DijiPeople` is
explicitly out of scope for this task; its dirty state (`AGENTS.md`,
`CLAUDE.md`, `apps/landing/app/partners/partner-inquiry-form.tsx` modified,
plus three untracked files) predates this filing task, is unrelated to
SESSION-0097, and was left exactly as found.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[QA-SETTINGS-017]] · [[SESSION-0097]]

<!-- GRAPH:END -->
