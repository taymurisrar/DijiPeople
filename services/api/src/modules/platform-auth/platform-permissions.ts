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

export function platformAccessForRole(role: PlatformUserRole): PlatformAccess {
  const key = role.toLowerCase().replaceAll('_', '-');
  const elevated =
    role === PlatformUserRole.SUPER_ADMIN ||
    role === PlatformUserRole.PLATFORM_OWNER;
  return {
    roleKeys: elevated
      ? [role, key, 'SUPER_ADMIN', 'system-admin']
      : [
          role,
          key,
          role === PlatformUserRole.MEMBER ? 'system-customizer' : key,
        ],
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

function resolvePlatformPermission(
  request: AuthenticatedRequest,
): PlatformPermission | null {
  const method = request.method.toUpperCase();
  const route = request.route as { path?: string } | undefined;
  const path = route?.path ? route.path : (request.path ?? request.url);

  if (path.includes('admin/demo-data')) return 'platform.demoData.delete';
  if (method === 'DELETE') return null;
  if (path.includes('dashboard-summary')) return 'dashboard.read';
  if (path.includes('platform-settings'))
    return method === 'GET' ? 'settings.read' : 'settings.manage';
  if (path.includes('billing/diagnostics')) return 'billing.read';
  if (path.includes('billing/stripe-webhook-events')) return 'billing.read';
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
