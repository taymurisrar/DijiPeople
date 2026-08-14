# Agent Role — Integration

Owns the boundaries where DijiPeople meets systems it does not control.

---

## Required Context

- [`.agent/context/integration-patterns.md`](../context/integration-patterns.md)
- [`.agent/context/backend-architecture.md`](../context/backend-architecture.md)
- [`.agent/context/tenant-context.md`](../context/tenant-context.md)
- [`.agent/context/audit-events.md`](../context/audit-events.md)
- [`.agent/context/deployment-runtime.md`](../context/deployment-runtime.md) —
  for credentials and environment registration
- [`.agent/context/testing-architecture.md`](../context/testing-architecture.md)

Plus `docs/qa/known-bug-patterns/` entries on duplicate processing and
idempotency.

## Task-Specific Discovery

Read the existing connector, gateway service or webhook handler before adding
one. There is an established registry/pipeline shape — extend it rather than
forking it.

## Staleness Rule

Code wins. External-system behaviour is not in the repository at all, so state
plainly which claims come from vendor documentation rather than this codebase,
and mark them as unverified against runtime.

---

## Owns

Device connectors, the on-premise .NET gateway contract, ingestion pipelines,
webhooks, outbound email delivery, queue and background integration work,
retries, idempotency, integration error handling and observability, credential
handling for external systems.

## Does not own

Domain rules that consume ingested data (Backend/API). Schema for integration
tables (Database). Approving its own work.

---

## The rules that matter most here

### Idempotency first

Anything that can be retried **will** be retried: webhooks redeliver, devices
resend, queues re-process, operators re-run. Every handler must be safe to run
twice with the same input and produce one business effect.

Establish the dedupe key before writing the handler. If there is no natural
external identifier, that is a design problem to solve, not to defer.

### Retries must not duplicate business effects

A retry that creates a second attendance record, a second payment or a second
notification is worse than a failure. Separate "receive and store raw" from
"apply business effect", so a retry of the first cannot repeat the second.

### Tenant context must survive the boundary

Inbound integration payloads arrive without a request context. The tenant must
be resolved from the credential, device registration or gateway identity —
**never from the payload body**. An external system asserting its own tenant id
is the same defect as a client asserting one.

### The gateway contract is deployed software

The .NET gateway runs on customer premises and is not upgraded in lockstep.
Changing its contract is a breaking change for installations you cannot see.
Version or additively extend; do not repurpose fields.

### Secrets

Third-party credentials go through the encryption service. Never log a
credential, token or full request body containing one. New environment
variables must be registered everywhere the deployment expects them — see
`deployment-runtime.md`.

### Failures must be observable

An integration that fails silently is indistinguishable from one that never ran.
Record failures through the error/event infrastructure with enough context to
identify the tenant, the external entity and the attempt — without leaking
credentials.

### Timeouts and limits are explicit

No unbounded outbound call. No unbounded retry loop. State the timeout, the
retry count, the backoff and the give-up behaviour, and what the system does
with the record when it gives up.

### External identifiers stay traceable

Persist the external system's identifier alongside the local record. Without it,
reconciliation after an incident is guesswork.

---

## Prohibitions

- No integration handler without an idempotency story.
- No tenant derived from an untrusted payload.
- No credential in logs, error payloads or audit snapshots.
- No breaking change to the gateway contract without a compatibility plan.
- No silent catch-and-continue.
- No direct email send from a domain service — go through the notification
  pipeline.

---

## Definition of done

- [ ] Idempotency key identified and enforced
- [ ] Retry behaviour explicit; retries cannot double-apply
- [ ] Tenant resolved from a trusted source
- [ ] Timeouts and give-up behaviour defined
- [ ] Failures observable, with tenant and external id, without secrets
- [ ] External identifiers persisted
- [ ] Backward compatibility assessed for deployed gateways and agents
- [ ] Tests cover duplicate delivery, timeout and malformed payload
- [ ] Validation run per `testing-architecture.md`; live-service limitations
      stated honestly
