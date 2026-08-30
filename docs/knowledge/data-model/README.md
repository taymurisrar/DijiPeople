# Data Model Knowledge

Entity-level knowledge derived from `services/api/prisma/schema.prisma`.
Published to `12 - Data Model/Generated` in the vault.

## The split every note follows

Each `entity-<model>.md` has two halves, and they have different owners:

| Half | Written by | Contains |
|---|---|---|
| Everything outside the markers | **A person or an agent** | Purpose, lifecycle, business rules, security, what catches people out |
| Between `<!-- GENERATED:schema-facts -->` and `<!-- /GENERATED:schema-facts -->` | **`scripts/generate-data-model.mjs`** | Ownership, fields, enum states, relationships, constraints |

Do not hand-edit the generated region; it is overwritten. Do not put facts the
schema already carries in the prose; they will drift and nothing will notice.

That is the whole point of the arrangement. Entity documentation rots faster than
any other kind, because a migration invalidates it without anyone deciding to —
`database-architecture.md` was written at "~285 models, ~255 enums" and the
schema reached 318 and 299 unremarked. Generating the facts is what makes the
prose beside them worth trusting.

## Commands

```bash
npm run knowledge:data-model         # regenerate the facts and domain-map.md
npm run knowledge:data-model:check   # fail if any note is stale (CI-safe)
```

`--check` fails when a generated region no longer matches the schema, when a note
documents a model that no longer exists, when a note's filename disagrees with
its `model:` frontmatter, or when a module directory has no domain in
`scripts/lib/data-model.mjs`.

It runs in CI, in the **Framework validation** job, beside the other generated
artefacts. That is what makes this arrangement work rather than merely intend to:
an unchecked generated region rots exactly like the prose it exists to anchor.

## Adding an entity note

1. Create `entity-<kebab-model-name>.md`.
2. Frontmatter must carry `aliases: [<ModelName>]`, `type: entity` and
   `model: <ModelName>`. The alias is what lets a double-bracket link written
   with the bare model name resolve to the note.
3. Write the prose. Explain *why* — the schema already says *what*.
4. Leave an empty `<!-- GENERATED:schema-facts -->` /
   `<!-- /GENERATED:schema-facts -->` pair where the facts should go.
5. Run `npm run knowledge:data-model`.

Link only to notes that exist. A dead wikilink renders as ordinary text rather
than announcing itself, which is why the generator emits a plain code span
instead of a link for any model without a note.

## Coverage

[[domain-map]] lists every model in the schema, grouped by the domain of the
module that writes it, and marks which have a note. It is generated, so coverage
is always measured rather than estimated. [[discovery-status]] carries the wider
picture.

## Related

[[data-model-overview]] · [[domain-map]] · [[glossary]] ·
[[discovery-status]] · [[known-gaps]] · [[contradictions]]
