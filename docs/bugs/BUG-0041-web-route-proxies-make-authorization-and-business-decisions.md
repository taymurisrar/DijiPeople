---
ID: BUG-0041
aliases: [BUG-0041]
Title: Web route proxies make authorization and business decisions
Status: OPEN
Severity: MEDIUM
Priority: P2
Type: SECURITY
Source: QA_RUN
DetectedDate: 2026-08-17
DetectedInSha: 1af3690
AffectedModules: [apps/web]
OwnerAgent: frontend
ArchitectDisposition: PLAN_REQUIRED
QAReport: docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md
RegressionId:
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-17
ResolvedAt:
---

# BUG-0041 — Web route proxies make authorization and business decisions

## Summary

`apps/web/AGENTS.md` states route handlers are thin proxies with "No business
logic. **No authorization decisions.**" Both halves are violated. One handler
denies access on its own authority; several others compute, reshape or invent
data the API never returned.

`BUG-0039` covers the two most severe instances separately, because their
failure mode is data substitution rather than policy drift.

## Expected Behavior

A handler forwards the request, forwards the response, and decides nothing.

## Actual Behavior

**Authorization decided locally** — `apps/web/app/api/teams/route.ts:7-14`:

```ts
const sessionUser = await getSessionUser();
const isLookupRequest = url.searchParams.get("teamType") === "ORGANIZATIONAL" && …;
if (isLookupRequest && !sessionUser?.permissionKeys.includes("teams.read")) {
  return Response.json({ items: [] });
}
```

It reads `permissionKeys`, decides the caller may not read teams, and returns a
fabricated `200` with an empty list **without calling the API at all**. It is
fail-closed, so it can only withhold — but it is a second source of truth on
`teams.read` that the authority can never correct or audit.

**Business logic in a proxy** — the clearest is
`apps/web/app/api/payroll/compensations/route.ts:45-123`: `normalizeCompensationPayload`
makes a **second API call** to `/pay-components`, branches on
`calculationMethod === "PERCENTAGE"`, and **derives `basicSalary`** from the
first non-empty component. Payroll computation, in a proxy, duplicated again in
`[compensationId]/route.ts`.

Others: `app/api/tenant-settings/branding-assets/route.ts` owns a MIME allowlist
and a 3 MB policy and performs a non-atomic two-step orchestration that orphans
a document if step two fails; `app/api/lookups/dashboard-views/route.ts:16-65`
invents a `DEFAULT_DASHBOARD_OPTION` the API never returned;
`app/api/attendance/reverse-geocode/route.ts:17-20` calls
`nominatim.openstreetmap.org` directly, bypassing the API entirely and
forwarding the visitor's IP to a third party.

## Reproduction

Read the cited handlers. Each decision is unconditional in source.

## Evidence

All paths above verified by direct read at `1af3690`. `lib/permissions.ts`,
`lib/security-keys.ts` and `lib/elevated-roles.ts` are imported by **no** route
handler — `api/teams/route.ts` reaches permissions via `getSessionUser()`, which
is why a grep for the permission modules alone does not find it.

## Root Cause

Established: there is no mechanical guard. The rule exists only in prose, and
none of the 416 handlers has a test. Each violation was individually reasonable
— a lookup that returned noise, a payload the API wanted differently shaped —
and nothing accumulated the cost.

## Impact

- **`teams.read`**: fail-closed, so no exposure. The cost is that the API can
  never widen that permission — a tenant granted `teams.read` through a role the
  UI mirror does not know about still gets an empty list.
- **Payroll normalisation**: a compensation figure is derived in a layer with no
  tests, no audit log and no server-side validation. If the derivation and the
  API disagree, the API wins on write and the user saw the proxy's answer.
- **Reverse-geocode**: an unauthenticated route (it sits outside the proxy
  matcher) that relays employee coordinates and the caller's IP to a third
  party.

`MEDIUM` — none is exploitable for privilege escalation; all are governance and
correctness defects that make the authorization model harder to reason about.

## Affected Areas

`app/api/teams/route.ts` · `app/api/payroll/compensations/**` ·
`app/api/tenant-settings/branding-assets/route.ts` ·
`app/api/lookups/dashboard-views/route.ts` ·
`app/api/attendance/reverse-geocode/route.ts`.

## Proposed Resolution

**Needs an ExecPlan** — this is five different decisions, not one fix:

- `teams`: delete the branch; if the lookup returns noise for unprivileged
  users, that is the API's to scope.
- payroll compensations: move the derivation server-side, or establish that the
  API accepts the raw shape.
- branding assets: make the two-step upload atomic or compensating.
- reverse-geocode: put it behind the API so the third-party call and the
  coordinate handling are governed, and authenticate it.
- dashboard-views: return what the API returns.

The durable half is a **mechanical check** in the style of the four existing
`scripts/check-*.mjs`: fail if a file under `app/api/**` imports
`getSessionUser`, `lib/permissions`, `lib/security-keys` or `lib/elevated-roles`.
That is a precise, low-false-positive rule and it would have caught the `teams`
handler the day it landed.

## Acceptance Criteria

- No handler under `app/api/**` reads a permission or role.
- No handler derives a monetary value.
- A check fails when one does.

## Regression Coverage

**None.** The mechanical check above is the regression.

## Dependencies

[[BUG-0039-employee-payslip-and-bank-account-proxies-return-the-callers]] —
same layer, same absent guard; fix the check once.

## Related Items

[[BUG-0039-employee-payslip-and-bank-account-proxies-return-the-callers]] ·
[[web-architecture]] · [[tenant-application]] · [[ITEM-0034]] ·
bug pattern [[service-authorization-hidden]] · bug pattern [[divergent-duplicate-guard]].

## Resolution

Not resolved.

## QA Retest

Not applicable — not yet fixed. Verified by direct read of each cited handler at
`1af3690`; the wider claim that these are the only such handlers rests on
repo-wide greps across all 416 files, which is sound for those patterns but
would not catch a novel one.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `PLAN_REQUIRED`. Five independent decisions
  plus a guard; doing them piecemeal is how the rule eroded in the first place.
</content>
