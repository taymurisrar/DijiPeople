import {
  buildBusinessUnitNotificationScopeKey,
  buildDepartmentNotificationScopeKey,
  buildOrganizationNotificationScopeKey,
  buildTeamNotificationScopeKey,
  buildTenantNotificationScopeKey,
  NOTIFICATION_SYSTEM_SCOPE_KEY,
  notificationScopeChain,
} from './notifications.constants';

describe('notification scope chain', () => {
  it('orders scopes most specific first and always ends at system', () => {
    const chain = notificationScopeChain({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      businessUnitId: 'bu-1',
      departmentId: 'dept-1',
      teamId: 'team-1',
    });

    expect(chain).toEqual([
      buildTeamNotificationScopeKey('team-1'),
      buildDepartmentNotificationScopeKey('dept-1'),
      buildBusinessUnitNotificationScopeKey('bu-1'),
      buildOrganizationNotificationScopeKey('org-1'),
      buildTenantNotificationScopeKey('tenant-1'),
      NOTIFICATION_SYSTEM_SCOPE_KEY,
    ]);
  });

  it('skips levels the record does not belong to', () => {
    const chain = notificationScopeChain({
      tenantId: 'tenant-1',
      businessUnitId: 'bu-1',
    });

    expect(chain).toEqual([
      buildBusinessUnitNotificationScopeKey('bu-1'),
      buildTenantNotificationScopeKey('tenant-1'),
      NOTIFICATION_SYSTEM_SCOPE_KEY,
    ]);
  });

  it('falls back to tenant then system when no placement is known', () => {
    expect(notificationScopeChain({ tenantId: 'tenant-1' })).toEqual([
      buildTenantNotificationScopeKey('tenant-1'),
      NOTIFICATION_SYSTEM_SCOPE_KEY,
    ]);
  });

  it('never returns a scope twice, so a lookup cannot double count', () => {
    const chain = notificationScopeChain({
      tenantId: 'tenant-1',
      organizationId: 'org-1',
      teamId: 'team-1',
    });

    expect(new Set(chain).size).toBe(chain.length);
  });
});
