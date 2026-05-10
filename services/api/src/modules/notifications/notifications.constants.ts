export const NOTIFICATION_SYSTEM_SCOPE_KEY = 'SYSTEM';

export const NOTIFICATION_TENANT_SCOPE_PREFIX = 'TENANT';
export const NOTIFICATION_USER_SCOPE_PREFIX = 'USER';

export const NOTIFICATION_PERMISSION_KEYS = {
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  NOTIFICATION_TEMPLATES_READ: 'notification.templates.read',
  NOTIFICATION_TEMPLATES_MANAGE: 'notification.templates.manage',
  NOTIFICATION_PROVIDERS_READ: 'notification.providers.read',
  NOTIFICATION_PROVIDERS_MANAGE: 'notification.providers.manage',
  NOTIFICATION_LOGS_READ: 'notification.logs.read',
} as const;

export function buildTenantNotificationScopeKey(tenantId: string) {
  return `${NOTIFICATION_TENANT_SCOPE_PREFIX}:${tenantId}`;
}

export function buildUserNotificationScopeKey(
  tenantId: string,
  userId: string,
) {
  return `${NOTIFICATION_USER_SCOPE_PREFIX}:${tenantId}:${userId}`;
}
