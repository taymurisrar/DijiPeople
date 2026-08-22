---
ID: ITEM-0050
aliases: [ITEM-0050]
Title: Move payroll derivation and branding upload orchestration out of web proxies
Type: TECH_DEBT
Status: DONE
Priority: P2
Severity: MEDIUM
AffectedModules: [apps/web, services/api/src/modules/compensation, services/api/src/modules/tenant-settings]
Source: IMPLEMENTATION
OwnerAgent: backend-api
ArchitectDisposition: DONE
CreatedAt: 2026-08-18
UpdatedAt: 2026-08-22
RelatedBug: BUG-0041
RelatedQA:
RelatedADR:
RelatedImplementation:
TargetMilestone:
BlockedBy:
---

# ITEM-0050 — Move payroll derivation and branding upload orchestration out of web proxies

## Summary

BUG-0041 fixed the three route handlers whose behaviour was a correctness or
privacy defect. Two remain, and both are real refactors with a domain owner
rather than proxy hygiene, so they are carried here instead of being rushed into
that fix.

## Why It Matters

Both are the same architectural violation — `apps/web/AGENTS.md` says a route
handler "forwards the request, forwards the response, and decides nothing" — but
neither is currently producing a wrong answer, which is exactly why they need
care rather than speed.

**`api/payroll/compensations/route.ts`** derives `basicSalary` as *the first
component with a non-empty amount* when the caller did not supply one, after
making a second API call to `/pay-components` and branching on
`calculationMethod === "PERCENTAGE"`. That is a payroll rule — what counts as
basic salary — living in a proxy, and duplicated again in
`[compensationId]/route.ts`. It is money, and "first non-empty component" is a
guess that no domain service has ever agreed to. Changing it blind could alter
what employees are paid, so it needs the payroll owner, not a mechanical move.

**`api/tenant-settings/branding-assets/route.ts`** owns a MIME allowlist and a
3 MB limit the API does not know about, and performs a two-step upload that is
not atomic: if step two fails, step one has already created a document and
nothing removes it. The orphan is the substantive half; the policy duplication is
the architectural half.

## Evidence

- `apps/web/app/api/payroll/compensations/route.ts:45-123` —
  `normalizeCompensationPayload`, the second API call, and the `basicSalary`
  fallback.
- `apps/web/app/api/payroll/compensations/[compensationId]/route.ts` — the same
  logic a second time.
- `apps/web/app/api/tenant-settings/branding-assets/route.ts` — allowlist, size
  policy, non-atomic orchestration.

## Proposed Approach

ExecPlan required; the two halves are independent and can ship separately.

1. **Compensation.** Decide with the payroll owner what `basicSalary` means when
   the caller omits it — including whether omitting it should simply be rejected.
   Then either have the metadata form emit the API's shape directly, or accept
   the flat `component_<id>` shape in the DTO. Delete the duplicate in
   `[compensationId]`. Add a service-level test for the chosen rule.
2. **Branding assets.** Move the MIME and size policy to the API so one place
   decides, and make the two-step upload atomic — or compensating, so a failed
   second step removes the document the first created.

## Acceptance Criteria

- No route handler under `apps/web/app/api/` computes a payroll value.
- `basicSalary` derivation exists once, in a service, with a test.
- Branding upload rejects by a single API-side policy and leaves no orphan
  document when it fails.

## Dependencies

None blocking. BUG-0041's fixed half is already on develop.

## Related Items

[[BUG-0041]] · [[BUG-0039]] · [[TASK-0005]]
