# Engineering History — Platform Admin and landing UX program

| | |
|---|---|
| **Task Title** | Platform Admin and landing UX program: payment diagnosis, workspace routing, notifications, preferences, field types, wizard |
| **Task Type** | FEATURE + BUGFIX, ten reported items across three apps and six API modules |
| **Parent Task** | [[TASK-0013]] |
| **Date** | 2026-08-21 |
| **Architect Plan** | NOT_APPLICABLE for the code; the two schema changes are three nullable columns with no backfill, which `PLANS.md` explicitly excludes from "migrations with meaningful impact". The two findings that **would** need an ExecPlan — partner attribution at checkout, and governed publish/archive — were recorded in earlier sessions and are untouched here |
| **Agents Used** | Architect, Backend/API, Frontend, UI/UX, Database, QA, Product & Backlog Steward, Reviewer, Integrator, Knowledge & Graph. **Deliberately not used:** Security — no guard, permission key or tenant-scoped query changed; the one authorization decision made (the landing-route allow-list) is an `@IsIn` on a DTO, with the reason free text there would be an open redirect stated on the record. Release/DevOps — nothing reaches an environment |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/admin-landing-ux-program` |
| **Base SHA** | `aab6965c7ab22c67309a9e1e66523ec8d5aaeb3e` |
| **Final Task SHA** | `3b77e1b85cec5565db41e6f5a9b2f334fab411dc` |
| **Target Branch** | `develop` |
| **Merge Commit** | None. Integrated by ref-push, so `develop` took the exact CI-verified SHA |
| **Final Target SHA** | `3b77e1b85cec5565db41e6f5a9b2f334fab411dc` |

### Commits

```
a339e75 feat(platform): workspace URLs that resolve, a payment you can explain, and row actions that fit
b30e152 feat(admin): a notification feed that means something, and preferences that persist and apply
b8d5d88 feat(landing,admin): field controls that match the data, and a wizard that says where you are
3b77e1b fix(ci): the proxy guard, a redundant enum union, and my own formatting
```

The first two were **rewritten before pushing**. They cited BUG-0284–0287, which
is what the ids would have been; the allocator issued BUG-0312–0315. A commit
message pointing at a record that does not exist is exactly the stale reference
this repository files bugs about, and the commits were unpushed, so they were
rebuilt from the same file sets with the real ids.

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople             aab6965 [develop]  <- user's primary, CLEAN
D:/My Work/hrm-dijipeople/dijipeople-ux-program  3b77e1b [agent/admin-landing-ux-program]
```

### Files Changed

62 file(s) against `origin/develop`.

```
.agent/agents/ui-ux.md
.env.development.example
apps/admin/     row-actions, payment-recheck-panel, notifications feed + bell,
                console-preferences applier + lib, tenant-url + spec,
                tenant-access-panel, admin-topbar, globals.css, layout,
                notifications page, three API proxies, platform-module-registry
apps/landing/   onboarding-steps, subscribe-form, use-country-options,
                geography proxy
packages/config/  platform-domains.js + test
scripts/        generate-platform-runtime-schema.mjs (semantic controls, --check)
services/api/   payment-diagnosis + spec, payment-recheck.service,
                platform-notifications + spec, platform-events service +
                controller, platform-users service + preferences DTO,
                public-geography.controller, lookups.module, super-admin
                controller, billing.module, main.ts, schema.prisma,
                two migrations
docs/           BUG-0312..0317, REG-179..181, QA-TENANT-007,
                QA-PLATFORM-007/008, SESSION-0033, TASK-0013, indexes
```

## Ten reported items, and what each turned out to be

Three of the ten were one root cause. That is the finding worth keeping.

### Workspace routing — items 2, 4 and 5 were the same problem

`xoul-ltd.localhost:3001/login` not working, the missing primary workspace
hostname, and "what does Open Tenant do" were one cause with two independent
bugs stacked on it.

The cause: no `TENANT_BASE_DOMAIN`, so `buildWorkspaceHostname` returned "" and
`createSystemDomain` threw `TENANT_BASE_DOMAIN_NOT_CONFIGURED` — while
provisioning completed anyway. The tenant was created, activated and handed over
with no workspace address and nothing saying why. The API now states the
workspace hostname pattern at boot, or warns that it cannot issue one.

First bug on top: `buildWorkspaceUrl` emitted no port. `xoul-ltd.localhost`
resolves — browsers loopback any `.localhost` label — so configuring a base
domain locally takes the hostname branch and produced port 80. Every generated
workspace link in development was dead, and it presented as DNS.

Second: `apps/admin/lib/tenant-url.ts` was a second copy of a rule
`platform-domains.js` explicitly says may exist only once, keyed on a variable
under a different name, so admin and the API produced different URLs for the
same workspace. Deleted; admin delegates.

Open Tenant opens `buildTenantLoginUrl(slug)` — which is why it reported success
and then failed. The button worked; the URL did not.

### Payment — item 1

`Re-check payment with Stripe` on the customer record, delegating to the same
`confirmPayment` the webhook calls, so the outbox event and provisioning run
exactly as they would have. A manual "mark as paid" was rejected on
[[ITEM-0076]] and again in the service comment, for the reason that decides it:
it would set the column without emitting `PAYMENT_CONFIRMED`, so the operator
would close the ticket and the customer would still have no workspace.

The half actually asked for is the diagnosis. Thirteen assertions cover the
distinctions where the *customer's next action* differs, and the two that matter
most are negative: an unreachable Stripe never reports as "the customer has not
paid", and no customer-facing message ever contains a provider id or a decline
code.

### The rest

- **Row actions** — five labelled buttons in a 260px column, wrapping three deep
  and forcing horizontal scroll, so the actions were wider than the data. One
  inline, the rest in a menu. `lib/z-layers.spec.ts` rejected the first attempt
  at z-30.
- **Notifications** — a placeholder page under a hardcoded, permanently lit red
  dot. Now a `PlatformEvent` projection narrowed to what needs somebody, and a
  count that *can* be wrong, which is what makes it worth trusting.
- **Preferences** — `localStorage`, written and never read. Now three nullable
  columns on `PlatformUser`, applied from the authenticated layout.
- **Field types** — country free text in four admin modules and on the wizard,
  while the API held a 250-row ISO table and each app carried its own hardcoded
  list. Fixed in the *generator*, correcting 39 controls in one change, plus one
  public geography projection both apps read.
- **The wizard** — five identical pills, and three address fields labelled only
  by placeholder, which passes an automated accessibility check and leaves every
  sighted user with a label that vanishes on the first keystroke.
- **The agents** — `.agent/agents/ui-ux.md` gains a control audit whose every
  check names the defect in this repository it came from.

## Conflicts

None.

## Conflict Resolutions

Not applicable.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record; the evidence is the three scenarios and the suites below |
| **Bug IDs** | BUG-0312 … BUG-0317, all FIXED |
| **Backlog Items** | None created. [[ITEM-0076]] is implemented by the re-check action; [[ITEM-0075]] remains deferred |
| **QA Scenarios** | QA-TENANT-007, QA-PLATFORM-007, QA-PLATFORM-008 |
| **Regressions** | REG-179, REG-180, REG-181 |

Mutation results: reverting the port branch fails exactly one domain test and
two admin ones; reverting the control inference reports 39 changed fields and
exits 1. REG-180's assertions are mostly about **exclusion**, because a feed
built from "recent events" passes every test about what it includes and fails
the only thing the feature is for.

**REG-179 has a stated gap.** The boot-time warning is a log line and nothing
asserts it. That is recorded rather than counted as coverage.

### Known limitation

**Nothing was opened in a browser.** This is the third session in a row to say
so, and this one is a UI/UX program, so it belongs in the body rather than a
footnote: the notification feed, the row-action menu, the preferences applying,
the wizard's progress row and the country select are all proven by unit
assertions over the decisions behind them, not by observation. The Playwright
suite needs a migrated and seeded database plus three running services — the
database is now migrated and the environment configured, so what remains is
standing the services up.

## CI

| | |
|---|---|
| **CI Run ID** | [32514372744](https://github.com/taymurisrar/DijiPeople/actions/runs/32514372744) — `CI required gate` at `3b77e1b` |
| **CI Result** | PASS |

The first attempt at `b8d5d88` **failed**, and why is worth recording rather
than only that it was fixed. `check-proxy-forwards-client-ip` rejected the new
geography proxy: the headers were forwarded, but by assignment where all
twenty-five other route handlers spread them, and the guard matches the idiom.
Matching it is right regardless of the guard. Alongside it, prettier errors in
files I had not linted — because I linted the module I had been working in
rather than the paths in the diff.

## Local Validation

```
npm --workspace admin test               16 suites, 135 tests
npm --workspace landing test              7 suites, 112 tests
npm --workspace api test (5 modules)     13 suites, 100 tests
npx tsc --noEmit (api, admin, landing)    0 errors
npm run check:runtime-schema              matches schema.prisma
npm run test:runtime-schema               3 tests
npm run test:platform-domains            16 tests
node scripts/check-proxy-forwards-client-ip.mjs   25 handlers forward
npm run db:preflight                      PASS, 219 migrations applied
npm run validate:framework                3,165 checks
```

## Post-Merge Validation

Re-run in the task worktree, whose tip is identical to `develop`:

```
node scripts/validate-framework.mjs   3,165 checks, 0 failures
node scripts/db-preflight.mjs         DATABASE_AGENT_STATUS PASS
```

## Release / Deployment Impact

Two additive migrations, applied on deploy by `npm run release:api`. No
environment variable is newly *required* — `TENANT_BASE_DOMAIN` was already read
and already defaulted in production; what changed is that its absence is now
announced. Rollback class: revert the commit range; the columns are nullable and
nothing that would miss them reads them.

`DEPLOYMENT_REQUIRED = no`.

## Knowledge Capture

- BUG-0312/0313, REG-179 — a rule documented as single-copy that was copied
  anyway, and a development case the original never had to express.
- BUG-0314/0315, REG-180 — an indicator that cannot be wrong is an indicator
  nobody checks; a preference stored and never read is not a preference.
- BUG-0316/0317, REG-181 — one Prisma string type became fifteen kinds of field,
  and the fix belonged in the generator rather than in four field lists.
- `.agent/agents/ui-ux.md` — the control audit, so the next review asks these
  questions without being asked to.

## Obsidian Sync

`sync-obsidian.mjs` wrote 40 notes and left 509 current; `--verify` read the
vault back — the files, not the exit code:

```
OBSIDIAN_SYNC_STATUS          PASS
OBSIDIAN_REPO_TO_VAULT_DIFFS  0     OBSIDIAN_VAULT_TO_REPO_DIFFS  0
OBSIDIAN_SEMANTIC_LINK_ERRORS 0     OBSIDIAN_UNRESOLVED_LINKS     0
OBSIDIAN_GRAPH_ORPHANS        0     OBSIDIAN_STALE_NODES          0
```

## Cleanup

The user's primary checkout was CLEAN at session start and is CLEAN at the end.
Their `.env` files were edited with explicit agreement — three keys added to
each of api, web and admin, nothing existing changed — and those files are
gitignored, so they do not appear in the diff.

A trap worth recording: junctioning `node_modules` into a worktree makes
`@repo/*` resolve back to the **primary** checkout, so an admin test importing
`@repo/config` silently exercised unmodified code and passed against a fix that
was not there. A real `npm ci` in the worktree is the only correct answer when a
shared package is in the diff.

<!-- GRAPH:BEGIN — generated by scripts/generate-record-graph.mjs -->

## Related

Records this task created, closed or depended on, cited in its own body:

[[BUG-0312]] · [[BUG-0314]] · [[BUG-0316]] · [[BUG-0317]] · [[ITEM-0075]] · [[ITEM-0076]] · [[QA-PLATFORM-007]] · [[QA-PLATFORM-008]] · [[QA-TENANT-007]] · [[SESSION-0033]] · [[TASK-0013]]

<!-- GRAPH:END -->
