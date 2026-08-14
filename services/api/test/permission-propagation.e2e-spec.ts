import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';

import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestContextModule } from '../src/common/request-context/request-context.module';
import { PermissionBootstrapService } from '../src/modules/permissions/permission-bootstrap.service';
import { FOUNDATION_PERMISSION_DEFINITIONS } from '../src/common/constants/permissions';
import { ROLE_KEYS } from '../src/common/constants/rbac-matrix';

/**
 * Permission propagation.
 *
 * `PermissionBootstrapService.bootstrapTenantRbac` is the single mechanism that
 * carries foundation permission definitions and standard-role mappings into a
 * tenant. `seed:config` runs it for every tenant, which is what `release:api`
 * invokes; auth flows run it for one tenant as a repair path.
 *
 * These tests cover the properties a release depends on: an existing tenant
 * gains newly-defined permissions, running it again changes nothing, a new
 * tenant is correct from the start, and nothing customer-specific is destroyed.
 */
describe('Permission propagation (e2e, DB-backed)', () => {
  jest.setTimeout(180_000);

  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let bootstrap: PermissionBootstrapService;

  const suffix = `perm-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  const createdTenantIds: string[] = [];

  /** The Slice 1/2 keys that must reach every tenant. */
  const FOUNDATION_KEYS = [
    'integrations.read',
    'attendanceDevices.read',
    'attendanceDevices.manage',
    'attendanceMappings.read',
    'attendanceMappings.manage',
    'attendanceProvisioning.read',
    'attendanceProvisioning.manage',
    'gateways.read',
    'gateways.manage',
    'appDownloads.read',
    'appDownloads.manage',
  ];

  /**
   * `integrations.manage` is a MISC permission, not a foundation one. It lands
   * in RoleMiscPermission rather than Permission/RolePermission, and reaches the
   * auth context through the misc-permission merge in AuthAccessService.
   */
  const MISC_KEY = 'integrations.manage';

  async function createTenant(label: string): Promise<string> {
    const customerAccount = await prisma.customerAccount.findFirstOrThrow({
      select: { id: true },
    });

    const tenant = await prisma.tenant.create({
      data: {
        customerAccountId: customerAccount.id,
        name: `Perm test ${label} ${suffix}`,
        slug: `perm-test-${label}-${suffix}`,
        status: 'ACTIVE',
      },
    });
    createdTenantIds.push(tenant.id);
    return tenant.id;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        RequestContextModule,
        PrismaModule,
      ],
      providers: [PermissionBootstrapService],
    }).compile();
    await moduleRef.init();

    prisma = moduleRef.get(PrismaService);
    bootstrap = moduleRef.get(PermissionBootstrapService);
  });

  afterAll(async () => {
    // Tenant cascades remove permissions, roles and mappings.
    for (const tenantId of createdTenantIds) {
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    await moduleRef.close();
  });

  describe('existing tenant upgrade', () => {
    let tenantId: string;
    let customRoleId: string;
    let customPermissionId: string;

    beforeAll(async () => {
      tenantId = await createTenant('existing');

      // Simulate a tenant provisioned before these permissions existed: bring it
      // up to date, then strip the new definitions back out.
      await bootstrap.bootstrapTenantRbac(tenantId);
      await prisma.permission.deleteMany({
        where: { tenantId, key: { in: FOUNDATION_KEYS } },
      });
      await prisma.roleMiscPermission.deleteMany({
        where: { tenantId, permissionKey: MISC_KEY },
      });

      // Customer-specific RBAC that must survive the sync untouched.
      const customPermission = await prisma.permission.create({
        data: {
          tenantId,
          key: `custom.thing.${suffix}`,
          name: `Custom thing ${suffix}`,
        },
      });
      customPermissionId = customPermission.id;

      const customRole = await prisma.role.create({
        data: {
          tenantId,
          key: `custom-role-${suffix}`,
          name: `Custom role ${suffix}`,
          roleType: 'CUSTOM',
          accessLevel: 'USER',
        },
      });
      customRoleId = customRole.id;

      await prisma.rolePermission.create({
        data: {
          tenantId,
          roleId: customRole.id,
          permissionId: customPermission.id,
        },
      });
    });

    it('starts without the new permission definitions', async () => {
      const before = await prisma.permission.count({
        where: { tenantId, key: { in: FOUNDATION_KEYS } },
      });
      expect(before).toBe(0);
    });

    it('adds every missing foundation permission when synchronised', async () => {
      await bootstrap.bootstrapTenantRbac(tenantId);

      const found = await prisma.permission.findMany({
        where: { tenantId, key: { in: FOUNDATION_KEYS } },
        select: { key: true },
      });

      expect(found.map((row) => row.key).sort()).toEqual(
        [...FOUNDATION_KEYS].sort(),
      );
    });

    it('grants the HR role the intended attendance-integration permissions', async () => {
      const hrRole = await prisma.role.findFirstOrThrow({
        where: { tenantId, key: ROLE_KEYS.HR },
        select: { id: true },
      });

      const granted = await prisma.rolePermission.findMany({
        where: {
          tenantId,
          roleId: hrRole.id,
          permission: { key: { in: FOUNDATION_KEYS } },
        },
        select: { permission: { select: { key: true } } },
      });

      const keys = granted.map((row) => row.permission.key);
      expect(keys).toEqual(
        expect.arrayContaining([
          'integrations.read',
          'attendanceDevices.manage',
          'attendanceMappings.manage',
          'attendanceProvisioning.manage',
          'gateways.manage',
          'appDownloads.read',
        ]),
      );

      // Publishing a platform release is not a tenant action.
      expect(keys).not.toContain('appDownloads.manage');
    });

    it('grants HR the misc integrations.manage permission', async () => {
      const hrRole = await prisma.role.findFirstOrThrow({
        where: { tenantId, key: ROLE_KEYS.HR },
        select: { id: true },
      });

      const misc = await prisma.roleMiscPermission.findFirst({
        where: { tenantId, roleId: hrRole.id, permissionKey: MISC_KEY },
        select: { enabled: true },
      });

      expect(misc?.enabled).toBe(true);
    });

    it('leaves the custom role and its grant untouched', async () => {
      const role = await prisma.role.findUnique({
        where: { id: customRoleId },
      });
      expect(role).not.toBeNull();
      expect(role?.roleType).toBe('CUSTOM');

      const permission = await prisma.permission.findUnique({
        where: { id: customPermissionId },
      });
      expect(permission).not.toBeNull();

      const grant = await prisma.rolePermission.findFirst({
        where: { roleId: customRoleId, permissionId: customPermissionId },
      });
      expect(grant).not.toBeNull();
    });
  });

  describe('idempotency', () => {
    let tenantId: string;

    beforeAll(async () => {
      tenantId = await createTenant('idempotent');
      await bootstrap.bootstrapTenantRbac(tenantId);
    });

    it('produces no duplicates when run repeatedly', async () => {
      const snapshot = async () => ({
        permissions: await prisma.permission.count({ where: { tenantId } }),
        roles: await prisma.role.count({ where: { tenantId } }),
        rolePermissions: await prisma.rolePermission.count({
          where: { tenantId },
        }),
        rolePrivileges: await prisma.rolePrivilege.count({
          where: { tenantId },
        }),
        miscPermissions: await prisma.roleMiscPermission.count({
          where: { tenantId },
        }),
      });

      const first = await snapshot();

      await bootstrap.bootstrapTenantRbac(tenantId);
      const second = await snapshot();

      await bootstrap.bootstrapTenantRbac(tenantId);
      const third = await snapshot();

      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it('keeps exactly one row per foundation permission key', async () => {
      const rows = await prisma.permission.groupBy({
        by: ['key'],
        where: { tenantId, key: { in: FOUNDATION_KEYS } },
        _count: { key: true },
      });

      expect(rows).toHaveLength(FOUNDATION_KEYS.length);
      for (const row of rows) {
        expect(row._count.key).toBe(1);
      }
    });
  });

  describe('new tenant bootstrap', () => {
    let tenantId: string;

    beforeAll(async () => {
      tenantId = await createTenant('fresh');
      await bootstrap.bootstrapTenantRbac(tenantId);
    });

    it('has every foundation permission definition present', async () => {
      const expected = FOUNDATION_PERMISSION_DEFINITIONS.map((p) => p.key);
      const actual = await prisma.permission.findMany({
        where: { tenantId },
        select: { key: true },
      });
      const actualKeys = new Set(actual.map((row) => row.key));

      const missing = expected.filter((key) => !actualKeys.has(key));
      expect(missing).toEqual([]);
    });

    it('has the attendance-integration permissions without a separate release step', async () => {
      const found = await prisma.permission.count({
        where: { tenantId, key: { in: FOUNDATION_KEYS } },
      });
      expect(found).toBe(FOUNDATION_KEYS.length);
    });

    it('creates the standard system roles', async () => {
      const roles = await prisma.role.findMany({
        where: { tenantId, isSystem: true },
        select: { key: true },
      });
      const keys = roles.map((role) => role.key);

      expect(keys).toEqual(
        expect.arrayContaining([
          ROLE_KEYS.GLOBAL_ADMIN,
          ROLE_KEYS.HR,
          ROLE_KEYS.EMPLOYEE,
        ]),
      );
    });
  });

  describe('role separation', () => {
    let tenantId: string;

    beforeAll(async () => {
      tenantId = await createTenant('roles');
      await bootstrap.bootstrapTenantRbac(tenantId);
    });

    it('denies a normal employee integration management', async () => {
      const employeeRole = await prisma.role.findFirstOrThrow({
        where: { tenantId, key: ROLE_KEYS.EMPLOYEE },
        select: { id: true },
      });

      const misc = await prisma.roleMiscPermission.findFirst({
        where: {
          tenantId,
          roleId: employeeRole.id,
          permissionKey: MISC_KEY,
          enabled: true,
        },
      });
      expect(misc).toBeNull();

      const granted = await prisma.rolePermission.findMany({
        where: {
          tenantId,
          roleId: employeeRole.id,
          permission: { key: { in: FOUNDATION_KEYS } },
        },
        select: { permission: { select: { key: true } } },
      });

      const manageKeys = granted
        .map((row) => row.permission.key)
        .filter((key) => key.endsWith('.manage'));
      expect(manageKeys).toEqual([]);
    });

    it('gives elevated administrators the misc integrations.manage permission', async () => {
      const adminRole = await prisma.role.findFirstOrThrow({
        where: { tenantId, key: ROLE_KEYS.GLOBAL_ADMIN },
        select: { id: true },
      });

      const misc = await prisma.roleMiscPermission.findFirst({
        where: {
          tenantId,
          roleId: adminRole.id,
          permissionKey: MISC_KEY,
          enabled: true,
        },
      });
      expect(misc).not.toBeNull();
    });
  });
});
