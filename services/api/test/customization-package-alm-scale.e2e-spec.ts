import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestContextModule } from '../src/common/request-context/request-context.module';
import { TraceContextService } from '../src/common/request-context/trace-context.service';
import { SecretEncryptionService } from '../src/common/security/secret-encryption.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { AuditRepository } from '../src/modules/audit/audit.repository';
import { AuditService } from '../src/modules/audit/audit.service';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { PackageAlmService } from '../src/modules/customization/package-alm.service';
import {
  PackagePortableReader,
  definitionOf,
} from '../src/modules/customization/package-portable.reader';
import {
  buildPackageArtifact,
  type PortableComponentInput,
} from '../src/modules/customization/package-artifact';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * Package import at scale — TASK-0034.
 *
 * The whole import is one transaction, and on production the database is
 * across a network, so what bounds an import is the number of sequential round
 * trips inside that transaction, not local CPU. This suite imports a package
 * of about 1,700 components and counts every Prisma operation, so the bound is
 * asserted as a number rather than inferred from a fast local run.
 *
 * `PKG_SCALE_LATENCY_MS` adds that much delay to every operation, to see the
 * wall-clock a remote database would give.
 */
describeWithDatabase()(
  'Customization package import at scale (e2e, DB-backed)',
  () => {
    jest.setTimeout(900_000);

    const MODULES = 60;
    const FIELDS_PER_MODULE = 25;
    const latencyMs = Number(process.env.PKG_SCALE_LATENCY_MS ?? 0);
    const stats = { operations: 0 };

    let moduleRef: TestingModule;
    let prisma: PrismaService;
    let alm: PackageAlmService;
    let customizationService: CustomizationService;
    let fixtures: DbFixtures;
    let user: AuthenticatedUser;
    const emails: string[] = [];

    /*
     * Definitions go through the reader's own definitionOf, so they carry every
     * field a real export carries — a partial definition would never compare
     * equal to what the import wrote, and a re-import would look like an update.
     */
    function artifact(version: string, relabel = 0, extraFields = 0) {
      const components: PortableComponentInput[] = [];
      for (let m = 0; m < MODULES; m += 1) {
        const tableKey = `scaleModule${m}`;
        components.push({
          key: `table:${tableKey}`,
          type: 'table',
          objectKey: tableKey,
          parentKey: null,
          layerAction: 'create',
          baseIsSystem: false,
          definition: definitionOf('table', {
            tableKey,
            systemName: `ScaleModule${m}`,
            displayName: `Module ${m}`,
            pluralDisplayName: `Modules ${m}`,
            description: null,
            icon: null,
            ownershipType: null,
            moduleKey: null,
            displayOrder: 9000,
            isCustomizable: true,
            isVisibleInCustomization: true,
            isValidForAdvancedFind: true,
            isValidForFormDesigner: true,
            isValidForViewDesigner: true,
            isActive: true,
          }),
          layer: null,
          dependsOn: [],
        });
        const fields = FIELDS_PER_MODULE + (m === 0 ? extraFields : 0);
        const columnKeys: string[] = [];
        for (let f = 0; f < fields; f += 1) {
          const columnKey = `sc_field${f}`;
          columnKeys.push(columnKey);
          const relabelled = m * FIELDS_PER_MODULE + f < relabel;
          components.push({
            key: `column:${tableKey}.${columnKey}`,
            type: 'column',
            objectKey: `${tableKey}.${columnKey}`,
            parentKey: tableKey,
            layerAction: 'create',
            baseIsSystem: false,
            definition: definitionOf('column', {
              columnKey,
              systemName: columnKey,
              displayName: relabelled ? `Field ${f} v2` : `Field ${f}`,
              description: null,
              dataType: 'text',
              fieldType: 'text',
              isRequired: false,
              isSearchable: false,
              isFilterable: false,
              isSortable: false,
              isVisible: true,
              isVisibleInCustomization: true,
              isValidForFormDesigner: true,
              isValidForViewDesigner: true,
              isReadOnly: false,
              isPrimaryName: false,
              isActive: true,
              maxLength: null,
              minValue: null,
              maxValue: null,
              defaultValue: null,
              lookupTargetTableKey: null,
              optionSetJson: null,
              validationJson: null,
              sortOrder: 0,
            }),
            layer: null,
            dependsOn: [`table:${tableKey}`],
          });
        }
        components.push({
          key: `form:${tableKey}.main`,
          type: 'form',
          objectKey: `${tableKey}.main`,
          parentKey: tableKey,
          layerAction: 'create',
          baseIsSystem: false,
          definition: definitionOf('form', {
            formKey: 'main',
            name: 'Main',
            description: null,
            type: 'main',
            isDefault: true,
            isActive: true,
            layoutJson: {
              tabs: [
                {
                  sections: [
                    { fields: columnKeys.map((columnKey) => ({ columnKey })) },
                  ],
                },
              ],
            },
          }),
          layer: null,
          dependsOn: [
            `table:${tableKey}`,
            ...columnKeys.map((key) => `column:${tableKey}.${key}`),
          ],
        });
        components.push({
          key: `view:${tableKey}.active`,
          type: 'view',
          objectKey: `${tableKey}.active`,
          parentKey: tableKey,
          layerAction: 'create',
          baseIsSystem: false,
          definition: definitionOf('view', {
            viewKey: 'active',
            name: 'Active',
            description: null,
            type: 'custom',
            isDefault: true,
            isHidden: false,
            columnsJson: columnKeys
              .slice(0, 8)
              .map((columnKey) => ({ columnKey })),
            filtersJson: null,
            sortingJson: null,
            visibilityScope: 'tenant',
          }),
          layer: null,
          dependsOn: [
            `table:${tableKey}`,
            ...columnKeys.slice(0, 8).map((key) => `column:${tableKey}.${key}`),
          ],
        });
      }
      return buildPackageArtifact({
        manifest: {
          packageKey: 'sc_scalePackage',
          displayName: 'Scale Package',
          description: null,
          version,
          publisher: { publisherKey: 'sc', displayName: 'Scale', prefix: 'sc' },
          metadataSchemaVersion: '1.0.0',
          sourceEnvironmentType: 'DEVELOPMENT',
          releasedAt: null,
          dependencies: [],
          coreDependencies: [],
        },
        components,
      }).serialized;
    }

    async function measure<T>(label: string, run: () => Promise<T>) {
      const before = stats.operations;
      const started = Date.now();
      const value = await run();
      const operations = stats.operations - before;
      const ms = Date.now() - started;

      console.log(
        `${label}: ${operations} operations, ${ms} ms (≈${Math.round((operations * 30) / 1000)} s of round trips at 30 ms)`,
      );
      return { value, operations, ms };
    }

    beforeAll(async () => {
      process.env.SECRET_ENCRYPTION_KEY ||= 'package-alm-scale-key';
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          RequestContextModule,
          PrismaModule,
        ],
        providers: [AuditRepository, SecretEncryptionService],
      }).compile();
      await moduleRef.init();
      prisma = moduleRef.get(PrismaService);
      fixtures = new DbFixtures(prisma, 'pkgscale');

      /* Every operation — including inside interactive transactions — is counted. */
      const counting = prisma.$extends({
        query: {
          $allModels: {
            async $allOperations({ args, query }) {
              stats.operations += 1;
              if (latencyMs)
                await new Promise((resolve) => setTimeout(resolve, latencyMs));
              return query(args);
            },
          },
        },
      }) as unknown as PrismaService;
      const reader = new PackagePortableReader(counting);
      customizationService = new CustomizationService(counting, reader);
      const audit = new AuditService(
        new AuditRepository(counting),
        moduleRef.get(TraceContextService),
      );
      alm = new PackageAlmService(
        counting,
        customizationService,
        reader,
        audit,
        moduleRef.get(SecretEncryptionService),
      );

      const tenant = await fixtures.createTenant('uat', {
        environmentType: 'UAT',
      });
      const organizationId = await fixtures.createOrganization(tenant.id);
      const businessUnitId = await fixtures.createBusinessUnit(
        tenant.id,
        organizationId,
      );
      const email = `${fixtures.name('admin')}@example.invalid`.toLowerCase();
      emails.push(email);
      const passwordHash = await bcrypt.hash('unused', 4);
      const identity = await prisma.identity.create({
        data: { email, passwordHash },
        select: { id: true },
      });
      const created = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId,
          firstName: 'Scale',
          lastName: 'Admin',
          email,
          passwordHash,
          identityId: identity.id,
        },
        select: { id: true },
      });
      user = {
        userId: created.id,
        tenantId: tenant.id,
        tenantName: 'Scale',
        email,
        roleIds: [],
        roleKeys: [],
        permissionKeys: [
          'customization.read',
          'customization.publish',
          'customization.packages.import',
        ],
      };
      /*
       * A real workspace already has DijiPeople Core materialised, and the sync is
       * cached per process: warm it here so the counts measure the import.
       */
      await customizationService.syncCore(user);
    });

    afterAll(async () => {
      await fixtures.cleanup();
      await prisma.identity.deleteMany({ where: { email: { in: emails } } });
      await moduleRef.close();
    });

    const file = (content: string) => ({
      buffer: Buffer.from(content, 'utf8'),
      originalname: 'scale.djpkg',
    });

    it('installs ~1,700 components in a bounded number of round trips', async () => {
      const content = artifact('1.0.0');
      const analysis = await measure('analyze 1.0.0', () =>
        alm.analyzeImport(user, file(content)),
      );
      expect(analysis.value.status).toBe('READY');
      const execution = await measure('install 1.0.0', () =>
        alm.executeImport(user, analysis.value.id, {}),
      );
      expect(execution.value.status).toBe('COMPLETED');
      expect(
        await prisma.customizationColumn.count({
          where: { tenantId: user.tenantId },
        }),
      ).toBeGreaterThanOrEqual(MODULES * FIELDS_PER_MODULE);

      /*
       * The bound. Per-component writes needed two round trips per component
       * (~3,400 here); batching by component type makes the count independent of
       * package size apart from updates.
       */
      expect(execution.operations).toBeLessThan(200);
    });

    it('re-imports the same version without per-component work', async () => {
      const analysis = await alm.analyzeImport(user, file(artifact('1.0.0')));
      expect(analysis.counts).toMatchObject({ created: 0, updated: 0 });
      const execution = await measure('reinstall 1.0.0', () =>
        alm.executeImport(user, analysis.id, {}),
      );
      expect(execution.value.status).toBe('COMPLETED');
      expect(execution.operations).toBeLessThan(120);
    });

    it('upgrades, touching only what changed', async () => {
      const analysis = await alm.analyzeImport(
        user,
        file(artifact('1.1.0', 100, 20)),
      );
      expect(analysis.counts).toMatchObject({ created: 20, updated: 101 });
      const execution = await measure(
        'upgrade 1.1.0 (100 relabelled, 20 new fields)',
        () => alm.executeImport(user, analysis.id, {}),
      );
      expect(execution.value.status).toBe('COMPLETED');
      /* One update per changed field and its membership row, plus the fixed cost. */
      expect(execution.operations).toBeLessThan(2 * 101 + 150);
    });
  },
);
