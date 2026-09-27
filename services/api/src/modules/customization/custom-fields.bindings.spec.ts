import { readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import {
  CUSTOM_FIELDS_KEY,
  type CustomFieldsBinding,
} from './custom-fields.decorator';
import { SYSTEM_CUSTOMIZATION_TABLES } from './customization.registry';

/*
 * TASK-0035 / ADR-0024 — every @CustomFields binding in the API, checked where
 * a mistake would otherwise only show up as a value silently written to the
 * wrong record or never stored:
 *
 * - the table exists and takes custom fields;
 * - an update (and a read keyed by the record) names a param its route has;
 * - the HTTP method fits the role;
 * - every table that takes custom fields has somewhere they are stored — the
 *   defect BUG-3697 was, for every module but Employees.
 */

type Bound = CustomFieldsBinding & {
  handler: string;
  method: string;
  path: string;
};

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, found);
    else if (entry.endsWith('.controller.ts')) found.push(full);
  }
  return found;
}

const joinPath = (...parts: (string | string[] | undefined)[]) =>
  parts
    .map((part) => (Array.isArray(part) ? part[0] : part) ?? '')
    .filter(Boolean)
    .join('/');

async function collectBindings(): Promise<Bound[]> {
  const bindings: Bound[] = [];
  for (const file of walk(resolve(process.cwd(), 'src'))) {
    const loaded = (await import(file)) as Record<string, unknown>;
    for (const exported of Object.values(loaded)) {
      if (typeof exported !== 'function') continue;
      const controllerPath = Reflect.getMetadata(PATH_METADATA, exported) as
        | string
        | string[]
        | undefined;
      if (controllerPath === undefined) continue;
      const proto = exported.prototype as object;
      for (const name of Object.getOwnPropertyNames(proto)) {
        const target = Object.getOwnPropertyDescriptor(proto, name)?.value as
          | object
          | undefined;
        if (typeof target !== 'function') continue;
        const binding = Reflect.getMetadata(CUSTOM_FIELDS_KEY, target) as
          | CustomFieldsBinding
          | undefined;
        if (!binding) continue;
        const method = Reflect.getMetadata(
          METHOD_METADATA,
          target,
        ) as RequestMethod;
        bindings.push({
          ...binding,
          handler: `${exported.name}.${name}`,
          method: RequestMethod[method],
          path: joinPath(
            controllerPath,
            Reflect.getMetadata(PATH_METADATA, target) as string | undefined,
          ),
        });
      }
    }
  }
  return bindings;
}

const METHODS_BY_ROLE: Record<CustomFieldsBinding['role'], string[]> = {
  create: ['POST', 'PUT'],
  update: ['PATCH', 'PUT'],
  read: ['GET'],
  list: ['GET'],
};

describe('@CustomFields bindings', () => {
  let bindings: Bound[];
  const customizable = new Set(
    SYSTEM_CUSTOMIZATION_TABLES.filter((table) => table.isCustomizable).map(
      (table) => table.tableKey,
    ),
  );

  beforeAll(async () => {
    bindings = await collectBindings();
  }, 600_000);

  it('finds the bindings at all', () => {
    expect(bindings.length).toBeGreaterThan(100);
  });

  it('binds only tables that take custom fields', () => {
    expect(
      bindings
        .filter((binding) => !customizable.has(binding.tableKey))
        .map((b) => b.handler),
    ).toEqual([]);
  });

  it('names an id param the route actually has, where the role needs one', () => {
    const wrong = bindings.filter((binding) => {
      if (binding.role === 'update' && !binding.idParam) return true;
      if (
        binding.idParam &&
        !new RegExp(`:${binding.idParam}(/|$)`).test(binding.path)
      )
        return true;
      return (
        (binding.role === 'create' || binding.role === 'list') &&
        Boolean(binding.idParam)
      );
    });
    expect(
      wrong.map(
        (binding) =>
          `${binding.handler} ${binding.path} ${binding.idParam ?? '-'}`,
      ),
    ).toEqual([]);
  });

  it('uses a method that fits the role', () => {
    expect(
      bindings
        .filter(
          (binding) => !METHODS_BY_ROLE[binding.role].includes(binding.method),
        )
        .map(
          (binding) => `${binding.handler} ${binding.method} ${binding.role}`,
        ),
    ).toEqual([]);
  });

  it('gives every table that takes custom fields a place to store them', () => {
    const stored = new Set(
      bindings
        .filter(
          (binding) => binding.role === 'create' || binding.role === 'update',
        )
        .map((b) => b.tableKey),
    );
    /* Employees writes its values in EmployeesService, inside the create transaction (TASK-0034). */
    stored.add('employees');
    expect(
      [...customizable].filter((tableKey) => !stored.has(tableKey)).sort(),
    ).toEqual([]);
  });
});
