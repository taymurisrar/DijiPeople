# AGENTS.md — `apps/agent-desktop`

Scope-specific rules for the Electron attendance agent. Root
[`AGENTS.md`](../../AGENTS.md) still applies; this adds what is different here,
and this app is different in ways that matter.

---

## Why this app needs its own rules

Every other surface in this product runs in a browser or on a server. This one
runs **on an employee's own machine, in the background, with native OS
capabilities**:

- it reads the **active window title** and the foreground application path;
- it captures **geolocation**;
- it holds a refresh token in the **OS credential vault**;
- it starts on login and runs unattended;
- it installs its own updates.

Every one of those is a capability the employee cannot easily observe. A defect
here is not a broken screen someone reports — it is surveillance data that is
wrong, over-collected, or leaked, on a machine nobody is looking at.

---

## The rules that are specific to this app

### 1. Collect only what the tenant enabled, and decide it server-side

`AgentSettings` carries `captureActiveApp`, `captureWindowTitle` and the
telemetry retention window. Those flags are enforced **on the API when the event
is written** (`agent.service.ts`, `saveHeartbeatEvent`), not only in the client.

Never move that decision into the agent alone. A client-side-only check means a
stale config, a downgrade, or a tampered build collects window titles for a
tenant that switched it off — and the tenant has no way to tell.

### 2. Never log what the agent reads

`AgentLogger` writes to disk on the employee's machine. Window titles, app paths,
coordinates and tokens must never reach it. Log the *event*, not the *content*:
`agent.heartbeat.sent count=12`, never the titles.

### 3. The API is the clock and the arbiter

The agent proposes; the server decides. Session state, productivity totals and
what counts as active are the API's, from the events it accepts. Do not compute a
total locally and send it — send observations.

### 4. Retries must be idempotent end to end

The offline queue re-sends whole batches. Anything the agent can send twice must
be safe to receive twice: see BUG-0036, where replayed heartbeats permanently
inflated `WorkSession.totalActiveSeconds` and every derived utilisation figure.
Establish the dedupe key before writing a new send path, not after.

### 5. Fail loudly in the logs, quietly in the UI

A background agent that shows an employee a technical error is noise; one that
swallows the reason is undiagnosable. Log the reason with the failure — BUG-0034
was an update feed that 404'd for months while logging
`agent.update.check_failed` with nothing attached — and surface to the user only
what they can act on.

### 6. Do not strand the employee

If the agent blocks tracking — a required update, a permission refusal — the
dialog must offer something that works. BUG-0034's forced-update dialog offered
"Check for updates" against a feed that did not exist, leaving Quit as the only
functioning button.

---

## Contract with the API

**The DTOs in `services/api/src/modules/agent/dto/` are the contract, and the
two sides are validated in different workspaces.** The API's global
`ValidationPipe` runs `forbidNonWhitelisted: true`, so a field this app sends
that the DTO does not declare is a **400, not an ignored extra**.

That exact drift shipped: BUG-0035, where every logout returned 400 because this
app sent `deviceFingerprint` and `AgentLogoutDto` did not declare it. The agent
swallowed the failure, showed a successful sign-out, and left the refresh token
live for its full TTL.

`services/api/src/modules/agent/agent-client-contract.spec.ts` now validates the
payloads in `src/main/api-client.ts` against those DTOs through a pipe built with
the same options as `main.ts`. **If you change a request body here, that spec is
where it breaks — fix it there, do not work around it.**

Prefer changing the **server** when the two disagree. Deployed agents cannot be
assumed to update: BUG-0034 means the update feed does not exist yet, so a
contract change that requires a new client build strands every installed copy.

---

## Testing

There is **no test runner in this workspace yet** — that is the open half of
[`ITEM-0028`](../../docs/backlog/items/ITEM-0028-apps-agent-desktop-has-no-agents-md-and-no-test-coverage.md),
and it is stated here rather than implied so nobody assumes coverage that does
not exist.

What is covered today, and where:

| Behaviour | Covered by |
|---|---|
| Request payloads match the API DTOs | `services/api/.../agent-client-contract.spec.ts` |
| Login does not enumerate accounts | `services/api/.../agent-login-enumeration.spec.ts` |
| Replayed heartbeats are not double counted | `services/api/.../heartbeat-idempotency.spec.ts` |
| Public agent writes are rate limited | `services/api/.../public-write-rate-limit.invariant.spec.ts` |

All of those live on the **API** side. Nothing exercises this app's own logic —
`activity-tracker`, `offline-queue`, `session-manager`, `secure-store`,
`update-manager`. Until a runner exists, `npm --workspace agent-desktop run
check-types` is the only automated signal here.

When adding one, prefer the pure modules first: `offline-queue` and
`config-manager` have no Electron dependency and are where a defect is most
expensive.

---

## Commands

```bash
npm --workspace agent-desktop run check-types   # tsc --noEmit — the only gate today
npm --workspace agent-desktop run build         # main + renderer
npm --workspace agent-desktop run dist:win      # NSIS installer
```

`dist:win` produces an **unsigned** installer —
[`ITEM-0026`](../../docs/backlog/items/ITEM-0026-desktop-agent-windows-installer-is-unsigned.md).
Windows SmartScreen warns on it, and an unsigned binary that asks for background
telemetry permissions is exactly what an employee should refuse. Do not describe
the installer as production-ready until that is resolved.
