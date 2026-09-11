# Deployment Report — PRODUCTION — 5a1afa64

## Metadata

| | |
|---|---|
| Environment | PRODUCTION |
| Date / time (UTC) | 2026-09-11 08:48 → 08:57 |
| Release SHA | `5a1afa64dfc8566abb31aacb27e817bae1151276` |
| Source branch | `develop` (PR #76), tip `e8dc87a7c8f958bcdede64c55373624f2c4e9c2b` |
| Previous release SHA | `6b2cd007abba5f2ae763685d60b559b540a46e1b` |
| Agent / operator | Architect, on the owner's standing authorisation and their explicit instruction to merge to main |
| Deployment target | Render `dijipeople-api` (`srv-d7js7fqqqhas739v4i7g`) |

Merge commit tree is byte-identical to the CI-verified commit:

```
main tree      c5a92b82970c33e8499b11197fad82b1be4a27ba
e8dc87a7 tree  c5a92b82970c33e8499b11197fad82b1be4a27ba   match
```

So the thing deployed is the thing the gate passed, not a merge commit nobody
validated.

## Why this release exists

SESSION-0098 was asked to close every open session, bug and backlog item. This
promotes that work. It is unusual for a release in that almost none of it is new
capability — it is a backlog reaching a defensible state, plus the fixes that
closing it produced.

## Components

| Component | Deployed? | Version / SHA | Notes |
|---|---|---|---|
| API (`services/api`) | yes | `5a1afa64` | live 08:57; **no migrations in this release** |
| Web (`apps/web`) | yes | `5a1afa64` | Vercel follows `main` |
| Admin (`apps/admin`) | yes | `5a1afa64` | |
| Landing | no change | — | — |
| Gateway (.NET) | no binary change | — | but now built and tested in CI for the first time |

## The risk profile, stated plainly

**No migrations and no schema change.** `git diff origin/main..origin/develop`
over `services/api/prisma/` and `schema.prisma` was empty before the merge. That
is the single largest reason this release was safe to move quickly on: this
platform applies migrations by hand, so a release with none has no
expand/backfill/contract exposure and no hand-applied step that can be forgotten.

## What shipped

### Seven sessions closed

Six sat `ACTIVE` in the runtime registry with stale heartbeats; four of their
records already said `COMPLETE` and only the registry entry was left behind.
SESSION-0061 was blocked since 2026-08-26 on a GitHub Actions outage for a verdict
it never received. SESSION-0096 had committed the full technical health audit —
twenty thousand lines across eighteen specialist reports — to a local branch that
was never pushed.

### Twelve open bugs and twenty-one backlog items

Each with a regression register entry and a reusable QA scenario. The ones most
likely to be noticed: an attendance entry that could never be closed once it
reached a particular state, four separate Users screens collapsed into one, twelve
authenticated route trees that middleware was not protecting, and Reports and
Analytics offering surfaces the tenant's plan does not include.

### Six defects found by the sweep itself

- **BUG-3152** — `POST /users/:userId/roles` let a delegated role administrator
  grant themselves `GLOBAL_ADMIN`. Its sibling route enforced the rule; this one
  never learned it.
- **BUG-3241** — two more one-sided pairs, including an employee export that
  skipped the row-scope its sibling read applies. A BOLA: it handed over in bulk
  what the caller could not fetch one at a time.
- **BUG-3115** — the rate limiter trusted a client-supplied `X-Forwarded-For`.
- **BUG-3254** — recorded because the fix for it was wrong. See below.
- **BUG-3263** — a pre-existing one-millisecond test flake in a required job.
- **BUG-3110** — the credential leak, which is **not** fixed by this release.

### The .NET Integration Gateway joins CI

It is the only DijiPeople software installed as a binary on a customer's own
network, talking to their hardware, and it had no automated coverage of any kind.
104 tests now run on every push, in the required gate, with no `continue-on-error`.

### The audit becomes a backlog

116 findings are durable records with file-and-line citations, all triaged: 31
`FIX_NOW`, 14 `PLAN_REQUIRED`, 5 `PRODUCT_DECISION`, 61 `DEFER`, 5 `DUPLICATE`.
Five were already fixed — four of them during this session — which the audit could
not have known, having been taken at `890cd96`.

## What was deliberately held back

**PII-at-rest encryption (BUG-3154, CRITICAL).** Bank accounts, IBANs, national
ids and tax identifiers are stored in plaintext beside an AES-256-GCM service the
codebase already uses for SMTP passwords. The expand phase and `EXECPLAN-0032`
exist on `agent/cs-s10-pii` and are not merged. Sequencing is what blocks it: the
backfill rewrites every one of those columns, and this database has no backup
beyond an untested six-hour restore window ([[ITEM-0131]]). It should be run
attended, after a dump.

**The leaked production credential (BUG-3110, CRITICAL).** A real Neon password
sat in a tracked file in a public repository for seven weeks and remains readable
in history. Secret scanning, push protection and Dependabot security updates are
now enabled, so the next such push is refused — but that reduces recurrence, not
exposure. Rotation and the Render environment update are the owner's.

## Post-deploy verification

Verified rather than assumed, because a merge to `main` has previously sat
undeployed for 48 minutes with no error anywhere.

```
/api/health  commitShort 5a1afa6   (was 6b2cd00 for seven consecutive polls)
```

The health endpoint is a static `ok` payload that cannot see a dead database —
that is BUG-3198, triaged `FIX_NOW` in this very release — so a real
database-backed public read was exercised as well: `GET /api/public/plans`
returned live plan rows.

Render reported the deploy as `trigger=new_commit` at 08:48:15, fifteen seconds
after the merge, so automatic deployment from `main` is working.

## Rollback

Class: **trivial**. No migrations, no schema change, no data transformation.
Reverting is redeploying `6b2cd007`, which Render still holds as a previous
deploy. Nothing in this release writes a format the previous version cannot read.

## Known outstanding after this release

The five `PRODUCT_DECISION` records are the ones that need the owner rather than
scheduling: no staging environment, no per-tenant restore, seven boot-required
environment variables that exist only in the Render dashboard, no MFA anywhere
including platform super admins, and a tenant setting that advertises malware
scanning the product does not have.
