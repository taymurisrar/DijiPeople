---
ID: ADR-0015
aliases: [ADR-0015]
Title: Production retires sink email providers, tenants fall back to the platform relay, and default templates ship with real copy
Status: ACCEPTED
CreatedAt: 2026-09-13
UpdatedAt: 2026-09-13
---
# ADR-0015 — Production retires sink email providers, tenants fall back to the platform relay, and default templates ship with real copy

## Status

Accepted — 2026-09-13, by the product owner during the second demo walkthrough.
Tracked as [[BUG-3500]] and [[BUG-3501]].

## Context

Tenant email is resolved per tenant by the notifications email provider factory:
the tenant's own enabled provider, then the platform relay, then — outside
production only — a console sink. On production the demo tenant's only provider
is a `CONSOLE` provider, enabled and default. It writes rendered mail to the
server log and delivers nothing, while the Providers screen says "Email is sent
by this workspace's own provider … over CONSOLE".

Separately, every seeded email template is `ACTIVE` with a placeholder body:
"This is a system placeholder email template. Configure tenant-specific content
before production sending."

The owner was asked three linked questions: whether sink providers stay usable
in production, what happens to existing ones, and what production sends before
the owner has reviewed drafted copy.

## Decision

1. **`CONSOLE` and `DEV` providers cannot be created in production.**
2. **Existing `CONSOLE`/`DEV` provider rows are not used in production.** A
   tenant whose only providers are sinks falls back to the platform relay, so
   real email is delivered.
3. **Default templates ship with real, professional copy, `ACTIVE`**, drafted by
   the Architect and released with the provider change; the owner reviews the
   copy afterwards.
4. The Providers screen states the actual delivery path in plain terms.

## Reasons

- A production workspace that silently delivers nothing is worse than one that
  delivers: activation, password reset and approval mail all depend on it.
- Shipping the provider change without real copy would mail placeholder text to
  real people; shipping both together avoids that.

## Alternatives Considered

- **Keep existing console providers, block only new ones.** Rejected by the owner.
- **Deactivate placeholder templates until reviewed.** Rejected by the owner in
  favour of shipping the drafted copy.
- **Hold back the provider change until the copy is reviewed.** Rejected.

## Consequences

- The demo tenant starts sending real email after release, including the daily
  scheduled report to the workspace owner. Demo employee addresses use the
  non-deliverable `@demo.dijipeople.com` domain.
- Sink providers remain available in development and test environments.
- Because Render's pre-deploy step runs `seed:config` on every deploy, template
  copy changes delivered through `seed-config` reach every environment on the
  next deploy; tenant-cloned templates must not be overwritten.

## Migration / Compatibility Impact

No schema change is required by the decision itself. Seeded system templates are
updated in place by key; tenant clones and tenant-authored templates are left
untouched. Existing sink rows may be left in the database but are ignored by
provider resolution in production, or disabled by a one-off, idempotent step.

## Security / Tenant Impact

Delivery moves from a log sink to a real relay, so message content (activation
and password-reset links) now leaves the system as intended. Provider resolution
remains per tenant, keyed by `tenantId`. No secret is logged.

## Agent Rules

- Never make a sink provider selectable or effective in production.
- Never ship an `ACTIVE` template whose body is placeholder text; a seed check
  must fail on it.
- Updating seeded template copy must not overwrite a tenant's own template.

## Related Modules

`notifications` (email providers, templates, delivery logs), `apps/web`
notification settings, `services/api/prisma/seed-config.ts`.

## Related Features

Tenant email delivery; Settings → Notifications → Providers and Templates.

## Related

- [[BUG-3500]] — placeholder template bodies.
- [[BUG-3501]] — the provider screen and sink providers.
- [[BUG-3379]] — delivery log rows that explain nothing.
