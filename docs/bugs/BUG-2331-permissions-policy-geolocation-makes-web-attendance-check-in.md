---
ID: BUG-2331
aliases: [BUG-2331]
Title: Permissions-Policy geolocation=() makes web attendance check-in impossible
Status: FIXED
Severity: HIGH
Priority: P1
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: f77c0abb
AffectedModules: [packages/config, apps/web, apps/admin]
OwnerAgent: architect
ArchitectDisposition: FIX_NOW
QAReport: 
RegressionId: REG-360
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt: 2026-08-30
---

# BUG-2331 — Permissions-Policy geolocation=() makes web attendance check-in impossible

## Summary

Every response from the tenant app carried
`Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`.
An empty allowlist is the **strictest** form of the directive: it disables the
feature for the document's own origin, not only for embedded frames. Chrome
therefore rejected `navigator.geolocation.getCurrentPosition` with
`PERMISSION_DENIED` *before the permission layer was reached* — no prompt was
ever shown, and granting location access in browser settings changed nothing,
because the site was never allowed to ask.

Attendance check-in captures a device position on every attempt and the API
refuses a check-in that arrives without one. So web attendance was unusable for
every employee, on every browser, for as long as this header has shipped.

## Expected Behavior

Opening Attendance and pressing **Check In** asks the browser for location the
first time, and records attendance once permission is granted. If the employee
declines, the app says so and offers to try again — an instruction they can act
on.

## Actual Behavior

No prompt appeared. The check-in failed immediately with the app's
`PERMISSION_DENIED` card: "Location access is required to check in remotely.
Allow location access for DijiPeople in your browser and try again." Following
that instruction had no effect, because the header blocks the feature above the
permission layer.

## Reproduction

1. Sign in to a tenant workspace and open `/attendance`.
2. Press **Check In**.
3. Observe: no browser permission prompt, and the "Location access is required"
   card appears immediately.
4. In DevTools, run `document.featurePolicy.allowsFeature('geolocation')` →
   `false`, and `navigator.permissions.query({name:'geolocation'})` → `denied`.

## Evidence

Confirmed against production (`dijipeople-demo.ws.dijipeople.com`) on
2026-08-30, before any change:

```
curl -I https://dijipeople-demo.ws.dijipeople.com/attendance
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
```

In-page, on the real signed-in attendance screen:

```json
{
  "policyAllowsGeolocation": false,
  "permissionState": "denied",
  "getCurrentPosition": {
    "ok": false, "code": 1,
    "message": "Geolocation has been disabled in this document by permissions policy."
  }
}
```

The browser's own message names the cause. `code: 1` is `PERMISSION_DENIED`,
which is why the app's classifier reported a denied permission: the code is
indistinguishable from a real refusal.

Isolating the single variable — the same production page, same browser, same
grant, with **only** the response header rewritten to `geolocation=(self)`:

```json
{"servedHeaderAllowsGeolocation": true, "permissionState": "granted",
 "position": {"ok": true, "lat": 25.2854, "lon": 51.531, "accuracy": 20}}
```

And on a first visit with every permission cleared, which is the state a new
employee is in:

```json
{"FIXED_HEADER_first_visit":   {"allowsFeature": true,  "permissionState": "prompt"},
 "SHIPPED_HEADER_first_visit": {"allowsFeature": false, "permissionState": "denied"}}
```

`prompt` is Chrome saying it will show the dialog. `denied` under an empty
allowlist is Chrome saying it never can.

With the corrected header the full pipeline ran end to end on production: GPS
captured at 20 m accuracy, reverse-geocoded to a street address, and posted to
`/api/attendance/check-in` with a complete location payload.

## Root Cause

`packages/config/security-headers.js` listed `geolocation=()` among "Features
nothing in these apps uses" — a claim that was false for `apps/web` from the
moment attendance location capture shipped. The comment and the code agreed with
each other and disagreed with the product. This is the `doc-code-drift` pattern
expressed in a header rather than a document.

The empty allowlist `()` is easily misread as "no special grant" when it in fact
means "denied to everyone, including self". `(self)` is the value that means
what the author intended.

## Impact

Total loss of web attendance check-in and check-out for every employee of every
tenant, on every browser, on the app's most-used self-service screen. Reachable
in production and reached: this is the defect the user reported.

Not affected: the Electron agent-desktop app, which is not governed by this
header, and device punches through the gateway.

## Affected Areas

- `packages/config/security-headers.js` — the shared header definition
- `apps/web` — attendance check-in/check-out, any future location feature
- `apps/admin` — same header, no location feature today

## Proposed Resolution

Make geolocation opt-in per app rather than globally denied. `apps/web` and
`apps/admin` pass `geolocation: true` and receive `geolocation=(self)`;
`apps/landing` keeps `geolocation=()`. `(self)` and not `*`: the tenant app may
ask, cross-origin embedders still may not. No ExecPlan needed — one header
value, no schema or contract change.

## Acceptance Criteria

- A response from `apps/web` carries `geolocation=(self)`.
- A response from `apps/landing` still carries `geolocation=()`.
- On a browser with no prior grant, pressing Check In shows the browser's
  location prompt.
- Granting it records attendance; declining it shows the existing "Location
  access is required" card with a working retry.

## Regression Coverage

`packages/config/security-headers.test.js` — REG-360. Three assertions: the
opt-in produces `(self)` and never `*`, the default stays `()` for apps that do
not opt in, and the option survives `securityHeadersForApp`, which is where the
value the apps actually receive is assembled. Mutation-tested: reverting the
source to a flat `()` fails two of the three.

## Dependencies

None.

## Related Items

- [[BUG-2332]] — the refusal that follows a successful capture is also mangled,
  one layer down, by the same class of mistake.
- [[BUG-2334]] — a capture failure on the attendance adapter loses its reason
  code, which is why every location failure looked alike.
- [[BUG-2091]] — the settings contract still describes attendance geolocation as
  tenant-configurable; it is a mandatory control.
- [[doc-code-drift]] — the pattern: a comment describing a repository state that
  does not exist.

## Resolution

Fixed on `agent/attendance-location-capture`.

- `packages/config/security-headers.js` — `baselineSecurityHeaders` takes a
  `geolocation` option; the header is assembled rather than hardcoded, and the
  misleading comment is replaced with the full account.
- `apps/web/next.config.ts`, `apps/admin/next.config.ts` — pass
  `geolocation: true`.
- `packages/config/security-headers.test.js` — regression coverage.

## QA Retest

Verified live against production on 2026-08-30 by rewriting only this response
header on the real signed-in attendance page: `allowsFeature` false to true,
first-visit permission state denied to prompt, and a complete check-in payload
posted from a real captured GPS position. Retest after deploy by pressing Check
In on a browser with no prior grant and confirming the prompt appears.

## History

- 2026-08-30 — created from qa run at `f77c0abb`.
- 2026-08-30 — root cause established in the browser, fixed, and verified live
  against production with the header rewritten in flight.
- 2026-08-30 - released to production in `ec1d58da` (PR #59) and verified live on the deployed build, not only on the branch.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[deployment-architecture]], [[tenant-application]], [[platform-admin]]
- Regression — REG-360 (see the regression register)

<!-- GRAPH:END -->
