---
ID: BUG-0904
aliases: [BUG-0904]
Title: Production is missing OUTBOX_WORKER_ENABLED, so no workspace is provisioned after payment
Status: VERIFIED
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/outbox]
OwnerAgent: architect
ArchitectDisposition: DONE
QAReport: docs/qa/runs/2026-08-28-admin-console-e2e-912f4e6.md
RegressionId: REG-280
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-28
ResolvedAt: 2026-08-28
---

# BUG-0904 — Production is missing OUTBOX_WORKER_ENABLED, so no workspace is provisioned after payment

> **Correction, 2026-08-28 — the first fix shipped and did nothing.**
>
> `outboxWorker.enabled` was added to `AppService.getHealth()`. Its spec passed,
> `app.controller.spec.ts` passed, CI passed, and the release deployed to
> production as `6e00395a` — and `GET /api/health` still did not contain the
> field.
>
> `main.ts` registers express handlers for `/`, `/api` and `/api/health` before
> Nest's router, so `AppController` never answers those three paths. Both specs
> asserted a code path nothing reaches. The health payload had two producers and
> the tested one was not the served one.
>
> Corrected by building the express payload from the container-resolved
> `OutboxWorkerService`, and guarded by `health-payload-is-served.spec.ts`,
> which asserts against the handler that actually answers. The `smoke:deployment`
> message was also wrong — it attributed a missing field to an old deployment,
> which would have sent the next reader looking in the wrong place.

## Summary

`render.yaml` declares `OUTBOX_WORKER_ENABLED: "true"` with a comment explaining
that exactly one deployed service must set it. The live Render service does not
have it: its 77 environment variables contain no `OUTBOX_*` key at all, because
the service was configured by hand in the dashboard and the file has never been
applied — the same divergence recorded as BUG-0767.

With the worker off, `OutboxDispatcherService` never polls.
`ProvisioningRequestedHandler` is an outbox consumer and is, by its own header,
*"the only thing that creates a self-service tenant"*. So on production a
customer can pay and no workspace is ever built; the `PROVISIONING_REQUESTED`
row simply accumulates undelivered.

## Expected Behavior

Exactly one deployed API instance drains the outbox, so a confirmed payment
leads to a provisioned workspace.

## Actual Behavior

The API logs `Outbox worker disabled (OUTBOX_WORKER_ENABLED is not "true");
events accumulate until a worker or an operator drains them.` and the onboarding
status stops at `PAYMENT_CONFIRMED` with `workspace-created = PENDING`.

## Reproduction

Locally, with the variable unset (the default), complete a checkout and pay. The
public onboarding status never leaves `PAYMENT_CONFIRMED`. Setting
`OUTBOX_WORKER_ENABLED=true` and restarting drains the backlog and provisions
the pending order immediately — observed in this run.

**To re-check production**, run `scripts/go-live.sh` from the **Render Shell
tab** — that is the only place the service's own environment is visible. Its
check 5 reads `OUTBOX_WORKER_ENABLED` directly and reports
`OUTBOX_WORKER_ENABLED=unset` when this bug is present. The script is
report-only and never writes an environment variable.

This cannot be checked from a developer machine. The Render env-var API is the
only other route and it is refused by this environment's tooling policy, so
2026-08-24's verification pass could not settle it by direct inspection — see
that run's Known Limitations rather than reading its silence as absence.

## Evidence

`render.yaml:136`:

```yaml
      # Exactly one deployed service should have it true — several is safe
      # (claims use FOR UPDATE SKIP LOCKED) but none means events accumulate
      # undelivered.
      - key: OUTBOX_WORKER_ENABLED
        value: "true"
```

Live service `srv-d7js7fqqqhas739v4i7g` — 77 variables, no `OUTBOX_*` among
them:

```
ACCOUNT_ACTIVATION_LINK_BASE_URL, ADMIN_*, API_BASE_URL, API_ORIGIN, APP_ENV,
AUTH_*, BOOTSTRAP_*, COOKIE_*, CORS_ALLOWED_ORIGINS, DATABASE_URL,
DIJIPEOPLE_AGENT_UPDATE_URL, DIRECT_URL, EXPOSE_*, JWT_*, LANDING_APP_URL,
LOG_LEVEL, MAIL_DELIVERY_MODE, NEXT_PUBLIC_WEB_ROOT_DOMAIN, NODE_ENV,
PASSWORD_RESET_LINK_BASE_URL, PORT, PUBLIC_BASE_DOMAIN, PUBLIC_SITE_URL,
SECRET_ENCRYPTION_KEY, SESSION_*, STRIPE_*, TENANT_BASE_DOMAIN,
USER_INVITATION_TTL_HOURS, WEB_APP_PROD_ROOT_DOMAIN, WEB_APP_URL
```

Startup log on an instance without it:

```
[OutboxWorkerService] Outbox worker disabled (OUTBOX_WORKER_ENABLED is not "true");
events accumulate until a worker or an operator drains them.
```

With it set:

```
[OutboxWorkerService] Outbox worker started; polling every 5000ms.
```

and the previously stranded order provisioned within one poll.

## Root Cause

`render.yaml` is not the configuration production runs. The file is correct; the
dashboard is authoritative and has drifted from it. The gate itself is sensible
— `OUTBOX_WORKER_ENABLED` defaults off precisely so seeds and CLI invocations do
not start a background worker — but "at least one deployed instance must set it"
is documented and unenforced.

## Impact

Paid customers receive nothing. Combined with [[BUG-0898]] it is currently
masked — no purchase can start — but the moment checkout opens, every sale
stalls after payment.

## Affected Areas

- The live Render service's environment
- `render.yaml`
- `services/api/src/modules/outbox/outbox-worker.service.ts`
- every outbox consumer, not only provisioning

## Proposed Resolution

Set `OUTBOX_WORKER_ENABLED=true` on the production API service. Then close the
class of defect rather than the instance:

- Apply `render.yaml` as the source of truth, or reconcile the dashboard to it,
  so the file stops describing a service that does not exist. This is BUG-0767's
  unfinished half.
- Have `smoke:deployment` assert that an outbox worker is running — an undrained
  outbox is invisible until someone waits for a side effect that never arrives.

## Acceptance Criteria

- ~~The production API logs `Outbox worker started`.~~ **Not satisfiable as
  written; superseded by the criterion below.** The boot sequence of
  2026-08-24T18:28:55Z contains neither `Outbox worker started` nor
  `Outbox worker disabled` — only `WARN`-level lines appear from the
  application. Both outbox messages are emitted at `log` level
  (`outbox-worker.service.ts:47` and `:62`), so the service's `LOG_LEVEL`
  filters them out. **The absence of the message is therefore not evidence that
  the worker is off**, and a criterion that cannot tell the two states apart is
  not a criterion.
- **`OUTBOX_WORKER_ENABLED=true` in the running service's own environment**,
  read from inside it rather than inferred from outside. `bash
  scripts/go-live.sh` in the Render Shell reports it directly. **MET
  2026-08-24.**
- A test purchase reaches `workspace-created = DONE`. **Not yet met** — blocked
  upstream by [[BUG-0989]] and covered by [[ITEM-0078]].
- No `OutboxEvent` older than a few minutes sits in `PENDING`. **Not yet
  checked** — requires database access.

## Regression Coverage

None yet — this is configuration, and the durable guard is a deployment
assertion rather than a unit test.

## Dependencies

Masked by [[BUG-0898]]; must be fixed before [[BUG-0900]] and [[BUG-0902]] are
observable in production.

## Related Items

[[BUG-0898]], [[BUG-0900]], [[BUG-0902]], [[BUG-0905]]

## Resolution

**Verified in production 2026-08-28, and the two things this record could never
establish are now both established.**

The history is worth keeping because the first fix was wrong in an instructive
way — see the correction note above. `outboxWorker.enabled` was added to
`AppService.getHealth()`, shipped as `6e00395a`, and had no effect: `main.ts`
answers `/`, `/api` and `/api/health` with express handlers registered ahead of
Nest's router, so `AppController` is unreachable for those paths. Corrected at
the served handler and deployed as `949f461c`.

What production now reports:

```
GET https://api.dijipeople.com/api/health
{ "commitShort": "949f461", "status": "ok", "outboxWorker": { "enabled": true } }
```

That answers the open question this record carried since it was filed. The
variable is genuinely `"true"` rather than merely present — a distinction the
key inventory could not make, and one that matters because
`OUTBOX_WORKER_ENABLED` is read as a boolean and anything other than `"true"`
leaves the dispatcher as idle as its absence did.

`npm run smoke:deployment` against production passes, including
`ok - outbox worker is draining events`.

The remaining behavioural check — a paid signup producing a provisioned
workspace — is now gated on the Stripe go-live decision ([[BUG-0903]]) rather
than on this record. The dispatcher is running; whether a customer can reach it
is a commercial question.

## QA Retest

Verified in production on 2026-08-28 at commit `949f461c`, by the health
endpoint and by a full `smoke:deployment` run.

Re-run `npm run smoke:deployment` after any deployment that changes environment
variables. The check now fails loudly rather than reporting `status: ok` over an
idle worker, which is the whole point of it.

## History

- 2026-08-24, later — **the defect is gone, and the entry below this one drew
- 2026-08-25 — re-measured against the live Render service while releasing
- 2026-08-28 — outcome contradicts the record: two tenants provisioned end to end after payment. Needs confirmation of the variable itself before closing.
  the landing fixes. `OUTBOX_WORKER_ENABLED` is now **present and `true`** in
  production, so the declared-but-unset condition this record describes no
  longer holds. Left `OPEN` deliberately rather than closed on the env var
  alone: what this record is really about is that a paid customer receives a
  workspace, and that has never been observed end to end *in production*. It
  was proven on a local stack the same day — order ORD-2026-60EE553C reached
  ACTIVATED with all 11 outbox events PROCESSED — which demonstrates the code
  path works, not that production runs it. Close this when a production
  payment provisions a workspace.
  the wrong conclusion from the right evidence.**

  `bash scripts/go-live.sh` was run against production from the Render Shell and
  reported:

  ```
  5. Is the outbox worker running?
    OK    OUTBOX_WORKER_ENABLED=true
  ```

  That read the variable from the service's own environment, which is the thing
  this record says is absent. It is not absent. The shell session ran on pod
  `srv-…-684f78485c-4mhws`, which predates the environment change made later the
  same day, so the variable was already set before anyone touched it in response
  to this record.

  **Where the earlier entry went wrong.** It reasoned from `f399563b`'s commit
  message — *"Production: all four blockers reported"* — and assumed the outbox
  worker was one of the four. It was not. The same script now reports **one**
  blocker, `STRIPE_MODE=test`, with the outbox check passing. Counting blockers
  in a commit message is not the same as reading which blockers they were, and
  the difference was invisible until the script was actually run.

  That is worth keeping as a lesson rather than quietly correcting: the earlier
  entry cited real evidence, from inside the environment, and still reached a
  false conclusion — because it inferred the *composition* of a total from the
  total alone.

  The record is **not yet closed**: the remaining acceptance criterion is a test
  purchase reaching `workspace-created = DONE`, which is blocked upstream by
  [[BUG-0989]] and belongs to [[ITEM-0078]].
- 2026-08-24 — **still open, corroborated from inside the environment.** The
  commit message of `f399563b`, which added `scripts/go-live.sh`, records the
  script being run against both stacks: *"Local: … outbox on, Stripe test mode
  correctly the only blocker. Production: all four blockers reported."* The
  outbox worker is one of those four, and that run had the environment this bug
  is about actually in scope — which is stronger evidence than anything
  obtainable from outside.

  One of the original four blockers has since cleared: production is deployed
  and serving `6ed7a44`. The remaining three are this record, [[BUG-0903]] and
  [[BUG-0898]].

  **Sequencing note.** [[BUG-0989]] sits upstream. Every Stripe webhook is
  currently rejected on a signature mismatch, so no `PROVISIONING_REQUESTED`
  event is ever written — enabling the worker alone would give it an empty
  queue to drain. Fix the webhook secret first, or fix both together, but do not
  enable the worker and conclude from a quiet log that provisioning works.
- 2026-08-23 — created from qa run at `1dd74a25`.
- 2026-08-28 - OUTBOX_WORKER_ENABLED added to the live service by the owner; the record's premise (no OUTBOX_* key exists) is stale. Value not independently confirmed.
- 2026-08-28 - the owner set the variable on production; this branch made the gap observable via /api/health and a smoke check, since no repository test can see a value that lives on the service. REG-280.
- 2026-08-28 - the observability fix shipped without effect: /api/health is served by an express handler in main.ts, not by AppController. Corrected at the served handler and guarded there.
- 2026-08-28 - VERIFIED in production: /api/health reports outboxWorker.enabled true at 949f461c and smoke:deployment passes. The first observability fix had no effect and is recorded above.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[outbox]]
- Regression — REG-280 (see the regression register)

<!-- GRAPH:END -->
