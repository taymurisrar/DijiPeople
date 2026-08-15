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
  | 'billing.read'
  | 'billing.manage'
  | 'subscriptions.read'
  | 'invoices.read'
  | 'plans.read'
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
    'subscriptions.read',
    'invoices.read',
    'plans.read',
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

export function userHasPlatformPermission(
  user: AuthenticatedUser,
  permission: PlatformPermission,
) {
  return (
    hasPlatformPermission(user.platform?.role, permission) ||
    user.permissionKeys.some((granted) =>
      permissionMatches(granted, permission),
    )
  );
}

@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.platform?.role;

    if (!role) return true;
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

export function resolvePlatformPermission(
  request: AuthenticatedRequest,
): PlatformPermission | null {
  const method = request.method.toUpperCase();
  const route = request.route as { path?: string } | undefined;
  const path = route?.path ? route.path : (request.path ?? request.url);

  if (path.includes('admin/demo-data')) return 'platform.demoData.delete';
  if (path.includes('dashboard-summary')) return 'dashboard.read';
  if (path.includes('platform-email/test-connection'))
    return 'settings.email.test';
  if (path.includes('platform-email/test-email')) return 'settings.email.test';
  if (path.includes('platform-email/templates'))
    return method === 'GET' ? 'settings.read' : 'settings.email.manage';
  if (path.includes('platform-email'))
    return method === 'GET' ? 'settings.read' : 'settings.email.manage';
  if (path.includes('platform-settings')) {
    if (method === 'GET') return 'settings.read';
    if (method === 'PATCH' && isAppearanceOnlyUpdate(request.body))
      return 'settings.appearance.manage';
    return 'settings.manage';
  }
  if (path.includes('billing/diagnostics')) return 'billing.read';
  if (path.includes('billing/test-stripe-connection')) return 'billing.manage';
  if (path.includes('billing/stripe-webhook-events')) return 'billing.read';
  if (path.includes('promotions'))
    return method === 'GET' ? 'billing.read' : 'billing.manage';
  if (path.includes('leads')) return actionFor(method, 'leads');
  if (path.includes('customers')) return actionFor(method, 'customers');
  if (path.includes('customer-onboarding'))
    return actionFor(method, 'onboarding');
  if (path.includes('tenants')) return actionFor(method, 'tenants');
  if (path.includes('payments')) return 'payments.read';
  if (path.includes('subscriptions')) return 'subscriptions.read';
  if (path.includes('invoices')) return 'invoices.read';
  if (path.includes('plans')) return 'plans.read';
  if (path.includes('billing'))
    return method === 'GET' ? 'billing.read' : 'billing.manage';
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
  return null;
}

function permissionMatches(granted: string, requested: string) {
  if (granted === 'platform.*' || granted === requested) return true;
  return granted.endsWith('.*') && requested.startsWith(granted.slice(0, -1));
}
