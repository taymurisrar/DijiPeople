import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestContextModule } from '../src/common/request-context/request-context.module';
import { SecretEncryptionService } from '../src/common/security/secret-encryption.service';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { AppError } from '../src/common/errors/app-error';
import { AuditRepository } from '../src/modules/audit/audit.repository';
import { AuditService } from '../src/modules/audit/audit.service';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { PackageAlmService } from '../src/modules/customization/package-alm.service';
import { PackagePortableReader } from '../src/modules/customization/package-portable.reader';
import {
  buildPackageArtifact,
  parsePackageArtifact,
} from '../src/modules/customization/package-artifact';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * Package ALM round trip — TASK-0033 / EXECPLAN-0052, scenarios §81 and §82.
 *
 * Real PostgreSQL, real services. DEV and UAT are two workspaces of the same
 * customer, which is what an environment IS in DijiPeople; OTHER is an
 * unrelated tenant used for isolation and conflict cases.
 *
 * What only a database can prove, and why each case is here: that the apply
 * transaction really rolls back (a DB constraint fails it mid-way), that the
 * unique indexes make a re-import idempotent rather than duplicating rows, and
 * that nothing written in one tenant is reachable from another.
 */
describeWithDatabase()('Customization package ALM (e2e, DB-backed)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let customization: CustomizationService;
  let alm: PackageAlmService;
  let fixtures: DbFixtures;
  const identityEmails: string[] = [];

  let dev: AuthenticatedUser;
  let uat: AuthenticatedUser;
  let other: AuthenticatedUser;
  let devPackageId: string;
  let release100: string;

  const PERMISSIONS = [
    'customization.read',
    'customization.publish',
    'customization.packages.manage',
    'customization.packages.release',
    'customization.packages.import',
    'customization.packages.uninstall',
    'customization.export',
    'customization.choice-lists.manage',
    'customization.relationships.manage',
    'customization.action-bars.manage',
  ];

  async function workspace(
    label: string,
    environmentType: 'DEVELOPMENT' | 'UAT' | 'PRODUCTION',
    customerAccountId?: string,
  ): Promise<AuthenticatedUser & { customerAccountId: string }> {
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
        firstName: 'Package',
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
    };
  }

  const file = (content: string, name = 'package.djpkg') => ({
    buffer: Buffer.from(content, 'utf8'),
    originalname: name,
  });

  async function codeOf(promise: Promise<unknown>) {
    try {
      await promise;
    } catch (error) {
      if (error instanceof AppError)
        return {
          code: error.errorCode,
          message: error.message,
          details: error.details,
        };
      const status = (error as { status?: number }).status;
      return {
        code: `HTTP_${status ?? 'ERROR'}`,
        message: (error as Error).message,
        details: null,
      };
    }
    throw new Error('Expected the call to be refused, but it succeeded.');
  }

  async function exportLatest(
    user: AuthenticatedUser,
    packageId: string,
    version?: string,
  ) {
    return (await alm.exportVersion(user, packageId, version)).content;
  }

  beforeAll(async () => {
    process.env.SECRET_ENCRYPTION_KEY ||= 'package-alm-e2e-key';
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
    fixtures = new DbFixtures(prisma, 'pkgalm');

    const devWorkspace = await workspace('dev', 'DEVELOPMENT');
    dev = devWorkspace;
    uat = await workspace('uat', 'UAT', devWorkspace.customerAccountId);
    other = await workspace('other', 'PRODUCTION');
  });

  afterAll(async () => {
    await fixtures.cleanup();
    await prisma.identity.deleteMany({
      where: { email: { in: identityEmails } },
    });
    await moduleRef.close();
  });

  /* ------------------------------------------------------------ Scenarios */

  it('B — provisioning gives every workspace a Default Customizations package', async () => {
    await customization.publishTenantDefaults(uat.tenantId, uat.userId);
    await customization.publishTenantDefaults(uat.tenantId, uat.userId);
    const defaults = await prisma.customizationSolution.findMany({
      where: { tenantId: uat.tenantId, isTenantDefault: true },
    });
    expect(defaults).toHaveLength(1);
    expect(defaults[0]).toMatchObject({
      displayName: 'Default Customizations',
      isManaged: false,
    });
    expect(defaults[0].publisherId).toBeTruthy();
  });

  it('A — DijiPeople Core is listed, named, and protected', async () => {
    const packages = await customization.listPackages(dev);
    const core = packages.find((entry) => entry.isDefault);
    expect(core).toMatchObject({
      displayName: 'DijiPeople Core',
      kind: 'system',
      isReadOnly: true,
      canEdit: false,
    });
    expect((await codeOf(alm.exportVersion(dev, core!.id))).code).toBe(
      'PACKAGE_READ_ONLY',
    );
    expect((await codeOf(alm.release(dev, core!.id, {}))).code).toBe(
      'PACKAGE_READ_ONLY',
    );
    expect((await codeOf(alm.uninstall(dev, core!.id))).code).toBe(
      'PACKAGE_READ_ONLY',
    );
    expect(
      (await codeOf(customization.deletePackage(dev, core!.id))).code,
    ).toBe('HTTP_400');
  });

  it('C/D — a custom package, and components created inside it, in DEV', async () => {
    const created = await customization.createPackage(dev, {
      packageKey: 'mis_customizations',
      displayName: 'MIS Customizations',
      publisherName: 'MIS',
      version: '1.0.0',
    });
    devPackageId = created.id;
    expect(created).toMatchObject({
      kind: 'editable',
      version: '1.0.0',
      prefix: 'mis_',
    });

    await customization.createTable(dev, {
      packageId: devPackageId,
      tableKey: 'misAsset',
      displayName: 'Asset',
      pluralDisplayName: 'Assets',
    });
    await customization.createColumn(dev, 'misAsset', {
      packageId: devPackageId,
      columnKey: 'mis_grade',
      displayName: 'Grade',
      dataType: 'text',
    });
    /* A field on a DijiPeople Core module: the package owns the field, not the module. */
    await customization.createColumn(dev, 'employees', {
      packageId: devPackageId,
      columnKey: 'mis_employeeGrade',
      displayName: 'Employee Grade',
      dataType: 'text',
    });
    await customization.createTableView(dev, 'misAsset', {
      packageId: devPackageId,
      viewKey: 'seniorAssets',
      name: 'Senior Assets',
      columnsJson: [
        { columnKey: 'mis_grade', label: 'Grade' },
      ] as unknown as Record<string, unknown>,
    });

    const components = await prisma.customizationSolutionComponent.findMany({
      where: { tenantId: dev.tenantId, solutionId: devPackageId },
    });
    const keys = components.map(
      (row) => `${row.componentType}:${row.objectKey}`,
    );
    expect(keys).toEqual(
      expect.arrayContaining([
        'table:misAsset',
        'column:misAsset.mis_grade',
        'column:employees.mis_employeeGrade',
        'table:employees',
        'view:misAsset.seniorAssets',
      ]),
    );
    /*
     * Adding a field to the package's own module must not demote the module to
     * a reference (it did, before TASK-0033).
     */
    expect(
      components.find((row) => row.objectKey === 'misAsset')?.layerAction,
    ).toBe('create');
    /* Employees is referenced, never taken over. */
    expect(
      components.find((row) => row.objectKey === 'employees')?.layerAction,
    ).toBe('reference');
  });

  it('F — the dependency engine sees what uses the field', async () => {
    const field = await prisma.customizationSolutionComponent.findFirstOrThrow({
      where: {
        tenantId: dev.tenantId,
        solutionId: devPackageId,
        objectKey: 'misAsset.mis_grade',
      },
    });
    const graph = await alm.componentDependencies(dev, field.id);
    expect(graph.dependsOn.map((entry) => entry.componentKey)).toContain(
      'table:misAsset',
    );
    expect(graph.usedBy.map((entry) => entry.componentKey)).toContain(
      'view:misAsset.seniorAssets',
    );
  });

  it('delete safety (B3) — a field named only by a layer in another package cannot be deleted', async () => {
    const scratch = await customization.createPackage(dev, {
      packageKey: 'mis_scratch',
      displayName: 'Scratch',
      publisherName: 'MIS',
      version: '1.0.0',
    });
    await customization.createColumn(dev, 'misAsset', {
      packageId: scratch.id,
      columnKey: 'mis_temp',
      displayName: 'Temp',
      dataType: 'lookup',
      lookupTargetTableKey: 'employees',
    });
    await customization.ensureCustomizationLayer(dev, {
      moduleKey: 'misAsset',
      componentType: 'relationship',
      componentKey: 'mis_tempLink',
      packageId: scratch.id,
      layerAction: 'create',
      displayName: 'Temp link',
      metadataJson: {
        referenceField: 'mis_temp',
        targetModule: 'employees',
        relationshipType: 'manyToOne',
      },
    });
    const refused = await codeOf(
      customization.deleteColumn(dev, 'misAsset', 'mis_temp'),
    );
    expect(refused.code).toBe('HTTP_400');
    expect(refused.message).toContain(
      'Cannot delete misAsset.mis_temp. It is used by Temp link (Scratch).',
    );
    const table = await prisma.customizationTable.findFirstOrThrow({
      where: { tenantId: dev.tenantId, tableKey: 'misAsset' },
    });
    expect(
      await prisma.customizationColumn.count({
        where: {
          tenantId: dev.tenantId,
          tableId: table.id,
          columnKey: 'mis_temp',
        },
      }),
    ).toBe(1);

    /* Remove the scratch package so the release below is unaffected. */
    await prisma.customizationSolutionComponent.deleteMany({
      where: { tenantId: dev.tenantId, solutionId: scratch.id },
    });
    await prisma.customizationColumn.deleteMany({
      where: {
        tenantId: dev.tenantId,
        tableId: table.id,
        columnKey: 'mis_temp',
      },
    });
    await prisma.customizationSolution.delete({ where: { id: scratch.id } });
  });

  it('G/H — validate, release 1.0.0, and export a deterministic artifact with no secrets or ids', async () => {
    const readiness = await alm.validateForRelease(dev, devPackageId);
    expect(readiness.errors).toBe(0);
    expect(readiness.issues.map((issue) => issue.code)).toContain(
      'CORE_DEPENDENCY',
    );

    const released = await alm.release(dev, devPackageId, {
      notes: 'First release',
    });
    expect(released).toMatchObject({
      version: '1.0.0',
      nextWorkingVersion: '1.0.1',
    });

    release100 = await exportLatest(dev, devPackageId);
    expect(await exportLatest(dev, devPackageId, '1.0.0')).toBe(release100);
    expect(release100).not.toContain(dev.tenantId);
    expect(release100).not.toContain(dev.userId);
    expect(release100).not.toMatch(
      /"(tenantId|objectId|tableId|createdAt|updatedAt)":/,
    );

    const parsed = parsePackageArtifact(release100);
    expect(parsed.problems).toEqual([]);
    expect(parsed.artifact!.manifest).toMatchObject({
      packageKey: 'mis_customizations',
      version: '1.0.0',
      sourceEnvironmentType: 'DEVELOPMENT',
    });
    expect(parsed.artifact!.manifest.coreDependencies).toContain(
      'table:employees',
    );

    /* A released version is immutable. */
    expect(
      (await codeOf(alm.release(dev, devPackageId, { version: '1.0.0' }))).code,
    ).toBe('PACKAGE_VERSION_CONFLICT');
  });

  it('I — import into UAT: analyzed, planned, then applied atomically', async () => {
    const tablesBefore = await prisma.customizationTable.count({
      where: { tenantId: uat.tenantId, tableKey: 'misAsset' },
    });
    const analysis = await alm.analyzeImport(uat, file(release100));
    /* Whole object, so a refusal prints the plan that explains it. */
    expect(analysis).toMatchObject({ status: 'READY' });
    expect((analysis.plan as { mode: string }).mode).toBe('INSTALL');
    expect(analysis.counts.created).toBeGreaterThan(0);
    expect(analysis.counts.conflicts).toBe(0);
    /* Analysis alone changes nothing. */
    expect(
      await prisma.customizationTable.count({
        where: { tenantId: uat.tenantId, tableKey: 'misAsset' },
      }),
    ).toBe(tablesBefore);

    const applied = await alm.executeImport(uat, analysis.id, {});
    expect(applied.status).toBe('COMPLETED');

    const pkg = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId: uat.tenantId, solutionKey: 'mis_customizations' },
    });
    expect(pkg).toMatchObject({
      origin: 'IMPORTED',
      isManaged: true,
      installedVersion: '1.0.0',
      sourceEnvironmentType: 'DEVELOPMENT',
    });
    const table = await prisma.customizationTable.findFirstOrThrow({
      where: { tenantId: uat.tenantId, tableKey: 'misAsset' },
    });
    expect(
      await prisma.customizationColumn.count({
        where: {
          tenantId: uat.tenantId,
          tableId: table.id,
          columnKey: 'mis_grade',
        },
      }),
    ).toBe(1);
    expect(
      await prisma.customizationView.count({
        where: {
          tenantId: uat.tenantId,
          tableId: table.id,
          viewKey: 'seniorAssets',
        },
      }),
    ).toBe(1);
    const employees = await prisma.customizationTable.findFirstOrThrow({
      where: { tenantId: uat.tenantId, tableKey: 'employees' },
    });
    expect(
      await prisma.customizationColumn.count({
        where: {
          tenantId: uat.tenantId,
          tableId: employees.id,
          columnKey: 'mis_employeeGrade',
        },
      }),
    ).toBe(1);

    /* The runtime reads the snapshot: the module must be in it. */
    const snapshot = await prisma.customizationPublishSnapshot.findFirstOrThrow(
      { where: { tenantId: uat.tenantId }, orderBy: { version: 'desc' } },
    );
    expect(JSON.stringify(snapshot.snapshotJson)).toContain('misAsset');

    const history = await alm.listOperations(uat, {
      packageKey: 'mis_customizations',
    });
    expect(history[0]).toMatchObject({ status: 'COMPLETED', version: '1.0.0' });
  });

  it('M — importing the same version again duplicates nothing', async () => {
    const rowsBefore = await prisma.customizationSolutionComponent.count({
      where: { tenantId: uat.tenantId },
    });
    const analysis = await alm.analyzeImport(uat, file(release100));
    expect((analysis.plan as { mode: string }).mode).toBe('REINSTALL');
    expect(analysis.counts).toMatchObject({
      created: 0,
      updated: 0,
      conflicts: 0,
    });
    await alm.executeImport(uat, analysis.id, {});
    expect(
      await prisma.customizationSolutionComponent.count({
        where: { tenantId: uat.tenantId },
      }),
    ).toBe(rowsBefore);
    expect(
      await prisma.customizationTable.count({
        where: { tenantId: uat.tenantId, tableKey: 'misAsset' },
      }),
    ).toBe(1);
  });

  it('installed components are read-only in the target', async () => {
    const refused = await codeOf(
      customization.updateColumn(uat, 'misAsset', 'mis_grade', {
        displayName: 'Changed in UAT',
      }),
    );
    expect(refused.code).toBe('PACKAGE_READ_ONLY');
    const pkg = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId: uat.tenantId, solutionKey: 'mis_customizations' },
    });
    expect(
      (
        await codeOf(
          customization.updatePackage(uat, pkg.id, { displayName: 'Renamed' }),
        )
      ).code,
    ).toBe('PACKAGE_READ_ONLY');
  });

  let release110: string;
  it('J — an upgrade applies only what changed', async () => {
    await customization.updateColumn(dev, 'misAsset', 'mis_grade', {
      packageId: devPackageId,
      displayName: 'Grade Level',
    });
    await customization.createColumn(dev, 'misAsset', {
      packageId: devPackageId,
      columnKey: 'mis_category',
      displayName: 'Category',
      dataType: 'text',
    });
    await alm.release(dev, devPackageId, { version: '1.1.0' });
    release110 = await exportLatest(dev, devPackageId);

    const analysis = await alm.analyzeImport(uat, file(release110));
    const plan = analysis.plan as {
      mode: string;
      items: { key: string; status: string }[];
    };
    expect(plan.mode).toBe('UPGRADE');
    const status = Object.fromEntries(
      plan.items.map((item) => [item.key, item.status]),
    );
    expect(status['column:misAsset.mis_category']).toBe('NEW');
    expect(status['column:misAsset.mis_grade']).toBe('UPDATE');
    expect(status['view:misAsset.seniorAssets']).toBe('MATCHING');

    await alm.executeImport(uat, analysis.id, {});
    const table = await prisma.customizationTable.findFirstOrThrow({
      where: { tenantId: uat.tenantId, tableKey: 'misAsset' },
    });
    const grade = await prisma.customizationColumn.findFirstOrThrow({
      where: {
        tenantId: uat.tenantId,
        tableId: table.id,
        columnKey: 'mis_grade',
      },
    });
    expect(grade.displayName).toBe('Grade Level');
    expect(
      await prisma.customizationColumn.count({
        where: {
          tenantId: uat.tenantId,
          tableId: table.id,
          columnKey: 'mis_category',
        },
      }),
    ).toBe(1);
    const pkg = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId: uat.tenantId, solutionKey: 'mis_customizations' },
    });
    expect(pkg.installedVersion).toBe('1.1.0');

    /* And importing 1.1.0 again is a no-op. */
    const again = await alm.analyzeImport(uat, file(release110));
    expect(again.counts).toMatchObject({ created: 0, updated: 0 });
  });

  it('a downgrade is blocked unless deliberately overridden', async () => {
    const analysis = await alm.analyzeImport(uat, file(release100));
    expect(analysis.status).toBe('BLOCKED');
    expect(JSON.stringify(analysis.plan)).toContain('DOWNGRADE');
    expect((await codeOf(alm.executeImport(uat, analysis.id, {}))).code).toBe(
      'PACKAGE_IMPORT_BLOCKED',
    );
    const pkg = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId: uat.tenantId, solutionKey: 'mis_customizations' },
    });
    expect(pkg.installedVersion).toBe('1.1.0');
  });

  it('K — incompatible target metadata stops the import before any change', async () => {
    const localPackage = await customization.createPackage(other, {
      packageKey: 'oth_local',
      displayName: 'Local',
      publisherName: 'Other',
      version: '1.0.0',
    });
    await customization.createTable(other, {
      packageId: localPackage.id,
      tableKey: 'misAsset',
      displayName: 'Asset',
      pluralDisplayName: 'Assets',
    });
    await customization.createColumn(other, 'misAsset', {
      packageId: localPackage.id,
      columnKey: 'mis_grade',
      displayName: 'Grade',
      dataType: 'number',
    });
    const columnsBefore = await prisma.customizationColumn.count({
      where: { tenantId: other.tenantId },
    });

    const analysis = await alm.analyzeImport(other, file(release110));
    expect(analysis.status).toBe('BLOCKED');
    const items = (
      analysis.plan as {
        items: { key: string; status: string; messages: string[] }[];
      }
    ).items;
    const grade = items.find(
      (item) => item.key === 'column:misAsset.mis_grade',
    )!;
    expect(grade.status).toBe('CONFLICT');
    expect(grade.messages[0]).toMatch(/belongs to Local/);
    expect((await codeOf(alm.executeImport(other, analysis.id, {}))).code).toBe(
      'PACKAGE_IMPORT_BLOCKED',
    );
    expect(
      await prisma.customizationColumn.count({
        where: { tenantId: other.tenantId },
      }),
    ).toBe(columnsBefore);
    expect(
      await prisma.customizationSolution.count({
        where: { tenantId: other.tenantId, solutionKey: 'mis_customizations' },
      }),
    ).toBe(0);
  });

  it('refuses a tampered, corrupted or future-format file with a reason', async () => {
    const tampered = JSON.parse(release110);
    const target = tampered.components.find(
      (component: { definition: unknown }) => component.definition,
    );
    target.definition.displayName = 'Tampered';
    const a = await alm.analyzeImport(other, file(JSON.stringify(tampered)));
    expect(a.status).toBe('BLOCKED');
    expect(JSON.stringify(a.plan)).toMatch(
      /modified or corrupted after export/,
    );

    const future = JSON.parse(release110);
    future.formatVersion = 4;
    const b = await alm.analyzeImport(other, file(JSON.stringify(future)));
    expect(JSON.stringify(b.plan)).toContain(
      'This package uses format version 4. This DijiPeople environment reads format 1.',
    );

    const c = await alm.analyzeImport(other, file(release110.slice(0, 300)));
    expect(JSON.stringify(c.plan)).toMatch(/not valid JSON/);
  });

  it('refuses a package whose dependency is not installed, naming the fix', async () => {
    const source = parsePackageArtifact(release110).artifact!;
    const { serialized } = buildPackageArtifact({
      manifest: {
        ...source.manifest,
        packageKey: 'mis_payrollExtensions',
        displayName: 'MIS Payroll Extensions',
        version: '2.0.0',
        dependencies: [
          {
            packageKey: 'mis_hrFoundation',
            publisherKey: 'mis',
            displayName: 'MIS HR Foundation',
            minVersion: '1.4.0',
            maxVersion: null,
          },
        ],
      },
      components: [],
    });
    const analysis = await alm.analyzeImport(uat, file(serialized));
    expect(analysis.status).toBe('BLOCKED');
    expect(JSON.stringify(analysis.plan)).toContain(
      'Required dependency MIS HR Foundation 1.4.0+ is not installed. Install it before importing this package.',
    );
  });

  it('rolls the whole import back when the database refuses one component', async () => {
    /* Two primary-name fields in one module: only the database's partial unique index objects. */
    const source = parsePackageArtifact(release110).artifact!;
    const components = [
      {
        key: 'table:misBroken',
        type: 'table' as const,
        objectKey: 'misBroken',
        parentKey: null,
        layerAction: 'create' as const,
        baseIsSystem: false,
        definition: {
          tableKey: 'misBroken',
          displayName: 'Broken',
          pluralDisplayName: 'Broken',
          systemName: 'MisBroken',
        },
        layer: null,
        dependsOn: [],
      },
      ...['mis_first', 'mis_second'].map((columnKey) => ({
        key: `column:misBroken.${columnKey}`,
        type: 'column' as const,
        objectKey: `misBroken.${columnKey}`,
        parentKey: 'misBroken',
        layerAction: 'create' as const,
        baseIsSystem: false,
        definition: {
          columnKey,
          displayName: columnKey,
          dataType: 'text',
          fieldType: 'text',
          isPrimaryName: true,
        },
        layer: null,
        dependsOn: ['table:misBroken'],
      })),
    ];
    const { serialized } = buildPackageArtifact({
      manifest: {
        ...source.manifest,
        packageKey: 'mis_broken',
        displayName: 'Broken',
        version: '1.0.0',
        dependencies: [],
        coreDependencies: [],
      },
      components,
    });
    const analysis = await alm.analyzeImport(uat, file(serialized));
    expect(analysis.status).toBe('READY');

    const failure = await codeOf(alm.executeImport(uat, analysis.id, {}));
    expect(failure.code).toBe('PACKAGE_IMPORT_FAILED');
    expect(failure.message).toMatch(/rolled back\. Nothing was changed/);
    expect(
      await prisma.customizationTable.count({
        where: { tenantId: uat.tenantId, tableKey: 'misBroken' },
      }),
    ).toBe(0);
    expect(
      await prisma.customizationSolution.count({
        where: { tenantId: uat.tenantId, solutionKey: 'mis_broken' },
      }),
    ).toBe(0);
    const operation = await alm.getOperation(uat, analysis.id);
    expect(operation.status).toBe('FAILED');
    expect(
      (operation.error as { failedComponent: string }).failedComponent,
    ).toBe('column:misBroken.mis_second');
  });

  it('L — environment variables: the definition travels, the value never does', async () => {
    const variable = await alm.createEnvironmentVariable(dev, {
      packageId: devPackageId,
      variableKey: 'mis_oracleBaseUrl',
      displayName: 'Oracle API Base URL',
      type: 'url',
      isRequired: true,
    });
    await alm.setEnvironmentVariableValue(
      dev,
      variable.id,
      'https://dev.oracle.example.com',
    );
    const secret = await alm.createEnvironmentVariable(dev, {
      packageId: devPackageId,
      variableKey: 'mis_oracleToken',
      displayName: 'Oracle token',
      type: 'secret',
    });
    await alm.setEnvironmentVariableValue(dev, secret.id, 'dev-token-value');
    const stored =
      await prisma.customizationEnvironmentVariableValue.findFirstOrThrow({
        where: { tenantId: dev.tenantId, variableId: secret.id },
      });
    expect(stored.value).not.toContain('dev-token-value');
    expect(
      await alm.resolveEnvironmentValue(dev.tenantId, 'mis_oracleToken'),
    ).toBe('dev-token-value');

    await alm.release(dev, devPackageId, { version: '1.2.0' });
    const release120 = await exportLatest(dev, devPackageId);
    expect(release120).not.toContain('dev.oracle.example.com');
    expect(release120).not.toContain('dev-token-value');

    const analysis = await alm.analyzeImport(uat, file(release120));
    expect(analysis.status).toBe('READY');
    expect(
      (
        analysis.plan as { requiredInputs: { variableKey: string }[] }
      ).requiredInputs.map((input) => input.variableKey),
    ).toEqual(['mis_oracleBaseUrl']);
    expect((await codeOf(alm.executeImport(uat, analysis.id, {}))).code).toBe(
      'PACKAGE_IMPORT_BLOCKED',
    );

    const applied = await alm.executeImport(uat, analysis.id, {
      environmentValues: {
        mis_oracleBaseUrl: 'https://uat.oracle.example.com',
      },
    });
    expect(applied.status).toBe('COMPLETED');
    expect(
      await alm.resolveEnvironmentValue(uat.tenantId, 'mis_oracleBaseUrl'),
    ).toBe('https://uat.oracle.example.com');
    expect(
      await alm.resolveEnvironmentValue(uat.tenantId, 'mis_oracleToken'),
    ).toBeNull();
    expect(
      await alm.resolveEnvironmentValue(dev.tenantId, 'mis_oracleBaseUrl'),
    ).toBe('https://dev.oracle.example.com');
  });

  it('Q — a package cannot be uninstalled while another depends on it; the chain is shown', async () => {
    const source = parsePackageArtifact(release110).artifact!;
    const { serialized } = buildPackageArtifact({
      manifest: {
        ...source.manifest,
        packageKey: 'mis_payroll',
        displayName: 'MIS Payroll',
        version: '1.0.0',
        dependencies: [
          {
            packageKey: 'mis_customizations',
            publisherKey: 'mis',
            displayName: 'MIS Customizations',
            minVersion: '1.0.0',
            maxVersion: null,
          },
        ],
        coreDependencies: [],
      },
      components: [],
    });
    const payroll = await alm.analyzeImport(uat, file(serialized));
    expect(payroll.status).toBe('READY');
    await alm.executeImport(uat, payroll.id, {});

    const pkg = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId: uat.tenantId, solutionKey: 'mis_customizations' },
    });
    const blocked = await codeOf(alm.uninstall(uat, pkg.id));
    expect(blocked.code).toBe('PACKAGE_UNINSTALL_BLOCKED');
    expect(blocked.message).toContain(
      'MIS Payroll → depends on → MIS Customizations',
    );

    /* Records in a package module block uninstall too. */
    const table = await prisma.customizationTable.findFirstOrThrow({
      where: { tenantId: uat.tenantId, tableKey: 'misAsset' },
    });
    await prisma.customDataRecord.create({
      data: {
        tenantId: uat.tenantId,
        tableId: table.id,
        values: { mis_grade: 'A' },
      },
    });
    const check = await alm.uninstallCheck(uat, pkg.id);
    expect(check.blockers.map((blocker) => blocker.code)).toEqual(
      expect.arrayContaining(['PACKAGE_DEPENDENT', 'HAS_RECORDS']),
    );

    /* The dependent itself has nothing depending on it: it uninstalls. */
    const payrollPackage = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId: uat.tenantId, solutionKey: 'mis_payroll' },
    });
    const removed = await alm.uninstall(uat, payrollPackage.id);
    expect(removed).toMatchObject({ kind: 'UNINSTALL', status: 'COMPLETED' });
    expect(
      await prisma.customizationSolution.count({
        where: { tenantId: uat.tenantId, solutionKey: 'mis_payroll' },
      }),
    ).toBe(0);
  });

  it('O — another tenant cannot see, export, import into or execute anything here', async () => {
    const uatPackage = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId: uat.tenantId, solutionKey: 'mis_customizations' },
    });
    const uatOperation =
      await prisma.customizationPackageOperation.findFirstOrThrow({
        where: { tenantId: uat.tenantId },
      });

    expect((await codeOf(alm.getLifecycle(other, devPackageId))).message).toBe(
      'Customization package was not found.',
    );
    expect((await codeOf(alm.exportVersion(other, devPackageId))).message).toBe(
      'Customization package was not found.',
    );
    expect((await codeOf(alm.uninstall(other, uatPackage.id))).message).toBe(
      'Customization package was not found.',
    );
    expect(
      (await codeOf(alm.getOperation(other, uatOperation.id))).message,
    ).toBe('Package operation was not found.');
    expect(
      (await codeOf(alm.executeImport(other, uatOperation.id, {}))).message,
    ).toBe('Package operation was not found.');
    expect(await alm.listOperations(other, {})).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: uatOperation.id }),
      ]),
    );
    const variables = await alm.listEnvironmentVariables(other);
    expect(variables.map((variable) => variable.variableKey)).not.toContain(
      'mis_oracleBaseUrl',
    );
  });

  it('R — the migration backfill adopts customizations made before this feature, idempotently', async () => {
    const tenantId = other.tenantId;
    await prisma.customizationSolution.create({
      data: {
        tenantId,
        solutionKey: 'zz_tenantCustomizations',
        displayName: 'Other Customizations',
        scope: 'tenant',
        createdAt: new Date('2025-01-01'),
      },
    });
    await prisma.customizationSolution.upsert({
      where: { tenantId_solutionKey: { tenantId, solutionKey: 'default' } },
      create: {
        tenantId,
        solutionKey: 'default',
        displayName: 'Default Solution',
        scope: 'tenant',
        isDefault: true,
        isSystem: true,
      },
      update: { displayName: 'Default Solution' },
    });

    const migration = readFileSync(
      join(
        __dirname,
        '..',
        'prisma',
        'migrations',
        '20260926180000_customization_package_alm',
        'migration.sql',
      ),
      'utf8',
    );
    const backfill = migration.slice(migration.indexOf('-- Backfill.'));
    const statements = backfill
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.replace(/^\s*--.*$/gm, '').trim())
      .filter(Boolean);
    expect(statements.length).toBe(4);

    for (let run = 0; run < 2; run += 1) {
      for (const statement of statements)
        await prisma.$executeRawUnsafe(statement);
    }

    const core = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId, solutionKey: 'default' },
    });
    expect(core.displayName).toBe('DijiPeople Core');
    const legacy = await prisma.customizationSolution.findFirstOrThrow({
      where: { tenantId, solutionKey: 'zz_tenantCustomizations' },
    });
    const flagged = await prisma.customizationSolution.findMany({
      where: { tenantId, isTenantDefault: true },
    });
    expect(flagged).toHaveLength(1);
    /* The older, suffix-keyed package is the one adopted. */
    expect(flagged[0].id).toBe(legacy.id);
    expect(legacy.displayName).toBe('Default Customizations');
    expect(legacy.publisherId).toBeTruthy();
    expect(
      await prisma.customizationPublisher.count({
        where: { tenantId, prefix: 'zz' },
      }),
    ).toBe(1);
  });
});
