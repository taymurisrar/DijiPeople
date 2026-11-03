import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CustomModuleRuntimeService } from './custom-module-runtime.service';
import { EntityPermissionResolver } from './entity-permission.resolver';

/*
 * BUG-3494 / ADR-0016. Which custom modules exist for end users: published and
 * active, for the caller's tenant, and only for a caller allowed to read custom
 * records. The permission resolver is real so the two-system check is what is
 * under test, not a mock that always passes.
 */

const TENANT = 'tenant-1';

function reader(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: TENANT,
    email: 'reader@example.invalid',
    roleIds: [],
    roleKeys: ['hr'],
    permissionKeys: ['custom-records.read'],
    rolePrivileges: [
      {
        entityKey: ENTITY_KEYS.CUSTOM_RECORDS,
        privilege: SecurityPrivilege.READ,
        accessLevel: SecurityAccessLevel.TENANT,
        roleId: 'role-1',
      },
    ],
    ...overrides,
  } as AuthenticatedUser;
}

function table(
  id: string,
  tableKey: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    tenantId: TENANT,
    tableKey,
    systemName: tableKey,
    displayName: `${tableKey} name`,
    pluralDisplayName: `${tableKey} plural`,
    icon: null,
    displayOrder: 0,
    isCustom: true,
    isActive: true,
    columns: [
      column('col-published', 'dd_serialNumber', { tableId: id }),
      column('col-draft', 'dd_draftOnly', { tableId: id, isRequired: true }),
      column('col-secret', 'dd_secret', {
        tableId: id,
        validationJson: { readPermission: 'sensitive.read' },
      }),
    ],
    ...overrides,
  };
}

function column(
  id: string,
  columnKey: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    columnKey,
    displayName: columnKey,
    dataType: 'text',
    isActive: true,
    isVisible: true,
    isRequired: false,
    isReadOnly: false,
    isPrimaryName: false,
    maxLength: null,
    lookupTargetTableKey: null,
    optionSetJson: null,
    validationJson: null,
    ...overrides,
  };
}

/* The demo tenant's QA Asset, as the Publish Center wrote it. */
const PUBLISHED_SNAPSHOT = {
  effectiveMetadata: {
    modules: [{ id: 'table-published', tableKey: 'qaAsset' }],
    fields: [{ id: 'col-published' }, { id: 'col-secret' }],
    forms: [
      {
        id: 'form-main',
        tableId: 'table-published',
        formKey: 'main',
        name: 'Main',
        type: 'main',
        isDefault: true,
        layoutJson: { tabs: [] },
      },
    ],
    views: [
      {
        id: 'view-active',
        tableId: 'table-published',
        viewKey: 'activeQaAssets',
        name: 'Active QA Assets',
        isDefault: true,
        columnsJson: [{ columnKey: 'dd_serialNumber' }],
      },
      {
        id: 'view-hidden',
        tableId: 'table-published',
        viewKey: 'hidden',
        name: 'Hidden',
        isHidden: true,
      },
    ],
  },
};

function setup({
  snapshot = PUBLISHED_SNAPSHOT as unknown,
  liveTable = table('table-published', 'qaAsset') as unknown,
  liveTables = [table('table-published', 'qaAsset')] as unknown[],
} = {}) {
  const prisma = {
    customizationPublishSnapshot: {
      findFirst: jest
        .fn()
        .mockResolvedValue(
          snapshot === null ? null : { snapshotJson: snapshot },
        ),
    },
    customizationTable: {
      findFirst: jest.fn().mockResolvedValue(liveTable),
      findMany: jest.fn().mockResolvedValue(liveTables),
    },
  };
  const service = new CustomModuleRuntimeService(
    prisma as never,
    new EntityPermissionResolver(),
  );
  return { service, prisma };
}

describe('CustomModuleRuntimeService — runtime availability', () => {
  it('resolves a published, active module with only its published columns', async () => {
    const { service } = setup();
    const resolved = await service.resolvePublishedTable(TENANT, 'qaAsset');
    expect(resolved?.id).toBe('table-published');
    expect(resolved?.columns.map((item) => item.columnKey)).toEqual([
      'dd_serialNumber',
      'dd_secret',
    ]);
  });

  it('does not resolve a draft module (table not in the published snapshot)', async () => {
    const { service } = setup({
      liveTable: table('table-draft', 'draftThing'),
    });
    await expect(
      service.resolvePublishedTable(TENANT, 'draftThing'),
    ).resolves.toBeNull();
  });

  it('does not resolve an inactive module (live row filtered out)', async () => {
    /* The live query filters isActive; an inactive table comes back as null. */
    const { service, prisma } = setup({ liveTable: null });
    await expect(
      service.resolvePublishedTable(TENANT, 'qaAsset'),
    ).resolves.toBeNull();
    expect(prisma.customizationTable.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT,
          isCustom: true,
          isActive: true,
        }),
      }),
    );
  });

  it('resolves nothing for a tenant that has never published', async () => {
    const { service } = setup({ snapshot: null });
    await expect(
      service.resolvePublishedTable(TENANT, 'qaAsset'),
    ).resolves.toBeNull();
  });

  it('reads only the caller tenant snapshot', async () => {
    const { service, prisma } = setup();
    await service.resolvePublishedTable(TENANT, 'qaAsset');
    expect(prisma.customizationPublishSnapshot.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT, status: 'published' },
      }),
    );
  });
});

describe('CustomModuleRuntimeService — listModules', () => {
  it('lists published active modules for a reader, scoped to snapshot ids and tenant', async () => {
    const { service, prisma } = setup();
    const result = await service.listModules(reader());
    expect(result.items).toEqual([
      expect.objectContaining({
        moduleKey: 'qaAsset',
        pluralDisplayName: 'qaAsset plural',
      }),
    ]);
    expect(prisma.customizationTable.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: TENANT,
          isCustom: true,
          isActive: true,
          id: { in: ['table-published'] },
        },
      }),
    );
  });

  it('returns no modules and runs no table query when nothing is published', async () => {
    const { service, prisma } = setup({ snapshot: null });
    await expect(service.listModules(reader())).resolves.toEqual({
      items: [],
    });
    expect(prisma.customizationTable.findMany).not.toHaveBeenCalled();
  });

  it('refuses a caller without custom-records read (legacy key missing)', async () => {
    const { service } = setup();
    await expect(
      service.listModules(reader({ permissionKeys: [] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a caller without custom-records read (matrix privilege missing)', async () => {
    const { service } = setup();
    await expect(
      service.listModules(reader({ rolePrivileges: [] })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('CustomModuleRuntimeService — getModule', () => {
  it('returns published forms, non-hidden views and field-secured published fields', async () => {
    const { service } = setup();
    const definition = await service.getModule(reader(), 'qaAsset');

    expect(definition.fields.map((field) => field.logicalName)).toEqual([
      'dd_serialNumber',
    ]);
    expect(definition.forms.map((form) => form.formKey)).toEqual(['main']);
    expect(definition.views.map((view) => view.viewKey)).toEqual([
      'activeQaAssets',
    ]);
    expect(definition.primaryNameField).toBe('dd_serialNumber');
    expect(definition.capabilities).toEqual({
      read: true,
      create: false,
      update: false,
      delete: false,
    });
  });

  it('is not found for a draft module', async () => {
    const { service } = setup({
      liveTable: table('table-draft', 'draftThing'),
    });
    await expect(
      service.getModule(reader(), 'draftThing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is forbidden before anything is read for a caller without read', async () => {
    const { service, prisma } = setup();
    await expect(
      service.getModule(reader({ permissionKeys: [] }), 'qaAsset'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.customizationTable.findFirst).not.toHaveBeenCalled();
  });
});
