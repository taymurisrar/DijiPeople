import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';

type PlatformPermission =
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
  | 'payments.read'
  | 'billing.read'
  | 'subscriptions.read'
  | 'invoices.read'
  | 'plans.read'
  | 'platform.demoData.delete';

const MEMBER_PERMISSIONS = new Set<PlatformPermission>([
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
]);

export function hasPlatformPermission(
  role: 'SUPER_ADMIN' | 'MEMBER' | undefined,
  permission: PlatformPermission,
) {
  if (role === 'SUPER_ADMIN') return true;
  if (role === 'MEMBER') return MEMBER_PERMISSIONS.has(permission);
  return false;
}

@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const role = request.user?.platform?.role;

    if (!role) return true;
    if (role === 'SUPER_ADMIN') return true;

    const permission = resolvePlatformPermission(request);
    if (permission && hasPlatformPermission(role, permission)) {
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

  if (path.includes('dashboard-summary')) return null;
  if (path.includes('platform-settings'))
    return method === 'GET' ? 'billing.read' : null;
  if (path.includes('billing/diagnostics')) return null;
  if (path.includes('billing/stripe-webhook-events')) return null;

  if (path.includes('leads')) return actionFor(method, 'leads');
  if (path.includes('customers')) return actionFor(method, 'customers');
  if (path.includes('customer-onboarding'))
    return actionFor(method, 'onboarding');
  if (path.includes('tenants')) return actionFor(method, 'tenants');

  if (path.includes('payments'))
    return method === 'GET' ? 'payments.read' : null;
  if (path.includes('subscriptions'))
    return method === 'GET' ? 'subscriptions.read' : null;
  if (path.includes('invoices'))
    return method === 'GET' ? 'invoices.read' : null;
  if (path.includes('plans')) return method === 'GET' ? 'plans.read' : null;
  if (path.includes('billing')) return method === 'GET' ? 'billing.read' : null;

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
