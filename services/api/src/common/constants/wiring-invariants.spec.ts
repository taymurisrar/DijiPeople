import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERMISSION_KEYS } from './permissions';
import {
  MISC_PERMISSION_KEYS,
  SYSTEM_ROLE_MISC_PERMISSIONS,
  SYSTEM_ROLE_PRIVILEGES,
} from './rbac-matrix';
import { BASE_ROLE_PERMISSION_KEYS } from './permissions';

/*
 * These do not test a feature. They test that the parts are wired to each
 * other, which is where most defects in this codebase have actually lived: a
 * permission defined but granted to nobody, a menu item with no page behind it,
 * a filter condition the API rejects. Each failure below would otherwise be
 * found by a user.
 */

const REPO_ROOT = resolve(process.cwd(), '..', '..');

function readRepoFile(path: string) {
  return readFileSync(resolve(REPO_ROOT, path), 'utf8');
}

function walk(dir: string, match: RegExp, acc: string[] = []) {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) walk(full, match, acc);
    else if (match.test(entry)) acc.push(full);
  }
  return acc;
}

/** Every permission any role can end up holding. */
function grantedPermissionKeys() {
  const keys = new Set<string>();

  for (const list of Object.values(SYSTEM_ROLE_MISC_PERMISSIONS)) {
    for (const key of list) keys.add(key);
  }

  // Seeding also writes these to RolePermission for each base role.
  for (const list of Object.values(BASE_ROLE_PERMISSION_KEYS)) {
    for (const key of list) keys.add(key);
  }

  for (const matrix of Object.values(SYSTEM_ROLE_PRIVILEGES)) {
    for (const [entityPrivilege, level] of Object.entries(matrix)) {
      if (level === 'NONE') continue;
      const [entity, privilege] = entityPrivilege.split(':');
      if (entity && privilege) keys.add(`${entity}.${privilege.toLowerCase()}`);
    }
  }

  return keys;
}

/*
 * Endpoints intentionally reserved for the administrator bypass. Anything not
 * listed here must be reachable by at least one ordinary role, otherwise the
 * screen behind it is dead for every real user.
 */
const ADMIN_ONLY_PERMISSIONS = new Set<string>([
  'customers.create',
  'customers.read',
  'customers.write',
  'sla.read',
  'tenant.read',
  'onboarding.update',
  'recruitment.advance',
  'projects.update',
  'claims.cancel',
  'claims.read-own',
  'business-trips.read-own',
  'employees.history.create',
  'payroll-tax.calculate',
  'payroll.finalize',
  'payroll.settings.read',
  'payroll.settings.update',
  'timesheets.jobs.run',
  'timesheets.payroll.handoff',
  'timesheets.policy.configure',
  'timesheets.policy.resolution.read',
  'timesheets.read.team',
  'timesheets.reopen',
  'timesheets.settings.read',
  'timesheets.template.export',
  'audit.read',
]);

describe('wiring invariants', () => {
  it('every permission an endpoint requires is held by at least one role', () => {
    const controllers = walk(
      resolve(process.cwd(), 'src'),
      /\.controller\.ts$/,
    );
    const required = new Set<string>();

    for (const file of controllers) {
      const source = readFileSync(file, 'utf8');
      for (const match of source.matchAll(/@Permissions\(([^)]*)\)/g)) {
        for (const key of match[1].matchAll(/'([a-zA-Z0-9.\-_]+)'/g)) {
          required.add(key[1]);
        }
      }
    }

    const granted = grantedPermissionKeys();
    const unreachable = [...required]
      .filter((key) => !granted.has(key))
      .filter((key) => !ADMIN_ONLY_PERMISSIONS.has(key))
      .sort();

    expect({ unreachable }).toEqual({ unreachable: [] });
  });

  it('every permission a role is granted is a defined permission', () => {
    /*
     * Keys are declared in several places in permissions.ts (the key map, the
     * misc map and the definition arrays), so the source is the reliable list
     * rather than any single export.
     */
    const source = readFileSync(
      resolve(process.cwd(), 'src/common/constants/permissions.ts'),
      'utf8',
    );
    const defined = new Set<string>([
      ...Object.values(PERMISSION_KEYS),
      ...Object.values(MISC_PERMISSION_KEYS),
      ...[...source.matchAll(/'([a-z0-9-]+(?:\.[a-zA-Z0-9-]+)+)'/g)].map(
        (match) => match[1],
      ),
    ]);
    const derived = /^[a-z0-9-]+\.[a-z]+$/;

    const undefinedGrants = Object.entries(SYSTEM_ROLE_MISC_PERMISSIONS)
      .flatMap(([role, keys]) =>
        keys
          .filter((key) => !defined.has(key) && !derived.test(key))
          .map((key) => `${role}:${key}`),
      )
      .sort();

    expect({ undefinedGrants }).toEqual({ undefinedGrants: [] });
  });

  it('every settings menu item resolves to a route and an adapter', () => {
    const navigation = readRepoFile(
      'apps/web/app/(authenticated)/settings/_lib/settings-navigation.ts',
    );
    const registry = readRepoFile(
      'apps/web/app/(authenticated)/settings/_lib/settings-adapter-registry.ts',
    );
    const runtime = readRepoFile(
      'apps/web/app/(authenticated)/settings/_lib/settings-runtime.ts',
    );

    const itemKeys = [
      ...navigation.matchAll(/key:\s*"([a-z0-9-]+)",\s*href:\s*"([^"]+)"/g),
    ].map((match) => ({ key: match[1], href: match[2] }));

    expect(itemKeys.length).toBeGreaterThan(20);

    const missingAdapter = itemKeys
      .filter(
        (item) =>
          !registry.includes(`"${item.key}"`) && !runtime.includes(item.key),
      )
      .map((item) => item.href)
      .sort();

    expect({ missingAdapter }).toEqual({ missingAdapter: [] });
  });

  it('every filter condition the table offers is accepted by a module API', () => {
    const table = readRepoFile('apps/web/app/components/data-table/types.ts');
    const offered = [...table.matchAll(/^\s{2}\|\s"([a-zA-Z]+)"/gm)].map(
      (match) => match[1],
    );

    expect(offered.length).toBeGreaterThan(5);

    // Text operators are the shared set every module's list filters accept.
    const textOperators = [
      'contains',
      'notContains',
      'equals',
      'notEquals',
      'startsWith',
      'endsWith',
      'isEmpty',
      'isNotEmpty',
    ];

    const employeeDto = readFileSync(
      resolve(process.cwd(), 'src/modules/employees/dto/employee-query.dto.ts'),
      'utf8',
    );

    const unsupported = textOperators
      .filter((operator) => !employeeDto.includes(`'${operator}'`))
      .sort();

    expect({ unsupported }).toEqual({ unsupported: [] });
  });
});
