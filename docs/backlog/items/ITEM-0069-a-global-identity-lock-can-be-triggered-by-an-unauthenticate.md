---
ID: ITEM-0069
aliases: [ITEM-0069]
Title: A global identity lock can be triggered by an unauthenticated attacker
Type: SECURITY
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [auth, users]
Source: SECURITY_REVIEW
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-20
UpdatedAt: 2026-08-20
RelatedBug:
RelatedQA:
RelatedADR:
RelatedImplementation: TASK-0010
TargetMilestone:
BlockedBy:
---

# ITEM-0069 — A global identity lock can be triggered by an unauthenticated attacker

## Summary

TASK-0009 WP-04 added a **global** lockout on `Identity`: 20 failed attempts
locks the person for 60 minutes. WP-06 then added
`POST /auth/discover-workspaces`, which is public and counts its failures
against that same counter.

Together those mean **anyone who knows an address can lock its owner out of
every workspace**, from an unauthenticated endpoint, with twenty requests.

Found by the WP-10 security review of this parent's own work. It is a deliberate
trade-off rather than an oversight, and it is filed so the trade-off is visible
rather than assumed.

## Why it was built this way

The counter has to exist. Discovery is unauthenticated, so without it the
endpoint is an unlimited password-guessing surface — and one that bypasses the
per-tenant lockout entirely, because at that point in the flow there is no
tenant to take a policy from.

The counter also has to be on the account rather than the request.
`login-lockout.service.ts` already says why, and the reasoning is unchanged:
*"Counting per address would be avoided by rotating addresses, which is exactly
what an attacker does."* An IP-keyed limit alone is defeated by a botnet; an
account-keyed one is not.

So the choice was between "an attacker can guess passwords indefinitely" and
"an attacker can lock somebody out for an hour". The second is the lesser harm,
and it is the same trade the per-tenant lockout already makes.

## Why it is still worth fixing

The global lock is **strictly worse than the per-tenant one in blast radius**.
Per-tenant, a victim loses one workspace and can still work in another. Global,
they lose everything, including the ability to reach the workspace picker.

Current numbers, for whoever picks this up:

| Control | Threshold | Duration |
|---|---|---|
| Per-tenant lockout (`User`) | 5 attempts, tenant-configurable | 30 min default |
| Global lockout (`Identity`) | 20 attempts, fixed | 60 min |
| Public rate limit, per IP and path | 20 writes | 10 min |

The global threshold is deliberately four times the per-tenant default so it is
materially harder to trigger, and the public rate limit means a single IP cannot
reach it inside one window. Neither stops a distributed attempt.

## Proposed Approach

Needs a plan rather than a patch: every option trades usability against
resistance, and where to sit on that curve is a product decision.

1. **Do not let the unauthenticated path cause the lock.** Count discovery
   failures separately, so they throttle *discovery* without incrementing the
   credential counter that governs real sign-ins. An attacker then cannot lock
   anybody out through it, and guessing stays bounded.
2. **Proof-of-work or CAPTCHA** on discovery after a few failures for one
   address. Costs an integration and a dependency.
3. **Notify on lock.** Prevents nothing, but turns a silent denial of service
   into something the victim can act on, and is cheap.

Options 1 and 3 together are probably the answer. Option 1 alone leaves the same
question open for `/auth/login`, which has the identical shape and predates this
parent.

## Acceptance Criteria

- An unauthenticated caller cannot cause a lock that prevents the legitimate
  holder from signing in.
- Password guessing through the public endpoints stays bounded.
- Whatever is chosen also applies to `/auth/login`, which has the same shape.

## Evidence

- `services/api/src/modules/users/identity.service.ts` —
  `GLOBAL_ATTEMPTS_BEFORE_LOCK = 20`, `GLOBAL_LOCK_MINUTES = 60`,
  `registerIdentityFailure`.
- `services/api/src/modules/auth/auth.service.ts` — `discoverWorkspaces` calls
  `verifyIdentityCredential`, which registers the failure.
- `services/api/test/workspace-discovery-auth.e2e-spec.ts` — *"counts failures
  against the person, so guessing here is not free"* demonstrates the lock being
  reached through the public path.

## Related Items

- [[TASK-0009]] — the parent that introduced it, and whose WP-10 found it.
- [[ITEM-0062]] — the architecture decision underneath.

## Resolution — 2026-08-20, TASK-0010

**Separation, not removal.** Discovery has its own counter now:
`Identity.discoveryFailedAttempts` and `discoveryBlockedUntil`, 10 attempts and
a 15-minute block. Exhausting it blocks *discovery*; the credential lock is
untouched.

The counter could not simply be deleted — discovery has no tenant, so without
one it is unlimited password guessing that the per-tenant lockout never sees.
And it could not move to the request, for the reason `login-lockout.service.ts`
already gives: counting per address is avoided by rotating addresses.

So the three properties now hold together:

- guessing through the public endpoint stays bounded;
- the victim can still sign in at their workspace URL, because the credential
  lock is untouched;
- the worst a stranger can do is take away the generic login screen from one
  address for fifteen minutes.

**That last line is the residual harm, and it is real** — somebody who knows
their email but not their workspace URL is inconvenienced. It is a different
order of thing from being locked out of the product, which is what this item was
filed about.

Thresholds are lower than the credential lock's (10/15min against 20/60min)
precisely because this one is cheaper to trigger: anybody can drive the
endpoint, so its bound has to assume anybody will, and the cost of being wrong
falls on a legitimate person.

Mutation-checked: putting `registerIdentityFailure` back in discovery's path —
recreating the weapon exactly — fails the test that names it.

**Notify-on-lock was not built.** `PlatformCommunicationsService` exists but has
no email provider configured, so a notification would fail silently in
production. Filed as part of that provider's own work rather than shipped as
something that looks like a safeguard and is not.

Regression: `services/api/test/workspace-discovery-auth.e2e-spec.ts` — "bounds
guessing without touching the credential the victim signs in with".
