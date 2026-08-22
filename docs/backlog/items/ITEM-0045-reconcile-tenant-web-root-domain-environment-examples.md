---
ID: ITEM-0045
aliases: [ITEM-0045]
Title: Reconcile tenant web root-domain environment examples
Type: DOCUMENTATION
Status: DONE
Priority: P3
Severity: LOW
AffectedModules: [apps/web]
Source: QA_RUN
OwnerAgent: frontend
ArchitectDisposition: DONE
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-22
RelatedBug:
RelatedQA: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0045 — Reconcile tenant web root-domain environment examples

## Summary

Committed tenant-web environment examples disagree about the root/base domain
variables required for workspace routing. Reconcile them with the canonical
platform-domain configuration and environment documentation.

## Why It Matters

Following the wrong example produces a web process that classifies workspaces
against a different domain contract than the API or CI.

## Evidence

`apps/web/.env.example:13` and `apps/web/.env.local.example:9` differ; see
`docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md:75`.

## Proposed Approach

No ExecPlan: compare both examples with `packages/config/platform-domains.js`
and `docs/environment-variables.md`, update only the stale example, and extend
the existing configuration contract test.

## Acceptance Criteria

- Both examples declare the same canonical root/base-domain contract.
- A config test fails when a required example variable is omitted or renamed.

## Dependencies

None.

## Related Items

[[workspace-routing-and-domains]] · [[silent-config-fallback]] · [[TASK-0005]]

## History

- 2026-08-17 — created at `0051180`.
