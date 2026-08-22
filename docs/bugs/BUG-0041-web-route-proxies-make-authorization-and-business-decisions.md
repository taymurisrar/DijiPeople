---
ID: BUG-0041
aliases: [BUG-0041]
Title: Web route proxies make authorization and business decisions
Status: FIXED
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
RegressionId: REG-055
RelatedBacklogItem: ITEM-0050
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-17
UpdatedAt: 2026-08-22
ResolvedAt: 2026-08-22
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

**The authorization half is fixed; two business-logic instances remain.** The
record stays `OPEN` for those rather than being closed on the half that was
easier, and they are carried by [[ITEM-0050]].

Fixed 2026-08-18:

1. **`api/teams/route.ts` — the only authorization instance.** It read
   `permissionKeys`, decided the caller could not read teams, and returned a
   fabricated `200 { items: [] }` without calling the API. Removed entirely; the
   handler now forwards and the API's own `teams.read` enforcement answers. Being
   fail-closed was never the point — it was a second source of truth the API
   could not correct, could not audit, and could not see, and an empty list is
   indistinguishable from "you have no teams".
2. **`api/lookups/dashboard-views/route.ts` — invented data.** It substituted a
   `DEFAULT_DASHBOARD_OPTION` ("Administration") on *any* failure other than 401,
   so a caller the API refused with 403 received a dashboard it had never
   offered. That is the BUG-0039 shape — a refusal rendered as a `200`. It now
   forwards `error.status`, and an empty list is returned as the real answer it
   is. The consumer already lists `dashboardViews` in `RECOVERABLE_LOOKUP_KEYS`,
   so it tolerates the honest failure.
3. **`api/attendance/reverse-geocode/route.ts` — third-party IP leak.** It called
   `nominatim.openstreetmap.org` itself and spread `forwardedClientHeaders` into
   that request. That helper exists so the **API** can see the visitor's address
   for per-client rate limiting across this app's proxy hop (BUG-0032); pointing
   it at a third party sent every employee's IP to OpenStreetMap alongside their
   exact punch coordinates — a linkable location trace, from a helper whose
   documented purpose is the opposite hop. It now uses the existing
   `lib/location/geocoding.server.ts` helper, which sends no client headers and
   already carries the provider's usage-policy User-Agent. The duplicated address
   assembly went with it.

The two that were left in August, and why they were left:

- `api/payroll/compensations/route.ts` derived `basicSalary` as the first
  component with a non-empty amount. That is a payroll rule in a proxy, it is
  money, and "first non-empty component" is a guess no domain service has agreed
  to. Changing it blind could alter what employees are paid.
- `api/tenant-settings/branding-assets/route.ts` owned a MIME allowlist and 3 MB
  policy the API did not know about, and its two-step upload orphaned a document
  when step two failed.

### Fixed 2026-08-22 — the remaining two, carried by [[ITEM-0050]]

**Compensation.** The shape translation moved to the compensation runtime spec,
which already has the pay components loaded to build the form — so the second API
call to `/pay-components` is gone as well. The derivation is simply deleted, and
the reason it could be is that the answer was already in the codebase: the form
marks `basicSalary` `requirementLevel: "required"` and
`CreateEmployeeCompensationDto` declares it required. The API's stated rule was
always "reject an omission"; the proxy was inventing a value to satisfy a
requirement that already existed. A caller who omits it now gets a 400 naming the
field rather than a silently invented salary, which is the safer answer for money
and the one the domain had already agreed to.

`StandardModuleRuntimeSpec` gained `mutationPayloadTransform` for this, because a
module whose form fields are generated at runtime — one per active pay component,
named `component_<id>` — cannot be described by a static field list. It may
reshape; it may not decide policy or invent a monetary value.

**Branding assets.** Both halves moved to `POST /tenant-settings/branding-assets`.
The MIME allowlist and 3 MB limit are enforced on the authority, so a caller
reaching the API directly is governed by the same rule. The orchestration
*compensates* rather than transacts — the two writes cross a storage boundary a
database transaction cannot span — so a failed settings write archives the
document it created before rethrowing, and a failure of that archive is logged
without masking the error the caller can act on.

`TenantSettingsModule` and `DocumentsModule` now reference each other through
`forwardRef`. The cycle is real and deliberate: documents needs the
document-settings resolver, and branding-asset upload needs the document service.

**The mechanical check the record asked for** is
`scripts/check-proxies-decide-nothing.mjs`: it fails when any handler under
`app/api/**` reads a permission, role or elevation value, or assigns a monetary
field. It would have caught the `teams` handler the day it landed. A probe
carrying both shapes is refused; 502 handlers scanned.

## QA Retest

Pass for all five handlers.

August, the first three:

```text
check:proxies-forward-refusals   PASS
apps/web                         18 suites, 397 tests; check-types PASS
```

2026-08-22, the remaining two:

```text
check-proxies-decide-nothing            502 handlers, none decides
compensation-runtime.spec.ts            14 tests PASS
branding-assets.service.spec.ts         13 tests PASS
services/api                            1634 tests PASS
apps/web                                438 tests PASS; check-types PASS
```

Scenarios `QA-PAYROLL-001` and `QA-TENANT-013`. The manual half of each — saving a
compensation record with the basic salary left empty, and a branding upload whose
settings write fails — is described in those scenarios and was not run against a
live stack here.

`teams/route.ts` no longer imports `getSessionUser`; `dashboard-views` forwards
`error.status`; `reverse-geocode` no longer constructs a third-party request or
touches `forwardedClientHeaders`.

The original record's caveat still stands and is worth keeping: the claim that
these were the *only* such handlers rests on repo-wide greps for known patterns,
which would not catch a novel one. `check-proxies-forward-refusals` and the
forwarded-headers invariant cover the two shapes that have now bitten twice.

## History

- 2026-08-17 — found during the `apps/web` deep documentation audit (TASK-0003).
- 2026-08-17 — Architect triage: `PLAN_REQUIRED`. Five independent decisions
  plus a guard; doing them piecemeal is how the rule eroded in the first place.
