import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TENANT_ERASURE_DELETE_ORDER,
  TENANT_ERASURE_DETACHED_MODELS,
  TENANT_ERASURE_PRESERVED_MODELS,
  TENANT_ERASURE_SELF_REFERENCES,
} from './tenant-erasure.constants';

/**
 * The erasure order is a hand-maintained constant derived from the schema, and
 * a hand-maintained list of 230 models is exactly the kind of thing that rots
 * the first time someone adds a table. This spec re-derives it from
 * `schema.prisma` on every run: a new tenant-owned model, or a foreign key that
 * changes the order, fails here rather than half-way through a live erasure.
 */
describe('tenant erasure order', () => {
  const schema = readFileSync(
    join(__dirname, '../../../prisma/schema.prisma'),
    'utf8',
  );

  const models = parseModels(schema);
  const tenantOwned = new Set(
    [...models.entries()]
      .filter(([, lines]) =>
        lines.some((line) => /^\s*tenantId\s+String/.test(line)),
      )
      .map(([name]) => name),
  );
  const excluded = new Set([
    'Tenant',
    ...TENANT_ERASURE_DETACHED_MODELS.map(pascalCase),
    ...TENANT_ERASURE_PRESERVED_MODELS.map(pascalCase),
  ]);
  const expected = [...tenantOwned].filter((name) => !excluded.has(name));

  it('covers every tenant-owned model exactly once', () => {
    const listed = TENANT_ERASURE_DELETE_ORDER.map(pascalCase);
    const missing = expected.filter((name) => !listed.includes(name));
    const extra = listed.filter((name) => !expected.includes(name));

    expect({ missing, extra }).toEqual({ missing: [], extra: [] });
    expect(new Set(listed).size).toBe(listed.length);
  });

  it('deletes a model before every tenant-owned model it points at with a blocking foreign key', () => {
    const position = new Map(
      TENANT_ERASURE_DELETE_ORDER.map((name, index) => [
        pascalCase(name),
        index,
      ]),
    );
    const violations: string[] = [];

    for (const child of expected) {
      for (const line of models.get(child) ?? []) {
        const relation = parseOwningRelation(line);
        if (!relation || !isBlocking(relation.mode)) continue;
        if (relation.target === child) continue;
        if (!position.has(relation.target)) continue;
        if (position.get(child)! > position.get(relation.target)!) {
          violations.push(
            `${child} is deleted after ${relation.target} it references`,
          );
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('nulls every blocking self-reference before its table is emptied', () => {
    const declared = new Map(
      TENANT_ERASURE_SELF_REFERENCES.map((entry) => [
        pascalCase(entry.model),
        new Set(entry.fields),
      ]),
    );
    const missing: string[] = [];

    for (const model of expected) {
      for (const line of models.get(model) ?? []) {
        const relation = parseOwningRelation(line);
        if (!relation || relation.target !== model) continue;
        if (!isBlocking(relation.mode)) continue;
        for (const field of relation.fields) {
          if (field === 'tenantId') continue;
          if (!declared.get(model)?.has(field)) {
            missing.push(`${model}.${field}`);
          }
        }
      }
    }

    expect(missing).toEqual([]);
  });

  it('keeps the platform-side evidence out of the delete set', () => {
    /* The receipt has to outlive the tenant it evidences. */
    expect(TENANT_ERASURE_DELETE_ORDER).not.toContain('tenantErasureReceipt');
    expect(TENANT_ERASURE_DELETE_ORDER).not.toContain('platformEvent');
  });

  it('detaches the legal and support trail rather than deleting it', () => {
    expect([...TENANT_ERASURE_DETACHED_MODELS]).toEqual(
      expect.arrayContaining(['contract', 'supportCase', 'customerOnboarding']),
    );
    for (const model of TENANT_ERASURE_DETACHED_MODELS) {
      expect(TENANT_ERASURE_DELETE_ORDER).not.toContain(model);
    }
  });
});

function parseModels(schema: string) {
  const models = new Map<string, string[]>();
  let current: string | null = null;
  for (const line of schema.split('\n')) {
    const start = /^model (\w+) \{/.exec(line);
    if (start) {
      current = start[1]!;
      models.set(current, []);
      continue;
    }
    if (line.startsWith('}')) {
      current = null;
      continue;
    }
    if (current) models.get(current)!.push(line);
  }
  return models;
}

function parseOwningRelation(line: string) {
  const match = /^\s+\w+\s+(\w+)(\?|\[\])?\s+@relation\((.*)\)\s*$/.exec(line);
  if (!match) return null;
  const [, target, cardinality, args] = match;
  if (!args.includes('fields: [')) return null;
  const fields = /fields: \[([^\]]+)\]/
    .exec(args)![1]
    .split(',')
    .map((field) => field.trim());
  const onDelete = /onDelete:\s*(\w+)/.exec(args);
  /* Prisma defaults: required relations Restrict, optional relations SetNull. */
  const mode = onDelete?.[1] ?? (cardinality === '?' ? 'SetNull' : 'Restrict');
  return { target: target, fields, mode };
}

/** Only these can refuse a delete; Cascade and SetNull impose no ordering. */
function isBlocking(mode: string) {
  return mode === 'Restrict' || mode === 'NoAction';
}

function pascalCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
