---
ID: ITEM-0006
aliases: [ITEM-0006]
Title: ADR needed — one source of truth for the tenant base domain
Type: ARCHITECTURE
Status: READY
Priority: P2
Severity: MEDIUM
AffectedModules: [packages/config, services/api, apps/web, apps/admin, apps/landing]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: PLAN_REQUIRED
CreatedAt: 2026-08-15
UpdatedAt: 2026-08-15
RelatedBug: BUG-0017
RelatedQA: docs/qa/runs/2026-08-15-commercial-onboarding-e2e-7bbab3d.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0006 — ADR needed: one source of truth for the tenant base domain

## Summary

The architectural half of [[BUG-0017]]. The tenant base domain has two declared
sources — a `tenant-provisioning` PlatformSetting the admin UI edits, and the
environment variables `packages/config/platform-domains.js` reads — and the
operator-facing one is inert.

## Why It Matters

`platform-domains.js` is consumed by the API **and all three Next.js apps**. A
frontend has no Prisma client, so it cannot read a PlatformSetting; that
constraint is what makes this an architecture decision rather than a bug fix. Any
answer changes four deployables, which is precisely the change class `PLANS.md`
says needs a written decision first.

## Evidence

`packages/config/platform-domains.js` `getPlatformDomainConfig(env = process.env)`
resolves `tenantBaseDomain` from five environment variables and nothing else.
`TenantProvisioningService.settings()` resolves it from the PlatformSetting
first. See [[BUG-0017]] for the full trace.

## Proposed Approach

An ADR in `docs/decisions/` choosing one of:

1. **API injects.** The API resolves the base domain and passes it into
   `buildWorkspaceHostname` at the call site; `platform-domains.js` stays
   env-only for the frontends. Smallest change; leaves two readers with one
   authority.
2. **Env-only everywhere.** Remove the admin control and document the base
   domain as deployment configuration. Simplest model; loses an operator
   capability someone deliberately built.
3. **Publish at deploy time.** The setting is written into the environment by
   the release process. One reader, but adds a deploy-time coupling and a window
   where the setting and the environment disagree.

## Acceptance Criteria

An ADR exists, names the chosen option and its cost, and [[BUG-0017]] can be
closed against it — either by making the control work or by removing it.

## Dependencies

None. Blocks [[BUG-0017]].

## Related Items

[[BUG-0017]] · architecture [[tenant-workspace-routing|Tenant Workspace Routing]] ·
requirement [[requirement-tenant-workspace-domains|Tenant Workspace Domains]] · modules [[tenant-provisioning|Tenant Provisioning]],
[[settings|Settings]].

## History

- 2026-08-15 — split out from BUG-0017 so the decision is tracked separately
  from the defect it must resolve.

- 2026-08-15 — Architect triage: PLAN_REQUIRED. This one genuinely is an architecture decision and not a defect: a frontend has no Prisma client, so it cannot read a PlatformSetting, and any answer changes four deployables. The ADR is the work item. It blocks BUG-0017 and nothing else.
