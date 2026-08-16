# Desktop Agent, API and Gateway — how the three actually relate

> **Last Verified:** 2026-08-16
> **Verified Against SHA:** `78072d2`
> **Source Paths:** `apps/agent-desktop/src/main/`,
> `services/api/src/modules/agent/`,
> `services/api/src/modules/attendance-integrations/`,
> `services/api/src/modules/app-releases/`, `gateway/`, `tools/zkteco-poc/`
>
> This describes the repository; the code is authority over it.

## The claim this note exists to settle

**The DijiPeople desktop agent and the DijiPeople integration gateway are not
related.** They are two independent products that happen to share a name prefix,
an API, and a loose association with "time at work".

Verified by search at `78072d2`, in both directions:

- `apps/agent-desktop/src/**` contains **no** reference to a gateway, a device
  connector, or `app-releases`.
- `gateway/**` contains **no** reference to `agent-desktop`.

Anyone planning work that touches "the agent" must first establish **which
one**. Getting this wrong means designing against the wrong contract, the wrong
data model and the wrong deployment story.

## The two paths, side by side

| | **Integration Gateway** | **Desktop Agent** |
|---|---|---|
| What it is | .NET service, `gateway/DijiPeople.Gateway.sln` | Electron app, `apps/agent-desktop` |
| Runs on | customer premises | the employee's workstation |
| Installed by | the customer's IT | the individual employee |
| Reads from | physical attendance devices (ZKTeco etc.) | the OS — idle time, foreground window |
| API surface | `modules/attendance-integrations/` — `connectors`, `devices`, `gateways`, `ingestion`, `mapping`, `operations`, `provisioning`, `work-sites` | `modules/agent/` — 16 routes under `@Controller('agent')` |
| Auth | gateway credentials, `gateway-auth.guard.ts` | `agent-desktop` JWT client, own secrets and TTLs |
| Writes to | attendance models | `WorkSession`, `ActivityEvent`, `DailyProductivitySummary` |
| Produces | **attendance** — punches, shifts | **utilisation** — active/idle/away seconds |
| Upgrade cadence | on the customer's schedule, unobservable | auto-update — currently broken, [[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] |

## The desktop agent produces no attendance data

Worth stating flatly, because both the package description and the repository
map call it an "attendance agent":

- `agent.module.ts` imports only `JwtModule` and `AuditModule`.
- `agent.service.ts` contains **no reference to attendance** at all.
- No heartbeat creates a punch, a shift or an attendance record.

If a task needs attendance data, the desktop agent is not where it comes from.
If a task changes attendance, the desktop agent is not a consumer to worry
about. The naming is the only thing connecting them.

## Where they do touch: `app-releases`, and only nominally

`services/api/src/modules/app-releases/` is a shared catalogue of downloadable
artefacts. It registers `AGENT_DESKTOP` as an app key, and the gateway has its
own entry.

But the desktop agent **never calls it**. The catalogue is consumed by
`apps/web` → Settings → Apps & downloads, by a human clicking Download, gated on
`appDownloads.read`. The agent's own updater points at a `generic`
`electron-updater` feed at a URL no route serves.

The two cannot simply be joined, for two reasons that are easy to miss:

1. **Shape.** `electron-updater`'s generic provider expects a `latest.yml`
   directory feed. `app-releases` serves a JSON API (`GET /app-releases/latest`,
   `GET /app-releases/:id/download`).
2. **Auth.** Every `app-releases` route is behind
   `@UseGuards(JwtAuthGuard, PermissionsGuard)` with
   `@Permissions('appDownloads.read')`. `electron-updater`'s generic provider
   sends no `Authorization` header at all.

So "just point the updater at `app-releases`" is not a fix — it is a design
decision with three viable answers, which is why
[[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] is
`PLAN_REQUIRED` rather than a one-line change.

## Tenant resolution differs, and both are correct

Neither component accepts a tenant from its payload — the rule in
[[multi-tenancy]] holds on both paths — but they establish it differently:

- **Desktop agent**: the employee authenticates with e-mail and password; the
  server resolves the tenant from the user and embeds it in the JWT. The app
  never holds or sends a `tenantId`.
- **Gateway**: the tenant comes from the gateway's own registered credential.

Both follow the principle in [[integration-architecture]] — "the tenant is
resolved from the credential, device registration or gateway identity, never
from the payload body".

## Contract stability obligations differ sharply

Both are deployed software you cannot reach, but the consequences are not
symmetric:

- **Gateway** — runs on customer premises and upgrades on the customer's
  schedule. A contract change is breaking for installations nobody can see.
  Version or extend additively; never repurpose a field.
- **Desktop agent** — nominally auto-updating, so a contract change *should* be
  recoverable. **It currently is not**, because the update feed is dead. Until
  BUG-0034 is resolved, treat the agent's contract as being as frozen as the
  gateway's: there is no mechanism to move an installed agent forward.

That last point is the practically important one, and it is not obvious from
either component's code.

## Related

[[desktop-agent]] · [[desktop-agent-architecture]] ·
[[monorepo-application-map]] · [[integration-architecture]] · [[attendance]] ·
[[multi-tenancy]] · [[authentication]] · [[deployment-architecture]] ·
[[BUG-0034-desktop-agent-auto-update-points-at-an-endpoint-that-does-no]] ·
[[ITEM-0026]]
