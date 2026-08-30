---
title: 2026-08-29 — the records reconciled with production
category: release
date: 2026-08-29
---

# Release — the records reconciled with production

Produced by [[SESSION-0075]].

A documentation-only promotion. No source, no schema, no migration, and
deliberately no behaviour change.

| | |
|---|---|
| **Previous production** | `6d17989a` — deployed 13:48 UTC, live and healthy |
| **Release** | `41a4c532` — PR #57, merged 15:25 UTC |
| **Contents** | 5 commits, 13 files, all under `docs/` and `.agent/context/` |
| **Migrations** | None. `git diff --name-only origin/main..origin/develop -- services/api/prisma/` was empty before the merge. |
| **Rollback class** | Documentation. Nothing to unwind; reverting changes no behaviour. |
| **CI** | PASS on `ff470930`, run `33259570461`, read on the exact PR head |

## What this was for

The code reached production earlier the same day in `6d17989a` — the identity
contract phase, leave entitlements and the tenant shell fixes. `main` carried the
code but not the records describing it: the release record for that deployment,
two engineering histories, a session closure and a bug note all sat on `develop`
only.

So this promotion closes a gap between what production runs and what `main` can
account for. `origin/develop..origin/main` was 0 commits before the merge, so
there was no divergence to reconcile — only a fast-forward of documentation.

## The deploy did not fire, and that is recorded rather than fixed

Render started no deployment for `41a4c532`. Polled for seven minutes; the most
recent deploy remains `6d17989a`, `status: live` since 13:48:57 UTC. `render.yaml`
declares no `buildFilter` and no `autoDeploy: false`, so a path filter does not
explain it — this is the same "a merge to `main` does not guarantee a deploy"
behaviour recorded against an earlier release, where a merge sat undeployed for
48 minutes with no error surfaced anywhere.

**No action was taken, on purpose.** The delta is documentation; a redeploy would
rebuild byte-identical application code and carries the usual deployment risk for
no gain. Production is serving the correct code:

```
GET https://api.dijipeople.com/api/health
{"status":"ok","commit":"6d17989a…","environment":"production","outboxWorker":{"enabled":true}}
```

The consequence to be aware of: `/api/health` will report `6d17989a` while `main`
is `41a4c532`, until the next code release moves it. That is a reporting gap, not
a functional one, and it resolves itself on the next deploy.

## A false alarm worth writing down

The first health check of this session returned Cloudflare `520`, and a follow-up
using `curl -w` reported HTTP `000` for the API, the app, the admin console and
the tenant workspace at once.

Neither was real. Three consecutive plain `curl` calls returned `status: ok`, and
`curl -w` is known to report `000` for every URL in this environment — two
previous sessions drew false conclusions from exactly that. Four surfaces failing
simultaneously is far more likely to be the instrument than the estate; the `520`
was a transient edge response.

The rule this keeps proving: confirm an outage with a second, different method
before reporting one.

## Verification performed

- `origin/main..origin/develop` = 0 commits after the merge.
- No file outside `docs/` and `.agent/context/` in the diff.
- Production health checked directly, three times, before and after the merge.
- Render deployment list checked directly rather than inferred from the merge.
