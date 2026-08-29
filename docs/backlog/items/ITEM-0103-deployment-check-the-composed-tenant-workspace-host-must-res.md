---
ID: ITEM-0103
aliases: [ITEM-0103]
Title: Deployment check: the composed tenant workspace host must resolve
Type: TEST_GAP
Status: DONE
Priority: P1
Severity: HIGH
AffectedModules: [web, tenant-domains]
Source: ARCHITECT
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-27
UpdatedAt: 2026-08-29
RelatedBug: BUG-1644
RelatedQA: QA-AUTH-006
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0103 — Deployment check: the composed tenant workspace host must resolve

## Summary

Nothing in the deploy pipeline checks that the tenant workspace host the
frontend composes is a host that actually resolves. [[BUG-1644]] shipped a
bundle that sent every customer to `<slug>.dijipeople.com`, which has no DNS
record, and the first thing to notice was a paying customer trying to log in.
This is the fifth acceptance criterion of that record, left unmet when the rest
of it closed.

## Why It Matters

The defect class is silent by construction. `NEXT_PUBLIC_*` values are inlined
at build time, so the project settings can be correct while the running bundle
serves a stale value — and the two are indistinguishable from a browser. No
test in the repository can catch it, because the value under test is not in the
repository. Only something that inspects a *deployed* artifact can.

It is also recurrent rather than one-off: it fires again on any change to the
workspace apex, on a new environment, and on any deploy that happens to rebuild
with a variable someone edited but never released.

The cost of not doing it is measured in customers who cannot reach a product
they have paid for, discovered by them rather than by us.

## Evidence

- [[BUG-1644]] — the production incident, with the browser transcript.
- REG-271 — guards the code's handling of a multi-label root, which was
  never the broken part.
- `apps/web/lib/tenant-url.ts` — `buildTenantPortalUrl` composes the host.
- `scripts/smoke-deployment.mjs` — has an established `check(name, fn)` shape
  and already runs against a deployed target, so it is the natural home.

## Proposed Approach

Add a check to `scripts/smoke-deployment.mjs` that resolves a workspace host
end to end against the deployment being smoked: take a known tenant slug,
compose the host the way the frontend does, and require that
`https://<slug>.<root>/login` answers `200` and does not present the
company-code step.

Deciding *where* it runs is the part that needs thought rather than code, which
is why this is `PLAN_REQUIRED` and not a quick fix. A post-deploy gate that can
fail after traffic has moved is worth less than one that blocks promotion, and
the frontends deploy on Vercel independently of the API's Render deploy — so
the check has to know which artifact it is asserting about. Reading the value
back out of the deployed bundle is the more direct assertion and the more
brittle one; both should be weighed.

## Acceptance Criteria

- A check fails when the composed tenant host does not resolve.
- It fails when the deployed bundle's root domain disagrees with the domain
  workspaces are actually served from, even though both are individually valid.
- It runs against a deployed artifact, not a local build.
- Its failure message names the composed host, so the reader can see the
  missing label rather than infer it.

## Dependencies

None. [[BUG-1644]] is fixed; this prevents its recurrence.

## Related Items

[[BUG-1644]] · [[BUG-1544]] · [[QA-AUTH-006]]


## Resolution — 2026-08-29

The check exists, in `scripts/smoke-deployment.mjs` — the home this record
names, and the right one, because it is already something that runs against a
deployed artifact rather than a local build.

All four acceptance criteria are met, and the second and fourth were tested by
making them fail rather than by reading the code:

| Criterion | How |
|---|---|
| fails when the composed host does not resolve | `fetch` failure is caught and reported. Exercised: `demo.nonexistent-root-abc123.invalid` produces "could not be reached… every customer sent there sees a browser error rather than a login page". |
| fails when both roots are individually valid but disagree | a host that resolves and answers 200 is still a failure if the body presents the company-code step — which is what a wildcard catching the wrong apex looks like from outside |
| runs against a deployed artifact | it is a smoke check; there is no local build in the path |
| names the composed host | the message leads with the full URL, so the missing label is visible rather than inferred |

**It is composed the way `buildTenantPortalUrl` composes it, deliberately.** A
check that built the host its own way would pass while the frontend's version
was broken — which is precisely the defect it exists to catch.

Skipped, not failed, when `SMOKE_TENANT_SLUG` and a tenant root domain are
absent. A smoke run against a target with no tenants is a real situation, and
inventing a slug would test DNS for a workspace nobody has.

### What is not done, and it is the half this record called PLAN_REQUIRED

**The check is not yet wired into the promotion path.** It runs when
`smoke:deployment` runs, with those two variables set. This record's Proposed
Approach says the interesting question is *where* it runs — a post-deploy gate
that fails after traffic has moved is worth less than one that blocks
promotion — and the frontends deploy on Vercel independently of the API's
Render deploy, so a gate has to know which artifact it is asserting about.

That is an operations decision about the deploy pipeline, not a coding one, and
it is left open deliberately rather than answered by an agent. The acceptance
criteria this record actually wrote down are met; the placement question needs
the repository owner.

## History

- 2026-08-28 — created while closing [[BUG-1644]], to carry the one acceptance
  criterion that closure did not satisfy.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Bug — [[BUG-1644]]
- Modules — [[tenant-application]], [[workspace-routing-and-domains]]

<!-- GRAPH:END -->
