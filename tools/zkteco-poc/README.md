# DijiPeople — ZKTeco K50 attendance POC

> **This POC must never retrieve or persist fingerprint templates or other biometric data.**

Isolated, **read-only** proof of concept that DijiPeople-owned code can talk to the
customer's physical ZKTeco K50 directly — connect, read device metadata, read the
user directory, read raw attendance transactions, normalise them, and disconnect.

It is deliberately **not** production integration. No Prisma model, no scheduler,
no gateway, no reconciliation, no writes to the DijiPeople database.

---

## Integration path

```
DijiPeople POC (Node/TypeScript, architecture-neutral)
      ↓  spawn, one JSON document on stdout
x86 worker process (.NET 8, win-x86, self-contained)
      ↓
zkemkeeper.ZKEM.1        (COM, 32-bit only)
      ↓  Connect_Net(host, port)
ZKTeco K50
      ↓
GetSerialNumber / GetProductCode / GetFirmwareVersion / GetPlatform /
GetDeviceMAC / GetVendor / GetDeviceTime / GetDeviceStatus
ReadAllUserID      + SSR_GetAllUserInfo
ReadGeneralLogData + SSR_GetGeneralLogData
      ↓
Normalised JSON
```

**Why a separate worker process?** `zkemkeeper` is registered only under
`HKEY_CLASSES_ROOT\WOW6432Node\CLSID\{00853A19-BD51-419B-9269-2DABE57EB61F}`
(→ `C:\Windows\SysWOW64\zkemkeeper.dll`), so it is a **32-bit COM component**. A
64-bit process gets `0x80040154 "Class not registered"`. Rather than force the
whole DijiPeople stack to x86, only this worker is x86; everything else stays
architecture-neutral. That is also the shape the eventual Integration Gateway
wants: a neutral core with a narrow legacy worker beside it.

---

## Supported test device

| | |
|---|---|
| Manufacturer / model | ZKTeco K50 |
| IP / port | `192.168.18.53` : `4370` |
| Device / Machine ID | `1` |
| Comm Key | `0` |
| Serial | `A2QO221160250` |
| Firmware | `8.0.4.2-20200723` |
| Platform | `ZLM60_TFT` |

None of this is hard-coded. `ZK_DEVICE_HOST` is required; everything else has a
neutral default.

---

## Two ways to run this

| | Customer machine | DijiPeople dev machine |
|---|---|---|
| Artefact | `DijiPeople.ZkTeco.Worker.exe` alone | this repo |
| Needs Node.js / npm | **No** | Yes |
| Needs .NET SDK | **No** (self-contained) | Yes, to build |
| Needs Git / source | **No** | Yes |
| Output | human report + optional JSON | human report + JSON artefacts |

The published executable performs **every** customer-machine diagnostic on its
own. Copy one file across and run it. Everything below under
"[Customer machine: the executable alone](#customer-machine-the-executable-alone)"
needs nothing else installed.

---

## Prerequisites

### Customer machine — one requirement

**`zkemkeeper` registered, 32-bit.** Already present on the customer machine
(installed by *Fingerprint Attendance System V2011*). Verify:

```powershell
Test-Path "C:\Windows\SysWOW64\zkemkeeper.dll"
Test-Path "HKLM:\SOFTWARE\Classes\WOW6432Node\CLSID\{00853A19-BD51-419B-9269-2DABE57EB61F}"
```

If the CLSID is missing, register it from an **elevated** prompt:

```powershell
regsvr32 C:\Windows\SysWOW64\zkemkeeper.dll
```

`zkemsdk.dll` must sit alongside it in `SysWOW64`. Plus network reachability:

```powershell
Test-NetConnection 192.168.18.53 -Port 4370   # TcpTestSucceeded : True
```

That is the complete list. **No Node.js, no npm, no .NET SDK, no Git, no
DijiPeople source code.**

### DijiPeople dev machine — to build and to use the TypeScript CLI

1. **Windows** — the COM component is Windows-only.
2. **Node.js 20+** — for the TypeScript CLI.
3. **.NET SDK 8+** — to build the worker.

---

## Setup

```powershell
cd tools\zkteco-poc

npm install                 # CLI dependencies (isolated; not an npm workspace)
npm run worker:publish      # builds worker/publish/DijiPeople.ZkTeco.Worker.exe (win-x86)

copy .env.example .env      # then edit .env
```

`npm run worker:publish` runs:

```
dotnet publish worker/DijiPeople.ZkTeco.Worker.csproj -c Release -r win-x86 --self-contained true -o worker/publish
```

### How x86 is enforced

Three independent guards, so the architecture cannot silently drift:

1. `DijiPeople.ZkTeco.Worker.csproj` sets `PlatformTarget=x86`, `Platforms=x86`
   and `RuntimeIdentifier=win-x86` — never AnyCPU.
2. `Program.cs` refuses to run when `Environment.Is64BitProcess` is true and
   exits with `ARCHITECTURE_MISMATCH` before touching COM.
3. The TypeScript CLI rejects any worker result whose `runtime.is64BitProcess`
   is true.

Every command prints the observed runtime, e.g. `Runtime  x86`.

---

## Environment variables

| Variable | Default | Meaning |
|---|---|---|
| `ZK_DEVICE_HOST` | — | **Required.** Device IP. |
| `ZK_DEVICE_PORT` | `4370` | Device TCP port. |
| `ZK_DEVICE_ID` | `1` | Device / Machine ID (`dwMachineNumber`). |
| `ZK_COMM_KEY` | `0` | Comm key. `0` skips `SetCommPassword` entirely. Never logged or written to output. |
| `ZK_EXPECTED_SERIAL` | unset | Warn-only serial comparison. |
| `ZK_WORKER_PATH` | `worker/publish/DijiPeople.ZkTeco.Worker.exe` | x86 worker executable. |
| `ZK_WORKER_TIMEOUT_MS` | `300000` | Worker watchdog. Raise for large historical downloads. |
| `ZK_CLOCK_DRIFT_WARN_SECONDS` | `60` | Drift above this is WARNING. |
| `ZK_ATTENDANCE_LIMIT` | `0` | Cap on punches written to JSON (most recent kept). `0` = all. |
| `ZK_OUTPUT_DIR` | `./output` | Gitignored artefact folder. |
| `ZK_LOG_LEVEL` | `info` | `debug` \| `info` \| `warn` \| `error` \| `silent` |
| `ZK_LOG_FORMAT` | `pretty` | `pretty` \| `json` |

Every one has an equivalent CLI flag (`npm run cli -- help`), and flags win.

---

## Customer machine: the executable alone

Copy **`DijiPeople.ZkTeco.Worker.exe`** to the machine. That single file is the
whole package — it is self-contained (~60 MB), so nothing else is installed and
nothing is left behind. (`DijiPeople.ZkTeco.Worker.pdb` is produced alongside it
but is only debug symbols; it is not needed to run.)

```powershell
# Connectivity + identity check — the first thing to run
DijiPeople.ZkTeco.Worker.exe --test --host 192.168.18.53 --port 4370 `
    --machine-number 1 --comm-key 0

# What the installed SDK exposes. Does NOT contact the device, so --host is not needed.
DijiPeople.ZkTeco.Worker.exe --capabilities

# One method's exact COM signature (DISPID, return type, parameters, directions)
DijiPeople.ZkTeco.Worker.exe --capabilities --method ReadLastestLogData

# Save the JSON alongside the on-screen report
DijiPeople.ZkTeco.Worker.exe --capabilities --output sdk-capabilities.json

# Device metadata and clock
DijiPeople.ZkTeco.Worker.exe --device-info --host 192.168.18.53 --machine-number 1

# User directory
DijiPeople.ZkTeco.Worker.exe --users --host 192.168.18.53 --machine-number 1

# Raw attendance transactions
DijiPeople.ZkTeco.Worker.exe --attendance --host 192.168.18.53 --machine-number 1

# Everything, capped, saved to a file to send back
DijiPeople.ZkTeco.Worker.exe --poc --host 192.168.18.53 --port 4370 `
    --machine-number 1 --comm-key 0 --max-users 100 --max-attendance 200 `
    --output k50-poc.json

DijiPeople.ZkTeco.Worker.exe --help
```

**Modes.** Exactly one of `--poc` (default), `--test`, `--device-info`,
`--users`, `--attendance`, `--capabilities`. Giving two is an error rather than
a silent pick.

**`--capabilities` never connects to the device.** Capability inspection reads
COM type metadata, which needs the component but not a session — so it needs no
`--host`, dials nothing, and cannot invoke `ReadLastestLogData`. Combining it
with `--probe-latest-log` is rejected outright.

**Output.** stdout is a readable diagnostic report. `--output <path>` writes the
JSON contract to a file without shell redirection. `--json` puts the raw JSON on
stdout instead of the report (this is what the DijiPeople CLI uses).

Exit codes: `0` success, `1` a reported failure (the report and JSON are still
produced), `2` a usage error.

---

## Commands (DijiPeople dev machine)

```powershell
cd tools\zkteco-poc

npm run test           # connect, read serial, disconnect. Writes nothing.
npm run device-info    # metadata + clock drift    -> output/device-info.json
npm run users          # device users              -> output/users.json
npm run attendance     # raw punches               -> output/attendance.json
npm run capabilities   # SDK methods + signatures  -> output/sdk-capabilities.json
npm run poc            # everything + scorecard    -> all of the above + poc-summary.json
```

Opt-in experiment, **not** part of `npm run poc` (see "The gated probe"):

```powershell
npm run cli -- probe-latest-log                      # blocked; explains why, touches nothing
npm run cli -- probe-latest-log --confirm-read-only  # runs it
```

Ad-hoc flags:

```powershell
npm run cli -- poc --host 192.168.18.53 --device-id 1 --expected-serial A2QO221160250
npm run cli -- attendance --limit 5000 --log-level debug
npm run cli -- help
```

**Without hardware** — a mock worker emits the same JSON contract so the
normalise → fingerprint → JSON → summary pipeline can be exercised on any machine:

```powershell
npm run poc:mock
```

Everything the mock serves is synthetic.

---

## Expected output

```
DijiPeople ZKTeco POC
=====================

Runtime               x86
Process architecture  X86
COM component         zkemkeeper.ZKEM.1

Configuration         PASS  validated
x86 runtime           PASS  X86 / .NET 8.0.29
COM component         PASS  zkemkeeper.ZKEM.1
Device connection     PASS  Connect_Net in 118 ms
Serial retrieval      PASS  A2QO221160250 (matches expected)
Device time           PASS  drift 4s (threshold 60s)
User retrieval        PASS  59 user(s)
Attendance retrieval  PASS  ... raw record(s)
Normalization         PASS  ...
JSON output           PASS  4 file(s)
Disconnect            PASS  session closed and COM released

Users                        59
Attendance records           ...
Stable transaction ID        NOT EXPOSED (fingerprint used instead)
Biometric templates          NOT RETRIEVED
Passwords                    NOT STORED
Device state modified        NO (read-only allowlist)
Overall                      PASS
```

---

## What the SDK actually returns

### Device metadata
`manufacturer` (GetVendor), `model` (GetProductCode), `serialNumber`,
`firmwareVersion`, `platform`, `macAddress`, `deviceTimeLocal` (GetDeviceTime),
plus raw `GetDeviceStatus` counters keyed by numeric code. **The status codes are
reported verbatim and left unlabelled — their meanings are not verified for this
firmware.** Any optional getter that returns `false` is recorded in
`unavailableFields` and never fails the run.

### Users — `ReadAllUserID` + `SSR_GetAllUserInfo`
`externalUserId`, `name`, `privilegeRaw`, `enabled`.

External user IDs are **explicit device identities**: not assumed sequential,
dense or numeric, and treated as opaque strings throughout.

### Attendance — `ReadGeneralLogData` + `SSR_GetGeneralLogData`
`externalUserId`, `occurredAtLocal`, `verificationModeRaw`, `punchStateRaw`,
`workCodeRaw`.

`SSR_GetGeneralLogData` returns date and time as **separate integer parts** with
no timezone. The worker composes them into `YYYY-MM-DDTHH:mm:ss` and nothing
attaches a UTC offset — the device never states one.

**Raw codes stay raw.** `State=0` is *not* recorded as check-in, `State=1` is
*not* check-out, `State=5` is *not* overtime. Those mappings are unverified for
this firmware and are deliberately not guessed. Present / Absent / Late / Early /
Overtime / worked hours are **not** calculated here at all — they belong to
DijiPeople's tenant-policy attendance engine in a later phase.

The customer's existing V2011 export (On duty, Off duty, Normal, Late, OT Time,
Exception, …) is the legacy engine's *output*. DijiPeople consumes raw punches
instead and will compute its own results.

---

## Stable transaction ID — not available

`SSR_GetGeneralLogData` returns only enrolment number, the six date/time parts,
verify mode, in/out mode and work code. **There is no record id among them**, so
no stable per-transaction identifier is exposed by this call.

Instead each punch carries an `eventFingerprint`:

```
SHA-256(
  deviceSerialNumber ␟ externalUserId ␟ occurredAtLocal ␟
  verificationModeRaw ␟ punchStateRaw ␟ workCodeRaw
)
```

joined with U+241F, a separator that cannot occur inside any component.

**Known limitation — this is preparation, not the final deduplication design.**
Two genuinely distinct punches by the same user, in the same second, with the
same raw values would hash identically; the device stores only second-level
resolution, so nothing in the payload can separate them. The `attendance` and
`poc` commands report `distinctEventFingerprints` next to the punch count so
real-world collision rates are visible immediately. Decide the production key
from that data, not from this default.

---

## Historical log behaviour and incremental retrieval

`ReadGeneralLogData(1)` buffers the device's **whole stored history** — records
back to at least **2022-10-24** were observed on the reference K50. It is not a
"since last read" call.

Consequences for the next phase:

- A production scheduler must **not** re-download and re-transmit the full
  history every few minutes.
- The capability run has confirmed that **no time-bounded and no new-only SDK
  call exists on this build** (`ReadTimeGLogData` and `ReadNewGLogData` are both
  absent).

### Accepted V1 synchronisation strategy for this K50 adapter

```
ReadGeneralLogData
  -> enumerate raw punches (SSR_GetGeneralLogData)
  -> local high-water mark
  -> eventFingerprint dedupe
  -> transmit unseen events only
```

Deduplication and the cursor live **on the DijiPeople side**. The device's full
history is pulled each cycle; DijiPeople decides what is new and sends only that.

Explicitly rejected for V1:

- **No unknown device-side cursor.** Nothing that reads or advances a device read
  marker is used, because the customer's V2011 software shares that state.
- **`ReadLastestLogData` is not used in production** unless it is separately
  proven safe. See "[The gated probe](#the-gated-probe)".

### Scheduling guidance

Scheduling itself is out of scope for this POC, and the production gateway will
make the interval configurable. But because this adapter buffers the device's
entire history on every read, the recommended **initial default is every 30–60
minutes** — not aggressive 1-minute polling.

Rationale: each cycle transfers the full log (years of records), so short
intervals multiply load on the device and the network for no extra information,
and increase the chance of colliding with the customer's V2011 downloads.
Attendance data is not latency-critical at minute resolution.

**Whether this SDK/device supports incremental retrieval is not yet answered.**
It could not be determined from the DijiPeople development machine, which has no
`zkemkeeper` registration to inspect. Rather than guess, the POC ships a probe:

```powershell
npm run capabilities
```

This enumerates the COM component's own type information on the customer machine
and reports every method it exposes, the log/attendance-related subset, and a
presence check for named candidates (`ReadTimeGLogData`, `ReadNewGLogData`,
`GetGeneralExtLogData`, `SSR_GetGeneralExtLogData`, `ReadGeneralLogDataEx`,
`GetGeneralLogDataCount`, …). Results land in `output/sdk-capabilities.json`.

The probe reads **type metadata only** — it invokes no device method. A method
listed as `PRESENT` means the component exposes it; it does **not** prove this
K50's firmware honours it. Confirming that needs a separate, deliberate test.

### Result of the first capability run (real device, confirmed)

The POC has now executed against the physical K50. The installed component
exposes **241 methods**. Relevant findings:

| Method | Present |
|---|---|
| `ReadTimeGLogData` | ✗ |
| `ReadNewGLogData` | ✗ |
| `ReadGeneralLogDataEx` | ✗ |
| `SSR_GetGeneralExtLogData` | ✗ |
| `GetGeneralLogDataCount` | ✗ |
| `ReadGeneralLogData` | ✓ |
| `ReadAllGLogData` | ✓ |
| `SSR_GetGeneralLogData` | ✓ |
| `GetGeneralLogData` | ✓ |
| `GetGeneralExtLogData` | ✓ |
| `ReadLastestLogData` | ✓ |
| `GetAllGLogData` | ✓ |

**The two methods that would have given true incremental retrieval —
`ReadTimeGLogData` (time-bounded) and `ReadNewGLogData` (new-only) — are absent
from this build.** That is the single most important result: there is no
time-range query and no new-only query on this component.

`ReadLastestLogData` is the only remaining candidate, and its semantics are
**not established**. See the next section.

### Why the semantics cannot be settled from metadata

`npm run capabilities` now prints the exact declaration of `ReadLastestLogData`,
`GetGeneralExtLogData`, `GetAllGLogData` and `ReadAllGLogData` — DISPID, return
type, parameter count, parameter names, parameter types, in/out/ref direction
and optional flags — straight from the type library.

That tells us **how to call** each method. It does **not** tell us what any of
them does to the device.

A signature cannot express a side effect. If `ReadLastestLogData` consumes or
advances a device-side read marker, the type library looks exactly the same as
if it does not. So no extension of this probe — however detailed — can prove the
call is safe to run against the customer's terminal.

This matters because the customer's Fingerprint Attendance System V2011 reads
the same device. A read marker is shared state: if we advance it, V2011's next
incremental download can silently skip records, and there is no undo.

**Conclusion: per step 5 of the investigation brief, the semantics cannot be
established safely from the metadata and documentation available. This is
reported rather than resolved by experimenting on the customer's device.**

To settle it, in order of preference:

1. ZKTeco's SDK documentation for **this** build (SDK 6.2.4.11) — the vendor's
   own description of `ReadLastestLogData`.
2. A test against a **spare / non-production** ZKTeco device: note the record
   count, call the probe, call it again, and see whether the second call returns
   the same records or an empty set. A shrinking result set means a marker is
   being consumed.
3. Only as a last resort, and only with the customer's explicit agreement and
   V2011 closed: the gated probe below.

### The gated probe

```powershell
npm run cli -- probe-latest-log                       # prints why it is blocked; touches nothing
npm run cli -- probe-latest-log --confirm-read-only   # runs the experiment
```

It is **not** part of `npm run poc` and cannot be reached from it. Two
independent gates:

- The CLI refuses without `--confirm-read-only`, which is **flag-only** — there
  is deliberately no environment variable, so a stale `.env` cannot silently
  unlock it.
- In the worker, `ReadLastestLogData` is kept out of the read-only allowlist
  entirely and lives in a separate probe-only set that is unreachable unless
  `--probe-latest-log` was passed. A default run cannot call it however the code
  around it changes.

When unlocked it calls `ReadLastestLogData` **once**, drains at most **20**
records with the already-validated `SSR_GetGeneralLogData` getter, prints raw
values with no check-in/check-out interpretation, writes
`output/latest-log-probe.json`, and disconnects in the worker's `finally`. It
never clears logs, never sets device time, never touches users, and never calls
a marker or counter setter (`SetLastCount`, `ClearGLog`, `ClearData`, … are all
absent from both sets).

Running it still does **not** prove the call is side-effect free — the command
says so in its own output.

---

## Known device reporting quirks

### Firmware version: SDK and device UI disagree

| Source | Value |
|---|---|
| Device UI | `8.0.4.2-20200723` |
| SDK `GetFirmwareVersion` | `Ver 6.60 Sep 19 2019` |

**Neither value is corrected, and neither is treated as authoritative over the
other.** They plausibly describe different components — the SDK string may report
a firmware core, protocol or algorithm version rather than the release label the
UI shows. DijiPeople records what each source reported and nothing more.

The console prints the SDK value labelled `Firmware (SDK)` with a reminder that
the UI may differ; artefacts carry a `firmwareVersionNote` saying the same.

Practical consequence: **do not use the SDK firmware string to gate behaviour or
to identify a device.** Use the serial number, which is unambiguous
(`A2QO221160250`).

### Device timestamps are timezone-local

The device reported its own clock as `2026-08-13T19:10:43` — a wall-clock
reading with **no timezone and no offset**. Every device timestamp (device time
and every punch) is the same: local wall clock as the terminal understands it.

DijiPeople rules, enforced throughout the POC:

- **Never append `Z`** and never call `toISOString()` on a device timestamp.
- **Never assume the gateway machine's timezone.** The machine reading the
  device may not sit in the same timezone as the device.
- Keep the `YYYY-MM-DDTHH:mm:ss` form and treat it as tenant-local until a
  deliberate, tenant-configured timezone is applied later.

`parseLocalWallClock` in [util/time.ts](src/util/time.ts) parses these strings
component-by-component rather than via `new Date(string)`, which would treat
some inputs as UTC. Every artefact carries a `timestampPolicy` field stating the
rule, so a downstream consumer cannot mistake the intent.

The clock-drift check compares device wall clock against host wall clock and
reports the difference. It is a **health signal only** — the POC never adjusts
the device clock (`SetDeviceTime` is not on the allowlist).

---

## Read-only guarantees

The worker routes every SDK call through a single gate with an explicit
allowlist (`ZkemAdapter.AllowedMethods`). Calling anything else throws
`READ_ONLY_VIOLATION` before it reaches the device.

Allowed: `SetCommPassword`¹, `Connect_Net`, `Disconnect`, `GetLastError`,
`GetSerialNumber`, `GetProductCode`, `GetFirmwareVersion`, `GetPlatform`,
`GetDeviceMAC`, `GetVendor`, `GetDeviceTime`, `GetDeviceStatus`,
`ReadAllUserID`, `SSR_GetAllUserInfo`, `ReadGeneralLogData`,
`SSR_GetGeneralLogData`.

¹ Client-side only: it tells the SDK which comm key to present. It writes
nothing to the device, and it is **skipped entirely when `ZK_COMM_KEY=0`**, which
is the reference K50's setting — so the validated call sequence is untouched in
the normal case.

Never called: `ClearGLog`, `ClearData`, `DeleteUserInfoEx`,
`SSR_DeleteEnrollData`, `SSR_SetUserInfo`, `SetUserInfo`, `SetDeviceTime`,
`SetDeviceInfo`, `RestartDevice`, `PowerOffDevice`, `EnableDevice`/`DisableDevice`.

**The physical terminal is never disabled.** Live testing showed `ReadAllUserID`
and `ReadGeneralLogData` both work without it, so the least intrusive path is
used and the device stays usable for staff while the POC runs.

### Connection lifecycle

`create COM instance → Connect_Net → reads → Disconnect → FinalReleaseComObject`,
with the disconnect and release in a `finally` block. A failed read still closes
the session. Because the whole session lives inside one short-lived child
process, a crashed run cannot leave a connection open.

---

## Data & privacy restrictions

Never retrieved, logged, persisted or transmitted:

- fingerprint templates, fingerprint images
- face templates, biometric vectors, enrolment data
- device user passwords / PINs

`SSR_GetAllUserInfo` **does** expose a password in its fourth argument. It is
handled as follows:

1. The worker passes a throwaway buffer for that argument.
2. The instant the call returns, the slot is set to `null` — before any other
   code reads the argument array.
3. `WorkerUser` **has no password property**, so there is no field for it to land
   in, and it never crosses the worker's JSON boundary into the Node process.

No template or biometric API appears anywhere in the allowlist, so none can be
called. Every artefact carries `biometricDataRetrieved: false` and
`devicePasswordsRetained: false`.

---

## Output

Written to `output/` (gitignored — **do not commit real customer attendance data**):

| File | Contents |
|---|---|
| `device-info.json` | runtime, COM, connection, device metadata, clock |
| `users.json` | normalised users |
| `attendance.json` | normalised punches + fingerprints + observed date range |
| `sdk-capabilities.json` | methods the installed SDK exposes |
| `poc-summary.json` | scorecard, counts, guarantees; written even on failure |

Console output stays summarised — the device holds years of history, so the
commands print counts, ranges and a short preview rather than every record.

---

## Concurrency test with Fingerprint Attendance System V2011

The customer still runs *Fingerprint Attendance System V2011* (4.8.7 build 153,
SDK 6.2.4.11). We need to know whether both clients can reach the K50 at once.

**Do not close, modify or terminate the customer's application on their behalf.**
Ask them to run these two tests and record the outcome.

### Test A — V2011 closed
1. Close V2011 completely (check Task Manager).
2. `npm run test`
3. Expected: `Connection: SUCCESS`.

### Test B — V2011 open and connected
1. Open V2011 and confirm it is connected to the device.
2. Leave it connected.
3. `npm run test`
4. Record which happened:
   - **both clients work** — the POC connects and reads while V2011 stays connected; or
   - **the device/SDK rejects simultaneous access** — capture the exact error code
     the POC prints (`DEVICE_UNREACHABLE`, `DEVICE_BUSY`, …) and whether V2011
     also lost its connection.

**Result: not yet run.** Record it here.

| Test | Date | Result | Notes |
|---|---|---|---|
| A — V2011 closed | | | |
| B — V2011 open | | | |

---

## Troubleshooting

| Error | Meaning / fix |
|---|---|
| `CONFIG_INVALID` | `ZK_DEVICE_HOST` missing or a value out of range. Check `.env`, or run the exe with `--help`. |
| `SDK_NOT_AVAILABLE` | Either the worker exe is missing (`npm run worker:publish`) or `zkemkeeper.ZKEM.1` is not registered. |
| `SDK_REGISTRATION_FAILED` (`0x80040154`) | Almost always a 64-bit process. Confirm the published worker is `win-x86`. Otherwise re-register `zkemkeeper.dll` from an elevated prompt. |
| `ARCHITECTURE_MISMATCH` | The worker ran as x64. Re-publish with `-r win-x86`. |
| `DEVICE_UNREACHABLE` | `Connect_Net` returned false. Check power, `Test-NetConnection <host> -Port 4370`, firewall, the comm key, and whether another client holds the device. |
| `CONNECTION_TIMEOUT` | Worker watchdog fired. Raise `ZK_WORKER_TIMEOUT_MS` — a full historical download can take minutes. |
| `READ_USERS_FAILED` / `READ_ATTENDANCE_FAILED` | `ReadAllUserID` / `ReadGeneralLogData` returned false — usually a dropped session. Retry with the device idle and V2011 closed. |
| `READ_ONLY_VIOLATION` | A code change tried to call a non-allowlisted SDK method. This is a bug, not a device problem. |
| `OUTPUT_WRITE_FAILED` | `ZK_OUTPUT_DIR` not writable, or a file is open elsewhere. |

Add `--log-level debug` to any command to see the worker's own trace.

---

## Explicitly out of scope

Production Integration Gateway · Windows service installer · scheduling ·
cloud ingestion endpoint · `RawAttendanceEvent` Prisma model · tenant
integration UI · employee mapping UI · attendance reconciliation · payroll and
leave integration · multi-device orchestration · webhooks/queues/background
workers · Hikvision, Suprema, push/ADMS adapters.

Those belong to the next phase, **after** this POC has been executed
successfully against the physical K50.
