# Engineering History — Release legal copy and plan pricing

| | |
|---|---|
| **Task Title** | Release: real legal copy, plan entitlement data loss, and the pricing screen |
| **Task Type** | RELEASE (carrying BUGFIX and FEATURE work integrated on `develop` first) |
| **Date** | 2026-08-23 |
| **Architect Plan** | NOT_APPLICABLE — no schema change, no destructive migration, no new module. The classes in `PLANS.md` that require an ExecPlan are not present. |
| **Agents Used** | Architect, Backend/API, Frontend, UI/UX, Security, QA, Reviewer, Integrator, Release/DevOps, Product & Backlog Steward, Knowledge & Graph. Database was not used: no migration and no schema edit. |

## Git

| | |
|---|---|
| **Base Branch** | `origin/main` |
| **Task Branch** | `agent/release-landing-e2e` |
| **Base SHA** | `be486ae1` |
| **Final Task SHA** | `944a2d003a401b9f16d07a4a78eadf7dd4f998df` |
| **Target Branch** | `main` |
| **Merge Commit** | `6b315835416fce22a138a2dfa193d663fbfcb421` (PR #42) |
| **Final Target SHA** | `6b315835416fce22a138a2dfa193d663fbfcb421` |

### Commits

```
944a2d00 test(legal): flip the last assertion that pinned the copy as unpublished
2852855e feat(legal): the real legal copy, and a test so it can never fail a deploy again
a6ee9f9c fix(admin): plan pricing and entitlements — a data-loss bug, a 500, and a screen you can work in
a3e15568 style(api): prettier formatting in the legal admin controller
f399563b feat(ops): a go-live check an operator runs in Render's Shell
4b1f1953 feat(legal): author and publish legal documents from Platform Admin
c9e78072 style(api): prettier formatting in the CORS regression spec
74eb5dc5 feat(commerce): one command to make the catalogue sellable
1bc2eadb fix(api): a refused CORS origin is a decision, not a 500 anyone can log
1e9f2c04 docs(release): SESSION-0045 — main is be486ae1, and what actually deployed
```

## Conflicts

None. `develop` was a fast-forward of `main`; the PR merged cleanly.

## Conflict Resolutions

None required.

## QA

| | |
|---|---|
| **QA Report** | No new QA run record. Verification was automated: `QA-API-001` and `QA-INTEGRATION-001` cover the two defects fixed here, and the deployed result was verified directly against production (below). |
| **Bug IDs** | Created and fixed: `BUG-0994` (CRITICAL, data loss), `BUG-0995` (HIGH). Reopened as `PLAN_REQUIRED`: `BUG-0015`, `BUG-0016`. Re-filed `ACCEPTED_RISK`: `BUG-0223`. |
| **Backlog Items** | None created. |

## CI

| | |
|---|---|
| **CI Run ID** | Workflow run on `944a2d00` — all 14 jobs plus `CI required gate` |
| **CI Result** | PASS |

Read on `944a2d00`, which is exactly the SHA PR #42 merged. An earlier run on
`2852855e` failed `Database e2e` and was **not** used to authorise anything —
see below.

## Post-Merge Validation

Run against production after the deploy reached `live`:

- `GET /api/health` → `commitShort: 6b31583`. The deployed commit is the merge
  commit, confirmed rather than assumed.
- `GET /api/public/legal` → 10 documents published: privacy, terms,
  billing-terms, refund-policy, cookie-policy, acceptable-use, dpa,
  data-retention, security, subprocessors.
- `GET /api/public/legal/terms` → version 1, 3,280 characters, zero draft
  markers, and the Liability, Indemnity and Governing law sections present. The
  content was read, not just the endpoint status — see the note below.
- `https://www.dijipeople.com/legal/terms` → 200; `/legal/not-a-real-doc` → 404,
  so the soft-404 fix is live too.
- `GET /api/public/plans` → 4 plans, 36 active prices, **0 checkout-ready**.

## Release / Deployment Impact

Deployed to production. Render deploy of `6b31583` went
`build_in_progress → pre_deploy_in_progress → update_in_progress → live`, the
first successful API deploy since 2026-08-22 22:15.

The two preceding deploys — `1dd74a2` and `be486ae` — both ended
`pre_deploy_failed`, so production served `ef57b2a` for roughly 23 hours while
`main` advanced twice without reaching it. The cause was `legal:publish
--confirm`, the last step of `npm --workspace api run release`, correctly
refusing documents whose own text said they were unreviewed drafts.

Rollback class: **not cleanly reversible.** Publishing a legal version is
immutable and acknowledgements reference it by version; withdrawing means
publishing a replacement. The code changes are revertible in the ordinary way;
the publication is not.

Still blocking go-live, both requiring a decision this task did not have:

- `STRIPE_MODE = test` — no real payment can be collected. Must be switched to
  `live`, with live keys and the webhook secret for that destination, **before**
  syncing prices: `stripeEnvironment` is stamped into each price at sync time.
- `OUTBOX_WORKER_ENABLED` is absent from the service environment entirely.
  Provisioning is an outbox consumer, so without it a customer pays and never
  receives a workspace.

Consequently 0 of 36 active prices are checkout-ready.

## Knowledge Capture

- `docs/qa/regressions/index.md` — REG-241 (one runtime module, one shape for
  `features`) and REG-242 (a stale Stripe product id must not brick pricing).
- `docs/qa/scenarios/QA-API-001-*`, `QA-INTEGRATION-001-*`.
- The durable lesson, recorded in REG-241's Note: a derivation that can turn
  "I did not understand this input" into "the answer is none" is dangerous in
  proportion to what consumes its output. Here the consumer replaced a set, so
  a silent empty array deleted entitlements. It should have been written so it
  could not produce that.
- The second, in the seed-legal commit: a content rule enforced only at deploy
  time is a rule enforced by outage. `legal:publish` was right to refuse; the
  fault was that nothing asked the same question earlier, so the answer arrived
  as `pre_deploy_failed` twice.
- Two specs in this repository asserted a *pending state* — "the seed still
  carries banners", "the detail contains BUG-0015" — and so pinned the defect
  as a requirement. Both were flipped rather than deleted, since the assertion
  was watching for exactly the change that happened. Worth recognising as a
  pattern: an assertion whose comment describes what should happen when it
  fails is a to-do list, not a test.

## Obsidian Sync

`node scripts/generate-dashboards.mjs` ran and rewrote the Engineering
Dashboard, Product Dashboard and Engineering Control Center;
`validate:framework` then passed 3,617 checks. Vault publication
(`sync-obsidian.mjs`) was not run — it needs local vault configuration this
session does not hold.

## Cleanup

Worktree `D:/My Work/hrm-dijipeople/wt-landing-e2e` retained and clean
(`git status --short` empty); branch `agent/release-landing-e2e` retained, since
`develop` and `main` both point at its work and further go-live steps follow.

The user's primary checkout carries two modified files, neither this task's to
touch: `apps/landing/next-env.d.ts` (generator output) and
`services/api/prisma/seed-legal.ts` — their own edit, now integrated, differing
from `develop` only by the `export` added so the publish guard could be tested.
