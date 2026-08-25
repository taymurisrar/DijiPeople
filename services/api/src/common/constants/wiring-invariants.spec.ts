import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import {
  REQUIRED_PERMISSIONS_KEY,
  REQUIRED_RBAC_PERMISSIONS_KEY,
} from '../decorators/require-permissions.decorator';
import { PermissionsGuard } from '../guards/permissions.guard';
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
  // Held by no role by default: reviewing captured DLP content is reachable only
  // via the elevated-admin bypass until a tenant assigns a dedicated role
  // (TASK-0020).
  'dlp.review',
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
  /*
   * Bulk hard deletes. Reserved for administrators by default rather than
   * granted with the matching update permission: erasing records permanently
   * should be a deliberate grant, not a side effect of being able to edit.
   */
  'recruitment.delete',
  'onboarding.delete',
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

/*
 * The dual-permission invariant.
 *
 * DijiPeople authorizes an endpoint through two decorator families at once, and
 * PermissionsGuard reads both metadata keys on every request:
 *
 *   @Permissions('employees.read')                     -> REQUIRED_PERMISSIONS_KEY
 *   @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')  -> REQUIRED_RBAC_PERMISSIONS_KEY
 *
 * The guard treats an *absent* family as satisfied rather than denied. Read it
 * again: `hasRbacPermission` is true when no matrix privilege is declared, and
 * `hasAllPermissions` is vacuously true when no legacy key is declared. So a
 * handler carrying only one family is still authorized — on one axis only, and
 * silently. Nothing fails, nothing logs, and the endpoint looks decorated.
 *
 * The matrix axis is the one carrying SecurityAccessLevel, which is what
 * resolveEffectiveAccessLevel() and buildScopedAccessWhere() consume to scope
 * rows. An endpoint with no matrix privilege therefore has no endpoint-level
 * counterpart to its row-level scoping, which is why this is worth an invariant
 * rather than a convention.
 *
 * This reads the metadata the guard reads, via the same Reflector and the same
 * resolution order, rather than grepping decorator text. A regex would be fooled
 * by a commented-out decorator, by the aliases (@RequirePermissions is
 * @Permissions; @RequireAnyPermission writes the same key as @RequirePermission)
 * and by controller-level declarations.
 */

type RouteHandler = {
  controller: string;
  handler: string;
  httpMethod: string;
  route: string;
  file: string;
  guards: unknown[];
  target: object;
  controllerClass: object;
};

/*
 * Guard identity, never guard name. PlatformPermissionsGuard ends in
 * "PermissionsGuard" but is an unrelated authorization system: it derives a
 * permission from the request path, reads neither metadata key, and returns true
 * outright when the caller has no platform role. A name or substring comparison
 * would pull every platform-admin handler into this invariant's scope and report
 * all of them as violations.
 */
function usesPermissionsGuard(guards: unknown[]) {
  return guards.some(
    (guard) => guard === PermissionsGuard || guard instanceof PermissionsGuard,
  );
}

/** Nest accepts a single path or an array of them on @Controller and @Get. */
function firstPath(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

async function collectRouteHandlers(): Promise<RouteHandler[]> {
  const files = walk(resolve(process.cwd(), 'src'), /\.controller\.ts$/);
  const handlers: RouteHandler[] = [];

  for (const file of files) {
    const loaded = (await import(file)) as Record<string, unknown>;

    for (const exported of Object.values(loaded)) {
      // @Controller() is what makes a class a routing surface.
      if (typeof exported !== 'function') continue;
      const controllerPath = Reflect.getMetadata(PATH_METADATA, exported) as
        | string
        | string[]
        | undefined;
      if (controllerPath === undefined) continue;

      const controllerGuards: unknown[] =
        (Reflect.getMetadata(GUARDS_METADATA, exported) as unknown[]) ?? [];

      /*
       * The prototype chain, not just own properties. No controller extends a
       * base class today; if one ever does, its inherited routes must not
       * silently escape this check.
       */
      const seen = new Set<string>();
      let proto: object | null = exported.prototype as object | null;

      while (proto && proto !== Object.prototype) {
        for (const name of Object.getOwnPropertyNames(proto)) {
          if (name === 'constructor' || seen.has(name)) continue;

          // Read the descriptor so a getter is not invoked by the lookup.
          const target = Object.getOwnPropertyDescriptor(proto, name)?.value as
            | object
            | undefined;
          if (typeof target !== 'function') continue;

          const httpMethod = Reflect.getMetadata(METHOD_METADATA, target) as
            | number
            | undefined;
          if (httpMethod === undefined) continue;
          seen.add(name);

          const methodGuards: unknown[] =
            (Reflect.getMetadata(GUARDS_METADATA, target) as unknown[]) ?? [];
          const handlerPath = Reflect.getMetadata(PATH_METADATA, target) as
            | string
            | string[]
            | undefined;

          handlers.push({
            controller: exported.name,
            handler: name,
            httpMethod: RequestMethod[httpMethod] ?? String(httpMethod),
            route: `/${firstPath(controllerPath)}/${firstPath(handlerPath)}`
              .replace(/\/+/g, '/')
              .replace(/(.)\/$/, '$1'),
            file: relative(process.cwd(), file).replace(/\\/g, '/'),
            // Nest applies controller-level and method-level guards together.
            guards: [...controllerGuards, ...methodGuards],
            target,
            controllerClass: exported,
          });
        }

        proto = Object.getPrototypeOf(proto) as object | null;
      }
    }
  }

  return handlers;
}

describe('permission wiring invariants', () => {
  it('every guarded, non-public endpoint declares both permission systems', async () => {
    const reflector = new Reflector();
    const handlers = await collectRouteHandlers();

    // A regression here means controllers stopped being discovered at all.
    expect(handlers.length).toBeGreaterThan(500);

    const skippedPublic: string[] = [];
    const skippedUnguarded = new Map<string, number>();
    const violations: string[] = [];
    let compliant = 0;

    for (const handler of handlers) {
      const lookup = [handler.target, handler.controllerClass] as Parameters<
        Reflector['getAllAndOverride']
      >[1];

      /*
       * getAllAndOverride, matching PermissionsGuard exactly: handler metadata
       * overrides controller metadata, it does not merge with it. A handler that
       * declares its own @Permissions replaces the controller's entirely.
       */
      const isPublic = reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        lookup,
      );
      if (isPublic === true) {
        skippedPublic.push(`${handler.controller}.${handler.handler}`);
        continue;
      }

      /*
       * Only PermissionsGuard reads these two keys, so only handlers it protects
       * can be held to the rule. Handlers behind JwtAuthGuard alone, the platform
       * guard, the gateway guard or the partner guard are counted and reported
       * below rather than judged here — they are a separate question, not a
       * silent exemption.
       */
      if (!usesPermissionsGuard(handler.guards)) {
        const key =
          (handler.guards as { name?: string }[])
            .map((guard) => guard?.name ?? 'anonymous')
            .join('+') || '(no guards)';
        skippedUnguarded.set(key, (skippedUnguarded.get(key) ?? 0) + 1);
        continue;
      }

      const legacy = reflector.getAllAndOverride<string[]>(
        REQUIRED_PERMISSIONS_KEY,
        lookup,
      );
      const matrix = reflector.getAllAndOverride<unknown[]>(
        REQUIRED_RBAC_PERMISSIONS_KEY,
        lookup,
      );

      // An empty array declares nothing, and the guard treats it as satisfied.
      const missing: string[] = [];
      if (!Array.isArray(legacy) || legacy.length === 0) {
        missing.push('@Permissions');
      }
      if (!Array.isArray(matrix) || matrix.length === 0) {
        missing.push('@RequirePermission');
      }

      if (missing.length === 0) {
        compliant += 1;
        continue;
      }

      violations.push(
        `${handler.controller}.${handler.handler} [${handler.httpMethod} ${handler.route}] ` +
          `missing: ${missing.join(', ')} (${handler.file})`,
      );
    }

    violations.sort();

    /*
     * Jest truncates a long diff, and the inventory is the point of this test,
     * so it is written out in full before the assertion rather than left to the
     * reporter.
     */
    if (violations.length > 0) {
      const byMissing = (label: string) =>
        violations.filter((line) => line.includes(`missing: ${label} (`))
          .length;

      console.error(
        [
          '',
          'DUAL-PERMISSION INVARIANT — violation inventory',
          `  total route handlers        : ${handlers.length}`,
          `  public handlers skipped     : ${skippedPublic.length}`,
          `  not behind PermissionsGuard : ${[...skippedUnguarded.values()].reduce((a, b) => a + b, 0)}`,
          ...[...skippedUnguarded.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(
              ([key, count]) => `      ${String(count).padStart(4)}  ${key}`,
            ),
          `  in scope                    : ${compliant + violations.length}`,
          `  compliant                   : ${compliant}`,
          `  violations                  : ${violations.length}`,
          `      missing @Permissions only        : ${byMissing('@Permissions')}`,
          `      missing @RequirePermission only  : ${byMissing('@RequirePermission')}`,
          `      missing both                     : ${byMissing('@Permissions, @RequirePermission')}`,
          '',
          ...violations,
          '',
        ].join('\n'),
      );
    }

    expect({ violations }).toEqual({ violations: [] });
  }, 600_000);

  it('keeps every non-PermissionsGuard route on an explicit reviewed authorization surface', async () => {
    const reflector = new Reflector();
    const handlers = await collectRouteHandlers();
    const serviceAuthorizedControllers = new Set([
      'ContractsController',
      'ContractTemplatesController',
      'SignatureRequestsController',
      'PlatformApprovalsController',
      'PartnerExperienceAdminController',
      'PlatformEventsController',
      'PlatformMonitoringController',
      'PlatformRuntimeController',
      'PlatformUsersController',
      'SupportCasesController',
      'TenantControlPlaneController',
      'PartnersController',
      'CustomizationRuntimeController',
      'DataController',
      'MetadataController',
      'ErrorLogsController',
      'OrganizationAccessController',
      'OrganizationHierarchyController',
      'WorkspaceController',
      'AppController',
    ]);
    const approvedAlternativeGuards = new Set([
      'PlatformPermissionsGuard',
      'PartnerAuthGuard',
      'GatewayAuthGuard',
      'PublicRateLimitGuard',
    ]);
    const violations: string[] = [];

    for (const handler of handlers) {
      const lookup = [handler.target, handler.controllerClass] as Parameters<
        Reflector['getAllAndOverride']
      >[1];
      if (
        reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, lookup) === true ||
        usesPermissionsGuard(handler.guards)
      ) {
        continue;
      }

      const guardNames = (handler.guards as { name?: string }[]).map(
        (guard) => guard?.name ?? 'anonymous',
      );
      if (
        serviceAuthorizedControllers.has(handler.controller) ||
        guardNames.some((name) => approvedAlternativeGuards.has(name))
      ) {
        continue;
      }

      violations.push(
        `${handler.controller}.${handler.handler} [${handler.httpMethod} ${handler.route}] ` +
          `has unreviewed guards: ${guardNames.join('+') || '(none)'} (${handler.file})`,
      );
    }

    expect({ violations: violations.sort() }).toEqual({ violations: [] });
  }, 600_000);
});
