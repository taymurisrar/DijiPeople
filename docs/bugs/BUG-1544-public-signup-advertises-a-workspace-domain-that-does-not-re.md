---
ID: BUG-1544
aliases: [BUG-1544]
Title: Public signup advertises a workspace domain that does not resolve
Status: OPEN
Severity: HIGH
Priority: P1
Type: UX
Source: QA_RUN
DetectedDate: 2026-08-26
DetectedInSha: 21032ae
AffectedModules: [tenant-domains, leads]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-26
UpdatedAt: 2026-08-27
ResolvedAt:
---

# BUG-1544 — Public signup advertises a workspace domain that does not resolve

> **Architect triage, 2026-08-27 — `FIX_NOW`.** Misinforms a buyer at the moment of purchase. Cheap to correct.


## Summary

Step 2 of public signup shows the prospective customer a workspace address of
the form `<slug>.dijipeople.com` and tells them it "is available". That domain
does not resolve. The workspace is actually served from
`<slug>.ws.dijipeople.com`, which the success page and the provisioned tenant
both use correctly — so the only wrong statement is the one made to the customer
while they are deciding to buy.

## Expected Behavior

The address offered during signup is the address the workspace will be served
from, and an availability check confirms that address.

## Actual Behavior

Signup advertises `<slug>.dijipeople.com` and asserts availability for it. That
hostname has no DNS record. The real workspace is served from
`<slug>.ws.dijipeople.com`.

## Reproduction

1. Begin a signup on `www.dijipeople.com`.
2. Reach step 2 and enter a workspace slug.
3. Note the address shown and the availability assertion.
4. Resolve both `<slug>.dijipeople.com` and `<slug>.ws.dijipeople.com`.

## Evidence

Observed on production, 2026-08-26:

- `nslookup` on `<slug>.dijipeople.com` does not resolve.
- `nslookup` on `<slug>.ws.dijipeople.com` resolves; the wildcard TLS
  certificate covering `*.ws.dijipeople.com` was independently verified as
  genuine.
- The signup success page and the provisioned tenant
  `qa-e2e-signup-b-20260826.ws.dijipeople.com` both use the `.ws.` form, which
  serves and redirects correctly (307 to `/login`).

## Root Cause

**Established 2026-08-27.** The landing app reads its workspace hostname from
`getPlatformDomainConfig`, which takes the first of `TENANT_BASE_DOMAIN`,
`NEXT_PUBLIC_TENANT_BASE_DOMAIN`, `NEXT_PUBLIC_TENANT_ROOT_DOMAIN`,
`WEB_APP_PROD_ROOT_DOMAIN` or `NEXT_PUBLIC_WEB_ROOT_DOMAIN` — and **falls back
to the marketing apex when none is set**.

`docs/environment-variables.md` declared none of them for the landing
deployment. So production composed `<slug>.dijipeople.com` from the fallback,
displayed it, and asserted it was available.

That fallback is the reason this is silent. An unset variable produces a
plausible hostname rather than an obviously missing one, so nothing looks wrong
until someone resolves it.

Same family as [[BUG-1644]], which is the same missing configuration seen from
`apps/web`, where the consequence is worse: there it breaks login rather than a
display string.

## Impact

A customer is told their workspace will live at an address that will never
work, at the moment they are deciding to pay. They may record it, share it with
colleagues, or configure against it. The workspace itself is fine, so the damage
is misinformation and support load rather than a broken product.

An availability check that asserts a result for a hostname nobody serves is also
not a meaningful check, whatever it currently queries.

## Affected Areas

- `apps/landing` — signup step 2
- `services/api/src/modules/tenant-domains`
- `services/api/src/modules/leads` — signup intake

## Proposed Resolution

Make the signup step display and check the same hostname the provisioning path
will use. The `.ws.` form is the working one and the tenant record already
agrees with it, so the signup step is the side to change.

Confirm what the availability check actually queries before changing the
display string — a check against the wrong hostname would keep returning
"available" for the right one too.

## Acceptance Criteria

- Signup displays `<slug>.ws.dijipeople.com`, matching the success page and the
  provisioned tenant.
- The availability assertion refers to the hostname that will be served.
- A slug already in use is reported unavailable.

## Regression Coverage

None yet. Needs a test asserting that the hostname signup displays equals the
hostname provisioning assigns. Requires a `REG-nnn` entry once written.

## Dependencies

None.

## Related Items

Found in the same production admin E2E pass as [[BUG-1515]] and [[BUG-1516]].
Independent of both.

## Resolution

Partially fixed 2026-08-27 on `agent/invitation-delivery-visibility`; the
remainder is a deployment change only.

`docs/environment-variables.md` now declares
`NEXT_PUBLIC_TENANT_BASE_DOMAIN=ws.dijipeople.com` for the landing deployment,
which previously declared no tenant domain at all, and corrects
`NEXT_PUBLIC_WEB_ROOT_DOMAIN` from `dijipeople.com` to `ws.dijipeople.com` for
both web and admin. A note above the three blocks explains what each reads, what
breaks when it is wrong, and that `NEXT_PUBLIC_*` needs a rebuild rather than a
restart.

That matters because the documented values were the wrong ones: a deployment
configured from this reference reproduced both this defect and [[BUG-1644]]
exactly.

**Not closed, because no code change can close it.** The variable has to be set
on the landing Vercel project and that project redeployed. Until then signup
keeps advertising a hostname that does not resolve.

## QA Retest

Not yet retested. Retest by running a signup to step 2 and resolving the
hostname shown.

## History

- 2026-08-26 — found during the production admin E2E pass; recorded from the
  session transcript, where it had existed only as prose.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[workspace-routing-and-domains]], [[leads]]

<!-- GRAPH:END -->
