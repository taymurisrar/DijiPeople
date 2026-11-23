# Runbook: credential rotation cutover (generic)

> **Drill status: NOT YET DRILLED.** No rotation was performed in writing this.

Applies to any secret: database URL, per-client JWT secrets, `SECRET_ENCRYPTION_KEY`, Stripe keys, platform tokens. No secret values belong in repo docs, tickets, logs or chat.

## Detection / trigger
Suspected exposure, personnel change, provider notice, or a schedule. Exposure is an incident: [incident-response](../../deployment/incident-response.md).

## Triage
1. Inventory consumers: `docs/environment-variables.md`, `render.yaml`, Vercel env, the gateway, the agent desktop. `render.yaml` is not synced to the live service, so read the live service rather than assuming.
2. `SECRET_ENCRYPTION_KEY` is special: changing it without re-encrypting stored integration credentials makes them unreadable. Plan the re-encryption first and escalate to the owner.
3. Rotating a JWT secret invalidates sessions for that client (`web`, `admin`, `agent-desktop`); users must sign in again.

## Action (overlap pattern)
1. Create the new credential at the provider; keep the old one valid.
2. Set the new value on each consuming service. This redeploys it: owner approval for production.
3. Verify health and a real authenticated flow.
4. Only then revoke the old credential at the provider.
5. Record the rotation (date, scope, who) without values.

## Verification
`/api/health` OK; platform health components OK; `node scripts/smoke-login.mjs` passes; `node scripts/webhook-delivery-health.mjs` is not BLOCK for Stripe.

## Rollback
Before step 4 the old credential still works: restore the old value. After revocation there is no rollback; issue another new credential.
