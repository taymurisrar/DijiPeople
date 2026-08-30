/*
 * Parse `schema.prisma` into a shape the data-model knowledge notes can be
 * generated from, and hold the module -> domain taxonomy those notes group by.
 *
 * A library rather than part of the generator because three callers need it:
 * the generator that writes the notes, the `--check` mode that fails CI when
 * they drift, and any future audit that wants to ask a question of the schema
 * without re-deriving the parse. When the parse existed twice it disagreed —
 * the same lesson `obsidian-mappings.mjs` carries at the top of its own file.
 *
 * The taxonomy is deliberately NOT a new invention. It is the area table in
 * AGENTS.md ("Domains actually implemented"), transcribed. A second, competing
 * grouping of the same modules would be exactly the duplicate source of truth
 * that Architecture Principle 4 forbids, and the one in AGENTS.md is already
 * validated against the module directory by validate-framework.mjs.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Scalar types Prisma provides. Anything else is an enum or a relation. */
const SCALARS = new Set([
  'String',
  'Int',
  'BigInt',
  'Float',
  'Decimal',
  'Boolean',
  'DateTime',
  'Json',
  'Bytes',
]);

/**
 * The module -> domain taxonomy, transcribed from AGENTS.md.
 *
 * Every module directory must appear exactly once. `validate-framework.mjs`
 * already fails when AGENTS.md and the module directory disagree; this table is
 * checked against the same directory by `generate-data-model.mjs --check`, so
 * the two cannot drift apart silently.
 */
export const MODULE_DOMAINS = new Map(
  Object.entries({
    auth: 'Identity',
    users: 'Identity',
    permissions: 'Identity',
    roles: 'Identity',

    employees: 'People',
    'employee-levels': 'People',
    'employment-types': 'People',
    teams: 'People',
    organization: 'People',

    attendance: 'Time',
    'attendance-engine': 'Time',
    'attendance-integrations': 'Time',
    timesheets: 'Time',
    leave: 'Time',

    payroll: 'Pay',
    payslips: 'Pay',
    'pay-components': 'Pay',
    compensation: 'Pay',
    'tax-rules': 'Pay',
    loans: 'Pay',
    claims: 'Pay',
    benefits: 'Pay',
    'business-trips': 'Pay',
    'time-payroll': 'Pay',

    recruitment: 'Talent',
    onboarding: 'Talent',
    projects: 'Talent',
    documents: 'Talent',
    policies: 'Talent',

    approvals: 'Governance',
    workflows: 'Governance',
    sla: 'Governance',
    audit: 'Governance',
    'error-logs': 'Governance',

    legal: 'Commercial',
    leads: 'Commercial',
    partners: 'Commercial',
    'partner-experience': 'Commercial',
    contracts: 'Commercial',
    'support-cases': 'Commercial',
    billing: 'Commercial',
    'super-admin': 'Commercial',

    'tenant-settings': 'Configuration',
    'settings-runtime': 'Configuration',
    customization: 'Configuration',
    lookups: 'Configuration',
    views: 'Configuration',
    navigation: 'Configuration',
    data: 'Configuration',
    'platform-runtime': 'Configuration',

    notifications: 'Messaging',

    'platform-auth': 'Platform ops',
    'platform-users': 'Platform ops',
    'platform-events': 'Platform ops',
    outbox: 'Platform ops',
    'platform-monitoring': 'Platform ops',
    'platform-communications': 'Platform ops',
    'app-releases': 'Platform ops',
    tenants: 'Platform ops',
    'tenant-control-plane': 'Platform ops',
    'tenant-domains': 'Platform ops',
    'demo-data': 'Platform ops',
    'data-management': 'Platform ops',
    agent: 'Platform ops',
    dashboard: 'Platform ops',
    inbox: 'Platform ops',
    reports: 'Platform ops',
  }),
);

export const DOMAIN_ORDER = [
  'Identity',
  'People',
  'Time',
  'Pay',
  'Talent',
  'Governance',
  'Commercial',
  'Configuration',
  'Messaging',
  'Platform ops',
  'Unattributed',
];

/**
 * Parse the schema into models and enums.
 *
 * A line parser rather than a real grammar. The schema uses one declaration per
 * line and no nested blocks other than attribute arguments, which are never
 * split across lines, so a parser that tracks only the current block is
 * sufficient — and one that stays sufficient is worth more than one that is
 * general. If the schema ever gains multi-line field declarations this will
 * under-report rather than mis-report, and the model count check in `--check`
 * is what would catch it.
 */
export function parseSchema(schemaPath) {
  const lines = readFileSync(schemaPath, 'utf8').split(/\r?\n/);
  const models = new Map();
  const enums = new Map();
  let current = null;
  let kind = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;

    let match;
    if ((match = /^model\s+(\w+)\s*\{/.exec(line))) {
      kind = 'model';
      current = match[1];
      models.set(current, {
        name: current,
        fields: [],
        relations: [],
        referencedBy: [],
        indexes: [],
        uniques: [],
        idField: null,
        tenantScoped: false,
      });
      continue;
    }
    if ((match = /^enum\s+(\w+)\s*\{/.exec(line))) {
      kind = 'enum';
      current = match[1];
      enums.set(current, { name: current, values: [] });
      continue;
    }
    if (line === '}') {
      current = null;
      kind = null;
      continue;
    }
    if (!current) continue;

    if (kind === 'enum') {
      const value = line.split(/\s+/)[0];
      if (/^[A-Za-z_]/.test(value)) enums.get(current).values.push(value);
      continue;
    }

    const model = models.get(current);
    if (line.startsWith('@@index')) {
      model.indexes.push(line);
      continue;
    }
    if (line.startsWith('@@unique')) {
      model.uniques.push(line);
      continue;
    }
    if (line.startsWith('@@')) continue;

    const field = /^(\w+)\s+(\S+)(.*)$/.exec(line);
    if (!field) continue;
    const [, name, rawType, rest] = field;
    const type = rawType.replace(/[?[\]]/g, '');
    model.fields.push({
      name,
      type,
      optional: rawType.endsWith('?'),
      list: rawType.endsWith('[]'),
      attributes: rest.trim(),
      scalar: SCALARS.has(type),
    });
    if (name === 'tenantId') model.tenantScoped = true;
    if (rest.includes('@id')) model.idField = name;
  }

  /* Relations and enum membership resolve only once every name is known. */
  for (const model of models.values()) {
    for (const field of model.fields) {
      field.isEnum = enums.has(field.type);
      field.isRelation = models.has(field.type);
      if (!field.isRelation) continue;
      /*
       * `owning` means this side holds the foreign key.
       *
       * List-vs-scalar is the obvious test and it is wrong for one-to-one
       * relations: `Tenant.tenantBranding` is a singular field whose foreign key
       * lives on `TenantBranding`, so a list check classified four of the
       * tenant's own children as its parents. Prisma marks the key-holding side
       * by giving it `fields:` — that is the actual signal.
       */
      model.relations.push({
        field: field.name,
        target: field.type,
        list: field.list,
        optional: field.optional,
        owning: /@relation\([^)]*\bfields:/.test(field.attributes),
        onDelete: (/onDelete:\s*(\w+)/.exec(field.attributes) || [])[1] ?? null,
      });
    }
  }
  for (const model of models.values()) {
    for (const relation of model.relations) {
      models.get(relation.target).referencedBy.push({
        from: model.name,
        field: relation.field,
        list: relation.list,
      });
    }
  }

  return { models, enums };
}

/** The Prisma client accessor for a model — `PayrollRun` -> `payrollRun`. */
export const accessorFor = (model) => model[0].toLowerCase() + model.slice(1);

function walkTypeScript(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walkTypeScript(path, found);
    else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) found.push(path);
  }
  return found;
}

const READ_OPERATIONS = [
  'findMany',
  'findFirst',
  'findFirstOrThrow',
  'findUnique',
  'findUniqueOrThrow',
  'count',
  'aggregate',
  'groupBy',
];

const WRITE_OPERATIONS = [
  'create',
  'createMany',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
];

const OPERATIONS = [...READ_OPERATIONS, ...WRITE_OPERATIONS].join('|');

/*
 * A write counts for ten reads when deciding who owns a model.
 *
 * Raw call counts pick the wrong module and pick it confidently. `dashboard`
 * calls `prisma.employee.count` more times than `employees` calls anything, so
 * a plain count named `dashboard` as the owner of `Employee` — and
 * `tenant-control-plane` as the owner of `User`. Both are consumers.
 *
 * Ownership follows the ability to change a record, not the frequency of
 * looking at one. Ten is arbitrary but only has to beat the read-heavy
 * reporting modules, and it does: every model whose owner this changed moved to
 * the module that actually creates it.
 */
const WRITE_WEIGHT = 10;

/**
 * Which module actually reads or writes each model, by counting Prisma calls.
 *
 * Evidence rather than naming. `AttendanceDay` living in the attendance domain
 * is a guess; `attendance.repository.ts` calling `prisma.attendanceDay.findMany`
 * is a fact, and the two disagree often enough to matter — `Identity` is written
 * by `auth`, not by anything named after it.
 *
 * Undercounts by design. A model reached only through a parent's nested write,
 * or through the generic entity delegate in `modules/data`, has no literal call
 * site and comes back unattributed. That is the honest answer, and it is also a
 * finding: 13 models came back with no call site anywhere in the repository.
 */
export function attributeModelsToModules(models, repoRoot) {
  const modulesDir = join(repoRoot, 'services/api/src/modules');
  const byAccessor = new Map([...models.keys()].map((model) => [accessorFor(model), model]));
  const writes = new Set(WRITE_OPERATIONS);
  const usage = new Map();
  const pattern = new RegExp(`(?:prisma|tx|client|db)\\.([a-z]\\w*)\\.\\s*(${OPERATIONS})`, 'g');

  for (const moduleName of readdirSync(modulesDir)) {
    const dir = join(modulesDir, moduleName);
    if (!statSync(dir).isDirectory()) continue;
    for (const file of walkTypeScript(dir)) {
      for (const hit of readFileSync(file, 'utf8').matchAll(pattern)) {
        const model = byAccessor.get(hit[1]);
        if (!model) continue;
        if (!usage.has(model)) usage.set(model, new Map());
        const counts = usage.get(model);
        const entry = counts.get(moduleName) ?? { reads: 0, writes: 0 };
        if (writes.has(hit[2])) entry.writes += 1;
        else entry.reads += 1;
        counts.set(moduleName, entry);
      }
    }
  }

  const score = (entry) => entry.writes * WRITE_WEIGHT + entry.reads;

  /*
   * Break a tie towards the module named after the model.
   *
   * `users` and `tenant-control-plane` write `User` exactly as often as each
   * other, so the sort was deciding on alphabetical order — which handed `User`
   * to the control plane. When two modules are otherwise indistinguishable, the
   * one whose directory is named after the entity is the owner; a name is a
   * weak signal, but it is a better one than the alphabet.
   */
  const affinity = (moduleName, model) => {
    const accessor = accessorFor(model).toLowerCase();
    const normalized = moduleName.replace(/-/g, '').toLowerCase();
    if (normalized === accessor || normalized === `${accessor}s`) return 2;
    return normalized.startsWith(accessor) ? 1 : 0;
  };

  /*
   * Seeds write too, and ignoring them invents defects.
   *
   * Scanning only `modules/` reported `LegalDocument`, `NotificationTemplate`
   * and `NotificationRule` as read-but-never-written — which reads as three
   * broken features and is three pieces of seed-owned configuration behaving
   * exactly as designed. `seed-config` and `seed-legal` upsert them; the
   * modules only read them. That is a category, not a gap, and the notes have
   * to be able to tell the two apart.
   */
  const seedWritten = new Set();
  const seedsDir = join(repoRoot, 'services/api/prisma');
  const writePattern = new RegExp(
    `\\.([a-z]\\w*)\\.\\s*(?:${WRITE_OPERATIONS.join('|')})\\b`,
    'g',
  );
  for (const file of walkTypeScript(seedsDir)) {
    for (const hit of readFileSync(file, 'utf8').matchAll(writePattern)) {
      const model = byAccessor.get(hit[1]);
      if (model) seedWritten.add(model);
    }
  }

  const attribution = new Map();
  for (const [model, counts] of usage) {
    const ranked = [...counts.entries()].sort(
      (a, b) =>
        score(b[1]) - score(a[1]) ||
        affinity(b[0], model) - affinity(a[0], model) ||
        a[0].localeCompare(b[0]),
    );
    const [ownerName, ownerCounts] = ranked[0];
    attribution.set(model, {
      /*
       * A module that only ever reads a model does not own it. When nothing
       * writes it anywhere, the owner is null and the note says so, rather than
       * promoting the busiest reader into an owner it is not.
       */
      owner: ownerCounts.writes > 0 ? ownerName : null,
      /*
       * A read-only model still belongs to the domain that reads it.
       * `LegalDocument` is seeded rather than written by a module, but it is
       * Commercial knowledge, and filing it under "Unattributed" would hide it
       * from the one group of people looking for it.
       */
      domain: MODULE_DOMAINS.get(ownerName) ?? 'Unattributed',
      readOnly: ownerCounts.writes === 0,
      seedWritten: seedWritten.has(model),
      modules: ranked.map(([name, entry]) => ({
        module: name,
        reads: entry.reads,
        writes: entry.writes,
      })),
    });
  }
  for (const model of models.keys()) {
    if (!attribution.has(model)) {
      attribution.set(model, {
        owner: null,
        domain: 'Unattributed',
        readOnly: false,
        seedWritten: seedWritten.has(model),
        modules: [],
      });
    }
  }
  return attribution;
}

/** Module directories the taxonomy does not name, and names it invents. */
export function taxonomyDrift(repoRoot) {
  const modulesDir = join(repoRoot, 'services/api/src/modules');
  const onDisk = readdirSync(modulesDir).filter((entry) =>
    statSync(join(modulesDir, entry)).isDirectory(),
  );
  return {
    missing: onDisk.filter((name) => !MODULE_DOMAINS.has(name)),
    stale: [...MODULE_DOMAINS.keys()].filter((name) => !onDisk.includes(name)),
  };
}
