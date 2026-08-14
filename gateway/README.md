# DijiPeople Integration Gateway

The on-premise service that collects attendance from devices DijiPeople cannot
reach from the cloud, and synchronises it.

```
ZKTeco K50 (LAN)
      ↓  zkemkeeper COM, 32-bit
DijiPeople.ZkTeco.Worker.exe        (x86 child process, one shot per operation)
      ↓  JSON on stdout
DijiPeople.Gateway.exe              (x64 Windows service)
      ↓  outbound HTTPS + service credential
Attendance ingestion API
      ↓
RawAttendanceEvent  →  EmployeeExternalIdentity  →  employeeId
```

This is the runtime for the Phase 1 domain model. It adds no second gateway
model, no second ingestion endpoint, no second authentication mechanism and no
second connector framework — everything below resolves against what already
exists in `services/api`.

---

## Why the process split

`zkemkeeper` is registered only under `HKCR\WOW6432Node`, so it is a 32-bit COM
component and any process that touches it must be x86. Making the whole gateway
x86 to satisfy one legacy connector would tax every future connector with a
constraint none of them share, so the boundary sits at a child process instead:

| | Architecture | Lifetime |
|---|---|---|
| `DijiPeople.Gateway.exe` | x64 | long-running Windows service |
| `DijiPeople.ZkTeco.Worker.exe` | x86 | one short-lived process per operation |

The worker is the same binary the diagnostic POC proved against the physical
K50 (`tools/zkteco-poc/worker`), rebuilt by the packaging script rather than
copied, so a released package can never ship a worker that has drifted from the
source in this repository. The gateway always invokes it with `--json` and
parses the documented contract; it never reads the human-readable report, which
remains for support engineers running the executable by hand.

The split also buys isolation that an in-process COM client could not: a hung
call is killed with the process, and a crashed one cannot take the service down.

---

## Layout

```
gateway/
  src/DijiPeople.Gateway.Host/
    Program.cs                     service host + administration CLI
    Cli/                           configure, install, pair, status, diagnostics
    Cloud/                         the only outbound channel, and its validation
    Configuration/                 local settings and paths
    Connectors/                    runtime adapter contract + registry
      ZkTeco/                      the legacy adapter and its worker supervisor
    Identity/                      DPAPI credential store
    Runtime/                       scheduler, sync, upload queue, provisioning
    Storage/                       SQLite durable store
  tests/DijiPeople.Gateway.Tests/       xunit suite
  tests/DijiPeople.Gateway.FakeWorker/  a worker that fails on demand
  packaging/                       publish.ps1, install.ps1, uninstall.ps1
```

---

## Building and testing

Requires the .NET 8 SDK. Only on a developer machine — a customer machine needs
nothing installed.

```powershell
cd gateway
dotnet build -c Release
dotnet test  -c Release
```

The test suite runs a real child process, because the failures that matter —
a hang, a crash, a flood of output, a contract mismatch — only exist at the
process boundary. It disables xunit parallelism deliberately: the fake worker's
behaviour is selected through an environment variable, and concurrent suites
would leak one test's mode into another's invocation.

### Building the customer package

```powershell
cd gateway/packaging
pwsh ./publish.ps1
```

Produces `gateway/artifacts/dist/DijiPeople.IntegrationGateway-<version>-win-x64.zip`
(~60 MB) plus `release-metadata.json` carrying the version, SHA-256, size,
platform and architecture for `POST /app-releases`.

---

## What the customer machine needs

Windows 10/11 or Server 2016+, 64-bit; LAN access to the terminals; outbound
HTTPS to DijiPeople; and, for ZKTeco, the `zkemkeeper` component their existing
attendance software already installed.

**Not** required: .NET runtime or SDK, Node.js, npm, Git, Visual Studio, VS Code,
or DijiPeople source. Both executables are published self-contained.

The same package works for every tenant. Nothing tenant-specific is baked in —
pairing is what connects an installation to one organisation.

---

## Installing

```powershell
# elevated PowerShell, in the unpacked folder
./install.ps1 -Url https://api.yourcompany.com -PairingCode ABCD-EFGH
```

Copies to Program Files, registers the service as `delayed-auto` under
LocalSystem with restart-on-failure, pairs, and starts.

Everything writable lives under `%ProgramData%\DijiPeople\IntegrationGateway`,
never in the install folder. That separation is what lets an upgrade replace the
binaries without touching the paired credential, the local queue or the logs.

---

## Local state

| Path | Contents |
|---|---|
| `gateway.settings.json` | address, worker path, limits. No secrets. |
| `gateway.identity.json` | gateway id, installation id, version. Safe to send to support. |
| `credential.dat` | the service credential, DPAPI machine scope, ACL'd. |
| `data\gateway.db` | SQLite: observed events, outbound queue, device state, config cache. |
| `logs\gateway-*.log` | rolling, size-limited, daily. |

**No tenant id is stored anywhere**, and none is ever sent. Tenancy is the
server's conclusion from the credential every request, so editing a local file
cannot move a gateway between tenants or make it fetch another gateway's devices.

**Machine-scope DPAPI is a deliberate trade.** The service must start unattended
after a reboot, before any user logs in and possibly under an account with no
loaded profile, so user-scoped protection would leave the credential unreadable
exactly when it is needed. It is honest about its limit: a local administrator on
that machine can read the credential. That is why the credential is scoped to one
gateway, revocable from the web app, and rotatable without reinstalling.

---

## How a sync works

1. The scheduler finds a device that is due — interval, active window, retry
   backoff and per-device jitter all respected — or that an administrator asked
   for through **Sync now**.
2. It takes the device's lock. A second request for a busy device is dropped,
   not queued: running the identical full-history read again would produce
   nothing and risk a concurrent COM session.
3. The adapter runs the worker, which returns the terminal's **entire** stored
   history. This device family has no time-bounded or new-only read; that was
   confirmed against the physical unit, not assumed.
4. Every punch is fingerprinted with the same hash the server uses, and recorded
   locally — including punches outside the import window, so they are never
   reconsidered again.
5. Punches inside the import window are queued, in the same transaction that
   records them. A crash between the two would otherwise mark a punch "seen" but
   never queue it.
6. The uploader sends batches and removes rows **only** after DijiPeople answers.
   Duplicates in the response are a success, not an error.
7. The run is reported as an `IntegrationRun`.

### Import window

A first connection would otherwise import four years of history into live
attendance. The window is chosen per integration (today onwards by default, or a
number of recent days, a specific date, or everything) and is **frozen at
baseline** — recomputing it each poll would make "last 7 days" slide forward and
silently stop admitting yesterday's punches at midnight.

Nothing is ever deleted or altered on the device.

### Timestamps

Device timestamps are wall clock with no offset, kept verbatim end to end. The
gateway never appends `Z`, never parses them into an instant, and never
substitutes its own timezone for a device that has none — a terminal in another
zone would otherwise have every punch silently recorded at the wrong time. A
device with no configured timezone still syncs, but its run is reported PARTIAL
with `DEVICE_TIMEZONE_MISSING` so the gap is visible.

Clock drift is measured and reported. The device clock is never set: it is the
customer's equipment and other software reads it.

---

## Failure behaviour

| Failure | What happens |
|---|---|
| Internet or DNS down | Devices keep being read. Punches queue locally with a capped exponential backoff. |
| API returns 500 | Same. Retried, never discarded. |
| Credential revoked (401/403) | Uploads and provisioning stop, retries back off to 15 minutes, an administrator is told plainly. Reads continue and queue. No retry budget is spent. |
| Gateway restarts mid-upload | In-flight rows return to PENDING and are re-sent. The cloud deduplicates. |
| Device offline | That device alone fails, records health, reports a FAILED run. Other devices and the service are unaffected. |
| Worker hangs | Killed at the watchdog, reported as `WORKER_TIMEOUT`. |
| Worker floods stdout | Killed as soon as the ceiling is crossed, output never parsed. |
| Worker returns garbage or a different contract version | Refused. Misparsing would produce plausible-looking punches, which is worse than a failed sync. |

---

## Provisioning

The transport is complete — claim under a server-side lease, execute, report,
release — and three independent gates stand between a job row and a terminal:
the planner does not create jobs for an uncertified connector, the API refuses to
hand one out, and the adapter refuses to run it.

**ZKTeco write-back is NOT certified.** The runtime adapter does not advertise
`WRITE_USERS`, so the scheduler cannot reach it, and `ProvisionUserAsync` returns
`WRITE_NOT_CERTIFIED`. Certifying it requires a physical test on the customer's
terminal establishing which SDK write calls are safe on a device their V2011
software also manages. Guessing at that against a production terminal is exactly
what this phase must not do.

---

## Read-only guarantees, preserved from the POC

x86 enforced three ways · read-only SDK allowlist · `Disconnect` and COM release
in a `finally` · no biometric read anywhere in the type system · device passwords
discarded inside the worker before they cross a process boundary · no log
clearing · no clock mutation · no user mutation during attendance sync.

`ReadLastestLogData`, `ReadMark`, `SetLastCount`, `ClearGLog` and `ClearData` are
absent from the allowlist and are never invoked. The customer's V2011 software
reads the same terminal and would share any device-side read marker, so
advancing one could make its next incremental download silently skip records.

---

## Networking

Outbound HTTPS only. The gateway listens on no port and accepts no inbound
connection. Device traffic stays on the LAN (`gateway → device:4370`), and
nothing in DijiPeople's cloud ever dials a `192.168.x.x` address. The default
HTTP handler honours the machine's system proxy settings; no bespoke enterprise
proxy scheme is implemented.
