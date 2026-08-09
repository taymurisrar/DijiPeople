import { CustomizationService } from './customization.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';

/*
 * These cover the two properties that make this endpoint safe to expose:
 * every query is tenant-filtered, and a module that cannot be tenant-filtered
 * returns nothing rather than everything.
 */

const USER = {
  userId: 'user-1',
  tenantId: 'tenant-1',
  email: 'admin@example.com',
  roleIds: [],
  roleKeys: [],
  permissionKeys: [],
} as unknown as AuthenticatedUser;

type FindManyArgs = {
  where?: Record<string, unknown>;
  select?: Record<string, unknown>;
  take?: number;
};

function createService(options: {
  primaryNameColumn?: string | null;
  employeeFindMany?: jest.Mock;
}) {
  const findMany = options.employeeFindMany ?? jest.fn((_args: unknown) => Promise.resolve([] as unknown[]));

  const prisma = {
    customizationTable: {
      findUnique: jest.fn(() =>
        Promise.resolve({ id: 'table-1', tableKey: 'employees' }),
      ),
    },
    customizationColumn: {
      findFirst: jest.fn(() =>
        Promise.resolve(
          options.primaryNameColumn === null
            ? null
            : { columnKey: options.primaryNameColumn ?? 'firstName' },
        ),
      ),
    },
    employee: { findMany },
  };

  const service = new CustomizationService(
    prisma as unknown as ConstructorParameters<typeof CustomizationService>[0],
  );
  return { service, findMany, prisma };
}

describe('CustomizationService.listLookupOptions', () => {
  it('always filters by the caller tenant', async () => {
    const findMany = jest.fn((_args: unknown) => Promise.resolve([] as unknown[]));
    const { service } = createService({ employeeFindMany: findMany });

    await service.listLookupOptions(USER, 'employees');

    const args = findMany.mock.calls[0][0] as FindManyArgs;
    expect(args.where).toMatchObject({ tenantId: 'tenant-1' });
  });

  it('selects only the id and the primary name', async () => {
    const findMany = jest.fn((_args: unknown) => Promise.resolve([] as unknown[]));
    const { service } = createService({
      employeeFindMany: findMany,
      primaryNameColumn: 'firstName',
    });

    await service.listLookupOptions(USER, 'employees');

    const args = findMany.mock.calls[0][0] as FindManyArgs;
    expect(Object.keys(args.select ?? {}).sort()).toEqual(['firstName', 'id']);
  });

  it('returns nothing when the module cannot be tenant-filtered', async () => {
    /* Prisma throws on an unknown `tenantId` field; that must not open up. */
    const findMany = jest.fn((_args: unknown) =>
      Promise.reject(new Error('Unknown arg `tenantId`')),
    );
    const { service } = createService({ employeeFindMany: findMany });

    await expect(service.listLookupOptions(USER, 'employees')).resolves.toEqual(
      [],
    );
  });

  it('returns nothing when the module has no primary name', async () => {
    const findMany = jest.fn((_args: unknown) => Promise.resolve([] as unknown[]));
    const { service } = createService({
      employeeFindMany: findMany,
      primaryNameColumn: null,
    });

    await expect(service.listLookupOptions(USER, 'employees')).resolves.toEqual(
      [],
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it('maps rows to id and label, and names a blank label rather than showing an id', async () => {
    const findMany = jest.fn((_args: unknown) =>
      Promise.resolve([
        { id: 'a', firstName: 'Ada' },
        { id: 'b', firstName: '   ' },
      ] as unknown[]),
    );
    const { service } = createService({ employeeFindMany: findMany });

    await expect(service.listLookupOptions(USER, 'employees')).resolves.toEqual(
      [
        { id: 'a', label: 'Ada' },
        { id: 'b', label: '(unnamed)' },
      ],
    );
  });

  it('caps the page size so a lookup cannot pull a whole module', async () => {
    const findMany = jest.fn((_args: unknown) => Promise.resolve([] as unknown[]));
    const { service } = createService({ employeeFindMany: findMany });

    await service.listLookupOptions(USER, 'employees', undefined, 5000);

    const args = findMany.mock.calls[0][0] as FindManyArgs;
    expect(args.take).toBe(50);
  });

  it('applies a search against the primary name only', async () => {
    const findMany = jest.fn((_args: unknown) => Promise.resolve([] as unknown[]));
    const { service } = createService({ employeeFindMany: findMany });

    await service.listLookupOptions(USER, 'employees', ' ada ');

    const args = findMany.mock.calls[0][0] as FindManyArgs;
    expect(args.where).toMatchObject({
      tenantId: 'tenant-1',
      firstName: { contains: 'ada', mode: 'insensitive' },
    });
  });
});
