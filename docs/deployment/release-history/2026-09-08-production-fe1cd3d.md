# Deployment Report — PRODUCTION — fe1cd3d

## Metadata

| | |
|---|---|
| Environment | PRODUCTION |
| Date / time (UTC) | 2026-09-08 20:23 → 20:31 |
| Release SHA | `fe1cd3dd4866301c473d1efb8259f9c399fad6fa` |
| Source branch | `develop` (PR #67), tip `51d48f318167a0bbcfa6993ef55f82d66b12a647` |
| Previous release SHA | `6d17e931ba46aac50194cc455eeb3846a8840af8` |
| Agent / operator | Architect, on the owner's standing authorisation to release |
| Deployment target | Render `dijipeople-api`; Vercel `diji-people-web` |

Merge commit tree is byte-identical to the CI-verified commit:

```
main tree      bc8c3bcbec361dc2bb9f8b2ffd81ea0d19365691
51d48f31 tree  bc8c3bcbec361dc2bb9f8b2ffd81ea0d19365691   match
```

## Why this release exists

Two things the owner asked for in one sitting: an approvals screen that had never
worked, and a workspace that could not send email and did not say so.

The approvals inbox rendered every field blank on the record page, and its
Approve and Reject buttons were declared disabled for every caller on every row.
Separately, the demo tenant's only email provider is a `CONSOLE` sink, and every
layer of the system — the schedule, the delivery log, the message id — reported
success for messages nobody received.

## Components

| Component | Deployed? | Version / SHA | Notes |
|---|---|---|---|
| API (`services/api`) | yes | `fe1cd3dd` | live 20:30:36; **one migration, applied by hand — see below** |
| Web (`apps/web`) | yes | `fe1cd3dd` | Vercel READY, branch `main` |
| Admin (`apps/admin`) | no change | — | untouched by this release |
| Landing (`apps/landing`) | no change | — | untouched by this release |

## Database

One additive migration: `20260831140000_email_delivery_not_delivered_status`,
`ALTER TYPE "EmailDeliveryStatus" ADD VALUE 'NOT_DELIVERED'`.

**It was applied manually, and that is the most important thing in this report.**

The live Render service has **no `preDeployCommand`**. `render.yaml` declares
`preDeployCommand: npm --workspace api run release`, which is what runs
`prisma migrate deploy` — but render.yaml is not synced to the service, and the
deploy history shows a `pre_deploy_failed` on 2026-09-01 after which the command
was evidently removed. So **migrations have not been applying automatically**,
and nothing in the pipeline says so.

Left alone, this release would have shipped code that writes `NOT_DELIVERED`
against a database whose enum does not contain it. The write throws, the catch
block records `FAILED` with `sent: false`, and every schedule on a sink tenant
starts failing — auto-disabling after `MAX_CONSECUTIVE_FAILURES`. A fix for a
silent-failure bug would have caused a louder one.

Applied via `prisma migrate deploy` against `DIRECT_DATABASE_URL` (never the
pooled endpoint — that is BUG-0086's `P1002`), so the `_prisma_migrations` ledger
is consistent rather than the enum being added by raw SQL behind Prisma's back.

| | Before | After |
|---|---|---|
| migrations applied | 225 | 226 |
| `EmailDeliveryStatus` | …`DRY_RUN` | …`DRY_RUN`, `NOT_DELIVERED` |

**Follow-up, not done here:** the service needs its `preDeployCommand` restored,
or every future migration needs this manual step. That is a change to the service
configuration rather than to the code, so it is left for the owner — see
Follow-ups.

**Rollback:** forward-only schema, revertible code. Reverting the release leaves
the enum value defined and unused, which is inert. Do **not** attempt to drop it:
PostgreSQL cannot remove an enum value, and rows may already reference it.

## Pre-Deployment Gates

| Gate | Result | Evidence |
|---|---|---|
| Git | PASS | `develop` ref-pushed to each CI-verified SHA; `main` merged from it |
| CI | PASS | `CI required gate` success on `51d48f31` (run `99536381985`) |
| QA | PASS | two regressions, REG-390 and REG-391, each proven to fail without its fix |
| Reviewer | PASS | one change touches shared authorization (`PermissionsGuard`); full API suite green |
| Tests | PASS | api 304 suites / 6,378 tests; web 69 suites / 1,544 tests |
| Framework validation | PASS | all sixteen steps of the job, run locally before each push |

## Post-Deployment Verification

| Check | Result |
|---|---|
| `/api/health` commit | `fe1cd3dd` — matches `main` |
| `POST /api/approvals/:id/approve` | 401 `AUTH_TOKEN_MISSING` — route exists and is guarded |
| `POST /api/approvals/:id/reject` | 401 — same |
| `POST /api/approvals/:id/cancel` | 401 — same |
| `GET /api/reporting/schedules/delivery-capability` | 401 — same |
| Vercel `diji-people-web` | READY on `fe1cd3dd`, branch `main` |
| Production enum | `NOT_DELIVERED` present |

### The approvals screen, driven in production

Signed into the demo tenant and opened the record that prompted this work,
`ACR-000001`. Every field the previous release rendered blank is populated:
Approval, Module (`Attendance`, title-cased rather than the raw machine key),
Requester, Submitted At, Status. Record Status reads `Pending`. Below the form:
the source-record link, the approval chain with its pending step, and the history
showing "Submitted by Taimur Israr — 2026-08-30 20:08 UTC".

Approve and Reject are enabled; Edit, Withdraw and Delete are disabled.

**Then the decision path was driven end to end**, which is the assertion
QA-RUNTIME-039 says only a live run can make. Pressing Approve opened the comment
dialog and posted to the new endpoint; the API resolved the attendance delegate
and called the attendance module's own method, which refused:

```
ACCESS_DENIED — You cannot approve or reject your own attendance correction request.
client_1788899957479_kyd1z35tgn   2026-09-08T20:39:17.479Z
```

That refusal is the result worth having. It proves the request reached the owning
module rather than moving the generic mirror row — an implementation that wrote
the approval row directly would have **succeeded** here and left the correction
request Pending while the inbox said Approved. It also proves the module's own
object-level rules survive delegation: `assertCanActionCorrection` checks the
self condition before the elevated-role bypass, and it still fires.

The record was left `Pending`. No production data was modified by this
verification.

## Findings raised by this release

- **ITEM-0121** (LOW, deferred) — the capability signal that drives the command
  bar models permissions, assignment and status, but not each module's
  object-level rules. So Approve was *enabled* for an action the module refuses.
  The server is authoritative and refused correctly, so this is a UX gap, not a
  security one; it is strictly better than the disabled-for-everyone buttons it
  replaced.

## Follow-ups

1. **Restore `preDeployCommand` on the Render service**, or accept that every
   migration is applied by hand. This is service configuration, not code, and it
   is the owner's call — the previous attempt failed on 2026-09-01, most likely
   the pooled-endpoint `P1002` that `DIRECT_DATABASE_URL` exists to avoid.
2. **ITEM-0120** — `schema.prisma` and the migrations disagree about several
   Timesheet constraint names and seven unique constraints. Pre-existing,
   unrelated to this release, and it is why this migration had to be produced
   with `migrate diff` rather than `migrate dev`.
3. **QA-REPORTING-011 steps 1, 2 and 5** remain manually unverified in
   production: the sink notice renders only for a caller holding `reports.write`
   on a sink tenant, and the negative case needs a delivering tenant.

## Records

`BUG-2718`, `BUG-2741`, `REG-390`, `REG-391`, `QA-RUNTIME-039`,
`QA-REPORTING-011`, `ITEM-0120`, `ITEM-0121`, `SESSION-0089`, `SESSION-0090`.
