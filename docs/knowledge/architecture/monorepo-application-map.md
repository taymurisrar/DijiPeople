# Monorepo Application Map

> **Last Verified:** 2026-08-16
> **Verified Against SHA:** `78072d2`
> **Source Paths:** `package.json` (workspaces), `turbo.json`,
> `apps/*/package.json`, `packages/config/index.js`,
> `services/api/src/modules/`, `gateway/`, `tools/zkteco-poc/`, `e2e/`,
> `render.yaml`, `.github/workflows/ci.yml`
>
> This describes the repository; the code is authority over it.

## CURRENT

Nine workspace members — `apps/*` (5), `packages/*` (4), `services/*` (1) and
`e2e` — plus two non-workspace components, `gateway/` and `tools/zkteco-poc/`.

`packages/database`, `packages/types` and `packages/utils` are **empty
directories**, not workspaces. Do not import from them.

## What talks to what

```
                          ┌──────────────────────┐
apps/landing  :3000 ──────▶                      │
apps/web      :3001 ──────▶   services/api :4000 │──▶ PostgreSQL
apps/admin    :3002 ──────▶   NestJS, prefix /api│──▶ Stripe
apps/agent-desktop ───────▶                      │──▶ SMTP
gateway/ (on-prem, .NET) ─▶                      │
                          └──────────────────────┘

apps/docs     :3003    ──▶ nothing. Talks to no one, and no one talks to it.
e2e/                   ──▶ drives landing + admin + api in a browser
```

Every application is a **client of one API**. None calls another directly. The
only cross-app references anywhere are link-outs: landing builds a workspace
login URL from `@repo/config`, and that is the whole of it.

## The five applications

| App | Port | Audience | Auth | Deployment target | CI gates |
|---|---|---|---|---|---|
| `landing` | 3000 | public visitors | **none** — public only | Vercel (`diji-people-landing`) | lint, test-landing, typecheck, build |
| `web` | 3001 | tenant users | tenant JWT (`web` client) | Vercel (`diji-people-web`) | lint, test-web, typecheck, build |
| `admin` | 3002 | platform operators | platform JWT (`admin` client) | Vercel (`diji-people-admin`) | lint, test-admin, typecheck, build |
| `agent-desktop` | n/a | employees, on their workstation | agent JWT (`agent-desktop` client) | manual, unsigned installer | typecheck, build **only** |
| `docs` | 3003 | **nobody** | none | **none** | typecheck, build **only** |

Only `services/api` has committed deployment configuration (`render.yaml`).
**The three Vercel targets are confirmed from the GitHub pull-request checks**,
not from anything in this repository — a Vercel integration deploys all three
frontends on every push, and their build configuration lives in the Vercel
dashboard where nobody can read it from a clean clone. `apps/docs` has no Vercel
project. See [[deployment-architecture]].

## Three auth clients, one API

`web`, `admin` and `agent-desktop` each have their **own** JWT secrets, TTLs,
cookie names and `appClientId`/`aud` check. A token minted for one is rejected
by another. `landing` has no client at all — it is public-only.

This is why root `AGENTS.md` states backward compatibility as a hard rule: an
API response shape is consumed by three frontends, an Electron agent **and** an
on-premise .NET gateway that upgrades on its own schedule.

## The two device-data paths, which are not the same path

This is the distinction most likely to be got wrong, because both end at
"attendance-ish data in the API":

```
Physical devices (ZKTeco etc.)
   └─▶ gateway/  (.NET, runs on customer premises)
          └─▶ services/api/src/modules/attendance-integrations/
                 connectors · devices · gateways · ingestion
                 mapping · operations · provisioning · work-sites
                 └─▶ attendance / attendance-engine

Employee workstations
   └─▶ apps/agent-desktop  (Electron)
          └─▶ services/api/src/modules/agent/
                 └─▶ WorkSession · ActivityEvent · DailyProductivitySummary
```

**They share no code, no contract and no data path.** The desktop agent contains
zero references to a gateway or a device connector, and the gateway contains
zero references to the desktop agent. The desktop agent writes **nothing** to
any attendance model.

Full detail: [[desktop-api-gateway-relationship]].

## Landing's dependency surface

| Landing surface | Proxy / call | API module |
|---|---|---|
| `/request-demo`, `/contact` | `app/api/leads` | `leads` → [[leads]] |
| `/partners`, `/partners/onboarding`, `/partners/activate` | `app/api/partners` | `partner-experience` → [[partners]], [[partner-onboarding]] |
| `/sign/[token]` | `app/api/signatures` | `contracts` → [[contracts-and-agreements]] |
| `/subscribe` | `app/api/public/subscribe` | `billing` → [[billing]] |
| `/`, `/plans`, `/features` | server-side, no proxy | `billing` (`public/plans`, `public/commercial-config`) |

## Desktop agent's dependency surface

| Concern | API module | Notes |
|---|---|---|
| Auth, config, devices, sessions, heartbeat, location | `agent` | Its whole contract |
| Release catalogue | `app-releases` | Registers `AGENT_DESKTOP` — but the agent **never calls it**; only `apps/web` does, for a human download |
| Attendance | — | **No relationship** |
| Gateway | — | **No relationship** |

## `packages/` and who uses them

| Package | Consumers |
|---|---|
| `@repo/config` | api, web, admin, landing — ports, app URLs, CORS, env validation |
| `@repo/ui` | **`apps/docs` only.** Three demo components; not the design system |
| `@repo/eslint-config`, `@repo/typescript-config` | all workspaces |

Deleting `apps/docs` therefore leaves `packages/ui` with zero consumers. The two
decisions are one decision — see [[docs-application]].

## What is undocumented by design

`apps/docs` has no `AGENTS.md` because there is nothing to instruct.
`apps/agent-desktop` has none because nobody wrote one, which is a gap, not a
decision — [[ITEM-0028]].

## Related

[[landing-website]] · [[landing-architecture]] · [[desktop-agent]] ·
[[desktop-agent-architecture]] · [[desktop-api-gateway-relationship]] ·
[[docs-application]] · [[system-architecture]] · [[deployment-architecture]] ·
[[integration-architecture]] · [[qa-and-ci-architecture]] ·
[[tenant-application]] · [[platform-admin]]
</content>
