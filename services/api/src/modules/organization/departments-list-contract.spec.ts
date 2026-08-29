import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConflictException } from '@nestjs/common';
import { Prisma, SecurityAccessLevel, SecurityPrivilege } from '@prisma/client';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { OrganizationService } from './organization.service';

/*
 * The departments list contract, and the two defects that lived in it.
 *
 * BUG-1959 — the endpoint answered with a bare array and rejected `pageSize`
 * outright, because its query DTO declared no pagination and the global
 * ValidationPipe runs with `forbidNonWhitelisted: true`. The bare array is
 * deliberate and stays the default, so the fix is opt-in: a caller that asks
 * for a page gets the same `{items, meta}` envelope the employees list uses.
 *
 * BUG-1958 — department names are now unique only among active rows, enforced
 * by a partial index Prisma cannot declare. That put a second route to a P2002
 * on the update path (reactivating an archived department whose name has been
 * taken since), which was returning a 500 rather than the 409 the create path
 * returns for the same collision.
 */

const tenantReader: AuthenticatedUser = {
  userId: 'user-1',
  tenantId: 'tenant-a',
  roleIds: [],
  roleKeys: ['hr-admin'],
  permissionKeys: ['departments.read', 'departments.update'],
  rolePrivileges: [
    {
      entityKey: ENTITY_KEYS.HIERARCHY,
      privilege: SecurityPrivilege.READ,
      accessLevel: SecurityAccessLevel.TENANT,
    },
    {
      entityKey: ENTITY_KEYS.HIERARCHY,
      privilege: SecurityPrivilege.MANAGE,
      accessLevel: SecurityAccessLevel.TENANT,
    },
  ],
};

const businessUnits = [{ id: 'bu-a', parentBusinessUnitId: null }];
const departments = Array.from({ length: 25 }, (_, index) => ({
  id: `dep-${index}`,
  tenantId: 'tenant-a',
  name: `Department ${index}`,
  status: 'ACTIVE',
  businessUnitId: 'bu-a',
}));

function build(overrides: Record<string, unknown> = {}) {
  return new OrganizationService(
    {
      findBusinessUnits: jest.fn(async () => businessUnits),
      findDepartments: jest.fn(async () => departments),
      ...overrides,
    } as never,
    {} as never,
  );
}

describe('departments list contract', () => {
  it('answers with a bare array when no page is requested', async () => {
    const result = await build().listDepartmentsForUser(tenantReader, {});

    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(departments.length);
  });

  it('accepts and honours a page size, with server totals', async () => {
    const result = await build().listDepartmentsForUser(tenantReader, {
      pageSize: 10,
      page: 3,
    });

    expect(Array.isArray(result)).toBe(false);
    expect(result).toEqual({
      items: departments.slice(20, 25),
      meta: { page: 3, pageSize: 10, total: 25, totalPages: 3 },
    });
  });

  it('clamps a page beyond the end rather than returning nothing', async () => {
    const result = await build().listDepartmentsForUser(tenantReader, {
      pageSize: 10,
      page: 99,
    });

    expect(result).toMatchObject({
      meta: { page: 3, pageSize: 10, total: 25, totalPages: 3 },
    });
  });

  it('defaults the page size when only a page is asked for', async () => {
    const result = await build().listDepartmentsForUser(tenantReader, {
      page: 1,
    });

    expect(result).toMatchObject({
      meta: { page: 1, pageSize: 20, total: 25, totalPages: 2 },
    });
  });

  it('reports a name collision on update as a conflict, not a server error', async () => {
    const service = build({
      updateDepartment: jest.fn(async () => {
        throw new Prisma.PrismaClientKnownRequestError('duplicate', {
          code: 'P2002',
          clientVersion: 'test',
        });
      }),
    });

    await expect(
      service.updateDepartment(tenantReader, 'dep-0', { name: 'Department 1' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

/*
 * The uniqueness itself is a database constraint, and a partial index cannot be
 * written in `schema.prisma` at all — so nothing in the generated client can be
 * asserted against. What is checkable here is that the two halves agree: the
 * schema must not carry the full unique back again, and a migration must create
 * the partial one. Both halves are read from disk, because a spec that only
 * restates the intention would keep passing after the migration was reverted.
 */
describe('department name uniqueness is scoped to active rows', () => {
  const prismaDir = join(__dirname, '../../../prisma');
  const lines = readFileSync(join(prismaDir, 'schema.prisma'), 'utf8').split(
    /\r?\n/,
  );
  const start = lines.findIndex((line) => /^model Department \{/.test(line));
  const modelBody = lines.slice(start + 1).slice(
    0,
    lines.slice(start + 1).findIndex((line) => /^\}/.test(line)),
  );

  it('finds the model it is asserting about', () => {
    expect(start).toBeGreaterThan(-1);
    expect(modelBody.length).toBeGreaterThan(0);
  });

  it('does not declare a full unique on (tenantId, name)', () => {
    const declared = modelBody.filter((line) =>
      /^\s*@@unique\(\[tenantId, name\]\)/.test(line),
    );

    expect(declared).toEqual([]);
  });

  it('keeps code unique across the whole table, which provisioning upserts through', () => {
    const declared = modelBody.filter((line) =>
      /^\s*@@unique\(\[tenantId, code\]\)/.test(line),
    );

    expect(declared).toHaveLength(1);
  });

  it('creates the partial unique index in a migration', () => {
    const migrations = readdirSync(join(prismaDir, 'migrations'), {
      withFileTypes: true,
    })
      .filter((entry) => entry.isDirectory())
      .map((entry) =>
        readFileSync(
          join(prismaDir, 'migrations', entry.name, 'migration.sql'),
          'utf8',
        ),
      );
    const creating = migrations.filter((sql) =>
      /CREATE UNIQUE INDEX[^;]*"Department_active_tenant_name_key"[^;]*WHERE\s+"isActive"\s*=\s*true/is.test(
        sql,
      ),
    );
    const dropping = migrations.filter((sql) =>
      /DROP INDEX[^;]*"Department_tenantId_name_key"/i.test(sql),
    );

    expect(creating).toHaveLength(1);
    expect(dropping).toHaveLength(1);
  });
});
