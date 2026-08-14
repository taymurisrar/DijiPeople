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
| `CI_READ` | **BLOCKED_ACCESS** | none — no `gh`, `api.github.com` returns HTTP 000 | Integrator | Local gates, and **the shared-target merge gate blocks** | **Yes** — blocks merging to shared branches |
| `CI_TRIGGER` | **AVAILABLE** | pushing any branch triggers `.github/workflows/ci.yml` | Integrator | — | No |
| `PR_MANAGEMENT` | **UNAVAILABLE** | none — no `gh` | Integrator | Push the branch; a human opens the PR | No |
| `BROWSER_AUTOMATION` | **UNAVAILABLE** | none installed in any workspace | QA | `MANUAL_VISUAL`, plus logic extracted and unit-tested | No — recorded as a Known Limitation |
| `TEST_DATABASE` | **UNAVAILABLE** | no Docker, no `psql`; the 9 e2e suites need a live DB | Database, QA | Unit tests with mocked Prisma | No — recorded as `DB_E2E = BLOCKED_INFRASTRUCTURE` |
| `DEPLOYMENT_API` | **UNAVAILABLE** | none — no Render CLI; Render auto-deploys from `main` | Release/DevOps | Prepare and report `DEPLOYMENT_EXECUTION = BLOCKED_BY_ACCESS` | No — but no agent deployment either |
| `LOG_ACCESS` | **UNAVAILABLE** | none — Render logs are console-only | Release/DevOps | Ask the user to paste logs | No |
| `MONITORING` | **UNAVAILABLE** | no Sentry / Datadog / OpenTelemetry / Prometheus anywhere | Release/DevOps | `/api/health` if the environment is reachable | No |
| `OBSIDIAN_READ` | **AVAILABLE** | filesystem, via `.obsidian-sync.local.json` → `scripts/retrieve-knowledge.mjs` | Architect | Repository knowledge; set `OBSIDIAN_CONTEXT = UNAVAILABLE` | No — never blocks |
| `OBSIDIAN_WRITE_SYNC` | **AVAILABLE** | `scripts/sync-obsidian.mjs` | Knowledge Capture | Knowledge stays in `docs/knowledge/`, still Git-tracked | No — non-blocking by contract |

Status values: `AVAILABLE` · `PARTIAL` · `UNAVAILABLE` · `BLOCKED_ACCESS`.
`UNAVAILABLE` means the tool is absent; `BLOCKED_ACCESS` means it exists but
this environment cannot reach it.

---

## The one that blocks

**`CI_READ`.** Everything else degrades gracefully — a missing browser is a
stated limitation, a missing database is a recorded blocker, absent monitoring
is a gap in the report. An unreadable CI verdict *stops merges into shared
branches*, by design, under
[`../../.agent/context/task-completion-contract.md`](../../.agent/context/task-completion-contract.md).

Either capability resolves it; **neither is required alongside the other**:

- **`gh` CLI** — authenticated, `gh run list` / `gh pr checks` readable, or
- **GitHub API reachability** — HTTPS to `api.github.com` plus a token with
  `repo` scope

Until one exists, `REMOTE_CI_ACCESS = BLOCKED` and the gate holds. **Do not
bypass it.** The gate is the control; its inconvenience is the point.

---

## Audit summary

| Question | Answer |
|---|---|
| **AVAILABLE NOW** | `git`, remote git, CI triggering, Obsidian read + write sync, `dotnet` (gateway), Node 22 / npm 11 |
| **CONFIGURATION NEEDED** | `CI_READ` — install `gh` or open API access. This is the only blocking gap |
| **RECOMMENDED NEXT** | An ephemeral PostgreSQL for integration and migration testing; then browser automation for the runtime-driven UI |
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
