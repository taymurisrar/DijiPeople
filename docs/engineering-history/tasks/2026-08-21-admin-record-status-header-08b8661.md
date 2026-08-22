# Engineering History — Platform Admin record header status group and default command bar

| | |
|---|---|
| **Task Title** | Platform Admin record header status group and default command bar |
| **Task Type** | FEATURE + UI/UX, with three BUGFIXes found on the way |
| **Date** | 2026-08-21 |
| **Architect Plan** | NOT_APPLICABLE — `PLANS.md` requires an ExecPlan for schema, migration, auth/permission, payroll and attendance changes. This touches none: no Prisma model changed, no migration, no permission key, and the one API edit adds a DTO to a validation switch |
| **Agents Used** | Architect, Frontend, UI/UX, Backend/API, QA, Product & Backlog Steward, Reviewer, Integrator, Knowledge & Graph. **Deliberately not used:** Database (no schema write — see the ExecPlan note, and BUG-0223 exists precisely because the alternative was a column change), Security (no permission key, guard or tenant-scoped query changed; the client-side permission helper this task extracted is a usability affordance the API re-checks), Integration, Release/DevOps (nothing reaches an environment) |

## Git

| | |
|---|---|
| **Base Branch** | `origin/develop` |
| **Task Branch** | `agent/admin-record-status-header` |
| **Base SHA** | `08b8661a17e4b7cf99789bab7474f89e3efe60b9` |
| **Final Task SHA** | `acb14a2bb4649a68da8f2cb52e1bbd6e8ee8df48` |
| **Target Branch** | `develop` |
| **Merge Commit** | None. Integrated by ref-push — `git push origin agent/admin-record-status-header:develop` — so `develop` took the exact CI-verified SHA. A merge commit would be a commit CI never saw |
| **Final Target SHA** | `acb14a2bb4649a68da8f2cb52e1bbd6e8ee8df48` — identical to the task SHA, which is the point of integrating that way |

### Commits

```
b59bd81 feat(admin): a default record command bar, a D365 status group, and a plans page that saves
acb14a2 docs(records): four bug records, three regressions and the context they change
```

Two commits, split so the diff a reviewer needs to read is not buried in
generated indexes. The code commit carries the specs that pin it; the records
commit carries the bug records, QA scenarios, regression entries, remediation
inventory and every generated index in one place, because a record edit without
its rebuild output fails CI framework validation.

### Worktrees

```
D:/My Work/hrm-dijipeople/DijiPeople                            08b8661 [develop]   ← user's primary, CLEAN
D:/My Work/hrm-dijipeople/dijipeople-record-header              acb14a2 [agent/admin-record-status-header]
```

Eleven other worktrees were attached and untouched. `session.mjs check --paths
apps/admin` classified the work `SAFE_PARALLEL` against six active sessions
before any file was read.

### Files Changed

52 file(s) against `origin/develop`.

```
M	.agent/context/runtime-module-system.md
M	apps/admin/AGENTS.md
M	apps/admin/app/(internal)/invoices/[invoiceId]/page.tsx
M	apps/admin/app/(internal)/partner-inquiries/[inquiryId]/page.tsx
M	apps/admin/app/(internal)/partner-onboarding/[applicationId]/page.tsx
M	apps/admin/app/_components/documents/contract-template-editor.tsx
M	apps/admin/app/_components/documents/signature-request-detail.tsx
M	apps/admin/app/_components/partners/partner-inquiry-review.tsx
M	apps/admin/app/_components/partners/partner-onboarding-review.tsx
A	apps/admin/app/_components/plans/plan-commercial-summary.tsx
A	apps/admin/app/_components/plans/plan-entitlements-panel.tsx
M	apps/admin/app/_components/runtime/module-action-bar.tsx
A	apps/admin/app/_components/runtime/record-command-bar.tsx
A	apps/admin/app/_components/runtime/record-status-group.tsx
M	apps/admin/app/_components/runtime/runtime-form.tsx
M	apps/admin/app/_components/runtime/runtime-record-page.tsx
M	apps/admin/app/_components/tenants/tenant-record-header.tsx
A	apps/admin/app/api/super-admin/feature-catalog/route.ts
M	apps/admin/lib/runtime/http-module-runtime-adapter.ts
A	apps/admin/lib/runtime/plan-record-form.spec.ts
A	apps/admin/lib/runtime/platform-module-capabilities.spec.ts
M	apps/admin/lib/runtime/platform-module-registry.ts
M	apps/admin/lib/runtime/platform-runtime.types.ts
A	apps/admin/lib/runtime/record-header-status-group.spec.ts
M	apps/admin/lib/runtime/runtime-lookups.ts
A	apps/admin/lib/runtime/runtime-permissions.ts
M	apps/admin/lib/runtime/runtime-record-action-handler.ts
A	apps/admin/lib/runtime/standard-record-commands.ts
A	apps/admin/lib/runtime/use-runtime-lookup-options.ts
M	docs/backlog/index.md
M	docs/backlog/open.md
M	docs/backlog/product-decisions.md
A	docs/bugs/BUG-0220-saving-a-plan-from-the-runtime-record-page-always-returns-40.md
A	docs/bugs/BUG-0221-schema-completed-form-fields-render-on-a-tab-the-form-never-.md
A	docs/bugs/BUG-0222-plan-related-record-panels-declare-no-tab-so-they-never-rend.md
A	docs/bugs/BUG-0223-admin-cannot-set-a-plan-ispublic-flag-which-gates-self-servi.md
M	docs/knowledge/dashboards/DijiPeople Engineering Dashboard.md
M	docs/knowledge/dashboards/DijiPeople Product Dashboard.md
M	docs/knowledge/dashboards/Engineering Control Center.md
M	docs/qa/coverage-matrix.md
M	docs/qa/regressions/index.md
A	docs/qa/scenarios/QA-PLATFORM-003-a-plan-form-field-the-api-will-reject-is-never-offered-as-ed.md
A	docs/qa/scenarios/QA-PLATFORM-004-every-module-record-page-offers-the-standard-command-bar-the.md
A	docs/qa/scenarios/QA-PLATFORM-005-no-record-form-field-or-related-panel-renders-on-a-tab-the-f.md
M	docs/qa/scenarios/index.md
M	docs/qa/test-plans/PLAN-019-platform-admin.md
M	docs/qa/test-plans/index.md
A	docs/sessions/SESSION-0030-platform-admin-record-header-status-group-and-default-comman.md
M	docs/sessions/active.md
M	docs/sessions/index.md
M	docs/tasks/remediation/TASK-0005-inventory.json
M	services/api/src/modules/platform-runtime/platform-runtime.service.ts
```

## What the task was, and what it turned out to be

The request was three things: enhance the Plans detail page, give every module
detail page a default command bar, and add a D365-style status group to the
record header.

Two of the three turned out to be the *same* problem seen from different sides.
The platform runtime already had a registry that could express all of this; what
it did not have was a **default**. Every module's command bar was assembled by
hand, so what a record page offered depended entirely on which standard actions
that module's author happened to spell out. Measured before any change:

- Seven modules' record pages carried a single Back button and nothing else —
  partner inquiries, partner onboarding, subscriptions, invoices, payments,
  commissions, monitoring incidents.
- **No module offered Refresh at record scope at all.** `STANDARD_RECORD_ACTIONS`
  never contained one, and no bespoke page implemented one either.
- Delete led the command bar on Leads and sat last on Customers, because the
  merge order depended on which defaults each module had already listed.
- Two partner review screens declared their own action arrays inline and so
  could never receive a registry default at all.

The same absence explained requirement three. Owner and Status were shown for
about half the modules, in a metadata strip under the title, as plain text.
Sub-status was shown for one. Nothing was editable from the header anywhere.

### Where the design decisions were

**A capability map, not a preference.** The obvious way to give every module
Edit and New is to add them unconditionally. That would have produced buttons
that return 400, because the runtime API implements `create`, `update` and
`remove` for a specific subset of modules and refuses the rest by design.
`MODULE_CAPABILITIES` restates those three switch statements, and
`platform-module-capabilities.spec.ts` re-derives all three sets from
`platform-runtime.service.ts` and fails when the map disagrees. Deleting the
`case 'plans':` branch from the service fails the spec — verified, not assumed.

Back and Refresh are the exception and are unconditional: both are client-side,
both work on a record nobody can change, and a detail page without them is a
dead end.

**A header slot is read-only unless it names a governed write route.** The
tempting version of a D365 status group makes every slot a dropdown that PATCHes
its column. That would route around what the owning service does on a
transition — qualifying a lead sets `isQualified`, a support case transition
runs its own rules, a tenant lifecycle change has a provisioning state machine
behind it. So a slot becomes editable only where the runtime API exposes a named
route: `assign` for four modules, `change-status` for three. Everything else
displays the value and says where it is decided. Plans says "ITEM-0022"; tenants
says "the Operations tab".

**Nothing is invented to fill a slot.** A plan has no owner column. The nearest
candidate, `publishedById`, is an audit stamp, and presenting it as an owner
would be a lie with a person's name on it. The plan header therefore shows
Publication and Sales model and no Owner, and a spec asserts that it stays that
way.

### The plans page was not slow, it was broken

Requirement one looked cosmetic and was not. **Saving a plan from the standard
Admin screen had never worked.**

The runtime completes a record form from the generated Prisma manifest — a
statement about the *database*. The API validates the resulting PATCH against a
DTO with `forbidNonWhitelisted` — a statement about the *contract*. For `plans`
the two disagreed on eight columns, because ITEM-0018 added the publication
state to `Plan` without adding it to `UpdatePlanDto`. One unknown key fails the
whole request, so every plan edit returned 400.

It was invisible to every existing check. `POST /platform-runtime/plans/validate`
returned `{ success: true }` because no DTO was mapped for plans, so the form's
own validation step passed and the failure happened at the write, with a message
naming whichever property came first in key order.

The fix is not to widen the DTO. Publication is a commercial act — it decides
what customers can buy — and ITEM-0022 exists to give it governed, audited
actions. So the form now declares every Plan column explicitly, with the eight
`UpdatePlanDto` accepts writable and the rest read-only and described, and plans
are mapped into the validate switch so a mismatch is reported against the field.

Two more defects surfaced in the same pass and are recorded rather than
mentioned: schema-completed fields were pinned to a tab key that only the
default tab set contains, so on any module with its own tabs they satisfied the
schema-coverage rule and rendered nowhere; and the plans related-record panels
declared no tab, so a page advertising Subscriptions and Tenants showed neither.

The lesson worth keeping is not either placement fix. It is that the
schema-coverage rule asked whether a field was **present** on a form and never
whether the form could show it — the second time an assertion in this repository
has proven presence and nothing else. The registry now refuses both shapes at
import, so the coverage rule can no longer be satisfied vacuously.

## Conflicts

None. `session.mjs check --paths apps/admin` reported `SAFE_PARALLEL`, no write
lease was contested, and `origin/develop` did not move during the task.

## Conflict Resolutions

Not applicable — see above.

## QA

| | |
|---|---|
| **QA Report** | No `docs/qa/runs/` record. The evidence is three new scenarios and the suites below; a run record would restate them |
| **Bug IDs** | BUG-0220 (FIXED), BUG-0221 (FIXED), BUG-0222 (FIXED) created and closed in this task. BUG-0223 created and left open — `ArchitectDisposition: PRODUCT_DECISION` |
| **Backlog Items** | None created. ITEM-0022 is referenced by BUG-0220 and BUG-0223 as the record that owns the governed publication actions neither of them adds |
| **QA Scenarios** | QA-PLATFORM-003, QA-PLATFORM-004, QA-PLATFORM-005 under PLAN-019 |
| **Regressions** | REG-174, REG-175, REG-176 |

Each regression was **observed to fail under mutation**, not assumed to:

- REG-174 — making `isPublic` writable again fails 2 of 6 assertions.
- REG-175 — deleting `case 'plans':` from `PlatformRuntimeService.update` fails
  the update-set assertion.
- REG-176 — removing the `entitlements` tab while leaving its panel makes the
  registry throw at import, naming the section.

Both source-parsing specs assert first that they found what they are parsing —
`export class UpdatePlanDto`, `export class PlatformRuntimeService` and all
three switch statements — so a regex that matched nothing fails loudly instead
of agreeing with an empty expectation.

### Known limitation

**No browser verification.** This is a UI/UX task and the screens were not
opened in a browser. The suite that could do it (`e2e/`, Playwright) needs a
migrated and seeded PostgreSQL plus three running services, and the database is
single-writer across all sessions — this session holds no database lease and
would have had to ask for a `DATABASE_URL` to proceed. What was verified instead:
the admin production build compiles every route, TypeScript passes across all
eight workspaces, and 130 admin assertions cover the registry decisions that
drive what renders. Layout and spacing of the new header group are unverified
by observation.

## CI

| | |
|---|---|
| **CI Run ID** | [32495674259](https://github.com/taymurisrar/DijiPeople/actions/runs/32495674259) — `CI required gate` at `acb14a2`, all fourteen jobs green |
| **CI Result** | PASS |

A verdict must be read **on the exact SHA being merged**. A verdict from an
earlier commit on the same branch is a verdict about different code.

## Local Validation

Run in the task worktree at `acb14a2`:

```
npm --workspace admin run test          15 suites, 130 tests, 0 failures
npx tsc --noEmit (apps/admin)           0 errors
npx eslint . (apps/admin)               0 errors, 2 warnings — both pre-existing on develop
npx next build (apps/admin)             all routes compiled
npm run typecheck (root, 8 workspaces)  8 successful
npm --workspace api test src/modules/platform-runtime   3 suites, 17 tests
npm run test:runtime-schema             3 tests
npm run validate:framework              3,117 checks
npm run backlog:check / qa:check / sessions:check / tasks:check   current
```

Two notes on the environment rather than the code. The API typecheck reported 43
errors on arrival which were also present on clean `develop` — a stale generated
Prisma client in the shared `node_modules`, not a regression; `prisma generate`
cleared all 43. And junctioning `node_modules` into the task worktree, which is
enough for `tsc` and `jest`, is **not** enough for `next build`: Turbopack panics
on a symlink pointing outside the project root. A real `npm ci` in the worktree
was needed to build.

## Post-Merge Validation

Re-run in the task worktree, whose tip is byte-identical to `develop`:

```
node scripts/validate-framework.mjs        3,118 checks, 0 failures
node scripts/rebuild-backlog.mjs --check   162 records, 0 structural errors
node scripts/rebuild-qa.mjs --check        19 plans, 117 scenarios
node scripts/rebuild-sessions.mjs --check  30 records, indexes current
node scripts/rebuild-tasks.mjs --check     12 tasks
```

Ref-push means the integrated tip and the verified tip are the same commit, so
this is a re-run rather than a validation of something new — which is the reason
for integrating that way.

## Release / Deployment Impact

None. `apps/admin` is not deployed by this task, no migration, no environment
variable, no route contract change consumed by another surface. The one API edit
adds `UpdatePlanDto` to a validation switch, which can only turn a 400 at write
time into the same 400 reported earlier and per-field.

`DEPLOYMENT_REQUIRED = no`. Rollback class: revert the commit range on
`develop`; nothing is deployed and no state is migrated.

## Knowledge Capture

- `.agent/context/runtime-module-system.md` — two new sections: the record
  command bar is a registry default derived from what the API implements, and a
  header status slot is read-only unless it names a governed write route. The
  per-file line counts in the platform runtime section were **removed** rather
  than corrected: they were stale within a week of being written and nothing
  validates them, which is `doc-code-drift` applied to the document describing
  the runtime.
- `apps/admin/AGENTS.md` — the command bar and record header are registry
  decisions, not page decisions; and never mark a field writable that the API
  will reject, with BUG-0220 named as what that costs.
- BUG-0220, BUG-0221, BUG-0222, BUG-0223 and REG-174/175/176 carry the rest.

## Obsidian Sync

`node scripts/sync-obsidian.mjs` ran against the configured vault at
`D:/My Work/hrm-dijipeople/DijiPeople-Vault`, writing 30 notes and leaving 497
already current. `--verify` then read the vault back — the files, not the exit
code. Every count is zero:

```
OBSIDIAN_SYNC_STATUS          PASS
OBSIDIAN_REPO_TO_VAULT_DIFFS  0     OBSIDIAN_VAULT_TO_REPO_DIFFS  0
OBSIDIAN_PARITY_DIFFS         0     OBSIDIAN_MISSING_PROVENANCE   0
OBSIDIAN_SEMANTIC_LINK_ERRORS 0     OBSIDIAN_UNRESOLVED_LINKS     0
OBSIDIAN_GRAPH_ORPHANS        0     OBSIDIAN_STALE_NODES          0
OBSIDIAN_GRAPH_NODES        527     WIKILINKS_CHECKED          2678
```

The 30 written notes are the four bug records, three QA scenarios, the session,
this history record and the listing surfaces they appear on.

## Cleanup

The task worktree `D:/My Work/hrm-dijipeople/dijipeople-record-header` is kept
until the branch is confirmed merged; it is separate from the user's primary
checkout and was never written from it.

The primary checkout was CLEAN at session start and is CLEAN at the end. One
generated file appeared there mid-task — `apps/landing/next-env.d.ts`, rewritten
by `next typegen` during a root typecheck — and was restored rather than
committed. It is the user's interactive workspace, not a scratch directory, and
a file nobody explained showing up in GitHub Desktop is something they see long
before any agent does.

Also restored: `node_modules` had been junctioned into the task worktree to get
a typecheck signal quickly. That is enough for `tsc` and `jest` and **not**
enough for `next build`, which panics on a symlink pointing outside the project
root, so the junctions were removed and a real `npm ci` run in the worktree.
The junctions no longer exist.

The write lease on `runtime-registries` is released with the session.
