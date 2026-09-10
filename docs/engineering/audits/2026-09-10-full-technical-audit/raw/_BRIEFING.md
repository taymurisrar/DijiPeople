# Auditor briefing — read this before you start

You are one specialist in a parallel technical audit of **DijiPeople**, a multi-tenant
SaaS HRM platform. The orchestrator will consolidate every specialist report into one
finding register, so your job is **evidence, not prose**.

## Where you are

Repository root for this audit: `D:/My Work/hrm-dijipeople/dijipeople-audit`

**Work only inside that path.** It is a dedicated git worktree on branch
`agent/full-technical-audit`, cut from `origin/develop` at `f55cf4b2`.

- Do **not** run any `git` command that writes (no `add`, `commit`, `checkout`,
  `stash`, `worktree`, `clean`, `reset`). Read-only git (`log`, `show`, `blame`,
  `ls-files`) is fine.
- Do **not** edit, create, delete or reformat any source file. This is an audit.
  The only file you write is your own report (path given in your task).
- Do **not** run destructive commands, migrations, seeds, or anything that writes to a
  database. Do not run `npm install`, `npm run build`, or `prisma migrate`.
- Read-only shell work (`grep`, `rg`, `find`, `cat`, `sed -n`, `node -e` that only
  reads) is encouraged and is how most evidence should be gathered.
- `node_modules` is junctioned in, so `npx tsc --noEmit`-style read-only checks work,
  but they are slow — only run one if a finding genuinely depends on it.

## The system, in brief

```
apps/landing      Next.js App Router, port 3000, public marketing site
apps/web          Next.js App Router, port 3001, tenant product (employees/HR/payroll)
apps/admin        Next.js App Router, port 3002, DijiPeople's own platform admin
apps/agent-desktop  Electron attendance agent, its own auth client
services/api      NestJS 11, port 4000, global prefix /api  — the only DB writer
packages/config   @repo/config, plain JS runtime config + env validation
gateway/          .NET on-premise integration gateway
```

Scale at this commit: 68 API modules, 111 controllers, 221 services, 325 Prisma
models, 305 enums, 226 migrations, ~347 frontend pages, ~501 Next.js route handlers
under `app/api/` (thin proxies to the API), 307 colocated `*.spec.ts`, 39 e2e specs.

**Tenant isolation is enforced by convention, not by the database.** There is no
PostgreSQL row-level security and no global tenant Prisma middleware. Every service is
expected to pass `request.user.tenantId` into every Prisma `where` by hand. That makes
unscoped queries the single highest-value thing to hunt for.

Two permission systems run at once: legacy `@Permissions('x.read')` keys from
`common/constants/permissions.ts`, and the RBAC matrix
`@RequirePermission(ENTITY_KEYS.X, 'read')` from `common/constants/rbac-matrix.ts`.
`PermissionsGuard` requires *all* declared legacy keys **and** *at least one* matrix
privilege. Row-level scope (OWN/TEAM/BUSINESS_UNIT) is a separate third step done
inside services via `buildScopedAccessWhere()` in `common/security/rbac-query-scope.ts`.

## What already counts as known

`docs/bugs/` holds 323 bug records (13 `Status: OPEN`). `docs/knowledge/regressions/`
holds a regression register. **Before you write up a finding, grep `docs/bugs/` and
`docs/knowledge/` for it.** If it is already recorded, still report it, but mark it
`KNOWN` and cite the record id. A finding the project already tracks is not a
discovery, and the orchestrator needs to know which is which.

## Evidence standard — this is the part that matters

Every finding must be traceable. Cite `path/to/file.ts:LINE` and quote the two or
three lines that prove the claim. A finding whose evidence is "this pattern looks
risky" will be cut by the orchestrator.

Label every finding with exactly one confidence level:

- **CONFIRMED** — you read the code path end to end, or you executed something and saw
  the result. You can state the failing input and the wrong output.
- **LIKELY** — the code strongly implies it but one link is unverified. Say which link.
- **NOT OBSERVED** — you looked for it specifically and did not find it. Report these
  too; "we searched for X and it is absent" is a real audit result, and the final
  report must document healthy areas as well as broken ones.

Do not inflate severity. A missing index on a 40-row lookup table is LOW. Reserve
CRITICAL for: cross-tenant data access, authentication bypass, privilege escalation,
secret leakage, or data loss.

**Distinguish reachable from unreachable.** A service method with no `tenantId` filter
that is only ever called from a platform-guarded controller is not a tenant-isolation
break. Trace the caller before you rate it. Conversely, a repository method that takes
`tenantId` but has one caller passing `undefined` *is* a break. Follow the call chain.

## Finding format

Write your report as a Markdown file with one `###` block per finding:

```
### <AREA>-NN — <one-line title>

- **Category:** <e.g. Tenant Isolation | AuthZ | Performance | Schema | ...>
- **Severity:** CRITICAL | HIGH | MEDIUM | LOW | INFORMATIONAL
- **Confidence:** CONFIRMED | LIKELY | NOT OBSERVED
- **Known:** NEW | KNOWN (<record id>)
- **Component:** <app/module/file>
- **Evidence:**
  `path:line` — quoted proof. Repeat for each independent piece.
- **Current behaviour:** what the code does today.
- **Expected behaviour:** what it should do.
- **Risk:** who is harmed and how, concretely.
- **Remediation:** the specific change, naming files and functions.
- **Difficulty:** LOW | MEDIUM | HIGH
- **Regression risk:** LOW | MEDIUM | HIGH
- **Fix now:** YES | NO | LATER
```

Use the `<AREA>` prefix given in your task (e.g. `TEN-01`, `AUTH-03`).

End your report with two required sections:

```
## Healthy — verified good
- Bullet list of things you specifically checked and found correctly implemented,
  with a file citation each. This is a deliverable, not filler.

## Not examined / limits
- What you could not reach, and why. Be honest; the orchestrator needs the gaps.
```

## Your final message back to the orchestrator

The orchestrator does **not** see your report file automatically. In your final
message, give:

1. The absolute path of the report you wrote.
2. A count of findings by severity.
3. The full text of every CRITICAL and HIGH finding (the orchestrator re-verifies
   these personally and needs the evidence inline).
4. Your one-sentence verdict on the area.
5. Anything you found that belongs to another specialist's area, so it gets routed.

Keep the final message tight. Detail belongs in the report file.
