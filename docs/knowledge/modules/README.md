# modules

Durable per-module knowledge — the rules, constraints and gotchas a future agent
needs **before** touching a module, not a changelog of what changed in it.

See [../README.md](../README.md) for the rules governing this folder. The two
that matter most here:

- **Notes are updated in place, never appended to.** A module note that grows a
  section per change becomes a changelog, and Git already does that better.
- **Never paste source code.** Reference `path/to/file.ts:line`. Pasted code goes
  stale silently — the `doc-code-drift` pattern.

Published to `03 - Modules/Generated` in the Obsidian vault by
`node scripts/sync-obsidian.mjs`.

Application-level knowledge does **not** live here — an application gets a
`product/` note for what it is and an `architecture/` note for how it is built.
See [[monorepo-application-map]] for the set.
