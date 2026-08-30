---
ID: BUG-2335
aliases: [BUG-2335]
Title: Allow approximate IP fallback is a live setting whose provider is a permanent stub
Status: PRODUCT_DECISION
Severity: MEDIUM
Priority: P2
Type: BUG
Source: QA_RUN
DetectedDate: 2026-08-30
DetectedInSha: f77c0abb
AffectedModules: [apps/web, services/api/src/modules/tenant-settings]
OwnerAgent: architect
ArchitectDisposition: PRODUCT_DECISION
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-30
UpdatedAt: 2026-08-30
ResolvedAt:
---

# BUG-2335 — Allow approximate IP fallback is a live setting whose provider is a permanent stub

## Summary

The attendance settings page renders **"Allow approximate IP fallback"** as an
editable checkbox, it saves, and the runtime policy reports it as
`allowIpFallback: true`. The provider behind it always fails. An administrator
switching it on is promised a fallback that cannot happen.

## Expected Behavior

Either the setting produces an approximate position when GPS fails, or it is not
offered as a live, editable control that reports itself as enabled.

## Actual Behavior

`captureIpFallbackLocation` returns a hardcoded failure on every call,
regardless of the setting, the tenant or the environment.

## Reproduction

1. Open Settings → People → Attendance on any tenant.
2. Confirm "Allow approximate IP fallback" is editable and can be saved on.
3. `GET /api/attendance/runtime-context` reports `"allowIpFallback": true`.
4. Cause a GPS failure and observe that no approximate position is ever
   produced.

## Evidence

`apps/web/lib/location/ip-location-provider.ts`, in full:

```ts
export async function captureIpFallbackLocation(): Promise<LocationCaptureResult> {
  return {
    ok: false,
    reason: "POSITION_UNAVAILABLE",
    message: "Approximate IP location is not configured for this tenant environment.",
    permissionState: await readPermissionState(),
  };
}
```

There is no branch that can succeed — no provider, no configuration read, no
environment check. The message says "not configured for this tenant
environment", which reads as a per-tenant condition; it is unconditional.

Demo tenant runtime policy, 2026-08-30:

```json
"policy": { "allowIpFallback": true, "allowManualLocationException": false, ... }
```

The setting is on for this tenant and has no effect.

Separately, `captureAttendanceLocation` — the function the attendance adapter
calls — never invokes the IP fallback at all, even when enabled. The only
caller of `captureIpFallbackLocation` passes an `enabled` flag and is not on the
check-in path. So the setting is inert twice over.

## Root Cause

A capability was designed into the settings catalog and the runtime policy
before its provider existed, and the placeholder shipped in a form that reports
a per-environment reason rather than "not implemented". Nothing in the settings
UI distinguishes a setting that is wired from one that is a promise.

## Impact

Low functional impact today, because the fallback would only matter when GPS
fails — but that is exactly the situation the user is in when they report
attendance problems, and an administrator reasonably believes they have already
mitigated it. It also misleads support: the natural first advice ("turn on
approximate fallback") does nothing.

Not a data-integrity risk. `allowManualLocationException` is a mandated `false`
and unaffected.

## Affected Areas

- `apps/web/lib/location/ip-location-provider.ts`
- `apps/web/lib/location/location-capture.ts` — `captureIpFallbackLocation`
- the `attendance` tenant-settings category — `allowIpFallback`
- Settings → People → Attendance

## Proposed Resolution

This needs a product decision, which is why it is not dispositioned FIX_NOW:

1. **Implement it** — choose an IP geolocation provider, decide whether an
   approximate position may satisfy an attendance integrity control at all
   (it is far weaker evidence than GPS, and location capture here is a
   deliberate integrity control), and wire it.
2. **Withdraw it** — disable the control with an explanation, the way the seven
   mandated attendance settings are already rendered read-only, and stop the
   runtime reporting a capability that does not exist.

Option 2 is the smaller change and the honest one until option 1 is decided.
Whichever is chosen, the placeholder's message should say "not implemented"
rather than implying a missing tenant configuration.

## Acceptance Criteria

- The setting either works or is not presented as an enabled capability.
- The runtime policy does not report `allowIpFallback: true` for a capability
  that cannot execute.

## Regression Coverage

To be added with whichever resolution is chosen.

## Dependencies

Needs a product decision on whether approximate location is acceptable evidence
for attendance. See [[BUG-1979]] for the established position that attendance
location capture is a deliberate mandatory integrity control — which argues
against accepting IP-derived positions.

## Related Items

- [[BUG-1979]] — the attendance location mandate and its evidence.
- [[BUG-2091]] — the settings contract is stale about attendance geolocation.
- [[BUG-2331]] — found during the same attendance verification.

## Resolution

Not yet resolved; awaiting product decision.

## QA Retest

Pending resolution.

## History

- 2026-08-30 — found while validating the attendance settings page against the
  runtime policy the API actually serves.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- Modules — [[tenant-application]], [[settings]]

<!-- GRAPH:END -->
