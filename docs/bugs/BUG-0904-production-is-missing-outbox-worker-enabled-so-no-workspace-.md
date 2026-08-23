---
ID: BUG-0904
aliases: [BUG-0904]
Title: Production is missing OUTBOX_WORKER_ENABLED, so no workspace is provisioned after payment
Status: OPEN
Severity: CRITICAL
Priority: P0
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-23
DetectedInSha: 1dd74a25
AffectedModules: [services/api/src/modules/outbox]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-23
UpdatedAt: 2026-08-23
ResolvedAt:
---

# BUG-0904 — Production is missing OUTBOX_WORKER_ENABLED, so no workspace is provisioned after payment

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

- The production API logs `Outbox worker started`.
- A test purchase reaches `workspace-created = DONE`.
- No `OutboxEvent` older than a few minutes sits in `PENDING`.

## Regression Coverage

None yet — this is configuration, and the durable guard is a deployment
assertion rather than a unit test.

## Dependencies

Masked by [[BUG-0898]]; must be fixed before [[BUG-0900]] and [[BUG-0902]] are
observable in production.

## Related Items

[[BUG-0898]], [[BUG-0900]], [[BUG-0902]], [[BUG-0905]]

## Resolution

Not fixed here. Changing a production environment variable is a deployment
action and is the owner's to take — the standing agreement on the Render
credentials is logs, status and health only.

## QA Retest

Retest by checking the production startup log for `Outbox worker started` and
completing one test purchase through to `workspace-created = DONE`.

## History

- 2026-08-23 — created from qa run at `1dd74a25`.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[outbox]]

<!-- GRAPH:END -->
