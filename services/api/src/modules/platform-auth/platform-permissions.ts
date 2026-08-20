import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PlatformUserRole } from '@prisma/client';
import type {
  AuthenticatedRequest,
  AuthenticatedUser,
} from '../../common/interfaces/authenticated-request.interface';

export type PlatformPermission =
  | 'dashboard.read'
  | 'leads.create'
  | 'leads.read'
  | 'leads.update'
  | 'customers.create'
  | 'customers.read'
  | 'customers.update'
  | 'tenants.create'
  | 'tenants.read'
  | 'tenants.update'
  | 'onboarding.create'
  | 'onboarding.read'
  | 'onboarding.update'
  | 'partners.read'
  | 'partners.manage'
  | 'contracts.read'
  | 'contracts.manage'
  | 'contracts.approve'
  | 'support.read'
  | 'support.manage'
  | 'monitoring.read'
  | 'monitoring.manage'
  | 'payments.read'
  | 'payments.manage'
  | 'billing.read'
  | 'billing.manage'
  | 'subscriptions.read'
  | 'subscriptions.manage'
  | 'invoices.read'
  | 'invoices.manage'
  | 'plans.read'
  // BUG-0072: the union had no mutating counterpart for these four domains, so
  // `resolvePlatformPermission` had nothing to return for a POST/PATCH/DELETE
  // and returned the read permission instead. A role called READ_ONLY_AUDITOR
  // could therefore rewrite the commercial plan catalog.
  | 'plans.manage'
  | 'settings.read'
  | 'settings.manage'
  | 'settings.appearance.manage'
  | 'settings.email.manage'
  | 'settings.email.credentials'
  | 'settings.email.test'
  | 'roles.manage'
  | 'platform.demoData.delete';

type PlatformAccess = { roleKeys: string[]; permissionKeys: string[] };

const LEGACY_MEMBER_PERMISSIONS: PlatformPermission[] = [
  'dashboard.read',
  'leads.create',
  'leads.read',
  'leads.update',
  'customers.create',
  'customers.read',
  'customers.update',
  'tenants.create',
  'tenants.read',
  'tenants.update',
  'onboarding.create',
  'onboarding.read',
  'onboarding.update',
  'payments.read',
  'billing.read',
  'subscriptions.read',
  'invoices.read',
  'plans.read',
];

const ROLE_PERMISSIONS: Record<PlatformUserRole, string[]> = {
  SUPER_ADMIN: ['platform.*'],
  PLATFORM_OWNER: ['platform.*'],
  PLATFORM_ADMIN: [
    'dashboard.read',
    'leads.*',
    'customers.*',
    'tenants.*',
    'onboarding.*',
    'partners.*',
    'contracts.*',
    'support.*',
    'monitoring.*',
    'billing.*',
    'payments.read',
    'payments.manage',
    'subscriptions.read',
    'subscriptions.manage',
    'invoices.read',
    'invoices.manage',
    'plans.read',
    'plans.manage',
    'settings.read',
    'settings.manage',
    'settings.appearance.manage',
    'settings.email.manage',
    'settings.email.test',
  ],
  MEMBER: LEGACY_MEMBER_PERMISSIONS,
  PLATFORM_OPERATIONS: [
    'dashboard.read',
    'customers.read',
    'customers.update',
    'tenants.*',
    'onboarding.*',
    'partners.read',
    'contracts.read',
    'support.*',
    'monitoring.*',
  ],
  PRESALES_MANAGER: [
    'dashboard.read',
    'leads.*',
    'customers.create',
    'customers.read',
    'customers.update',
    'onboarding.create',
    'onboarding.read',
    'partners.read',
  ],
  PRESALES_USER: [
    'dashboard.read',
    'leads.create',
    'leads.read',
    'leads.update',
    'customers.read',
    'onboarding.read',
    'partners.read',
  ],
  PARTNER_MANAGER: [
    'dashboard.read',
    'partners.*',
    'leads.read',
    'leads.update',
    'contracts.read',
    'contracts.manage',
    'support.read',
  ],
  CONTRACT_MANAGER: [
    'dashboard.read',
    'contracts.*',
    'customers.read',
    'partners.read',
    'onboarding.read',
  ],
  LEGAL_REVIEWER: [
    'dashboard.read',
    'contracts.read',
    'contracts.approve',
    'customers.read',
    'partners.read',
  ],
  FINANCE_MANAGER: [
    'dashboard.read',
    'billing.*',
    'payments.read',
    'subscriptions.read',
    'invoices.read',
    'plans.read',
    'contracts.read',
    'contracts.approve',
    'customers.read',
    'partners.read',
  ],
  BILLING_USER: [
    'dashboard.read',
    'billing.read',
    'payments.read',
    'subscriptions.read',
    'invoices.read',
    'plans.read',
    'customers.read',
  ],
  SUPPORT_MANAGER: [
    'dashboard.read',
    'support.*',
    'monitoring.*',
    'customers.read',
    'tenants.read',
    'partners.read',
    'subscriptions.read',
    'invoices.read',
  ],
  SUPPORT_AGENT: [
    'dashboard.read',
    'support.read',
    'support.manage',
    'monitoring.read',
    'customers.read',
    'tenants.read',
    'partners.read',
    'subscriptions.read',
    'invoices.read',
  ],
  MONITORING_OPERATOR: [
    'dashboard.read',
    'monitoring.*',
    'support.read',
    'support.manage',
    'customers.read',
    'tenants.read',
  ],
  READ_ONLY_AUDITOR: [
    'dashboard.read',
    'leads.read',
    'customers.read',
    'tenants.read',
    'onboarding.read',
    'partners.read',
    'contracts.read',
    'support.read',
    'monitoring.read',
    'billing.read',
    'payments.read',
    'subscriptions.read',
    'invoices.read',
    'plans.read',
    'settings.read',
  ],
};

/**
 * The guard aliases a platform role satisfies.
 *
 * WHAT THIS LIST IS. Guards across the codebase check role *keys*, and they were
 * not written against one convention: some compare the enum member
 * (`PLATFORM_OWNER`), some the kebab slug (`platform-owner`), and the tenant-side
 * guards predate platform roles entirely and look for `system-admin` or
 * `system-customizer`. So one role has to answer to several names.
 *
 * WHAT IT IS NOT. It is not a list of roles a person holds, and it must never be
 * rendered as one — "PLATFORM_OWNER, platform-owner, SUPER_ADMIN, system-admin"
 * reads as four roles when it describes one. Show `PlatformUser.role` instead;
 * `formatPlatformRole` in the admin app renders it.
 *
 * Deduplicated at source: this previously emitted `key` twice for every
 * non-elevated role that was not MEMBER, and `SUPER_ADMIN` twice for the
 * SUPER_ADMIN role itself.
 */
export function platformAccessForRole(role: PlatformUserRole): PlatformAccess {
  const key = role.toLowerCase().replaceAll('_', '-');
  const elevated =
    role === PlatformUserRole.SUPER_ADMIN ||
    role === PlatformUserRole.PLATFORM_OWNER;

  const aliases = [
    role as string,
    key,
    ...(elevated ? ['SUPER_ADMIN', 'system-admin'] : []),
    ...(role === PlatformUserRole.MEMBER ? ['system-customizer'] : []),
  ];

  return {
    /* Order is preserved so the actual role stays first. */
    roleKeys: [...new Set(aliases)],
    permissionKeys: [...ROLE_PERMISSIONS[role]],
  };
}

export function hasPlatformPermission(
  role: PlatformUserRole | undefined,
  permission: PlatformPermission,
) {
  if (!role) return false;
  return ROLE_PERMISSIONS[role].some((granted) =>
    permissionMatches(granted, permission),
  );
}

/**
 * Does this subject hold a platform permission?
 *
 * Platform identity is checked first and is not negotiable. The
 * `permissionKeys` fallback below reads whatever keys the subject carries, and
 * for a *tenant* subject those are tenant keys — six of which
 * (`onboarding.create`, `onboarding.read`, `settings.read`, `settings.manage`,
 * `roles.manage`, `billing.manage`) share a name with a platform permission.
 * Without this guard clause a tenant administrator satisfied platform
 * permissions by coincidence of naming, which is BUG-0071.
 *
 * Requiring `platform.id` costs genuine platform users nothing:
 * `loadPlatformAccessContext` derives their `permissionKeys` from
 * `platformAccessForRole(user.role)`, so the role path already covers every key
 * the fallback could match.
 */
export function userHasPlatformPermission(
  user: AuthenticatedUser,
  permission: PlatformPermission,
) {
  if (!user.platform?.id) return false;

  return (
    hasPlatformPermission(user.platform?.role, permission) ||
    user.permissionKeys.some((granted) =>
      permissionMatches(granted, permission),
    )
  );
}

/**
 * The platform boundary, and it fails closed.
 *
 * This guard used to open with `if (!role) return true` — reading "no platform
 * role" as "not a platform request, nothing for me to check". Every controller
 * that uses it is a platform surface end to end (`super-admin`, `demo-data`,
 * `admin-leads`), so on those controllers that early exit did not mean
 * "harmless", it meant "unguarded": a tenant user with the ordinary tenant role
 * `system-admin` reached every super-admin endpoint. That is BUG-0071.
 *
 * The same line was inverted for the routes `resolvePlatformPermission` does
 * not map. A genuine platform operator fell through to the throw and got 403
 * from `/operators`, `/feature-catalog` and `/lifecycle-options`, while a tenant
 * user had already returned `true` above. The people the console was built for
 * were the only ones locked out of it.
 *
 * So: platform identity first, then the permission the route names — and the
 * map was completed so that every route names one.
 */
@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Identity before permission. A subject with no platform identity has no
    // business on any of these controllers, whatever keys its tenant granted.
    if (!request.user?.platform?.id) {
      throw new ForbiddenException({
        code: 'PLATFORM_ACCESS_REQUIRED',
        message: 'Platform access is required to perform this action.',
      });
    }

    // No permissive branch. An unresolved permission is refused, exactly as
    // before — the routes that used to land here (`/operators`,
    // `/feature-catalog`, `/lifecycle-options`, `/tenant-slug/availability`)
    // were fixed by completing the map, not by relaxing the guard, and
    // platform-permissions.spec.ts enumerates the controller to keep it complete.
    const permission = resolvePlatformPermission(request);

    if (permission && userHasPlatformPermission(request.user, permission)) {
      return true;
    }

    throw new ForbiddenException({
      code: 'PLATFORM_PERMISSION_DENIED',
      message: 'You do not have permission to perform this platform action.',
    });
  }
}

/**
 * Which platform permission does this request require?
 *
 * A path-substring matcher, extended domain by domain over time. Two rules keep
 * it honest, both learned the hard way:
 *
 *   1. **Every branch considers the method.** The `plans`, `invoices`,
 *      `subscriptions` and `payments` branches once returned the read
 *      permission whatever the method, so `READ_ONLY_AUDITOR` — a role named
 *      for not writing — could rewrite the commercial plan catalog (BUG-0072).
 *   2. **No super-admin route may fall through to `null`.** The guard refuses
 *      an unresolved permission, so a gap here is a route nobody can reach.
 *      Four routes were in that state (BUG-0071). `platform-permissions.spec.ts`
 *      enumerates the controller's own route metadata and fails if a new route
 *      lands unmapped, so this cannot silently regrow.
 *
 * Order matters: the specific paths come before the domain prefixes they would
 * otherwise be swallowed by.
 */
export function resolvePlatformPermission(
  request: AuthenticatedRequest,
): PlatformPermission | null {
  const method = request.method.toUpperCase();
  const route = request.route as { path?: string } | undefined;
  const path = route?.path ? route.path : (request.path ?? request.url);
  const reads = method === 'GET';

  if (path.includes('admin/demo-data')) return 'platform.demoData.delete';
  if (path.includes('dashboard-summary')) return 'dashboard.read';

  // Console furniture: static option lists and the platform staff picker. They
  // carry no tenant or commercial data, so platform identity plus the weakest
  // platform permission — which every role holds — is the whole requirement.
  // They are mapped explicitly rather than left to fall through, because
  // falling through means a 403 for everyone.
  if (path.includes('lifecycle-options')) return 'dashboard.read';
  if (path.includes('operators')) return 'dashboard.read';

  if (path.includes('platform-email/test-connection'))
    return 'settings.email.test';
  if (path.includes('platform-email/test-email')) return 'settings.email.test';
  if (path.includes('platform-email/templates'))
    return reads ? 'settings.read' : 'settings.email.manage';
  if (path.includes('platform-email'))
    return reads ? 'settings.read' : 'settings.email.manage';
  if (path.includes('platform-settings')) {
    if (reads) return 'settings.read';
    if (method === 'PATCH' && isAppearanceOnlyUpdate(request.body))
      return 'settings.appearance.manage';
    return 'settings.manage';
  }

  if (path.includes('billing/diagnostics')) return 'billing.read'; // GET only
  if (path.includes('billing/test-stripe-connection')) return 'billing.manage';
  // Listing webhook events reads; retrying one re-drives a payment side effect,
  // so it must not share the list's read permission.
  if (path.includes('billing/stripe-webhook-events'))
    return reads ? 'billing.read' : 'billing.manage';
  if (path.includes('promotions'))
    return reads ? 'billing.read' : 'billing.manage';

  if (path.includes('leads')) return actionFor(method, 'leads');
  // `tenant-slug` is a namespace lookup, not a tenant route: it does not contain
  // the substring `tenants`, so it needs its own line.
  if (path.includes('tenant-slug')) return 'tenants.read';
  if (path.includes('customer-onboarding'))
    return actionFor(method, 'onboarding');
  if (path.includes('customers')) return actionFor(method, 'customers');
  if (path.includes('tenants')) return actionFor(method, 'tenants');

  if (path.includes('payments'))
    return reads ? 'payments.read' : 'payments.manage';
  if (path.includes('subscriptions'))
    return reads ? 'subscriptions.read' : 'subscriptions.manage';
  if (path.includes('invoices'))
    return reads ? 'invoices.read' : 'invoices.manage';
  // The feature catalog is what plans are assembled from, so it reads with them.
  if (path.includes('feature-catalog')) return 'plans.read';
  if (path.includes('plans')) return reads ? 'plans.read' : 'plans.manage';
  if (path.includes('billing'))
    return reads ? 'billing.read' : 'billing.manage';

  return null;
}

function isAppearanceOnlyUpdate(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const settingsKeys = Object.keys(body).filter(
    (key) => !['merge', 'changeReason'].includes(key),
  );
  return settingsKeys.length === 1 && settingsKeys[0] === 'branding';
}

function actionFor(
  method: string,
  domain: 'leads' | 'customers' | 'tenants' | 'onboarding',
): PlatformPermission | null {
  if (method === 'GET') return `${domain}.read`;
  if (method === 'POST') return `${domain}.create`;
  if (method === 'PATCH' || method === 'PUT') return `${domain}.update`;
  // DELETE returned null, which the guard reads as "no route" and refuses.
  // There is no `<domain>.delete` permission in the union, and inventing one
  // would need a grant decision for sixteen roles; `update` is the closest
  // mutating permission that already exists and is already scoped per domain.
  if (method === 'DELETE') return `${domain}.update`;
  return null;
}

function permissionMatches(granted: string, requested: string) {
  if (granted === 'platform.*' || granted === requested) return true;
  return granted.endsWith('.*') && requested.startsWith(granted.slice(0, -1));
}
