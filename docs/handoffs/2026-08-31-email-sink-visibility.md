# Handoff — a workspace that cannot send email should say so

> Written 2026-08-31 ~09:40 UTC, at the end of the Reports & Analytics program.
> Everything described as *shipped* is live in production. Everything described
> as *remaining* has **no code written yet** — the session and worktree exist,
> the design is decided, nothing has been edited.

---

## 1. What you are picking up, in one paragraph

The Reports & Analytics platform shipped, and post-deploy validation found four
defects which are also now fixed and live. While verifying the last of those —
scheduled report email — it turned out that **no email leaves this product at
all** on the demo tenant, because its only email provider is a `CONSOLE` sink,
and every layer of the system reported success anyway. The owner decided: leave
the demo tenant as a sink, **but fix the fact that nothing said so.** That fix
is your job.

---

## 2. State of the world

| | |
|---|---|
| `origin/main` | `6d17e931ba46aac50194cc455eeb3846a8840af8` — deployed, healthy |
| `origin/develop` | `1b048164212e571a3b2ae6681a2984ec706ad8ee` |
| Production API | `https://api.dijipeople.com/api/health` reports `6d17e931` |
| Demo tenant | `https://dijipeople-demo.ws.dijipeople.com` |
| Session | **SESSION-0089**, ACTIVE, branch `agent/email-sink-visibility` |
| Worktree | `D:/My Work/hrm-dijipeople/dijipeople-mail` — clean, branched off `1b048164` |

**The worktree's `node_modules` is a junction** to the primary checkout's. That is
fine for reading and `tsc`, and **not** fine for a trustworthy test run — the
primary's install is older than `develop`'s `package.json` and is missing
`pdf-parse`, which fails 14 suites for reasons that have nothing to do with your
change. Before the final validation run:

```powershell
# unlink WITHOUT following the junction — a recursive delete here has previously
# destroyed 3,072 tracked files out of the user's primary checkout
[IO.Directory]::Delete("D:\My Work\hrm-dijipeople\dijipeople-mail\node_modules", $false)
```
```bash
cd "D:/My Work/hrm-dijipeople/dijipeople-mail" && npm ci && npm run prisma:generate
```

`prisma:generate` is not optional after a fresh install — without it 238 suites
fail on `Cannot find module '.prisma/client/default'`.

---

## 3. The task

**Approved by the owner:** *"A workspace whose default provider is a sink should
say so where people look: on the Scheduled screen and in the delivery log's
status, not only in a providerType field nobody reads."*

Two surfaces, both named explicitly by the owner:

1. **The delivery log's status.** Today a message handed to a sink is recorded
   `SENT`. It should not be.
2. **The Scheduled Reports screen.** Someone creating a schedule should be told
   the workspace cannot send email *before* they wait a day for an email that
   will never come.

**Explicitly out of scope:** configuring a real provider for the demo tenant.
The owner chose to leave it a sink.

---

## 4. What is already established (do not re-derive)

### The demo tenant sends nothing

```
GET /api/notifications/email-providers
  providerType : CONSOLE
  providerName : Console Provider
  enabled      : true
  isDefault    : true
  fromEmail    : no-reply@dijipeople.local
```

Only `SMTP`, `SES`, `SENDGRID`, `MAILGUN`, `POSTMARK` deliver. `CONSOLE` and
`DEV` are sinks. The Prisma enum `EmailProviderType` also contains `CUSTOM`.

### Every layer reported success

The scheduled report that ran at 09:00:20 UTC:

```
report schedule   lastRunStatus COMPLETED, lastFailureReason null
delivery log      status SENT, providerMessageId console_1788166820151_…
                  providerType CONSOLE            <- the ONLY tell
subject rendered  "Employee Directory - scheduled - DijiPeople Demo"
```

That subject line matters: it proves the BUG-2683 fix works — `{{tenantName}}`
resolved to "DijiPeople Demo". The email was rendered correctly and handed to a
sink.

### The console provider's output does not reach the logs either

`ConsoleEmailProvider.send()` writes a JSON blob with marker
`[CONSOLE_EMAIL_PROVIDER]`, recipient, subject and both rendered bodies — via
`logger.log()`, i.e. Nest **LOG** level. Attachments are never logged.

Production emits only `error` and `warn`. Verified, not assumed:

| Window | Lines | LOG-level |
|---|---|---|
| 08:00–09:30 UTC | 100 | 0 |
| 08:09–08:12 (busy deploy) | 100 | 0 |
| 09:00:00–09:01:30 (the send) | 0 | 0 |

**Why**, and this is a second bug worth fixing while you are here:

```ts
// services/api/src/main.ts
const LOG_LEVEL_LADDER = ['error', 'warn', 'log', 'debug', 'verbose'];
```

The live service has `LOG_LEVEL = info`. `info` is **not in that ladder**, so
`indexOf` returns `-1`, the branch is skipped, and it falls through to the
production default `['error','warn']` — silently. Nest's name for that level is
`log`; every other logging ecosystem calls it `info`, so `info` is the natural
thing to type and it does nothing.

The service also carries `MAIL_DELIVERY_MODE = log`, which affects the separate
legacy `common/mailer/mailer.service.ts` (activation links only). That one
returns `accepted: true` in **every** mode, including unsupported ones. Not the
path scheduled reports take, but the same disease.

---

## 5. Design decided so far

### 5a. Delivery log status

`EmailDeliveryStatus` already contains `REQUESTED, PENDING, PROCESSING, QUEUED,
SENT, DELIVERED, FAILED, SKIPPED, DRY_RUN`.

**Do not reuse `DRY_RUN`.** It means "the caller requested a rehearsal"
(`input.dryRun`), and its branch returns `sent: false`. Conflating "you asked
for a test" with "your configuration cannot deliver" makes both unreadable.

**Add `NOT_DELIVERED`.** Written in `email-execution.service.ts` where the
provider send succeeds but the resolved provider is `CONSOLE` or `DEV`, in place
of the `SENT` write at roughly line 420.

Adding a Prisma enum value is an additive migration. **This is the open
decision — see section 6.**

Add a shared predicate rather than repeating the pair of enum comparisons; the
same test already exists twice in `email-provider-factory.service.ts` around
lines 50–56:

```ts
export function isSinkProvider(type: EmailProviderType): boolean {
  return type === EmailProviderType.CONSOLE || type === EmailProviderType.DEV;
}
```

**Deliberately NOT changed:** the `sent` flag on `SendTemplateEmailResult`, and
the report scheduler's success semantics. Reasons, so you can overturn this
knowingly rather than by accident:

- The report scheduler calls `notifications.dispatch(...)` — the **orchestrator**
  — not `sendTemplateEmail` directly. Its `sent` counter increments when
  `dispatch` does not throw. Making a sink "fail" means changing the orchestrator
  contract, which is also on the path for password resets, invitations and
  employee-profile mail.
- If a sink counted as a failed send, schedules on sink tenants would fail daily
  and auto-disable after `MAX_CONSECUTIVE_FAILURES` (5). That may well be
  correct — it stops producing files nobody receives — but it is a behaviour
  change the owner has not been asked about.

Consider adding `delivered: boolean` to the result as an *additive* field so
callers can act on it without changing what `sent` means.

### 5b. The Scheduled Reports screen

Warn where someone acts. Two places:

- `apps/web/app/(authenticated)/reports/_components/scheduled-reports-list.tsx`
- the schedule creation dialog, `schedule-report-dialog.tsx`

Wording should say what is true and what to do: the workspace is not configured
to send email, reports will still be produced, and email settings are where to
fix it. Do not say "failed" — nothing failed.

**The capability signal needs an endpoint.** `GET /api/notifications/email-providers`
exists but is almost certainly gated behind notification-admin permissions, and
an ordinary user creating a schedule will not hold them. Options, in order of
preference:

1. A small capability route on the reporting controller, e.g.
   `GET /reporting/schedules/delivery-capability` returning
   `{ canDeliver: boolean, providerType: string | null }`. **Declare it before
   any parameterised `schedules/:id` route** — `reporting.controller.ts` has a
   route-shadowing invariant and static routes come first.
2. A field on the existing schedules response. This changes a shipped response
   shape; three frontends consume this API, so prefer (1).

Whatever you choose, resolve the capability through **the same path a real send
takes**, including the platform-provider fallback that `EmailExecutionService`
slots in between tenant and environment (see the `tenantOnly` option on
`resolveProvider`, and PLAN-023). A capability check that consults only the
tenant's own providers will lie for tenants relying on the platform provider.

### 5c. Worth folding in

Validate `LOG_LEVEL` in `main.ts`: if the value is non-empty and not in the
ladder, log a warning naming the accepted values rather than silently using the
default. Map `info` to `log` if you like, but warn either way — silence is the
defect.

---

## 6. Open decision, needs the owner

**How to create the migration.** The repo convention is
`npm run prisma:migrate:dev`, which needs a database. I proposed creating a
throwaway `dijipeople_mail_mig` and the owner declined the tool call, so this is
unresolved rather than decided.

- **Option A** — throwaway database, `prisma:migrate:dev`, drop it afterwards.
  Follows convention. Local Postgres 18 is at
  `C:\Program Files\PostgreSQL\18\bin`, password readable from
  `services/api/.env`. **Never touch the populated `dijipeople` dev database.**
- **Option B** — hand-write the migration directory and SQL.
  `ALTER TYPE "EmailDeliveryStatus" ADD VALUE 'NOT_DELIVERED';` is additive and
  safe. Note PostgreSQL will not let you use a new enum value in the same
  transaction that adds it; Prisma's migration runner handles this, but a
  hand-written migration that also *uses* the value would need two migrations.

Ask before proceeding.

---

## 7. Definition of done

- `NOT_DELIVERED` recorded for a real send resolved to a sink provider; `SENT`
  still recorded for a genuine transport; `DRY_RUN` still means a requested
  rehearsal.
- The Scheduled Reports screen and the schedule dialog warn when the workspace
  cannot deliver, and say nothing when it can.
- A regression test per behaviour, each **proven to fail without the fix** by
  reverting the change and watching it go red. A test that passes on the broken
  tree is worse than no test — that happened twice in this program.
- A bug record under `docs/bugs/` created with
  `npm run backlog:new-bug` (**let it allocate the id; do not guess one**), a
  `REG-nnn` entry appended to `docs/qa/regressions/index.md` (next free id is
  **REG-390**), and a QA scenario (next free is **QA-REPORTING-011**, area
  `reports`, or `authorization`/`authentication` as appropriate — an active
  regression without a reusable scenario fails `qa:rebuild`).
- Deployed and verified in production.

---

## 8. How to run the machinery here

```bash
export PATH="/c/Program Files/GitHub CLI:$PATH"      # gh is not on PATH by default
export DATABASE_URL="postgresql://u:p@localhost:5432/dummy?schema=public"  # a few specs need it at import time
```

**The single pre-push block. Run it as the last action, with no edits after it.**

```bash
for c in backlog:rebuild remediation:sync qa:rebuild knowledge:record-graph \
         knowledge:dashboards components:rebuild; do npm run "$c" >/dev/null || echo "FAIL $c"; done
node scripts/rebuild-sessions.mjs >/dev/null
(cd apps/web && npx eslint --fix >/dev/null; npx eslint) \
  && (cd apps/admin && npx eslint) && (cd apps/landing && npx eslint) \
  && (cd services/api && npx eslint --fix "src/**/*.ts" >/dev/null; \
      npx eslint "{src,test}/**/*.ts" --max-warnings=789) \
  && git add -A && npm run validate:framework
```

Then:

```bash
git push -u origin agent/email-sink-visibility
npm run ci:await -- --sha <sha> --timeout 3000        # run it backgrounded
git push origin agent/email-sink-visibility:develop   # ref-push keeps develop == the verified SHA
gh pr create --base main --head develop --title "..." --body-file <file>
gh pr merge <n> --merge
```

The owner has given **standing authorisation to release to `main` and deploy
production**. Verification duties are unchanged: after merging, confirm the
deployed commit at `/api/health` actually moved, and verify the tree:

```bash
git rev-parse origin/main^{tree}   # must equal the CI-verified commit's tree
```

Cleanup at the end: `session.mjs queue done`, `lease release`,
`session.mjs finish SESSION-0089`, then **set `STATUS: COMPLETE` in the session
record by hand** — the script prints a reminder and does not write it — then
`node scripts/remove-worktree.mjs <path> --branch <branch>`. **Never
`git worktree remove`.**

---

## 9. Traps that have already cost time in this program

- **Lint after the *last* edit, not once before pushing.** A CI cycle was lost
  because a second fix was added to an already-linted branch. The block in
  section 8 exists for exactly this.
- **`validate:framework` is one step of the Framework validation job.** A record
  edit made after a green validate left `generate-record-graph` stale and failed
  the gate — the stale file was the graph block inside the engineering history
  record itself.
- **A near-duplicate test that compares prefixes is worth nothing.** The first
  caveat-uniqueness test compared a 60-character prefix; the pair it was written
  for diverged at the fourth word, so it passed on the broken tree. Caught only
  by deliberately reverting the fix and finding the test still green.
- **Do not guess a record id.** `BUG-2685` was written into three comments
  before the allocator assigned `BUG-2693`.
- **Render captures a deploy's environment when the deploy is *created*,** not
  when the container starts. Variables set after a deploy begins do not reach
  that container. `render.yaml` is **not synced** to this service — 13 of its 16
  literal-valued keys are absent from the live environment.
- **Read the artifact, not the pipeline.** This whole handoff exists because a
  green pipeline was reported as a delivered email.

---

## 10. Other open items, not part of this task

- **`workforce.turnover_rate` renders as "—" and can never compute.** `derived`
  metrics return `null` from `metricValue` and nothing composes them. Needs a
  product decision first: its caveat requires an **average daily** headcount
  denominator, which is a different quantity from the point-in-time count
  `workforce.historical_headcount` now returns. Not recorded as a bug yet.
- **BUG-2626** — dashboard numbers render in the visitor's browser locale.
  Open, same family as the reporting hydration defect, out of scope so far.
- **BUG-2623 is not verified in production** and its release record says so. It
  only fires for a SELF/USER/TEAM caller belonging to a team; the only account
  available resolves to TENANT. Covered by unit tests instead.
- **Neon is at 5.09 / 5 GB data transfer**, the only exceeded metric, on the
  free plan. The billing period resets 2026-09-01 00:00 UTC. Compute 47%,
  storage 24%. Production is healthy. The structural question — a live
  multi-tenant SaaS on Neon Free — is the owner's to answer.
- **The `next` parameter loses the original path** on the expired-session
  redirect. After the BUG-2662 fix a stale session correctly lands on the login
  form, but at `/login?next=%2F` rather than the page that was asked for, so the
  user returns to the dashboard. Minor, unrecorded.
