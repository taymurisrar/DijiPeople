# 2026-08-17 — Documenting `apps/web`, the tenant product

| | |
|---|---|
| **Task** | TASK-0003 (`KNOWLEDGE`, LARGE) |
| **Branch** | `agent/knowledge-web-app-documentation` |
| **Base SHA** | `1af3690` |
| **QA run** | `docs/qa/runs/2026-08-17-web-app-documentation-1af3690.md` |
| **Product code changed** | **None** |

## What made this different from TASK-0002

The three applications documented last time were undocumented. `apps/web` is
not: it already had two knowledge notes, a good `AGENTS.md` and coverage in four
context documents. So the job was **verification first, depth second** — and a
note repeating what already existed would have been a regression.

That reframing produced the most useful result of the task: `apps/web/AGENTS.md`
is **accurate on every one of its 61 file references**, which is a materially
different starting point from `apps/landing/AGENTS.md`, where four documents
agreed with each other and all four were wrong. Confirming a document is right
is a real outcome, and reporting it as such is what stops the next audit
re-deriving it.

## What was learned that is worth keeping

### The runtime's registries are inert, and the documentation told agents to use them

`registerModule`, `registerCommand`, `registerEntityMetadata` and
`resolveModuleRuntimeContext` have **zero call sites**. Modules are spec objects
imported directly by route files. `apps/web/AGENTS.md` instructed step 3 of the
new-module workflow to register in two of those files — a step with no effect,
performed by exactly the reader who is doing the right thing by consulting the
scope file first.

`.agent/context/runtime-module-system.md` already had this right. **The
scope-authoritative file was the wrong one**, which inverts the usual assumption
that the more specific document is the more current.

The live counterexample is in the same app: `settingsAdapterRegistry` holds 82
of the 105 specs and throws at module load on a duplicate or malformed key. That
is what a registry looks like when it is load-bearing, and it is absent from the
runtime documentation entirely.

### A proxy that "helps" on a 403 is the most dangerous shape in this layer

Two handlers ask for another employee's payslips or bank accounts and, on the
API's `403`, silently re-request `/me/*` and return `200`. The caller sees
**their own salary and bank details labelled as somebody else's**.

Nothing crosses an identity boundary outward, so it is not a leak — but it
converts a refusal into an apparent success on the two most sensitive record
types in the product, and it makes permission misconfiguration silent. The
generalisable rule: **a proxy must never interpret an authorization answer.**
Substituting different data is worse than forwarding the error, even when the
substituted data belongs to the caller.

### The tenant-isolation path is genuinely well built — say so

Workspace resolution runs before any render and fails closed, gated on
`PLATFORM_ENVIRONMENT` rather than `NODE_ENV`; hostname suffix confusion is
defended by exact-suffix plus single-label arithmetic; the six workspace headers
are deleted before being set so a browser cannot forge them; and **zero of 416
route handlers accept a `tenantId` from the client**.

Recording the strong parts matters as much as the defects. An agent who reads
only the bug list concludes this app is fragile everywhere and starts
rebuilding the part that works.

### Verification depth has to scale with claim severity

Three subagent claims failed independent re-verification: a line count, "zero
`Tab` handlers" (there are nine, none in a modal — conclusion right, evidence
wrong), and "14 catch-alls without encoding" (17). One of my own measurements
was also wrong and I published it before catching it.

The lesson is not "agents are unreliable" — their substantive findings held. It
is that **counts and absence claims are the two forms that need re-measuring
before they enter a durable note**, which is the same conclusion TASK-0002
reached about enumerations, arrived at from the other direction.

## Where application knowledge went, and why not where the convention says

TASK-0002 established that an application gets a `product/` note and an
`architecture/` note, and wrote that into `docs/knowledge/README.md`.
`tenant-application.md` has lived under `modules/` since before that rule.

It stays there. `scripts/sync-obsidian.mjs` has **no prune step** — verified by
search — so moving the source would leave the published note stranded in
`03 - Modules/Generated` as the vault's first orphan. The vault currently has
**zero** orphans, and creating one to satisfy a filing convention is the wrong
trade. `modules/README.md` now records the exception rather than asserting a
rule the repository does not follow.

## Files written

**New** — `docs/knowledge/architecture/web-architecture.md`.

**Updated in place** — `docs/knowledge/modules/tenant-application.md` (refreshed
with verification metadata and the findings above), `modules/README.md`.

**Documentation corrected** — `apps/web/AGENTS.md` (the impossible workflow, the
missing `workspace/` segment, the testing scope), `apps/web/README.md` and
`apps/admin/README.md` (both were `create-next-app` boilerplate pointing at port
3000, which is landing — the same defect fixed in `apps/docs` by TASK-0002).

**Records** — BUG-0039 … BUG-0046 created (BUG-0044 fixed here);
ITEM-0034 … ITEM-0037 created.

### Regenerate generated artefacts last, not when it feels done

The `Framework validation` CI job failed on this branch because the Obsidian
dashboards were stale. The cause was ordering: `generate-dashboards.mjs` ran,
and *then* the engineering-history record was written — and the dashboards count
those records.

Locally the failure was invisible, because `validate-framework` was already
failing on an unrelated foreign deletion in the working tree
(`.obsidian-sync.example.json`, deleted-but-unstaged by someone else). **A check
that is already red hides the next thing that breaks it.** The local run said
"1 of 713"; the real state was two, and only CI — which checks out the commit,
without the foreign deletion — separated them.

Two durable points:

- **Run every generator after the last file is written**, not after the last
  *record* is written. `rebuild-backlog`, `rebuild-tasks` and
  `generate-dashboards` are cheap and idempotent; running them once more costs
  nothing and running them too early costs a CI round trip.
- **When a validation is already failing for a known reason, it has stopped
  being a signal.** Either resolve the known failure or verify against a clean
  tree before trusting a count. The check was working correctly here — a
  generated artefact that disagrees with its sources is exactly what it exists
  to catch.

## Not actioned here, deliberately

- **`docs/architecture/settings-and-branding.md`** is declared *canonical* and is
  materially stale — but two of its errors imply product decisions (which of two
  live user-management surfaces wins; where a permission fallback should point).
  Correcting a canonical document by guessing at those is worse than leaving it
  recorded. Owned by BUG-0045.
- **The inert registries themselves.** BUG-0044 fixed the documentation; whether
  to revive or delete the code is an architectural choice, ITEM-0036.

## Related

[[web-architecture]] · [[tenant-application]] · [[runtime-module-system]] ·
[[monorepo-application-map]]
</content>
