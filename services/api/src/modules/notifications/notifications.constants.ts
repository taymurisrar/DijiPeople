export const NOTIFICATION_SYSTEM_SCOPE_KEY = 'SYSTEM';

export const NOTIFICATION_TENANT_SCOPE_PREFIX = 'TENANT';
export const NOTIFICATION_USER_SCOPE_PREFIX = 'USER';
export const NOTIFICATION_ORG_SCOPE_PREFIX = 'ORG';
export const NOTIFICATION_BUSINESS_UNIT_SCOPE_PREFIX = 'BU';
export const NOTIFICATION_DEPARTMENT_SCOPE_PREFIX = 'DEPT';
export const NOTIFICATION_TEAM_SCOPE_PREFIX = 'TEAM';

/**
 * Where a template applies. A more specific scope overrides a broader one, so
 * a team can refine what its department, business unit, organization or tenant
 * already defines without copying the whole template.
 */
export type NotificationScopeContext = {
  tenantId: string;
  organizationId?: string | null;
  businessUnitId?: string | null;
  departmentId?: string | null;
  teamId?: string | null;
};

export const NOTIFICATION_PERMISSION_KEYS = {
  INBOX_READ: 'inbox.read',
  INBOX_MARK_READ: 'inbox.markRead',
  INBOX_DISMISS: 'inbox.dismiss',
  INBOX_ARCHIVE: 'inbox.archive',
  INBOX_BULK_UPDATE: 'inbox.bulkUpdate',
  NOTIFICATIONS_READ: 'notifications.read',
  NOTIFICATIONS_MANAGE: 'notifications.manage',
  NOTIFICATIONS_MANAGE_RULES: 'notifications.manageRules',
  NOTIFICATIONS_MANAGE_TEMPLATES: 'notifications.manageTemplates',
  NOTIFICATION_TEMPLATES_READ: 'notification.templates.read',
  NOTIFICATION_TEMPLATES_MANAGE: 'notification.templates.manage',
  NOTIFICATION_PROVIDERS_READ: 'notification.providers.read',
  NOTIFICATION_PROVIDERS_MANAGE: 'notification.providers.manage',
  NOTIFICATION_LOGS_READ: 'notification.logs.read',
  NOTIFICATION_DIAGNOSTICS_READ: 'notification.diagnostics.read',
} as const;

export function buildTenantNotificationScopeKey(tenantId: string) {
  return `${NOTIFICATION_TENANT_SCOPE_PREFIX}:${tenantId}`;
}

export function buildOrganizationNotificationScopeKey(organizationId: string) {
  return `${NOTIFICATION_ORG_SCOPE_PREFIX}:${organizationId}`;
}

export function buildBusinessUnitNotificationScopeKey(businessUnitId: string) {
  return `${NOTIFICATION_BUSINESS_UNIT_SCOPE_PREFIX}:${businessUnitId}`;
}

export function buildDepartmentNotificationScopeKey(departmentId: string) {
  return `${NOTIFICATION_DEPARTMENT_SCOPE_PREFIX}:${departmentId}`;
}

export function buildTeamNotificationScopeKey(teamId: string) {
  return `${NOTIFICATION_TEAM_SCOPE_PREFIX}:${teamId}`;
}

/**
 * Scope keys to try, most specific first. The first scope holding an active
 * template for the event wins; SYSTEM is the final fallback.
 */
export function notificationScopeChain(
  context: NotificationScopeContext,
): string[] {
  const chain: string[] = [];

  if (context.teamId) chain.push(buildTeamNotificationScopeKey(context.teamId));
  if (context.departmentId) {
    chain.push(buildDepartmentNotificationScopeKey(context.departmentId));
  }
  if (context.businessUnitId) {
    chain.push(buildBusinessUnitNotificationScopeKey(context.businessUnitId));
  }
  if (context.organizationId) {
    chain.push(buildOrganizationNotificationScopeKey(context.organizationId));
  }

  chain.push(buildTenantNotificationScopeKey(context.tenantId));
  chain.push(NOTIFICATION_SYSTEM_SCOPE_KEY);

  return chain;
}

/*
 * The levels a tenant user may author a template at, and how to read a stored
 * scope key back into a level and an id for display and editing.
 */
export const EMAIL_TEMPLATE_SCOPE_LEVELS = [
  'TENANT',
  'ORGANIZATION',
  'BUSINESS_UNIT',
  'DEPARTMENT',
  'TEAM',
] as const;

export type EmailTemplateScopeLevel =
  (typeof EMAIL_TEMPLATE_SCOPE_LEVELS)[number];

const SCOPE_PREFIX_BY_LEVEL: Record<EmailTemplateScopeLevel, string> = {
  TENANT: NOTIFICATION_TENANT_SCOPE_PREFIX,
  ORGANIZATION: NOTIFICATION_ORG_SCOPE_PREFIX,
  BUSINESS_UNIT: NOTIFICATION_BUSINESS_UNIT_SCOPE_PREFIX,
  DEPARTMENT: NOTIFICATION_DEPARTMENT_SCOPE_PREFIX,
  TEAM: NOTIFICATION_TEAM_SCOPE_PREFIX,
};

export function buildNotificationScopeKey(
  level: EmailTemplateScopeLevel,
  id: string,
) {
  return `${SCOPE_PREFIX_BY_LEVEL[level]}:${id}`;
}

export function parseNotificationScopeKey(scopeKey: string): {
  level: EmailTemplateScopeLevel | 'SYSTEM';
  id: string | null;
} {
  if (scopeKey === NOTIFICATION_SYSTEM_SCOPE_KEY) {
    return { level: 'SYSTEM', id: null };
  }

  const separator = scopeKey.indexOf(':');
  if (separator === -1) return { level: 'SYSTEM', id: null };

  const prefix = scopeKey.slice(0, separator);
  const id = scopeKey.slice(separator + 1);
  const level = EMAIL_TEMPLATE_SCOPE_LEVELS.find(
    (candidate) => SCOPE_PREFIX_BY_LEVEL[candidate] === prefix,
  );

  return level ? { level, id } : { level: 'SYSTEM', id: null };
}

export function buildUserNotificationScopeKey(
  tenantId: string,
  userId: string,
) {
  return `${NOTIFICATION_USER_SCOPE_PREFIX}:${tenantId}:${userId}`;
}
