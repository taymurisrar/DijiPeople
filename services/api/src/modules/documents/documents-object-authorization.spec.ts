import {
  DocumentEntityType,
  SecurityAccessLevel,
  SecurityPrivilege,
} from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { DocumentsService } from './documents.service';

function buildUser(
  documentAccess: SecurityAccessLevel,
  employeeAccess = documentAccess,
  privilege: SecurityPrivilege = SecurityPrivilege.READ,
): AuthenticatedUser {
  return {
    userId: 'user-1',
    tenantId: 'tenant-a',
    roleIds: [],
    roleKeys: ['employee'],
    permissionKeys: ['documents.read'],
    rolePrivileges: [
      {
        entityKey: ENTITY_KEYS.DOCUMENTS,
        privilege,
        accessLevel: documentAccess,
      },
      {
        entityKey: ENTITY_KEYS.EMPLOYEES,
        privilege,
        accessLevel: employeeAccess,
      },
    ],
    accessContext: {
      organizationId: 'org-a',
      businessUnitId: 'bu-a',
      accessibleBusinessUnitIds: ['bu-a'],
      businessUnitSubtreeIds: ['bu-a'],
      teamIds: [],
    },
  };
}

const document = {
  id: 'document-2',
  tenantId: 'tenant-a',
  isArchived: false,
  storageKey: 'tenant-a/document-2.pdf',
  originalFileName: 'private.pdf',
  links: [
    {
      entityType: DocumentEntityType.EMPLOYEE,
      entityId: 'employee-2',
    },
  ],
};

describe('DocumentsService object authorization', () => {
  function buildService(employeeVisible: boolean) {
    const repository = {
      findById: jest.fn(async () => document),
      findByTenant: jest.fn(async () => ({ items: [], total: 0 })),
      updateDocument: jest.fn(),
      archiveDocument: jest.fn(),
    };
    const prisma = {
      employee: {
        findFirst: jest.fn(async () =>
          employeeVisible ? { id: 'employee-2' } : null,
        ),
      },
    };
    const storage = {
      openFile: jest.fn(async () => ({ stream: 'file-stream' })),
    };
    const service = new DocumentsService(
      repository as never,
      prisma as never,
      storage as never,
      { getDocumentSettings: jest.fn() } as never,
      {} as never,
    );
    return { service, repository, prisma, storage };
  }

  it('returns a self-scoped employee document only when its owner is visible', async () => {
    const { service, storage } = buildService(true);
    await expect(
      service.openForView(buildUser(SecurityAccessLevel.SELF), 'document-2'),
    ).resolves.toMatchObject({ document: { id: 'document-2' } });
    expect(storage.openFile).toHaveBeenCalledWith('tenant-a/document-2.pdf');
  });

  it('hides another employee document from a self-scoped caller', async () => {
    const { service, storage } = buildService(false);
    await expect(
      service.openForView(buildUser(SecurityAccessLevel.SELF), 'document-2'),
    ).rejects.toThrow('Document was not found for this tenant.');
    expect(storage.openFile).not.toHaveBeenCalled();
  });

  it('retains tenant-wide document access for tenant readers', async () => {
    const { service, prisma } = buildService(false);
    await expect(
      service.openForView(buildUser(SecurityAccessLevel.TENANT), 'document-2'),
    ).resolves.toMatchObject({ document: { id: 'document-2' } });
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
  });

  it('adds employee ownership scope to the general list query', async () => {
    const { service, repository } = buildService(false);
    const query = { page: 1, pageSize: 25 };
    await service.findByTenant(
      buildUser(SecurityAccessLevel.SELF),
      query as never,
    );
    expect(repository.findByTenant).toHaveBeenCalledWith(
      'tenant-a',
      query,
      expect.objectContaining({ links: expect.any(Object) }),
    );
  });

  it('blocks update and archive before writing when the owning employee is out of scope', async () => {
    const { service, repository } = buildService(false);
    const writeUser = buildUser(
      SecurityAccessLevel.SELF,
      SecurityAccessLevel.SELF,
      SecurityPrivilege.WRITE,
    );
    await expect(service.update(writeUser, 'document-2', {})).rejects.toThrow(
      'Document was not found for this tenant.',
    );
    expect(repository.updateDocument).not.toHaveBeenCalled();

    const deleteUser = buildUser(
      SecurityAccessLevel.SELF,
      SecurityAccessLevel.SELF,
      SecurityPrivilege.DELETE,
    );
    deleteUser.rolePrivileges?.push({
      entityKey: ENTITY_KEYS.EMPLOYEES,
      privilege: SecurityPrivilege.WRITE,
      accessLevel: SecurityAccessLevel.SELF,
    });
    await expect(service.archive(deleteUser, 'document-2')).rejects.toThrow(
      'Document was not found for this tenant.',
    );
    expect(repository.archiveDocument).not.toHaveBeenCalled();
  });
});
