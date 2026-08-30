#!/usr/bin/env node
/*
 * Keep the data-model knowledge notes true to `schema.prisma`.
 *
 * Entity documentation rots faster than any other kind, because the thing it
 * describes changes on a migration rather than on a decision — nobody sets out
 * to invalidate a note, they add a column. `docs/knowledge/architecture/
 * database-architecture.md` was written with "~285 models, ~255 enums" and the
 * schema reached 318 and 299 without a single person noticing, which is the
 * `doc-code-drift` pattern in its purest form.
 *
 * So the facts in these notes are not written by hand. Each entity note carries
 * one region:
 *
 *     <!-- GENERATED:schema-facts -->
 *     ...ownership, identifiers, fields, relations, indexes...
 *     <!-- /GENERATED:schema-facts -->
 *
 * which this script owns and rewrites. Everything outside it — purpose,
 * lifecycle, business rules, security, the links into processes and screens —
 * is human knowledge the schema cannot supply, and is never touched.
 *
 * That split is the whole design. A fully generated note would say nothing a
 * reader could not get from the schema itself; a fully hand-written one would be
 * wrong within a month. `--check` fails when the generated half no longer
 * matches the schema, which is what makes the hand-written half worth trusting.
 *
 *   node scripts/generate-data-model.mjs [--check]
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseSchema,
  attributeModelsToModules,
  taxonomyDrift,
  accessorFor,
  DOMAIN_ORDER,
} from './lib/data-model.mjs';
/*
 * Line endings are a property of the checkout, not of the content. The
 * generator writes `\n`; Git checks the file out as `\r\n` on Windows, so a
 * byte comparison reports drift on every line of an untouched file in every
 * Windows worktree while passing in CI, which runs on Linux. That is BUG-1208,
 * and this repository already paid for it once — a rebase re-checked-out these
 * notes with CRLF and `--check` called all thirteen stale.
 */
import { indexIsCurrent } from './lib/index-drift.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCHEMA = join(ROOT, 'services/api/prisma/schema.prisma');
const NOTES_DIR = join(ROOT, 'docs/knowledge/data-model');
const CHECK = process.argv.includes('--check');

const OPEN = '<!-- GENERATED:schema-facts -->';
const CLOSE = '<!-- /GENERATED:schema-facts -->';

const problems = [];
const changed = [];

/** Which model an entity note documents, from its `model:` frontmatter key. */
function modelOf(body) {
  return (/^model:\s*(\w+)\s*$/m.exec(body) || [])[1] ?? null;
}

/*
 * Fields worth tabulating, and the ones that are noise.
 *
 * Every model carries id/createdAt/updatedAt/tenantId and the `tenant` relation.
 * Repeating those on 318 notes teaches nothing and buries the fields that
 * actually distinguish one entity from another, so the conventions are stated
 * once in the overview and the per-entity table starts after them.
 */
const CONVENTIONAL = new Set([
  'id',
  'tenantId',
  'tenant',
  'createdAt',
  'updatedAt',
  'createdById',
  'updatedById',
]);

function fieldTable(model) {
  const rows = model.fields.filter(
    (field) => !CONVENTIONAL.has(field.name) && !field.isRelation,
  );
  if (rows.length === 0) return '_No fields beyond the repository conventions._\n';

  const lines = ['| Field | Type | Required | Notes |', '|---|---|---|---|'];
  for (const field of rows) {
    const type = field.isEnum ? `\`${field.type}\` (enum)` : `\`${field.type}\``;
    const notes = [];
    const withDefault = /@default\(([^)]*)\)/.exec(field.attributes);
    if (withDefault) notes.push(`default \`${withDefault[1]}\``);
    if (field.attributes.includes('@unique')) notes.push('unique');
    /*
     * Report the actual precision rather than guessing at meaning. Labelling
     * every `@db.Decimal` as "money" was wrong for `completionPercentage` and
     * `discountValue`, which are not amounts.
     */
    const decimal = /@db\.Decimal\(([^)]*)\)/.exec(field.attributes);
    if (decimal) notes.push(`decimal(${decimal[1].replace(/\s+/g, '')})`);
    lines.push(
      `| \`${field.name}\` | ${type} | ${field.optional ? 'no' : 'yes'} | ${notes.join(', ') || '—'} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/*
 * Beyond this many children, the list stops being information.
 *
 * `Tenant` owns 240 of them. Printing that renders one unreadable paragraph that
 * pushes everything a reader actually came for off the screen — and it repeats
 * what [[domain-map]] already lists, grouped, in a form somebody can scan.
 */
const CHILD_LIST_LIMIT = 25;

function relationList(model, documented) {
  /* Link only to notes that exist; a dead wikilink renders as ordinary text. */
  const ref = (target) =>
    documented.has(target) ? `[[entity-${kebab(target)}|${target}]]` : `\`${target}\``;

  const parents = model.relations.filter((relation) => relation.owning);
  const children = model.relations.filter((relation) => !relation.owning);
  const out = [];

  out.push('**Belongs to** — this model holds the foreign key\n');
  if (parents.length === 0) out.push('- _Nothing; this is a root._');
  for (const relation of parents.filter((r) => r.target !== 'Tenant')) {
    const cascade = relation.onDelete ? ` — \`onDelete: ${relation.onDelete}\`` : '';
    out.push(
      `- ${ref(relation.target)} via \`${relation.field}\`` +
        `${relation.optional ? ' (optional)' : ''}${cascade}`,
    );
  }
  if (parents.some((relation) => relation.target === 'Tenant')) {
    out.push(`- ${ref('Tenant')} — the isolation owner`);
  }

  out.push('\n**Owns** — the foreign key lives on the other side\n');
  if (children.length === 0) {
    out.push('- _Nothing._');
  } else if (children.length > CHILD_LIST_LIMIT) {
    out.push(
      `- **${children.length} child relations** — too many to list usefully. ` +
        `See [[domain-map]] for the full model inventory, grouped by domain.`,
    );
  } else {
    for (const relation of children) {
      out.push(`- ${ref(relation.target)} via \`${relation.field}\`${relation.list ? '[]' : ''}`);
    }
  }

  return `${out.join('\n')}\n`;
}

const kebab = (name) =>
  name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

/** How the owning-module cell reads, including when there is no owner. */
function ownerLabel(owner) {
  if (owner.owner) return `\`services/api/src/modules/${owner.owner}\``;
  if (owner.seedWritten) {
    return '**seed-owned** — written by `services/api/prisma/seed-*`, read-only at runtime';
  }
  if (owner.readOnly) return '**read-only everywhere** — nothing writes it; see [[known-gaps]]';
  return '**none detected** — no Prisma call site anywhere; see [[known-gaps]]';
}

/*
 * The other modules, capped.
 *
 * `Employee` is touched by 34 of the 67 modules. Listing all of them fills the
 * cell with names nobody reads and buries the owner directly above it, so the
 * long tail becomes a count.
 */
const MODULE_LIST_LIMIT = 8;

function otherModules(owner) {
  const rest = owner.modules.slice(1);
  if (rest.length === 0) return '—';
  const shown = rest
    .slice(0, MODULE_LIST_LIMIT)
    .map((entry) => `\`${entry.module}\`${entry.writes > 0 ? '' : ' (reads)'}`)
    .join(', ');
  const remaining = rest.length - MODULE_LIST_LIMIT;
  return remaining > 0 ? `${shown}, and ${remaining} more` : shown;
}

function schemaFacts(model, attribution, enums, documented) {
  const owner = attribution.get(model.name);
  const enumFields = model.fields.filter((field) => field.isEnum);

  const sections = [];
  sections.push(
    `> Generated from \`services/api/prisma/schema.prisma\` by ` +
      `\`scripts/generate-data-model.mjs\`. Do not hand-edit this region.\n`,
  );

  sections.push('### Ownership and access\n');
  sections.push(
    `| Property | Value |\n|---|---|\n` +
      `| Tenant-scoped | ${model.tenantScoped ? '**yes** — carries `tenantId`' : '**no** — platform-owned or global reference data'} |\n` +
      `| Primary key | \`${model.idField ?? 'composite/none'}\` |\n` +
      `| Prisma accessor | \`prisma.${accessorFor(model.name)}\` |\n` +
      `| Owning module | ${ownerLabel(owner)} |\n` +
      `| Domain | ${owner.domain} |\n` +
      `| Also touched by | ${otherModules(owner)} |\n`,
  );

  sections.push('\n### Fields\n');
  sections.push(fieldTable(model));

  if (enumFields.length > 0) {
    sections.push('\n### States\n');
    for (const field of enumFields) {
      const values = enums.get(field.type).values;
      sections.push(
        `- \`${field.name}\` — \`${field.type}\`: ${values.map((v) => `\`${v}\``).join(', ')}`,
      );
    }
    sections.push('');
  }

  sections.push('\n### Relationships\n');
  sections.push(relationList(model, documented));

  /*
   * Field-level `@unique` counts as much as `@@unique`, and reading only the
   * block-level ones reported `Tenant` as having no unique constraint at all —
   * while `slug`, the globally unique label the whole of workspace routing
   * resolves on, carries `@unique` on the field itself.
   */
  const inlineUniques = model.fields
    .filter((field) => field.attributes.includes('@unique'))
    .map((field) => `\`${field.name}\``);
  const blockUniques = model.uniques.map((constraint) => `\`${constraint}\``);
  const uniques = [...inlineUniques, ...blockUniques];

  sections.push('\n### Constraints and indexes\n');
  sections.push(
    `- Unique: ${uniques.length > 0 ? uniques.join(', ') : '**none**'}\n` +
      `- Indexes: ${model.indexes.length}\n`,
  );

  /* Sections carry their own trailing newlines; collapse the doubles they make. */
  return sections.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}

// ------------------------------------------------------------------ the run

if (!existsSync(SCHEMA)) {
  console.error(`schema not found: ${SCHEMA}`);
  process.exit(1);
}

if (!CHECK) mkdirSync(NOTES_DIR, { recursive: true });

const { models, enums } = parseSchema(SCHEMA);
const attribution = attributeModelsToModules(models, ROOT);

const drift = taxonomyDrift(ROOT);
if (drift.missing.length > 0) {
  problems.push(
    `module(s) with no domain in MODULE_DOMAINS: ${drift.missing.join(', ')} ` +
      `— add them to scripts/lib/data-model.mjs`,
  );
}
if (drift.stale.length > 0) {
  problems.push(`MODULE_DOMAINS names module(s) that no longer exist: ${drift.stale.join(', ')}`);
}

/*
 * Which models have an entity note, read once.
 *
 * Both the domain map and the per-note relation lists need it — the map to mark
 * a row as documented, the lists to decide whether a wikilink will resolve. A
 * link to a note that does not exist renders as ordinary text rather than
 * announcing itself, so this is the difference between a graph and a page of
 * double brackets.
 */
const noteFiles = existsSync(NOTES_DIR)
  ? readdirSync(NOTES_DIR).filter((file) => file.startsWith('entity-') && file.endsWith('.md'))
  : [];

const documented = new Set(
  noteFiles.map((file) => modelOf(readFileSync(join(NOTES_DIR, file), 'utf8'))).filter(Boolean),
);

/* -------------------------------------------------- the domain map (whole file) */

function domainMap() {
  const byDomain = new Map(DOMAIN_ORDER.map((domain) => [domain, []]));
  for (const [name, model] of models) {
    byDomain.get(attribution.get(name).domain).push(model);
  }

  const lines = [];
  lines.push('---');
  lines.push('aliases: [Domain Map]');
  lines.push('---');
  lines.push('');
  lines.push('# Data Model Domain Map');
  lines.push('');
  lines.push(
    '> **Generated** by `scripts/generate-data-model.mjs`. Every model in ' +
      '`services/api/prisma/schema.prisma`, grouped by the domain of the module ' +
      'that actually reads or writes it. Do not hand-edit.',
  );
  lines.push('');
  lines.push(
    'Attribution is by counted Prisma call sites, not by name. A model with no ' +
      'call site anywhere is listed under **Unattributed** — that is a finding, ' +
      'not a gap in the tooling. See [[known-gaps]].',
  );
  lines.push('');
  lines.push(`**${models.size} models · ${enums.size} enums · ` +
    `${[...models.values()].filter((m) => m.tenantScoped).length} tenant-scoped · ` +
    `${documented.size} with an entity note**`);
  lines.push('');
  lines.push('Related: [[data-model-overview]] · [[glossary]] · [[discovery-status]]');
  lines.push('');

  for (const domain of DOMAIN_ORDER) {
    const entries = byDomain.get(domain).sort((a, b) => a.name.localeCompare(b.name));
    if (entries.length === 0) continue;
    lines.push(`## ${domain} — ${entries.length} models`);
    lines.push('');
    lines.push('| Model | Tenant | Owning module | Note |');
    lines.push('|---|---|---|---|');
    for (const model of entries) {
      const owner = attribution.get(model.name);
      const note = documented.has(model.name)
        ? `[[entity-${kebab(model.name)}|documented]]`
        : '—';
      lines.push(
        `| \`${model.name}\` | ${model.tenantScoped ? 'yes' : 'no'} | ` +
          `${owner.owner ? `\`${owner.owner}\`` : '**none**'} | ${note} |`,
      );
    }
    lines.push('');
  }

  return `${lines.join('\n')}`;
}

const mapPath = join(NOTES_DIR, 'domain-map.md');
const mapBody = domainMap();
if (!existsSync(mapPath) || !indexIsCurrent(readFileSync(mapPath, 'utf8'), mapBody)) {
  if (CHECK) problems.push('docs/knowledge/data-model/domain-map.md is stale');
  else {
    writeFileSync(mapPath, mapBody);
    changed.push('domain-map.md');
  }
}

/* ------------------------------------------------- the generated region per note */

for (const file of noteFiles) {
  const path = join(NOTES_DIR, file);
  const body = readFileSync(path, 'utf8');
  const model = modelOf(body);

  if (!model) {
    problems.push(`${file}: no \`model:\` key in frontmatter`);
    continue;
  }
  if (!models.has(model)) {
    problems.push(
      `${file}: documents model \`${model}\`, which no longer exists in the schema`,
    );
    continue;
  }
  if (file !== `entity-${kebab(model)}.md`) {
    problems.push(`${file}: should be named entity-${kebab(model)}.md for model \`${model}\``);
    continue;
  }

  const start = body.indexOf(OPEN);
  const end = body.indexOf(CLOSE);
  if (start === -1 || end === -1) {
    problems.push(`${file}: missing the ${OPEN} region`);
    continue;
  }

  const facts = schemaFacts(models.get(model), attribution, enums, documented);
  const next = `${body.slice(0, start + OPEN.length)}\n\n${facts}\n${body.slice(end)}`;
  if (indexIsCurrent(body, next)) continue;

  if (CHECK) problems.push(`${file}: generated schema facts are stale`);
  else {
    writeFileSync(path, next);
    changed.push(file);
  }
}

// ------------------------------------------------------------------ report

console.log(
  `data-model: ${models.size} models, ${enums.size} enums, ` +
    `${noteFiles.length} entity note(s)`,
);
if (changed.length > 0) console.log(`updated: ${changed.join(', ')}`);

if (problems.length > 0) {
  console.error('\nPROBLEMS');
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error(
    CHECK
      ? '\nRun `node scripts/generate-data-model.mjs` and commit the result.'
      : '',
  );
  process.exit(1);
}

console.log(CHECK ? 'DATA_MODEL_NOTES: CURRENT' : 'DATA_MODEL_NOTES: WRITTEN');
