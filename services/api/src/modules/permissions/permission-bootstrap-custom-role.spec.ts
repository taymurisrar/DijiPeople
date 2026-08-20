import {
  RoleAccessLevel,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import {
  ENTITY_KEYS,
  legacyPermissionToMatrixPrivileges,
} from '../../common/constants/rbac-matrix';
import { PermissionBootstrapService } from './permission-bootstrap.service';

describe('custom-role matrix compatibility bootstrap', () => {
  it.each([
    ['documents.read', ENTITY_KEYS.DOCUMENTS, SecurityPrivilege.READ],
    ['documents.upload', ENTITY_KEYS.DOCUMENTS, SecurityPrivilege.CREATE],
    ['documents.update', ENTITY_KEYS.DOCUMENTS, SecurityPrivilege.WRITE],
    ['documents.delete', ENTITY_KEYS.DOCUMENTS, SecurityPrivilege.DELETE],
    [
      'documents.categories.manage',
      ENTITY_KEYS.DOCUMENTS,
      SecurityPrivilege.CONFIGURE,
    ],
    [
      'tenant-settings.resolved.read',
      ENTITY_KEYS.TENANT_SETTINGS_RESOLVED,
      SecurityPrivilege.READ,
    ],
    ['attendance.checkin', ENTITY_KEYS.ATTENDANCE, SecurityPrivilege.CREATE],
    [
      'attendanceDevices.manage',
      ENTITY_KEYS.ATTENDANCE,
      SecurityPrivilege.MANAGE,
    ],
    [
      'attendance.correction.approve',
      ENTITY_KEYS.ATTENDANCE,
      SecurityPrivilege.APPROVE,
    ],
    [
      'data-management.import.execute',
      ENTITY_KEYS.CUSTOM_RECORDS,
      SecurityPrivilege.IMPORT,
    ],
    [
      'notification.templates.manage',
      ENTITY_KEYS.SETTINGS,
      SecurityPrivilege.CONFIGURE,
    ],
    ['dashboard.view', ENTITY_KEYS.USER_PREFERENCES, SecurityPrivilege.READ],
    ['employees.read.self', ENTITY_KEYS.EMPLOYEES, SecurityPrivilege.READ],
    [
      'leave-policies.update',
      ENTITY_KEYS.LEAVE_REQUESTS,
      SecurityPrivilege.WRITE,
    ],
  ])('maps %s to %s:%s', (legacy, entityKey, privilege) => {
    expect(legacyPermissionToMatrixPrivileges(legacy)).toContainEqual({
      entityKey,
      privilege,
    });
  });

  it('creates missing custom-role matrix rows at the role scope', async () => {
    const rolePrivilegeCreateMany = jest.fn(async () => ({ count: 1 }));
    const db = {
      permission: {
        createMany: jest.fn(),
        findMany: jest.fn(async () => []),
      },
      role: {
        createMany: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              id: 'custom-role',
              accessLevel: RoleAccessLevel.BUSINESS_UNIT,
              rolePermissions: [{ permission: { key: 'documents.read' } }],
              miscPermissions: [],
            },
          ]),
      },
      rolePermission: { createMany: jest.fn() },
      rolePrivilege: {
        upsert: jest.fn(),
        createMany: rolePrivilegeCreateMany,
      },
      roleMiscPermission: { upsert: jest.fn() },
    };

    await new PermissionBootstrapService(db as never).bootstrapTenantRbac(
      'tenant-a',
      db as never,
      'actor-1',
    );

    expect(rolePrivilegeCreateMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          tenantId: 'tenant-a',
          roleId: 'custom-role',
          entityKey: ENTITY_KEYS.DOCUMENTS,
          privilege: SecurityPrivilege.READ,
          accessLevel: SecurityAccessLevel.BUSINESS_UNIT,
        }),
      ]),
      skipDuplicates: true,
    });
  });
});
