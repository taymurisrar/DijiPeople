# TASK-0032 — rules every work-package agent follows

These rules bind every WP agent in TASK-0032 (EXECPLAN-0051). They exist so five
agents working at once cannot corrupt each other's work, the user's checkout, a
shared database or production.

## Workspace

- Work **only** in your own worktree (`D:/My Work/hrm-dijipeople/dp-pah-wpNN`) on
  your own branch (`agent/pah-wpNN-*`). Use absolute paths.
- `node_modules` in your worktree are **junctions** to
  `D:/My Work/hrm-dijipeople/dp-partner-admin`. Never delete, reinstall or
  `rm -rf` them, never run `npm install`/`npm ci`, never run
  `git worktree remove`. Do not change `package.json` or `package-lock.json`.
- Do not run `next dev` or `next build` (Turbopack refuses the junction). Browser
  validation is done centrally in WP-09.
- Commit to **your branch only**, in logical commits, message ending with
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Write
  the message to a file and use `git commit -F` (heredocs mangle Markdown).
  **Never push. Never touch `main` or `develop`. Never rebase or reset.**

## Single-writer files

- `services/api/prisma/schema.prisma` and `prisma/migrations/` are done (WP-01,
  commit `10d5d148`). Do not edit them. If you need a schema change, stop and
  report it in your report as `SCHEMA_NEEDED`.
- `common/constants/permissions.ts`, `common/constants/rbac-matrix.ts`,
  `modules/platform-auth/platform-permissions.ts` and `common/guards/*` belong to
  **WP-02 only**. Others use existing permission keys; if a new key is needed,
  report it as `PERMISSION_NEEDED` rather than editing.

## Databases and production

- **Production is forbidden.** Never call a production URL, never read a
  production database, never use Render/Vercel/Neon CLIs.
- Unit tests need no database (set `DATABASE_URL=postgresql://u:p@localhost:5432/x`
  if a spec throws at import).
- If you need a real database (e2e specs), create your own:
  `dijipeople_pah_<wpNN>_test`, using host/role/password from
  `services/api/.env`, assert it with `node scripts/assert-test-database.mjs`,
  then `npx prisma migrate deploy --config prisma.config.ts` from `services/api`.
  Never point anything at `dijipeople`, `dijipeople_pah_test` or any database you
  did not create. Drop yours when you finish.

## Engineering rules (from AGENTS.md — re-read it)

- Tenant isolation: `tenantId` from `request.user` only; `findFirst({ id, tenantId })`
  not bare `findUnique` on tenant-owned models.
- Tenant endpoints carry both `@Permissions(...)` and `@RequirePermission(...)`.
  Platform endpoints authorize by platform permission (ADR-0018).
- Every state-changing operation calls `AuditService.log()` with before/after
  snapshots — never secrets, tokens, TOTP seeds, recovery codes or signature
  images in a snapshot.
- Errors: `AppError` with an error-catalog code, or a Nest exception carrying
  `{ code, message }`; messages an operator can act on. No generic "Something
  went wrong" when a reason exists.
- DTOs with class-validator; never spread a DTO into Prisma.
- Reuse existing components (`ProDataTable`, runtime pages, `StatusPill`, …).
- **No explanatory helper text or descriptions added to UI controls** — the owner
  has asked for this never to be added without asking. Labels, values, statuses
  and error messages only.
- Comments explain *why*; match the house style of substantial comments where
  behaviour is non-obvious.

## Validation you run

From your worktree root:

```
npm --workspace api run check-types
npm --workspace api run test -- <your spec paths or patterns>
cd services/api && npx eslint --fix <every api file you changed>
npm --workspace admin run check-types      (if you touched apps/admin)
npm --workspace admin run test             (if you touched apps/admin)
npm --workspace web run check-types        (if you touched apps/web)
npm --workspace landing run check-types    (if you touched apps/landing; see its package.json)
```

Run the **full** `npm --workspace api run test` once before your final commit and
report pass/fail counts; identify any failure as pre-existing (fails on
`10d5d148` too) or yours.

## Records

Do **not** edit files under `docs/bugs/`, `docs/backlog/`, generated indexes,
`docs/qa/regressions/index.md`, or run `rebuild-backlog`/`remediation:sync`/
`qa:rebuild` — the Architect does that at integration.

Instead, in the **same commit as each fix**:

- append a regression entry for it to `docs/qa/regressions/_incoming/<wpNN>.md`,
  using an id from your reserved REG range, in the same shape as the entries in
  `docs/qa/regressions/index.md` (read two of them);
- append a closure note to your report (below) naming the record id, the
  commit, the spec that proves it, and whether the spec fails without the fix.

## Report

Write `docs/tasks/TASK-0032-streams/WP-NN-report.md` (commit it with your work):

```
IMPLEMENTED              what was built
CHANGED_BEHAVIOR         what now behaves differently, including for existing callers
RISK_AREAS               where this is most likely to be wrong
KNOWN_MISTAKES_AVOIDED   retrieved defects you deliberately did not repeat
TESTS_ADDED              new specs and what each proves
TEST_HOOKS               ids, routes, fixtures, seeds WP-09 can use for browser QA
RECORD_CLOSURES          per record: id, commit, spec, fails-without-fix yes/no
VALIDATION               every command run and its result
UNRESOLVED               what was left, and why (SCHEMA_NEEDED / PERMISSION_NEEDED / other)
```

Your final message: the report path, the final commit SHA, and a 10-line summary.
