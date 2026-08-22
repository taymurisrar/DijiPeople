# Platform Access

> **Last verified:** 2026-08-22
> **Verified against commit:** e9819a3
>
> Every id, hostname and setting below was read from the live provider APIs on
> that date, not copied from a dashboard screenshot. Re-derive them rather than
> trusting them if a deploy behaves unexpectedly — see [Verifying reality](#verifying-reality).

How an agent session reaches the three planes DijiPeople runs on, what it may do
there, and how to tell whether production is actually in the state a task
believes it is.

This document does **not** contain credentials. It names the environment
variables that hold them and where they live. `validate-framework.mjs` scans
every markdown file under `docs/deployment/` for committed connection strings,
so keep it that way.

---

## The three planes

DijiPeople is not deployed to one provider. Three separate control planes each
own a different layer, and confusing them wastes a debugging cycle:

| Plane | Provider | What it runs | Control |
|---|---|---|---|
| **Frontends** | Vercel | `apps/web`, `apps/admin`, `apps/landing` | `vercel` CLI, `VERCEL_TOKEN` |
| **Backend API** | Render | `services/api` (NestJS, port 4000, prefix `/api`) | `render` CLI, `RENDER_API_KEY` |
| **Database** | Neon | The PostgreSQL 17 instance the API connects to | REST API, `NEON_API_KEY` |

Render hosts **no** datastore — `render postgres list` returns `{"data": []}`.
The database is Neon's, and `render.yaml` reaches it purely through
`DATABASE_URL`. A question about tables, migrations, connection limits or
restore windows is a **Neon** question even though the API is on Render.

---

## Where the credentials live

All three are **User-scope Windows environment variables** on the maintainer's
workstation. They are deliberately **not** in `.env`, not in `services/api/.env`
and not in the repository at any path:

| Variable | Plane | Scope |
|---|---|---|
| `VERCEL_TOKEN` | Vercel | Team `taimurisrar806-2915s-projects` |
| `RENDER_API_KEY` | Render | Account-wide (Render offers no narrower key) |
| `NEON_API_KEY` | Neon | **Project-scoped** to `wispy-dream-20751252` |

### Loading them inside a session

A shell started before the variables were set does **not** inherit them, and
Git Bash does not read the Windows User environment on its own. Read them from
the registry rather than pasting the secret into a command, which would put it
in the session transcript:

```bash
export PATH="/c/Users/hp/bin:$PATH"                      # render.exe lives here
export RENDER_API_KEY=$(powershell -NoProfile -Command \
  "[Environment]::GetEnvironmentVariable('RENDER_API_KEY','User')" | tr -d '\r\n')
```

The same pattern works for `VERCEL_TOKEN` and `NEON_API_KEY`. Note the
`tr -d '\r\n'` — PowerShell appends CRLF, and a trailing `\r` inside an
`Authorization` header produces a confusing `401` rather than a parse error.

---

## What an agent may do with them

**Default posture is read-only.** None of the three tokens is technically
read-only — a Vercel token acts as its user, a Render key carries full account
permissions, and a Neon project-scoped key can drop branches. The restraint is a
working agreement, not a permission boundary:

| Allowed without asking | Requires explicit user approval |
|---|---|
| Deploy status and history | Triggering a deploy or redeploy |
| Runtime and build logs | Creating, editing or deleting an environment variable |
| Health endpoints | Restarting or suspending a service |
| Listing projects, services, branches, endpoints | Creating or deleting a Neon branch |
| Reading Neon branch/endpoint **settings** | Any write to production data |

Reading environment variables is permitted but is not free: the response
contains `STRIPE_SECRET_KEY`, `JWT_ACCESS_SECRET`, `SECRET_ENCRYPTION_KEY` and
`DATABASE_URL` in plaintext. Filter the response down to the field being checked
and never print a raw value — the pattern under
[Verifying reality](#verifying-reality) shows how.

This posture exists because `main` is the production deploy trigger. An agent
holding these tokens can deploy DijiPeople to real tenants without a PR, a CI
verdict or a release record, which is precisely what
[`branch-model.md`](../../.agent/context/branch-model.md) forbids.

---

## Vercel — the three frontends

```bash
vercel --version                                  # 59.4.0, installed globally via npm
vercel whoami --token "$VERCEL_TOKEN"             # -> taimurisrar806-2915
vercel project ls --token "$VERCEL_TOKEN"
```

| Project | Production URL | Workspace |
|---|---|---|
| `diji-people-web` | `https://app.dijipeople.com` | `apps/web` |
| `diji-people-admin` | `https://admin.dijipeople.com` | `apps/admin` |
| `diji-people-landing` | `https://www.dijipeople.com` | `apps/landing` |

The custom domains above are the production aliases. The `*.vercel.app` hosts
still referenced throughout
[`environment-variables.md`](../environment-variables.md) resolve to the same
deployments; when the two disagree, the custom domain is what a tenant actually
loads.

---

## Render — the backend API

The Render CLI is a **TUI by default** and will hang forever waiting on input in
a non-interactive session. Always pass `-o json --confirm`:

```bash
render workspace set tea-d7jrft57vvec73dqhp6g -o json --confirm   # once per machine
render services list -o json --confirm
render deploys list srv-d7js7fqqqhas739v4i7g -o json --confirm
render logs --resources srv-d7js7fqqqhas739v4i7g --limit 100 -o json --confirm
```

| Field | Value |
|---|---|
| Workspace | `tea-d7jrft57vvec73dqhp6g` — "Taimur's workspace" |
| Service | `DijiPeople`, `srv-d7js7fqqqhas739v4i7g`, type `web_service` |
| Origin | `https://dijipeople.onrender.com` |
| Health | `https://dijipeople.onrender.com/api/health` |

The CLI is the official `render-oss/cli` build at `C:\Users\hp\bin\render.exe`,
installed from the GitHub release and SHA256-verified against Render's published
checksum. **The npm package named `render-cli` is an unrelated template
renderer** — installing it instead is a live trap, since the name looks right.

Render exposes no `env` subcommand; environment variables are reachable only
through the REST API at
`https://api.render.com/v1/services/{serviceId}/env-vars`.

---

## Neon — the database

Neon has no CLI installed here. The REST API is sufficient and avoids a global
dependency:

```bash
API="https://console.neon.tech/api/v2/projects/wispy-dream-20751252"
curl -s -H "Authorization: Bearer $NEON_API_KEY" "$API"
curl -s -H "Authorization: Bearer $NEON_API_KEY" "$API/branches"
curl -s -H "Authorization: Bearer $NEON_API_KEY" "$API/endpoints"
```

| Field | Value |
|---|---|
| Project | `dijipeople`, id `wispy-dream-20751252` |
| Region | `aws-us-east-1` |
| Postgres | 17 |
| Branch | `production`, `br-snowy-mud-am2378xn` — default, **not protected** |
| Endpoint | `ep-crimson-field-amm402fv`, type `read_write` |
| Host | `ep-crimson-field-amm402fv.c-5.us-east-1.aws.neon.tech` |
| Pooler | **disabled** (`pooler_enabled: false`) |
| Autoscaling | 0.25 – 2 CU |
| Scale to zero | **disabled** (`suspend_timeout_seconds: 0`) |
| History retention | **21600s — 6 hours** |

Four of those rows contradict what general Neon guidance assumes, and each
changes how a symptom should be read:

- **Scale-to-zero is off.** A slow first request is *not* a cold start. Look at
  the Render service, the Prisma pool, or the query — not at Neon suspend.
- **The pooler is off**, so there is no PgBouncer in front of this database and
  the transaction-pooling constraints behind BUG-0086 do not currently apply.
  See the drift note below before relying on that.
- **History retention is six hours.** Instant restore reaches back six hours and
  no further. It is not a backup, and it will not recover a bad migration
  discovered the next morning. Anything destructive needs its own backup first,
  per the expand/backfill/contract rule in
  [`prisma/AGENTS.md`](../../services/api/prisma/AGENTS.md).
- **The production branch is not protected.** Nothing at the provider level
  prevents deleting it.

### Known drift: the migration connection is unset

`prisma.config.ts` and `packages/config` read **`DIRECT_DATABASE_URL`** for the
migration connection, and `render.yaml` declares it. On the live Render service
as of 2026-08-22:

- `DIRECT_DATABASE_URL` is **not set**
- `DIRECT_URL` **is** set — and that name appears nowhere in the codebase, so
  nothing reads it

Migrations therefore fall back to `DATABASE_URL`, which is currently the
**direct** endpoint (`pooled=false`), so `prisma migrate deploy` succeeds and
the fallback is behaving exactly as documented.

**The risk is latent, not active.**
[`environment-variables.md`](../environment-variables.md) recommends the pooled
endpoint for `DATABASE_URL` — "a good choice for it". Following that advice
without also setting `DIRECT_DATABASE_URL` reproduces BUG-0086 exactly:
`pg_advisory_lock` cannot be held across a transaction-pooled connection,
`preDeployCommand` aborts with `P1002` after ten seconds, and every step after
the migration — `seed:config`, `seed:verify`, `seed:admin`, `seed:legal`,
`legal:publish` — never runs.

Two things would close it: set `DIRECT_DATABASE_URL` to the direct endpoint, and
delete the dead `DIRECT_URL`. Both are environment-variable writes on a
production service, so both need explicit approval per the table above.

---

## Verifying reality

### Did the merge actually deploy?

Merging to `main` does not guarantee a deploy, and a merge has previously sat
undeployed for 48 minutes with no error anywhere. The commit the API reports is
the only authority:

```bash
curl -s https://dijipeople.onrender.com/api/health
# {"commitShort":"3602ec3", "environment":"production", ...}
```

Compare `commitShort` against the merged SHA. If they differ, the deploy has not
landed yet — check `render deploys list` before concluding anything about the
code. This is what `DEPLOYMENT_DRIFT_STATUS` in the completion contract means.

### Reading one env var without spilling the others

Never print a raw env-var response. Filter to the field in question:

```bash
curl -s -H "Authorization: Bearer $RENDER_API_KEY" \
  "https://api.render.com/v1/services/srv-d7js7fqqqhas739v4i7g/env-vars?limit=100" \
 | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{
     const rows=(JSON.parse(s)||[]).map(x=>x.envVar||x);
     const r=rows.find(x=>x.key==='DATABASE_URL');
     const host=(String(r.value).match(/@([^/:?]+)/)||[])[1]||'';
     console.log('pooled=' + /-pooler/.test(host));   // boolean only
   })"
```

---

## Related

- [`environments.md`](environments.md) — what is configured where
- [`deployment-runbook.md`](deployment-runbook.md) — executing a release
- [`incident-response.md`](incident-response.md) — when a deploy goes wrong
- [`environment-variables.md`](../environment-variables.md) — the full inventory
- [`repository-health.md`](../../.agent/context/repository-health.md) — `MAIN_SYNC_STATUS`, deployment drift
- [`branch-model.md`](../../.agent/context/branch-model.md) — why only a RELEASE task may touch `main`
