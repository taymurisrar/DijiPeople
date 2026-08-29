---
ID: ITEM-0079
aliases: [ITEM-0079]
Title: Activation does not gate on a workspace having any module enabled
Type: PRODUCT_DECISION
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [services/api/src/modules/tenant-control-plane]
Source: QA_RUN
OwnerAgent: architect
ArchitectDisposition: DONE
CreatedAt: 2026-08-22
UpdatedAt: 2026-08-29
RelatedBug: 
RelatedQA: 
RelatedADR: 
RelatedImplementation:
TargetMilestone: 
BlockedBy: 
---

# ITEM-0079 — Activation does not gate on a workspace having any module enabled

## Summary

`TenantControlPlaneService.changeStatus` refuses activation for two reasons, and
its own comments say why each one matters:

> Activating a workspace nobody can administer produces a tenant its own
> customer cannot sign in to.

> Activating a workspace nobody can reach produces a tenant whose owner is told
> it is live and finds nothing at the address.

Readiness names a **third** way a workspace can be live and useless — *"No module
is enabled, so the workspace has nothing a user can open"* — and marks it
`BLOCKER`. The activation gate does not check it. The filter is explicit about
which blockers it enforces:

```ts
['workspace-slug', 'workspace-domain', 'workspace-routing'].includes(check.key)
```

So a tenant can be activated, its owner can sign in successfully, and there is
nothing for them to open.

## Why It Matters

The two gated cases and this one are the same failure told three ways: the
customer is told their workspace is live and finds it is not usable. Two are
refused on the way in; the third is not.

It is also the least visible of the three, because it is the only one that
produces a *working* sign-in. An owner who cannot reach the address knows
something is wrong. An owner who signs in to an empty workspace files a support
case about the product being broken.

## Evidence

- `services/api/src/modules/tenant-control-plane/tenant-control-plane.service.ts`
  — the `dto.status === TenantStatus.ACTIVE` branch of `changeStatus`: the owner
  check, then a readiness call filtered to three routing keys.
- The same file's readiness builder — the `modules` check, severity `BLOCKER`.
- `services/api/test/tenant-activation.e2e-spec.ts` — "activates a workspace that
  still has nothing a user can open", which asserts today's behaviour and passes.

## How it was found

Writing the successful-activation path for [[ITEM-0004]]. The suite's fixture
plan entitles no modules, so `enabledModuleCount` is zero and the blocker is
visible. In an ordinary provisioning run the plan entitles something and the
blocker never appears — which is why nobody would find this by using the product,
and why the case is pinned in a test rather than left as a note.

## The decision to make

Not whether the gap exists — it does — but whether the gate should close it:

1. **Gate on it.** Consistent with the two siblings. Risk: it refuses a
   legitimate activation where an operator intends to enable modules afterwards,
   and turns a plan misconfiguration into a blocked activation rather than a
   visible warning.
2. **Leave it, and make readiness louder.** The blocker already shows on the
   overview tab. The operator activating the tenant is looking at it.
3. **Gate on it only for system-provisioned tenants**, where a plan entitling
   nothing is a configuration error rather than a choice.

This is a product call about what the platform refuses to do on an operator's
behalf, which is why it is `PRODUCT_DECISION` rather than a bug.

## Acceptance Criteria

A decision is recorded as an ADR. If option 1 or 3 is chosen, the gate is
extended and the assertion in `tenant-activation.e2e-spec.ts` is inverted — it
was written to fail in exactly that case, so the decision is not silently lost.

## Dependencies

None.

## Related Items

[[ITEM-0004]] · [[BUG-0015]] · module [[tenant-control-plane|Tenant Control Plane]] ·
[[tenant-provisioning|Tenant Provisioning]].

## History

- 2026-08-22 — raised while closing [[ITEM-0004]]; the successful activation path
  reached ACTIVE with one readiness blocker still standing.
- 2026-08-22 — Architect triage: PRODUCT_DECISION. The gap is established; what
  the gate should do about it is a product call, and refusing an activation is
  not a change to make on an agent's own judgement.


## Decided and done — 2026-08-29

**Warn, and allow.** Put to the repository owner, who chose it over enforcing the
gate or leaving the behaviour alone.

The reasoning is worth keeping, because it is what separates this blocker from
the two beside it. A workspace nobody can administer and a workspace nobody can
reach both strand the customer with no way out from inside the product. A
workspace with no module enabled is recoverable in a minute by the operator who
just activated it, and activating deliberately ahead of enabling modules is a
real workflow.

Shipped in `TenantControlPlaneService.changeStatus`, integrated at `287612d9`:

- the `modules` BLOCKER no longer stops activation;
- it travels back on the response as `activationAdvisories`;
- it is written into the audit entry's `afterSnapshot`;
- and it raises the platform event from `INFO` to `WARNING`.

Those last three are the point. **A warning nobody receives is just an
activation**, so `activation-advisories.spec.ts` asserts the delivery rather than
the permission — and it is mutation-tested: removing the capture fails two of its
assertions. The field is *absent* rather than empty when there was nothing to
say, because an empty key reads as "checked and fine", which is a different fact
from "not applicable".

The two gates that were already there are untouched, and a test asserts a
workspace with no reachable address is still refused — proving the change was
narrow rather than a general relaxation.

### Why this record sat closed-in-code and open-on-paper for a day

The code shipped on 2026-08-28 and this record was not moved until the following
day, when a routine listing showed it still reading `PRODUCT_DECISION`.

That is precisely the failure this session spent its time documenting —
[[ITEM-0062]], [[BUG-0018]] and [[ITEM-0001]] all outlived their own premises —
and it happened here in the same session that catalogued it. Worth recording
rather than quietly fixing: the fix landing is not the record landing, and
nothing in the tooling connects them.


<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-control-plane]]

<!-- GRAPH:END -->
