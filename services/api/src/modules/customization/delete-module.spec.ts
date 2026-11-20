import { BadRequestException } from '@nestjs/common';
import { CustomizationService } from './customization.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/*
 * Deleting a custom module used to loop: it was refused while a form existed,
 * and the last default form could not be deleted. Its own fields, forms and
 * views now go with it; only a reference from another module blocks.
 */

const USER = {
  userId: 'user-1',
  tenantId: 'tenant-1',
} as unknown as AuthenticatedUser;

function build(referencing: unknown[]) {
  const deleteMany = jest.fn(() => Promise.resolve({ count: 1 }));
  const prisma = {
    customizationTable: {
      findUnique: jest.fn(() =>
        Promise.resolve({
          id: 'table-1',
          tableKey: 'qaAsset',
          displayName: 'QA Assets',
        }),
      ),
      deleteMany,
    },
    customizationSolutionComponent: {
      findFirst: jest.fn(() => Promise.resolve(null)),
      count: jest.fn(() => Promise.resolve(2)),
    },
    customizationColumn: {
      count: jest.fn(() => Promise.resolve(3)),
      findMany: jest.fn(() => Promise.resolve(referencing)),
    },
    customizationForm: { count: jest.fn(() => Promise.resolve(1)) },
    customizationView: { count: jest.fn(() => Promise.resolve(1)) },
    customDataRecord: { count: jest.fn(() => Promise.resolve(5)) },
  };
  const service = new CustomizationService(
    prisma as unknown as ConstructorParameters<typeof CustomizationService>[0],
  );
  return { service, prisma, deleteMany };
}

describe('CustomizationService.deleteTable', () => {
  it('deletes a module that still has its own forms, fields and views', async () => {
    const { service, deleteMany } = build([]);
    const result = await service.deleteTable(USER, 'qaAsset');
    expect(result.deleted).toBe(true);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'table-1', tenantId: 'tenant-1' },
    });
  });

  it('refuses while another module looks up into it', async () => {
    const { service, deleteMany } = build([
      {
        columnKey: 'asset',
        displayName: 'Asset',
        table: { tableKey: 'other', displayName: 'Other' },
      },
    ]);
    await expect(service.deleteTable(USER, 'qaAsset')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('reports the impact, scoped to the tenant', async () => {
    const { service, prisma } = build([]);
    const impact = await service.getTableDependencies(USER, 'qaAsset');
    expect(impact).toMatchObject({
      columns: 3,
      forms: 1,
      views: 1,
      records: 5,
      canDelete: true,
    });
    expect(prisma.customizationColumn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: 'tenant-1',
          lookupTargetTableKey: 'qaAsset',
        }) as unknown,
      }),
    );
  });
});
