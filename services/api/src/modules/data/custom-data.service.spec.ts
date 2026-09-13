import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SecurityPrivilege } from '@prisma/client';
import { CustomDataService } from './custom-data.service';

describe('CustomDataService related CRUD', () => {
  const user = {
    userId: 'user-1',
    tenantId: 'tenant-1',
    email: 'user@example.com',
    roleIds: [],
    roleKeys: [],
    permissionKeys: [
      'employees.read',
      'custom-records.read',
      'custom-records.create',
      'custom-records.write',
      'custom-records.delete',
    ],
    rolePrivileges: [],
  };
  const table = {
    id: 'table-1',
    tenantId: 'tenant-1',
    tableKey: 'customChild',
    systemName: 'CustomChild',
    displayName: 'Custom Child',
    pluralDisplayName: 'Custom Children',
    description: null,
    icon: null,
    ownershipType: 'user',
    moduleKey: 'employees',
    displayOrder: 0,
    isSystem: false,
    isCustom: true,
    isCustomizable: true,
    isVisibleInCustomization: true,
    isValidForAdvancedFind: true,
    isValidForFormDesigner: true,
    isValidForViewDesigner: true,
    isActive: true,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    columns: [
      column('pub_employee', 'lookup', {
        isRequired: true,
        lookupTargetTableKey: 'employees',
      }),
      column('pub_name', 'text', { isRequired: true }),
      column('pub_secret', 'text', {
        validationJson: { mask: true },
      }),
      column('pub_adminOnly', 'text', {
        validationJson: { readPermission: 'sensitive.read' },
      }),
    ],
  };
  const created = {
    id: 'record-1',
    tenantId: 'tenant-1',
    tableId: 'table-1',
    values: {
      pub_employee: 'employee-1',
      pub_name: 'Created',
      pub_secret: '1234567890',
      pub_adminOnly: 'hidden',
    },
    organizationId: 'org-1',
    businessUnitId: 'bu-1',
    ownerUserId: 'user-1',
    ownerTeamId: null,
    createdById: 'user-1',
    updatedById: 'user-1',
    isDeleted: false,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  function setup() {
    const tx = {
      customDataRecord: {
        create: jest.fn().mockResolvedValue(created),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ ...created, ...data }),
          ),
      },
    };
    const prisma = {
      customizationTable: { findFirst: jest.fn().mockResolvedValue(table) },
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'employee-1',
          businessUnitId: 'bu-1',
          userId: 'user-1',
          businessUnit: { organizationId: 'org-1' },
        }),
      },
      customDataRecord: {
        findFirst: jest.fn().mockResolvedValue(created),
        findMany: jest.fn().mockResolvedValue([created]),
        count: jest.fn().mockResolvedValue(1),
      },
      $transaction: jest.fn((callback) => callback(tx)),
    };
    const permissions = {
      assertCan: jest.fn(),
      assertCanRead: jest.fn(),
    };
    const scope = {
      buildScope: jest.fn().mockReturnValue({ tenantId: 'tenant-1' }),
      buildReadScope: jest.fn().mockReturnValue({ tenantId: 'tenant-1' }),
    };
    const audit = { log: jest.fn().mockResolvedValue({}) };
    const runtime = {
      resolvePublishedTable: jest.fn().mockResolvedValue(table),
    };
    const service = new CustomDataService(
      prisma as never,
      permissions as never,
      scope as never,
      audit as never,
      runtime as never,
    );
    return { service, prisma, permissions, scope, audit, tx, runtime };
  }

  const related = {
    parentEntity: 'employees',
    parentId: 'employee-1',
    relationship: 'employee_custom_children',
    lookupField: 'pub_employee',
  };

  it('binds the parent lookup, applies field security, and audits create', async () => {
    const { service, permissions, audit, tx } = setup();
    const result = await service.create(
      'customChild',
      related,
      { pub_name: 'Created', pub_secret: '1234567890' },
      user,
    );

    expect(permissions.assertCan).toHaveBeenCalledWith(
      expect.anything(),
      user,
      SecurityPrivilege.CREATE,
    );
    expect(tx.customDataRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          values: expect.objectContaining({ pub_employee: 'employee-1' }),
        }),
      }),
    );
    expect((result as Record<string, unknown>).pub_secret).toBe('******7890');
    expect(result).not.toHaveProperty('pub_adminOnly');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'custom-record.create' }),
      tx,
    );
  });

  /*
   * BUG-3494 / ADR-0016 — a published custom module is a top-level module, so
   * its list screen creates records with no parent. The service used to demand
   * parentEntity/parentId/lookupField on every create, which the unit specs
   * never noticed because they only ever created related records; the
   * DB-backed runtime e2e did.
   */
  it('creates a top-level record with no parent when the module has no required lookup', async () => {
    const { service, prisma, runtime, tx } = setup();
    const topLevelTable = {
      ...table,
      columns: table.columns.map((item) =>
        item.columnKey === 'pub_employee' ? { ...item, isRequired: false } : item,
      ),
    };
    prisma.customizationTable.findFirst.mockResolvedValue(topLevelTable);
    runtime.resolvePublishedTable.mockResolvedValue(topLevelTable);

    await service.create('customChild', {}, { pub_name: 'Standalone' }, user);

    expect(tx.customDataRecord.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          values: expect.objectContaining({ pub_name: 'Standalone' }),
        }),
      }),
    );
  });

  it('still refuses a create that names only part of a parent', async () => {
    const { service, tx } = setup();
    await expect(
      service.create(
        'customChild',
        { parentEntity: 'employees' },
        { pub_name: 'Half a parent' },
        user,
      ),
    ).rejects.toThrow(
      'parentEntity, parentId, and lookupField are required for related records.',
    );
    expect(tx.customDataRecord.create).not.toHaveBeenCalled();
  });

  it('scopes related list reads by tenant, record scope, and lookup JSON path', async () => {
    const { service, prisma } = setup();
    await service.findMany('customChild', related, user);
    expect(prisma.customDataRecord.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ tenantId: 'tenant-1' }),
            expect.objectContaining({
              values: { path: ['pub_employee'], equals: 'employee-1' },
            }),
          ]),
        }),
      }),
    );
  });

  it('audits update and performs only soft delete for bulk selection', async () => {
    const { service, audit, tx } = setup();
    await service.update(
      'customChild',
      'record-1',
      related,
      { pub_name: 'Updated' },
      user,
    );
    await service.softDelete('customChild', ['record-1'], related, user);
    expect(tx.customDataRecord.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isDeleted: true }),
      }),
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'custom-record.update' }),
      tx,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'custom-record.delete' }),
      tx,
    );
  });

  /*
   * BUG-3494 / ADR-0016. A draft or deactivated module is not a sidebar
   * question only: every record path must refuse it, or hiding the entry is a
   * read filter over a write that still works.
   */
  describe('a module that is not runtime-available (draft or inactive)', () => {
    it.each([
      ['list', (s: CustomDataService) => s.findMany('draftThing', {}, user)],
      [
        'create',
        (s: CustomDataService) =>
          s.create('draftThing', {}, { pub_name: 'x' }, user),
      ],
      [
        'read one',
        (s: CustomDataService) => s.findOne('draftThing', 'record-1', user),
      ],
      [
        'update',
        (s: CustomDataService) =>
          s.update('draftThing', 'record-1', {}, { pub_name: 'x' }, user),
      ],
      [
        'delete',
        (s: CustomDataService) => s.softDelete('draftThing', ['r'], {}, user),
      ],
    ])('refuses %s with not-found and touches no record', async (_l, call) => {
      const { service, runtime, prisma, tx } = setup();
      runtime.resolvePublishedTable.mockResolvedValue(null);
      await expect(call(service)).rejects.toBeInstanceOf(NotFoundException);
      expect(runtime.resolvePublishedTable).toHaveBeenCalledWith(
        'tenant-1',
        'draftThing',
      );
      expect(prisma.customDataRecord.findMany).not.toHaveBeenCalled();
      expect(prisma.customDataRecord.findFirst).not.toHaveBeenCalled();
      expect(tx.customDataRecord.create).not.toHaveBeenCalled();
      expect(tx.customDataRecord.update).not.toHaveBeenCalled();
    });

    it('reports it as not a custom table, so the list dispatch falls through to not-found', async () => {
      const { service, runtime } = setup();
      runtime.resolvePublishedTable.mockResolvedValue(null);
      await expect(
        service.isCustomTable('draftThing', 'tenant-1'),
      ).resolves.toBe(false);
    });
  });

  describe('findOne', () => {
    it('reads by id within the caller tenant, table and READ row scope', async () => {
      const { service, prisma, permissions, scope } = setup();
      const result = await service.findOne('customChild', 'record-1', user);

      expect(permissions.assertCan).toHaveBeenCalledWith(
        expect.anything(),
        user,
        SecurityPrivilege.READ,
      );
      expect(scope.buildScope).toHaveBeenCalledWith(
        expect.anything(),
        user,
        SecurityPrivilege.READ,
      );
      expect(prisma.customDataRecord.findFirst).toHaveBeenCalledWith({
        where: {
          AND: [
            { tenantId: 'tenant-1' },
            {
              id: 'record-1',
              tenantId: 'tenant-1',
              tableId: 'table-1',
              isDeleted: false,
            },
          ],
        },
      });
      expect(result).toEqual(
        expect.objectContaining({ id: 'record-1', pub_name: 'Created' }),
      );
      expect(result).not.toHaveProperty('pub_adminOnly');
    });

    it('is not found when the record is outside scope or in another tenant', async () => {
      const { service, prisma } = setup();
      prisma.customDataRecord.findFirst.mockResolvedValue(null);
      await expect(
        service.findOne('customChild', 'record-other-tenant', user),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('checks permission before reading the record', async () => {
      const { service, prisma, permissions } = setup();
      permissions.assertCan.mockImplementation(() => {
        throw new ForbiddenException();
      });
      await expect(
        service.findOne('customChild', 'record-1', user),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.customDataRecord.findFirst).not.toHaveBeenCalled();
    });
  });

  it('publishes effective CRUD capabilities and omits unreadable fields', async () => {
    const { service } = setup();
    const metadata = await service.getMetadata('customChild', user);
    expect(metadata.capabilities).toEqual(
      expect.objectContaining({ create: true, update: true, delete: true }),
    );
    expect(metadata.fields).not.toHaveProperty('pub_adminOnly');
  });
});

function column(
  columnKey: string,
  dataType: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `column-${columnKey}`,
    tenantId: 'tenant-1',
    tableId: 'table-1',
    columnKey,
    systemName: columnKey,
    displayName: columnKey,
    description: null,
    dataType,
    fieldType: dataType,
    isSystem: false,
    isCustom: true,
    isActive: true,
    isRequired: false,
    isSearchable: false,
    isFilterable: false,
    isSortable: false,
    isVisible: true,
    isVisibleInCustomization: true,
    isValidForFormDesigner: true,
    isValidForViewDesigner: true,
    isReadOnly: false,
    maxLength: null,
    minValue: null,
    maxValue: null,
    defaultValue: null,
    lookupTargetTableKey: null,
    optionSetJson: null,
    validationJson: null,
    sortOrder: 0,
    createdByUserId: null,
    updatedByUserId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}
