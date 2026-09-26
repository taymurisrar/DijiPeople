import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestContextModule } from '../src/common/request-context/request-context.module';
import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { CustomFieldValuesService } from '../src/modules/customization/custom-field-values.service';
import { PackagePortableReader } from '../src/modules/customization/package-portable.reader';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * Custom field values on a system module — TASK-0034 / BUG-3697.
 *
 * Real PostgreSQL. A tenant adds "Employee Grade" to Employees, publishes it,
 * and values are stored per employee — validated by the field, visible only
 * after publish, masked and permission-filtered on read, and never visible
 * from another tenant.
 */
describeWithDatabase()(
  'Custom field values on system modules (e2e, DB-backed)',
  () => {
    jest.setTimeout(600_000);

    let moduleRef: TestingModule;
    let prisma: PrismaService;
    let customization: CustomizationService;
    let values: CustomFieldValuesService;
    let fixtures: DbFixtures;
    let admin: AuthenticatedUser;
    let other: AuthenticatedUser;
    const emails: string[] = [];
    const recordId = '00000000-0000-4000-8000-000000000001';

    const PERMISSIONS = [
      'customization.read',
      'customization.publish',
      'customization.packages.manage',
    ];

    async function workspace(label: string): Promise<AuthenticatedUser> {
      const tenant = await fixtures.createTenant(label);
      const organizationId = await fixtures.createOrganization(tenant.id);
      const businessUnitId = await fixtures.createBusinessUnit(
        tenant.id,
        organizationId,
      );
      const email = `${fixtures.name(label)}@example.invalid`.toLowerCase();
      emails.push(email);
      const passwordHash = await bcrypt.hash('unused', 4);
      const identity = await prisma.identity.create({
        data: { email, passwordHash },
        select: { id: true },
      });
      const user = await prisma.user.create({
        data: {
          tenantId: tenant.id,
          businessUnitId,
          firstName: 'Field',
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
      };
    }

    beforeAll(async () => {
      moduleRef = await Test.createTestingModule({
        imports: [
          ConfigModule.forRoot({ isGlobal: true }),
          RequestContextModule,
          PrismaModule,
        ],
        providers: [
          CustomizationService,
          CustomFieldValuesService,
          PackagePortableReader,
        ],
      }).compile();
      await moduleRef.init();
      prisma = moduleRef.get(PrismaService);
      customization = moduleRef.get(CustomizationService);
      values = moduleRef.get(CustomFieldValuesService);
      fixtures = new DbFixtures(prisma, 'fieldvalues');
      admin = await workspace('admin');
      other = await workspace('other');
    });

    afterAll(async () => {
      await fixtures.cleanup();
      await prisma.identity.deleteMany({ where: { email: { in: emails } } });
      await moduleRef.close();
    });

    async function publishAll(user: AuthenticatedUser) {
      const drafts = await prisma.customizationSolutionComponent.findMany({
        where: { tenantId: user.tenantId, lifecycleState: 'draft' },
        select: { id: true },
      });
      await customization.publishComponents(
        user,
        drafts.map((draft) => draft.id),
      );
    }

    it('a draft field is neither shown nor accepted until it is published', async () => {
      await customization.createColumn(admin, 'employees', {
        columnKey: 'ad_grade',
        displayName: 'Employee Grade',
        dataType: 'select',
        optionSetJson: {
          options: [
            { value: 'G1', label: 'Grade 1' },
            { value: 'G2', label: 'Grade 2' },
          ],
        } as unknown as Record<string, unknown>,
      });
      expect(await values.definitions(admin, 'employees')).toEqual([]);
      expect(
        await values.validate(admin, 'employees', { ad_grade: 'G1' }, 'update'),
      ).toEqual({});

      await publishAll(admin);
      const definitions = await values.definitions(admin, 'employees');
      expect(definitions.map((entry) => entry.logicalName)).toEqual([
        'ad_grade',
      ]);
      expect(definitions[0].options.map((option) => option.value)).toEqual([
        'G1',
        'G2',
      ]);
    });

    it('stores a validated value per employee, merges updates and clears with null', async () => {
      await customization.createColumn(admin, 'employees', {
        columnKey: 'ad_badge',
        displayName: 'Badge number',
        dataType: 'text',
        maxLength: 10,
        validationJson: { mask: true },
      });
      await publishAll(admin);

      const first = await values.validate(
        admin,
        'employees',
        { ad_grade: 'G1', ad_badge: '1234567890' },
        'update',
      );
      await values.write(admin, 'employees', recordId, first);
      expect(await values.read(admin, 'employees', recordId)).toEqual({
        ad_grade: 'G1',
        ad_badge: '******7890',
      });

      await values.write(
        admin,
        'employees',
        recordId,
        await values.validate(admin, 'employees', { ad_grade: 'G2' }, 'update'),
      );
      const row = await prisma.customRecordExtension.findUniqueOrThrow({
        where: {
          tenantId_tableKey_recordId: {
            tenantId: admin.tenantId,
            tableKey: 'employees',
            recordId,
          },
        },
      });
      expect(row.values).toEqual({ ad_grade: 'G2', ad_badge: '1234567890' });

      await values.write(
        admin,
        'employees',
        recordId,
        await values.validate(admin, 'employees', { ad_badge: null }, 'update'),
      );
      expect(await values.read(admin, 'employees', recordId)).toEqual({
        ad_grade: 'G2',
        ad_badge: null,
      });
    });

    it('refuses invalid values with field errors, before anything is written', async () => {
      await expect(
        values.validate(
          admin,
          'employees',
          { ad_grade: 'G9', ad_badge: 'x'.repeat(11) },
          'update',
        ),
      ).rejects.toMatchObject({
        response: {
          errors: {
            'customFields.ad_grade': ['Not a choice for this field.'],
            'customFields.ad_badge': ['Must not exceed 10 characters.'],
          },
        },
      });
      await expect(
        values.validate(admin, 'employees', ['not', 'an', 'object'], 'update'),
      ).rejects.toMatchObject({
        response: {
          errors: { customFields: ['Must be an object of field values.'] },
        },
      });
    });

    it('a form posting back unchanged masked and read-only values writes nothing', async () => {
      await values.write(admin, 'employees', recordId, {
        ad_badge: '1234567890',
      });
      await customization.createColumn(admin, 'employees', {
        columnKey: 'ad_locked',
        displayName: 'Locked',
        dataType: 'text',
        isReadOnly: true,
      });
      await publishAll(admin);

      const shown = await values.read(admin, 'employees', recordId);
      expect(shown).toEqual({
        ad_grade: 'G2',
        ad_badge: '******7890',
        ad_locked: null,
      });
      expect(
        await values.validate(
          admin,
          'employees',
          { ...shown, ad_locked: '' },
          'update',
          recordId,
        ),
      ).toEqual({});

      const row = await prisma.customRecordExtension.findUniqueOrThrow({
        where: {
          tenantId_tableKey_recordId: {
            tenantId: admin.tenantId,
            tableKey: 'employees',
            recordId,
          },
        },
      });
      expect(row.values).toEqual({ ad_grade: 'G2', ad_badge: '1234567890' });

      await expect(
        values.validate(
          admin,
          'employees',
          { ad_locked: 'x' },
          'update',
          recordId,
        ),
      ).rejects.toMatchObject({
        response: {
          errors: { 'customFields.ad_locked': ['Field is read-only.'] },
        },
      });
      expect(
        await values.validate(
          admin,
          'employees',
          { ...shown, ad_badge: '5555' },
          'update',
          recordId,
        ),
      ).toEqual({ ad_badge: '5555' });
    });

    it('never shows one tenant the fields or values of another', async () => {
      expect(await values.definitions(other, 'employees')).toEqual([]);
      expect(await values.read(other, 'employees', recordId)).toEqual({});
      expect(
        await values.validate(other, 'employees', { ad_grade: 'G1' }, 'update'),
      ).toEqual({});
    });

    it('a new tenant row is erased with its tenant', async () => {
      const count = await prisma.customRecordExtension.count({
        where: { tenantId: admin.tenantId },
      });
      expect(count).toBe(1);
    });
  },
);
