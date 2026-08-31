# Deployment Report — PRODUCTION — dae0e37

## Metadata

| | |
|---|---|
| Environment | PRODUCTION |
| Date / time (UTC) | 2026-08-31 04:10 → 04:17 |
| Release SHA | `dae0e370cad316ef9e4e4ac7cd9c9791bcffec53` |
| Source branch | `develop` (PR #65), tip `d833e69490ac6d36c22c4d84d33f3646690f2206` |
| Previous release SHA | `cace6cdb0f207dcd73f0e4085d9e9172bb8c141d` |
| Agent / operator | Architect, on the owner's standing authorisation to release |
| Deployment target | Render `dijipeople-api`; Vercel `diji-people-web` |

Merge commit tree is byte-identical to the CI-verified commit:

```
main tree     8bdfd43e97ba4b3dac505dfbf3ad928ed2a33e61
d833e694 tree 8bdfd43e97ba4b3dac505dfbf3ad928ed2a33e61
```

## Why this release exists

The previous release deployed correctly. Opening the deployed application and
measuring it found three presentation defects that no local gate could have
caught, and this release repairs them. It also reconciles `main` back into
`develop`.

## Components

| Component | Deployed? | Version / SHA | Notes |
|---|---|---|---|
| API (`services/api`) | yes | `dae0e370` | 7m21s; pre-deploy applied no new migrations |
| Web (`apps/web`) | yes | `dae0e370` | both frontend fixes live here |

## Pre-Deployment Gates

| Gate | Result | Evidence |
|---|---|---|
| Git | PASS | `develop` tip equal to the CI-verified SHA by ref-push |
| QA | PASS | three regressions, each proven to fail without its fix |
| Reviewer | PASS | API diff is caveat strings and tests only — no auth, tenant, permission or query surface touched |
| Database | NOT_REQUIRED | no migration in this release |
| Configuration | PASS | the four `REPORTS_*` variables verified present on the service |
| Build | PASS | 14/14 CI jobs green on `d833e694` across three runs |
| Smoke plan | PASS | written before deploy as the three defects' acceptance criteria |

**Readiness level reached:** READY_FOR_PRODUCTION

## Database Changes

None. `ROLLBACK_CLASS = CODE_ONLY`.

## Deployment Sequence

```
CI VERIFIED (d833e694, 3 green runs) → MERGED (#65, tree-identical)
  → BUILDING 04:11 → PRE_DEPLOY 04:14 → DEPLOYING 04:17 → LIVE 04:17:50
  → VERIFYING → VERIFIED
```

## Deployment Results

Clean. `/api/health` moved from `cace6cdb` to `dae0e370`; Vercel production
ready in 1m.

## Smoke Tests

Every one of these is the acceptance criterion of a defect this release fixes,
measured against production rather than asserted.

| ID | Scenario | Result | Evidence |
|---|---|---|---|
| R1 | Deployed commit is the released commit | PASS | `/api/health` → `dae0e370…` |
| R2 | No React #418 on a report runner page | PASS | console: 0 errors, 0 warnings |
| R3 | Server HTML renders the tenant's date format | PASS | 12 slash-format dates, **0** fallback `Mar 10, 2025` dates |
| R4 | No horizontal overflow anywhere in the workspace | PASS | 6 pages × 4 widths (1024/1280/1440/1920) → **0** overflowing |
| R5 | The caveat panel lists each note once | PASS | Desktop 13/13 unique (was 20 with 5 doubled), Attendance 13/13, Leave 12/12, Recruitment 6/6 |
| R6 | The workforce snapshot worker runs | PASS | 12 rows for 08/30/2026, one per employee, `OBSERVED` |
| R7 | Exports build and download | PASS | XLSX, 12 rows, 22,118 bytes, `PK\x03\x04`, 7-day expiry |
| R8 | The reporting API refuses an unauthenticated caller | PASS | 401 `AUTH_TOKEN_MISSING`, standard contract, no tenant leak |
| R9 | Desktop Activity withholds below the population threshold | PASS | all four metrics "Withheld", neutral labels only |
| R10 | The custom report builder offers only allow-listed columns | PASS | 25 fields; no identity, bank or compensation field offered |
| R11 | Visible controls actually work (§65) | PASS | favourite toggled on and off, `aria-pressed` correct, list updated; export built and downloaded |
| R12 | All 13 reporting routes render | PASS | 200 with the right `<h1>` on each |

### The worker finding worth recording

R6 failed on the previous release and passes here, and the reason is a Render
behaviour worth writing down: **a deploy captures its environment when the
deploy is created, not when the container starts.** The first release's deploy
was created at 02:37 and the four `REPORTS_*` variables were set at 02:39, so
that container never received them — the workers were inert and said so only at
`LOG` level, which production suppresses. This release's deploy was created
after, and the snapshot worker wrote its first rows.

Verified inside a bounded window by temporarily setting the poll interval to its
5-minute minimum, confirming rows appeared, then restoring the stored value to
hourly.

That restore did **not** trigger a redeploy, so the running process keeps the
5-minute interval until the next deploy picks the hourly value up. Harmless —
the worker skips a day whose row already exists — but stated here because
"restored to hourly" describes the configuration, not the process currently
serving traffic, and those are two different things on this platform.

## Performance

Eight distinct reporting pages, requested sequentially — deliberately not
concurrently, because identical concurrent fetches produce a ladder that is the
client, not the server.

| | |
|---|---|
| All responses | 200 |
| Median | 1,238 ms |
| Slowest | 2,344 ms (the first request, cold) |

This is full server-rendered page plus API round trip, measured from a client
geographically distant from the API, on a tenant with 12 employees. It is a
smoke-level figure and **not** a scale test; the QA run's limitation about the
240-employee fixture stands.

## QA Report

[`2026-08-31-reports-analytics-platform-96ff155`](../../qa/runs/2026-08-31-reports-analytics-platform-96ff155.md) — PASS WITH RISKS, for the feature.
Post-deploy validation for both releases is recorded in these two deployment reports.

## Reviewer Status

No CRITICAL or HIGH accepted.

## Backlog and Bug References

| ID | Title | Effect of this release |
|---|---|---|
| [[BUG-2647]] | Reporting formatters omit the tenant context | **Fixed and verified in production** (R2, R3) |
| [[BUG-2648]] | Reports pages scroll sideways at 1440 | **Fixed and verified in production** (R4) |
| [[BUG-2657]] | The caveat panel says the same thing twice | **Fixed and verified in production** (R5) |
| [[BUG-2623]] | `buildScopedAccessWhere` emits `ownerTeamId` on `Employee` | Still open. Contained within reporting; the shared helper is unchanged |
| [[BUG-2626]] | Dashboard numbers use the visitor's browser locale | Still open. Same family as BUG-2647, outside this task's surface |
| [[BUG-2662]] | An expired refresh token puts the tenant app into a redirect loop | **Found during this validation, deferred.** Pre-existing, reproduced on the commit *before* the first release, and not reporting-specific |

Three open records ship alongside, each a decision rather than an oversight.
BUG-2662 in particular was deferred rather than fixed because folding an
unreproduced auth-middleware change into a reporting release would put an
unrelated risk into a deployment whose validation was scoped to reporting.

## Engineering History

[`2026-08-31-reports-analytics-platform-d833e694`](../../engineering-history/tasks/2026-08-31-reports-analytics-platform-d833e694.md)

## Verdict

**RELEASED AND VERIFIED.**

All three defects the previous deployment introduced are fixed and each was
re-measured in production rather than assumed. The workforce snapshot worker is
confirmed running. The feature is live for all tenants.
