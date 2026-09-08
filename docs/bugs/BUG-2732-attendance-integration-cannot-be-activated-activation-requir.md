---
ID: BUG-2732
aliases: [BUG-2732]
Title: Attendance integration cannot be activated: activation requires a verified device, but only an active integration is ever verified
Status: OPEN
Severity: HIGH
Priority: P1
Type: STATE_MACHINE
Source: QA_RUN
DetectedDate: 2026-08-31
DetectedInSha: 2b001494
AffectedModules: [services/api/src/modules/attendance-integrations, gateway/src/DijiPeople.Gateway.Host]
OwnerAgent: architect
ArchitectDisposition: TRIAGE_REQUIRED
QAReport: 
RegressionId: 
RelatedBacklogItem:
RelatedDecision:
RelatedImplementation:
CreatedAt: 2026-08-31
UpdatedAt: 2026-08-31
ResolvedAt:
---

# BUG-2732 — Attendance integration cannot be activated: activation requires a verified device, but only an active integration is ever verified

## Summary

A `LOCAL_GATEWAY` attendance integration — the ZKTeco on-premise path — can never
reach `ACTIVE`. Activation is refused until at least one enabled device carries
`verificationStatus = VERIFIED`, and the only code in the system that writes that
value is the gateway's device-verification report. The gateway only produces that
report from inside its per-device cycle, and that cycle skips every integration
whose `isActive` is false. Each side waits for the other, so a freshly configured
terminal stays `UNVERIFIED` forever and no attendance is ever collected.

This is not a misconfiguration and not environment-specific. It is reachable by
every tenant that configures an on-premise attendance device, and it blocks the
entire Integration Gateway feature from going live.

## Expected Behavior

After an administrator creates an integration, enables a device and pairs a
gateway, the gateway should contact the terminal, report the verification result,
and the integration should then become activatable. The readiness panel already
tells the user this is the intended sequence: "Install and pair a gateway, then
run Verify device."

## Actual Behavior

The gateway fetches its configuration, reports the integration and device, and
then does nothing further. No verification is attempted, no run is recorded, and
`POST /integrations/attendance/integrations/{id}/activate` returns 400 with
`blockers: ["No device has been verified yet. Install and pair a gateway, then
run Verify device."]`.

There is also **no "Verify device" control anywhere in the product**. The string
the readiness panel shows names an action that does not exist — there is no route
on `attendance-device.controller.ts` and no button in
`apps/web/app/(authenticated)/settings/integrations/attendance/`. The only
occurrences are the message itself and its own unit test.

## Reproduction

Observed against the local API at `2b001494` on tenant `xoul-ltd`, with the
gateway built from the same tree and paired to the local API.

1. `POST /integrations/gateways` — create a gateway.
2. `POST /integrations/attendance/integrations` with `connectorType:
   zkteco-legacy-tcp` and a schema-valid configuration.
3. `POST /integrations/attendance/devices` with `integrationId` and `gatewayId`.
4. `POST /integrations/attendance/devices/{deviceId}/enable` → device becomes
   `isEnabled: true`.
5. `POST /integrations/attendance/integrations/{id}/validate-configuration` →
   `configurationValid: true`, status moves `DRAFT` → `UNVERIFIED`.
6. `DijiPeople.Gateway.exe configure --url <api>/api` then `pair --code <code>` →
   gateway reaches `ONLINE`, `isPaired: true`.
7. Run the gateway. It logs `Configuration updated (...): 1 integration(s), 1
   device(s).` and then stops — no verification, no sync, indefinitely.
8. `POST /integrations/attendance/integrations/{id}/activate` → **400**, blocker
   "No device has been verified yet."

Step 8 never succeeds, no matter how long step 7 runs or how often **Sync now**
is pressed.

## Evidence

The cycle, in four hops:

1. `integrations/attendance-integration.service.ts:372` — `activate()` throws when
   `readiness.blockers.length > 0`.
2. `integrations/attendance-integration.service.ts:447-449` — `deviceVerified =
   verifiedDeviceCount > 0`, and a blocker is pushed whenever
   `enabledDeviceCount > 0 && !deviceVerified`.
3. `gateways/gateway-runtime.service.ts:135` — the **only** assignment of
   `AttendanceDeviceVerificationStatus.VERIFIED` in the codebase, reached from
   `POST /integrations/gateway/devices/verification`.
4. `gateway/src/DijiPeople.Gateway.Host/Runtime/GatewayWorker.cs:307` —
   `if (!integration.IsActive) continue;` sits above the only call site of
   `_syncRunner.VerifyAsync(...)` at line 397, inside `RunOneDeviceAsync`.

And `isActive` is written true in exactly one place —
`attendance-integration.service.ts:502`, `isActive: next ===
AttendanceIntegrationStatus.ACTIVE` — reachable only through `activate()`.

Observed database state after the full sequence above, with the gateway online
and holding the configuration:

```
AttendanceIntegration  status=UNVERIFIED  isActive=false   connectorType=zkteco-legacy-tcp
AttendanceDevice       status=ACTIVE      isEnabled=true   verificationStatus=UNVERIFIED
IntegrationGateway     status=ONLINE      isPaired=true    integrationCount=1  deviceCount=1
```

Gateway log across two runs and a **Sync now**, with no verification attempt:

```
[INF] DijiPeople Integration Gateway 2.0.0 (X64) starting. Connectors: zkteco-legacy-tcp.
[INF] Paired as gateway 649244e9-... against http://127.0.0.1:4000/api.
[INF] Configuration updated (b92d5432...): 1 integration(s), 1 device(s).
```

`GET /integrations/attendance/runs` returns `0` items throughout.

Disabling the device does not open a path either — it swaps one blocker for
another ("No enabled device is configured for this integration"), so both
branches of the readiness check are closed.

## Root Cause

Two independently reasonable safety rules compose into a cycle that neither
author could see alone:

- The API refuses to activate an integration whose hardware has never answered,
  so a misconfigured terminal cannot silently start writing attendance.
- The gateway refuses to touch a terminal belonging to an integration the tenant
  has not activated, so a draft configuration cannot dial the customer's network.

Each is correct in isolation. Together they leave no first move. The missing
piece is a verification path that is permitted **before** activation — which is
what the readiness message already promises and what the phrase "then run Verify
device" was presumably written against.

## Impact

Blocks the on-premise attendance integration end to end, for every tenant, on
every connector whose `connectionMode` is `LOCAL_GATEWAY`. No punches can be
collected from a ZKTeco terminal in production today.

Reachable in production: yes. The code path is identical on `main` — the gating
line and the activation check are both present at `origin/main`.

Severity is HIGH rather than CRITICAL only because no existing customer is
currently depending on collected device attendance; the feature has never been
able to run.

## Affected Areas

- `services/api/src/modules/attendance-integrations/integrations/attendance-integration.service.ts`
  — `activate()`, `evaluateReadiness()`, `transition()`
- `services/api/src/modules/attendance-integrations/gateways/gateway-runtime.service.ts`
  — the verification report handler
- `services/api/src/modules/attendance-integrations/devices/attendance-device.controller.ts`
  — has no verify route
- `gateway/src/DijiPeople.Gateway.Host/Runtime/GatewayWorker.cs` —
  `RunDeviceCyclesAsync`
- `apps/web/app/(authenticated)/settings/integrations/attendance/_lib/presentation.ts`
  — names a control that does not exist

## Proposed Resolution

Needs an ExecPlan: it changes a state machine that spans the API, the gateway and
the tenant UI, and the wrong shape here would let an unactivated integration dial
a customer network on a schedule.

The direction that keeps both safety properties intact is a **verification-only
pass that does not require activation**:

- Let the gateway run `VerifyAsync` for an integration that is `UNVERIFIED` (not
  merely `ACTIVE`), while continuing to gate *attendance reads and uploads* on
  `IsActive`. Verification is a single identity read — connect, read serial,
  disconnect — which is exactly the operation an administrator is asking for.
- Drive it from an explicit, administrator-initiated request rather than the
  poll loop, so a draft integration never dials anything unattended. The manual
  `syncRequestedAt` channel already carries an operator's intent and is the
  natural transport.
- Add the missing route and control (`POST
  /integrations/attendance/devices/:id/verify`) so the readiness message names a
  real action.

Rejected: relaxing the activation check to accept an unverified device. That
deletes the guarantee that stops punches being attributed to the wrong site,
which is the reason `deviceVerified` was made a recorded fact rather than an
assumption (see the comment at `attendance-integration.service.ts:41-47`).

## Acceptance Criteria

1. With a paired gateway, an enabled device and an `UNVERIFIED` integration, an
   administrator can trigger verification and the gateway attempts it.
2. A successful verification sets `verificationStatus = VERIFIED` and clears the
   activation blocker; the integration then activates.
3. A terminal answering with the wrong serial records `SERIAL_MISMATCH` and does
   **not** clear the blocker.
4. An `UNVERIFIED` integration is never polled for attendance on the schedule —
   only the explicit verification is permitted before activation.
5. Every readiness message names a control that exists in the UI.

## Regression Coverage

Needs a test that drives the full sequence — create, enable, pair, verify,
activate — and fails on the current code at the activate step. It must assert
that an `UNVERIFIED` integration is not swept into the scheduled attendance poll,
or the fix could regress into "activate everything" and still pass.

## Dependencies

None. The fix is self-contained across the API, the gateway and the tenant UI.

## Related Items

[[attendance]] — the module knowledge note for the attendance domain.

## Resolution

Not yet fixed.

## QA Retest

Not yet retested.

## History

- 2026-08-31 — created from qa run at `2b001494`, while preparing a physical
  ZKTeco K50 test on the local `xoul-ltd` tenant. Found by observing that a
  fully paired, online gateway holding a valid configuration never attempted a
  device cycle; confirmed by reading the four code paths above rather than by
  inference from the symptom.

<!-- GRAPH:BEGIN — generated by scripts/rebuild-backlog.mjs; edit the frontmatter, not this block -->

## Related

- No related record, module or decision is declared in this record's
  frontmatter. Declare one rather than adding a link here by hand — this
  block is regenerated and a hand-written link inside it is lost.

<!-- GRAPH:END -->
