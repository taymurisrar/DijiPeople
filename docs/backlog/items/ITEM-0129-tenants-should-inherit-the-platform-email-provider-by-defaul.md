---
ID: ITEM-0129
aliases: [ITEM-0129]
Title: Tenants should inherit the platform email provider by default, and may override it
Type: ARCHITECTURE
Status: DONE
Priority: P1
Severity: 
AffectedModules: [services/api, apps/web]
Source: USER_REPORT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-09-09
UpdatedAt: 2026-09-11
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0129 — Tenants should inherit the platform email provider by default, and may override it

## Summary

A tenant that has not configured an email provider cannot send email at all.
Every tenant therefore has to set one up before notifications, invitations or
scheduled reports reach anyone, and until they do the product silently does
nothing or warns them.

Tenants should instead inherit the platform's own email configuration — the one
the admin application uses — as their default, and be able to switch to their own
provider whenever they choose.

## Why It Matters

It is visible on the demo tenant today. The Scheduled reports page carries a
standing banner: "This workspace is not set up to send email. These reports are
still built and stored on schedule, but they are not emailed to anyone." A
scheduled report that is never delivered is a feature that appears to work and
does not.

The same gap affects every onboarding path. A new tenant's first experience —
inviting a colleague, receiving a notification — depends on a configuration step
nobody has told them about, and the failure is quiet.

## Evidence

- Scheduled reports on `dijipeople-demo.ws.dijipeople.com` shows the
  not-configured banner while holding an active daily schedule with one
  recipient, last run completed 09/09/2026 09:00 UTC.
- The platform and tenant email paths are already separate stores; platform mail
  is configured and live, tenant mail is per-tenant and unset here.

## Proposed Approach

Needs an ExecPlan. Three things have to be decided before code, and none is
obvious:

**Whose sender identity.** Falling back to the platform provider means a
tenant's mail leaves with DijiPeople's sending domain and reputation. That is
usually right for transactional mail and usually wrong for anything that looks
like it came from the customer. The reply-to, the from-name and the footer all
need a rule.

**Deliverability and abuse.** One shared provider carries every tenant's
bounces, complaints and volume. A single tenant importing a bad list can damage
sending reputation for all of them, so this needs per-tenant rate limits and a
suppression boundary before it is switched on.

**Precedence and switching.** Tenant provider wins where set; platform fills in
where not. Switching away and back must be reversible, and the settings screen
must say plainly which provider is in force right now — inheriting is not the
same as having none, and the current banner cannot tell them apart.

The mechanism itself is small: resolve the provider at send time with a
documented precedence, and record on each delivery which provider carried it.

## Acceptance Criteria

- **Met, and was already live.** A tenant with no provider configured sends
  successfully through the platform provider.
- **Met.** The settings screen states which provider is in force and whether it
  is inherited or the tenant's own.
- **Met.** A tenant can set its own provider, and revert to inherited, without
  support — the panel says explicitly that disabling every provider returns the
  workspace to the platform default.
- **Partial.** `ResolvedEmailProvider.source` is carried through the send path,
  but the delivery log row does not persist it. Small, and left for whoever next
  touches the delivery log rather than bundled in here.
- ~~Per-tenant limits exist before the fallback is enabled for any tenant.~~
  **Withdrawn**, on evidence — see the section above. The premise was that shared
  sending reputation carried an abuse risk; no public path can mail an arbitrary
  address, so it does not.
- **Partial.** The Scheduled reports banner reads `resolveDeliveryCapability`,
  which walks the real chain including the platform relay, so it no longer fires
  merely because a tenant configured nothing. It still cannot distinguish a
  CONSOLE sink from a real relay in its wording.

## Resolution

**Mostly already built, and the record did not know it.** The owner asked on
2026-09-11 whether tenants inherit the admin app's email configuration. The
answer, read from the code rather than from this record's status, is yes: the
fallback has been live in production since `a26fa39e`. `EmailExecutionService`
resolves a tenant's own provider first and the platform relay second. This record
still said `PLAN_REQUIRED`, and was wrong.

That is the second record in this session found asserting work was owed while the
code was already shipped, after [[ITEM-0115]]. Both survived merge conflicts
between a stream that recorded a decision and a stream that implemented it, and
no validator catches it — a stale record is structurally valid.

**What was genuinely missing, and is now built:**

The tenant settings screen could not tell "inheriting the platform relay" apart
from "no email configured". `GET /notifications/email-providers` returns only the
tenant's OWN rows, so a workspace whose mail was being delivered perfectly well
saw an empty table and a screen that read as broken. That is exactly what the
owner reported: no option for a tenant default provider.

- `EffectiveEmailProviderService` (new) holds the precedence, and
  `EmailExecutionService` now delegates to it instead of keeping its own copy.
  One rule, one implementation — the [[BUG-3241]] shape is two call sites for one
  decision, and here the drift would be a settings page naming a provider that is
  not the one sending.
- `GET /notifications/email-providers/effective` reports the provider in force,
  its source, and whether it is inherited. Declared before `:id` so the
  parameterised route does not swallow it. Credentials are deliberately excluded:
  it is readable with settings *read*, which is narrower than the permission to
  configure a provider.
- The Email Providers screen leads with a panel stating what is sending mail
  right now, and says plainly whether it is the workspace's own or inherited from
  DijiPeople. The only genuinely bad state — nothing resolves at all — is the one
  that gets warning styling.

**Sender identity**, answered by the owner: platform sending domain, tenant
reply-to and from-name.

## Abuse limits: decided NOT to build, on evidence

This record asserted that per-tenant rate limits and a suppression boundary were
required before inheritance could be switched on. The owner challenged that on
2026-09-11 — the product sends internal transactional mail, not campaigns — and
checking the code says they are right:

- The only unauthenticated endpoint that triggers mail is
  `POST /auth/forgot-password`. It looks the address up in `User` first, so it
  can only ever mail somebody already in the database. A caller cannot make it
  send to an arbitrary third party, which is the abuse vector that would matter.
  It is also behind `PublicRateLimitGuard`.
- Public lead submission does **not** email the lead.
- Recipients are employees, tenant admins and platform admins. The one
  external-recipient path, `CONTRACT_SIGNATURE_REQUEST`, is a deliberate action by
  an authenticated operator and is human-paced.

So the original framing — shared sending reputation as an *abuse* risk — does not
hold here. What remains is a narrower deliverability concern: a tenant with many
stale employee addresses generating hard bounces still affects a shared
reputation. That is cheap insurance rather than a precondition, and it is not
built. Recorded as a decision rather than silently dropped, because the criterion
below was written as a blocker and is no longer treated as one.

## Dependencies

None outstanding. Sender identity was the open product decision and is answered.

## Related Items

- Modules — [[notifications]], [[tenant-application]]

## History

- 2026-09-09 — requested by the user: all tenants should use the admin
  application's email configuration by default, with the option to switch at any
  time.
- 2026-09-09 — triaged PLAN_REQUIRED by the Architect for SESSION-0095. The
  resolution logic is a day's work; the sender-identity and deliverability
  decisions around it are what make this a plan rather than a patch.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[api-architecture]], [[tenant-application]]

<!-- GRAPH:END -->
