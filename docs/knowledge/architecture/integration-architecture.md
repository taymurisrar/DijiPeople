# Integration Architecture

> Generated from repository evidence at `ad8f77f`.

Where DijiPeople meets systems it does not control: attendance devices, the
on-premise .NET gateway, Stripe billing, outbound email, and queue-driven
background work.

## The gateway is deployed software you cannot reach

`gateway/` is a .NET solution that runs **on customer premises** and is not
upgraded in lockstep with the platform. Changing its contract is a breaking
change for installations nobody can see.

Version or extend additively. Never repurpose a field. This is why
[[api-architecture]]'s backward-compatibility rule is stated as a hard
constraint rather than a preference.

## Idempotency is the first design question, not the last

Anything that can be retried **will** be: webhooks redeliver, devices resend,
queues re-process, operators re-run. Every handler must be safe to run twice
with the same input and produce **one** business effect.

Establish the dedupe key before writing the handler. If there is no natural
external identifier, that is a design problem to solve, not to defer.

Separate "receive and store raw" from "apply business effect", so a retry of the
first cannot repeat the second. A retry that creates a second attendance record,
a second payment or a second notification is worse than a failure.

The clearest illustration in this repository is internal rather than external:
`identities-and-billing` is non-retryable precisely because replaying it would
create a second owner and a second invoice — and that non-retryability is what
makes a failed tenant unrecoverable,
[[BUG-0015-a-tenant-that-fails-before-identities-and-billing-is-unrecoverable]].
**Idempotency is not a nicety; its absence removes recovery options.**

## Tenant context must survive the boundary

Inbound payloads arrive with no request context. The tenant is resolved from the
**credential, device registration or gateway identity — never from the payload
body**. An external system asserting its own tenant id is the same defect as a
client asserting one. See [[multi-tenancy]].

## Secrets

Third-party credentials go through `SecretEncryptionService`;
`SECRET_ENCRYPTION_KEY` is mandatory in production. Never log a credential,
token, or a full request body containing one. New environment variables are
registered in `packages/config` validation, `turbo.json` `globalEnv`,
`render.yaml` and `docs/environment-variables.md` — all four.

## Failures must be observable

An integration that fails silently is indistinguishable from one that never ran.
Record failures through the error and event infrastructure with enough context
to identify the tenant, the external entity and the attempt — without leaking
credentials.

No unbounded outbound call. No unbounded retry loop. State the timeout, retry
count, backoff, give-up behaviour, and what happens to the record when it gives
up.

Persist the external system's identifier alongside the local record; without it,
reconciliation after an incident is guesswork.

## Current state

Stripe billing is a **stub in code** and was not testable in the 2026-08-15 E2E.
Partner-portal lead submission routes are permanent 403 stubs. Both are recorded
as untested rather than as working.

## Related

[[system-architecture]] · [[api-architecture]] · [[multi-tenancy]] ·
[[deployment-architecture]] · [[billing]]

Source: `.agent/context/integration-patterns.md`,
`.agent/agents/integration.md`, root `AGENTS.md`, QA run 2026-08-15.
