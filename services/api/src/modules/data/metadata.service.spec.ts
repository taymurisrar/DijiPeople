import { ForbiddenException } from '@nestjs/common';
import { MetadataService } from './metadata.service';

describe('MetadataService', () => {
  it('does not expose Prisma model names, scope internals, or field mappings', () => {
    const service = new MetadataService({
      assertCanRead: jest.fn(),
    });

    const metadata = service.getEntity('employees', {
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      roleIds: [],
      roleKeys: [],
      permissionKeys: ['employees.read'],
      rolePrivileges: [],
    });

    expect(metadata).not.toHaveProperty('prismaModel');
    expect(metadata).not.toHaveProperty('scope');
    expect(metadata.fields.taxIdentifier).toEqual({
      type: 'string',
      selectable: false,
      filterable: false,
      sortable: false,
      searchable: false,
    });
  });

  it('filters unreadable entities from the list response', () => {
    const service = new MetadataService({
      assertCanRead: jest.fn(() => {
        throw new ForbiddenException();
      }),
    });

    const response = service.listEntities({
      userId: 'user-1',
      tenantId: 'tenant-1',
      email: 'user@example.com',
      roleIds: [],
      roleKeys: [],
      permissionKeys: [],
      rolePrivileges: [],
    });

    expect(response.items).toEqual([]);
  });
});
