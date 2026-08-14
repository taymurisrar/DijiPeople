# Agent Tooling Matrix

What agents can actually do in this environment, verified rather than assumed.
Its purpose is to stop two failure modes: planning around a capability that does
not exist, and quietly skipping work because a tool was missing without saying so.

**Audited:** 2026-08-14, against commit `05354d9`, on the Windows development
workstation. Re-audit on a different machine or in CI — availability is a
property of the environment, not the repository.

---

## Matrix

| Capability | Status | Current tool | Owning agent | Fallback | Blocks completion? |
|---|---|---|---|---|---|
| `GIT` | **AVAILABLE** | `git` 2.45.2 | Integrator | — | Yes — nothing works without it |
| `REMOTE_GIT` | **AVAILABLE** | `git` over HTTPS; fetch and push verified against `origin` | Integrator | Local-only completion, if policy allows | Yes for shared work |
| `CI_READ` | **AVAILABLE** | `gh` 2.97.0, authenticated (keyring), scopes `repo` · `workflow` · `read:org` · `gist`. **Not on `PATH`** — see below | Integrator | — | No longer blocking |
| `CI_TRIGGER` | **AVAILABLE** | pushing any branch triggers `.github/workflows/ci.yml` | Integrator | — | No |
| `PR_MANAGEMENT` | **AVAILABLE** | `gh pr` — list verified; create/update permitted by the `repo` scope and ADMIN repository permission | Integrator | Push the branch; a human opens the PR | No |
| `BROWSER_AUTOMATION` | **UNAVAILABLE** | none installed in any workspace | QA | `MANUAL_VISUAL`, plus logic extracted and unit-tested | No — recorded as a Known Limitation |
| `TEST_DATABASE` | **PARTIAL** — CI yes, local no | CI: ephemeral `postgres:16-alpine` service container (`database-migration` required, `database-e2e-report` report-only). Local: nothing — no Docker, no `psql` | Database, QA | Locally, unit tests with mocked Prisma; CI performs the authoritative verification | Yes for schema/migration work, via `DB_CI_STATUS` |
| `DEPLOYMENT_API` | **UNAVAILABLE** | none — no Render CLI; Render auto-deploys from `main` | Release/DevOps | Prepare and report `DEPLOYMENT_EXECUTION = BLOCKED_BY_ACCESS` | No — but no agent deployment either |
| `LOG_ACCESS` | **UNAVAILABLE** | none — Render logs are console-only | Release/DevOps | Ask the user to paste logs | No |
| `MONITORING` | **UNAVAILABLE** | no Sentry / Datadog / OpenTelemetry / Prometheus anywhere | Release/DevOps | `/api/health` if the environment is reachable | No |
| `OBSIDIAN_READ` | **AVAILABLE** | filesystem, via `.obsidian-sync.local.json` → `scripts/retrieve-knowledge.mjs` | Architect | Repository knowledge; set `OBSIDIAN_CONTEXT = UNAVAILABLE` | No — never blocks |
| `OBSIDIAN_WRITE_SYNC` | **AVAILABLE** | `scripts/sync-obsidian.mjs` | Knowledge Capture | Knowledge stays in `docs/knowledge/`, still Git-tracked | No — non-blocking by contract |

Status values: `AVAILABLE` · `PARTIAL` · `UNAVAILABLE` · `BLOCKED_ACCESS`.
`UNAVAILABLE` means the tool is absent; `BLOCKED_ACCESS` means it exists but
this environment cannot reach it.

### `TEST_DATABASE` — local versus CI

The split is deliberate, and **developer laptops are not required to run
PostgreSQL**:

| Environment | Capability |
|---|---|
| **CI (authoritative)** | Ephemeral `postgres:16-alpine` per job, created fresh, destroyed with the runner. Runs the full migration history against an empty database, plus seed verification |
| **Local (this workstation)** | None. No Docker, no `psql`. Migration correctness cannot be verified here at all |

So the local agent flow for a schema change is:

1. run every non-DB validation locally (typecheck, unit tests, lint, framework)
2. push the task branch — always permitted
3. let CI's ephemeral database perform the authoritative verification
4. read `DB_CI_STATUS` from the `database-migration` job
5. **block the merge until it passes**

Locally, a schema change reports `DB_VALIDATION = BLOCKED_INFRASTRUCTURE`. That
is honest and expected — it is not a failure, and it is not a pass either.

---

## `gh` is installed but not on `PATH`

Verified 2026-08-15: `gh.exe` lives at `C:\Program Files\GitHub CLI\gh.exe` and
is **not** on the `PATH` of either shell — both were started before the install,
so they never picked it up. `command -v gh` fails in Git Bash and PowerShell
alike, which reads exactly like "not installed".

Invoke it by full path until the shells are restarted:

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run list --repo taymurisrar/DijiPeople
```

**`scripts/finalize-agent-task.mjs` still reports `CI_READ` as
`BLOCKED_BY_ACCESS`** for this reason — it probes `gh --version` through the
`PATH`. The capability is real; the probe is looking in the wrong place. Fixing
the probe to fall back to the known install location is the obvious follow-up.

## Previously the one that blocked — now resolved

**`CI_READ` was the single blocking gap** and is now available. Everything else
degrades gracefully — a missing browser is a
stated limitation, a missing database is a recorded blocker, absent monitoring
is a gap in the report. An unreadable CI verdict *stops merges into shared
branches*, by design, under
[`../../.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).

Either capability resolves it; **neither is required alongside the other**:

- **`gh` CLI** — authenticated, `gh run list` / `gh pr checks` readable ✅, or
- **GitHub API reachability** — HTTPS to `api.github.com` plus a token with
  `repo` scope (still blocked from this sandbox: `curl` returns HTTP 000)

The `gh` route is satisfied, so `REMOTE_CI_ACCESS = AVAILABLE`. Direct HTTP
remains blocked — `gh` reaches GitHub through its own transport, the same way
`git` always could.

---

## Audit summary

Re-audited 2026-08-15 after `gh` was installed.

| Question | Answer |
|---|---|
| **AVAILABLE NOW** | `git`, remote git, CI triggering, **CI read**, **PR management**, Obsidian read + write sync, `dotnet` (gateway), Node 22 / npm 11, ephemeral PostgreSQL **in CI** |
| **CONFIGURATION NEEDED** | Put `gh` on the shell `PATH` (restart the shells), and teach `finalize-agent-task.mjs` to find it. Branch protection still needs a repository admin |
| **RECOMMENDED NEXT** | Browser automation for the runtime-driven UI — now the largest remaining verification gap |
| **NOT NEEDED** | Kubernetes tooling, extra cloud CLIs, an observability platform, a second CI system |

Nothing was installed during this audit. Adding Playwright, Docker or a
monitoring stack changes the development process for everyone and is its own
decision with its own ExecPlan — not a side effect of a framework task.

---

## Re-auditing

```bash
command -v gh git docker psql node      # CLI availability
grep -rn "playwright\|cypress\|puppeteer" --include=package.json .
curl -s -o /dev/null -w "%{http_code}" https://api.github.com/rate_limit
node scripts/retrieve-knowledge.mjs --json <term>   # reports OBSIDIAN_CONTEXT
node scripts/finalize-agent-task.mjs                 # reports REMOTE_CI and push parity
```

**Update this table when a capability changes**, and say so in the task report.
A matrix that quietly goes stale is worse than none — agents would plan against
capabilities that disappeared.
