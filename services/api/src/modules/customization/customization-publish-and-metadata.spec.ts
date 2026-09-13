import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import type { PrismaService } from '../../common/prisma/prisma.service';
import type { CreateCustomizationPackageDto } from './dto/customization.dto';
import { CustomizationService } from './customization.service';

/*
 * BUG-3493 and BUG-3495 — the publish path and the metadata editors' server
 * rules, exercised through the real service with Prisma stubbed at the edge.
 */
type Internals = Record<string, (...args: unknown[]) => unknown>;

function userWith(permissionKeys: string[]): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-1',
    tenantName: 'Acme',
    roleKeys: ['system-admin'],
    permissionKeys,
  } as unknown as AuthenticatedUser;
}

function draft(patch: Record<string, unknown>) {
  return {
    id: 'draft-1',
    componentId: 'draft-1',
    objectId: 'object-1',
    componentName: 'QA All Assets',
    componentType: 'view',
    module: 'QA Asset',
    packageId: 'package-custom',
    packageKey: 'ac_tenantCustomizations',
    packageName: 'Acme Customizations',
    layerAction: 'create',
    lifecycleState: 'draft',
    modifiedOn: new Date('2026-09-13T00:00:00Z'),
    issues: [],
    isSystem: false,
    isCustom: true,
    ...patch,
  };
}

describe('publish validation (BUG-3493)', () => {
  function serviceWith(
    drafts: Array<ReturnType<typeof draft>>,
    unassigned: { id: string; displayName: string } | null,
    defaultViewIds: string[] = [],
  ) {
    const prisma = {
      customizationSolutionComponent: {
        findMany: jest.fn(({ where }: { where: { lifecycleState?: string } }) =>
          Promise.resolve(
            where.lifecycleState === 'draft'
              ? drafts.map((item) => ({
                  id: item.id,
                  componentType: item.componentType,
                  objectId: item.objectId,
                  objectKey: `qaAsset.${item.componentName}`,
                  tableId: 'table-1',
                  isSystem: item.isSystem,
                  isCustom: item.isCustom,
                  metadataJson: {},
                }))
              : [],
          ),
        ),
      },
      customizationForm: { findMany: jest.fn().mockResolvedValue([]) },
      customizationView: {
        findMany: jest
          .fn()
          .mockResolvedValue(defaultViewIds.map((id) => ({ id }))),
      },
    };
    const service = new CustomizationService(
      prisma as unknown as PrismaService,
    );
    const internals = service as unknown as Internals;
    jest
      .spyOn(internals, 'listPublishDraftComponents')
      .mockResolvedValue(drafts);
    jest
      .spyOn(internals, 'findUnassignedDraftPackage')
      .mockResolvedValue(unassigned);
    jest.spyOn(internals, 'syncDefaultSolution').mockResolvedValue({});
    return { service, prisma };
  }

  const user = userWith(['customization.publish']);

  it('reports a draft in the legacy unassigned package as blocking', async () => {
    const { service } = serviceWith(
      [draft({ packageId: 'package-unassigned' })],
      {
        id: 'package-unassigned',
        displayName: 'Unassigned Draft Customizations',
      },
    );

    const result = await service.validatePublishDrafts(user, ['draft-1']);

    expect(result.valid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ componentId: 'draft-1', blocking: true }),
      ]),
    );
  });

  it('refuses to publish exactly what validation reports as blocked', async () => {
    const { service } = serviceWith(
      [draft({ packageId: 'package-unassigned' })],
      {
        id: 'package-unassigned',
        displayName: 'Unassigned Draft Customizations',
      },
    );

    await expect(
      service.publishComponents(user, ['draft-1']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('passes a draft in a real Custom Package', async () => {
    const { service } = serviceWith([draft({})], {
      id: 'package-unassigned',
      displayName: 'Unassigned Draft Customizations',
    });

    const result = await service.validatePublishDrafts(user, ['draft-1']);

    expect(result.valid).toBe(true);
  });

  it('does not call a view the administrator created a default component', async () => {
    const { service } = serviceWith([draft({})], null);

    const result = await service.validatePublishDrafts(user, ['draft-1']);

    expect(
      result.issues.some((issue) =>
        issue.message.includes('default component'),
      ),
    ).toBe(false);
  });

  it('still warns for a genuine system default view', async () => {
    const { service } = serviceWith(
      [draft({ objectId: 'system-view', isSystem: true })],
      null,
      ['system-view'],
    );

    const result = await service.validatePublishDrafts(user, ['draft-1']);

    expect(
      result.issues.some((issue) =>
        issue.message.includes('default component'),
      ),
    ).toBe(true);
  });
});

describe('metadata layer rules (BUG-3495)', () => {
  const table = {
    id: 'table-1',
    tableKey: 'qaAsset',
    displayName: 'QA Asset',
  };

  function serviceWith(referenceColumnExists: boolean) {
    const prisma = {
      customizationColumn: {
        findFirst: jest
          .fn()
          .mockResolvedValue(referenceColumnExists ? { id: 'column-1' } : null),
      },
      customizationSolutionComponent: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    const service = new CustomizationService(
      prisma as unknown as PrismaService,
    );
    const internals = service as unknown as Internals;
    jest.spyOn(internals, 'syncDefaultSolution').mockResolvedValue({});
    jest.spyOn(internals, 'ensureCustomizationTable').mockResolvedValue(table);
    const tenantPackage = jest
      .spyOn(internals, 'getOrCreateTenantCustomPackage')
      .mockResolvedValue({
        id: 'package-tenant',
        displayName: 'Acme Customizations',
        isDefault: false,
        isSystem: false,
      });
    jest.spyOn(internals, 'findComponentBase').mockResolvedValue({
      objectId: 'object-1',
      isSystem: false,
      baseComponentId: null,
    });
    jest
      .spyOn(internals, 'addDefaultSolutionComponent')
      .mockResolvedValue({ id: 'component-1' });
    return { service, tenantPackage };
  }

  it('refuses an action bar row with no command, naming the row', async () => {
    const { service } = serviceWith(false);

    await expect(
      service.ensureCustomizationLayer(
        userWith(['customization.action-bars.manage']),
        {
          moduleKey: 'qaAsset',
          componentType: 'actionBar',
          componentKey: 'dd_qaRecordBar',
          metadataJson: {
            actions: [
              { label: 'New', command: 'system.new' },
              { label: 'Choose a command', command: '' },
            ],
          },
        },
      ),
    ).rejects.toThrow('Action 2 has no command');
  });

  it('refuses a relationship whose reference field is not a reference field on the module', async () => {
    const { service } = serviceWith(false);

    await expect(
      service.ensureCustomizationLayer(
        userWith(['customization.relationships.manage']),
        {
          moduleKey: 'qaAsset',
          componentType: 'relationship',
          componentKey: 'dd_qaAssetEmployee',
          metadataJson: {
            targetModuleKey: 'employees',
            referenceField: 'dd_assignedEmployee',
          },
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('accepts a relationship over a real reference field, into the tenant package', async () => {
    const { service, tenantPackage } = serviceWith(true);

    await expect(
      service.ensureCustomizationLayer(
        userWith(['customization.relationships.manage']),
        {
          moduleKey: 'qaAsset',
          componentType: 'relationship',
          componentKey: 'dd_qaAssetEmployee',
          metadataJson: {
            targetModuleKey: 'employees',
            referenceField: 'dd_assignedEmployee',
          },
        },
      ),
    ).resolves.toMatchObject({ packageId: 'package-tenant' });
    expect(tenantPackage).toHaveBeenCalled();
  });

  it('lets a legacy component be deactivated even if it breaks the new rules', async () => {
    const { service } = serviceWith(false);

    await expect(
      service.ensureCustomizationLayer(
        userWith(['customization.relationships.manage']),
        {
          moduleKey: 'qaAsset',
          componentType: 'relationship',
          componentKey: 'dd_qaAssetEmployee',
          layerAction: 'modify',
          metadataJson: { referenceField: 'dd_missing', isActive: false },
        },
      ),
    ).resolves.toBeDefined();
  });

  it("requires the component type's own manage key (ADR-0013)", async () => {
    const { service } = serviceWith(true);

    await expect(
      service.ensureCustomizationLayer(
        userWith(['customization.read', 'customization.publish']),
        {
          moduleKey: 'qaAsset',
          componentType: 'choiceList',
          componentKey: 'dd_condition',
          metadataJson: { options: [] },
        },
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('packages (BUG-3493, BUG-3495)', () => {
  it('stores the package key the administrator typed', async () => {
    const create = jest.fn(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'package-1',
        description: null,
        scope: 'tenant',
        isDefault: false,
        isSystem: false,
        isManaged: false,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      }),
    );
    const prisma = {
      customizationSolution: {
        findUnique: jest.fn().mockResolvedValue(null),
        create,
      },
    };
    const service = new CustomizationService(
      prisma as unknown as PrismaService,
    );
    jest
      .spyOn(service as unknown as Internals, 'syncDefaultSolution')
      .mockResolvedValue({});

    const dto: CreateCustomizationPackageDto = {
      packageKey: 'qw_walkthrough',
      displayName: 'QA Walkthrough Package',
      publisherName: 'QA Walkthrough',
      version: '1.0.0',
    };
    const response = await service.createPackage(userWith([]), dto);

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ solutionKey: 'qw_walkthrough' }),
      }),
    );
    expect(response.packageKey).toBe('qw_walkthrough');
  });

  it("creates the tenant's own writable Custom Package once, keyed by the tenant prefix", async () => {
    const upsert = jest.fn(({ create }: { create: Record<string, unknown> }) =>
      Promise.resolve({ id: 'package-tenant', ...create }),
    );
    const prisma = {
      customizationSolution: {
        findFirst: jest.fn().mockResolvedValue(null),
        upsert,
      },
    };
    const service = new CustomizationService(
      prisma as unknown as PrismaService,
    );

    const record = (await (service as unknown as Internals)[
      'getOrCreateTenantCustomPackage'
    ](userWith([]))) as Record<string, unknown>;

    expect(prisma.customizationSolution.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-1' }),
      }),
    );
    expect(record).toMatchObject({
      tenantId: 'tenant-1',
      solutionKey: 'ac_tenantCustomizations',
      displayName: 'Acme Customizations',
      isDefault: false,
      isSystem: false,
      isManaged: false,
    });
  });
});
