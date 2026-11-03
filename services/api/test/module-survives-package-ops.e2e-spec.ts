/**
 * A module published through the plain publish flow must still be published after
 * a package release or an import into the same workspace.
 *
 * Two publish paths write two snapshot shapes (published-custom-modules.ts): the
 * plain `publish()` lists every row at publish time; a package release or import
 * writes the EFFECTIVE metadata, which holds only rows whose solution component is
 * `published`. The runtime reads the LATEST snapshot, so if the module's component
 * were not `published` the second shape would silently unpublish it.
 *
 * Disposable database only; every row sits under fixture tenants.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestContextModule } from '../src/common/request-context/request-context.module';
import { SecretEncryptionService } from '../src/common/security/secret-encryption.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { AuditRepository } from '../src/modules/audit/audit.repository';
import { AuditService } from '../src/modules/audit/audit.service';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { PackageAlmService } from '../src/modules/customization/package-alm.service';
import { PackagePortableReader } from '../src/modules/customization/package-portable.reader';
import { readPublishedCustomizationIndex } from '../src/modules/data/published-custom-modules';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

const PERMISSIONS = [
  'customization.read',
  'customization.publish',
  'customization.tables.read',
  'customization.tables.update',
  'customization.packages.manage',
  'customization.packages.release',
  'customization.packages.import',
  'customization.export',
];

describeWithDatabase()(
  'Published modules survive package operations (real PostgreSQL)',
  () => {
    jest.setTimeout(300_000);
    let moduleRef: TestingModule;
    let prisma: PrismaService;
    let customization: CustomizationService;
    let alm: PackageAlmService;
    let fixtures: DbFixtures;
    const identityEmails: string[] = [];
    let dev: AuthenticatedUser;
    let uat: AuthenticatedUser;

    async function workspace(
      label: string,
      environmentType: 'DEVELOPMENT' | 'UAT',
      customerAccountId?: string,
    ) {
      const tenant = await fixtures.createTenant(label, {
        customerAccountId,
        environmentType,
      });
      const organizationId = await fixtures.createOrganization(
        tenant.id,
        `${label}-org`,
      );
      const businessUnitId = await fixtures.createBusinessUnit(
        tenant.id,
        organizationId,
        `${label}-bu`,
      );
      const email = `${fixtures.name(label)}@example.invalid`.toLowerCase();
      identityEmails.push(email);
      const passwordHash = await bcrypt.hash('unused', 4);
      const identity = await prisma.identity.upsert({
        where: { email },
        update: {},
        create: { email, passwordHash },
        select: { id: true },
      });
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId,
          firstName: 'Survive',
          lastName: label,
          email,
          passwordHash,
          identityId: identity.id,
        },
        select: { id: true },
      });
      return {
        userId: user.id,
        tenantId: tenant.id,
        tenantName: `Test ${label}`,
        email,
        roleIds: [],
        roleKeys: [],
        permissionKeys: PERMISSIONS,
        customerAccountId: tenant.customerAccountId,
      } as AuthenticatedUser & { customerAccountId: string };
    }

    /** What the runtime would serve: the latest snapshot's table index intersected with live rows. */
    async function publishedTableKeys(tenantId: string) {
      const snapshot = await prisma.customizationPublishSnapshot.findFirst({
        where: { tenantId },
        orderBy: { version: 'desc' },
        select: { snapshotJson: true },
      });
      const index = readPublishedCustomizationIndex(snapshot?.snapshotJson);
      const tables = await prisma.customizationTable.findMany({
        where: { tenantId, isCustom: true },
        select: { id: true, tableKey: true },
      });
      return tables
        .filter((t) => index?.tableIds.has(t.id))
        .map((t) => t.tableKey)
        .sort();
    }

    async function plainModule(user: AuthenticatedUser, tableKey: string) {
      await customization.createTable(user, {
        tableKey,
        displayName: tableKey,
        pluralDisplayName: `${tableKey}s`,
      });
      await customization.createColumn(user, tableKey, {
        columnKey: 'dd_name',
        displayName: 'Name',
        dataType: 'text',
        isPrimaryName: true,
      });
      await customization.publish(user);
    }

    beforeAll(async () => {
      process.env.SECRET_ENCRYPTION_KEY ||= 'survive-e2e-key';
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          RequestContextModule,
          PrismaModule,
        ],
        providers: [
          CustomizationService,
          PackageAlmService,
          PackagePortableReader,
          AuditRepository,
          AuditService,
          SecretEncryptionService,
        ],
      }).compile();
      await moduleRef.init();
      prisma = moduleRef.get(PrismaService);
      customization = moduleRef.get(CustomizationService);
      alm = moduleRef.get(PackageAlmService);
      fixtures = new DbFixtures(prisma, 'survive');
      const d = await workspace('dev', 'DEVELOPMENT');
      dev = d;
      uat = await workspace('uat', 'UAT', d.customerAccountId);
    });

    afterAll(async () => {
      await fixtures.cleanup();
      await prisma.identity.deleteMany({
        where: { email: { in: identityEmails } },
      });
      await moduleRef.close();
    });

    it('a module published the plain way stays published after a package release in the same workspace', async () => {
      await plainModule(dev, 'plainOne');
      expect(await publishedTableKeys(dev.tenantId)).toContain('plainOne');

      const pkg = await customization.createPackage(dev, {
        packageKey: 'sv_pkg',
        displayName: 'Survive Package',
        publisherName: 'SV',
        version: '1.0.0',
      });
      await customization.createTable(dev, {
        packageId: pkg.id,
        tableKey: 'pkgTwo',
        displayName: 'Pkg Two',
        pluralDisplayName: 'Pkg Twos',
      });
      await customization.createColumn(dev, 'pkgTwo', {
        packageId: pkg.id,
        columnKey: 'sv_name',
        displayName: 'Name',
        dataType: 'text',
        isPrimaryName: true,
      });
      await alm.release(dev, pkg.id, {});
      const after = await publishedTableKeys(dev.tenantId);
      expect(after).toContain('pkgTwo');
      expect(after).toContain('plainOne');
    });

    it('a module published the plain way stays published after a package import into the same workspace', async () => {
      await plainModule(uat, 'plainUat');
      expect(await publishedTableKeys(uat.tenantId)).toContain('plainUat');
      const pkg = await prisma.customizationSolution.findFirstOrThrow({
        where: { tenantId: dev.tenantId, solutionKey: 'sv_pkg' },
      });
      const exported = await alm.exportVersion(dev, pkg.id);
      const analysis = await alm.analyzeImport(uat, {
        buffer: Buffer.from(exported.content, 'utf8'),
        originalname: 'package.djpkg',
      });
      expect(analysis.status).toBe('READY');
      await alm.executeImport(uat, analysis.id, {});
      const after = await publishedTableKeys(uat.tenantId);
      expect(after).toContain('pkgTwo');
      expect(after).toContain('plainUat');
    });
  },
);
