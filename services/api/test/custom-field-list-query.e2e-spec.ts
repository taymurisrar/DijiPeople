import { BadRequestException } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import type { AuthenticatedUser } from '../src/common/interfaces/authenticated-request.interface';
import { PrismaModule } from '../src/common/prisma/prisma.module';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { RequestContextModule } from '../src/common/request-context/request-context.module';
import { CustomFieldValuesService } from '../src/modules/customization/custom-field-values.service';
import { CustomizationService } from '../src/modules/customization/customization.service';
import { PackagePortableReader } from '../src/modules/customization/package-portable.reader';
import type { EmployeeQueryDto } from '../src/modules/employees/dto/employee-query.dto';
import {
  EmployeesRepository,
  type EmployeeCustomListQuery,
} from '../src/modules/employees/employees.repository';
import { DbFixtures, describeWithDatabase } from './helpers/db-fixtures';

/**
 * TASK-0036 / ADR-0025 — the employee list filtered and sorted by custom
 * fields, on real PostgreSQL: the SQL runs, a negated operator includes
 * records with no extension row, a sort pages correctly with the unset
 * records last, another tenant's values never match, and a masked or
 * unreadable field can be neither filtered nor sorted by.
 */
describeWithDatabase()('Custom field list query (e2e, DB-backed)', () => {
  jest.setTimeout(600_000);

  let moduleRef: TestingModule;
  let prisma: PrismaService;
  let customization: CustomizationService;
  let values: CustomFieldValuesService;
  let employees: EmployeesRepository;
  let fixtures: DbFixtures;
  let admin: AuthenticatedUser;
  let other: AuthenticatedUser;
  const ids: Record<string, string> = {};

  async function workspace(label: string): Promise<{
    user: AuthenticatedUser;
    businessUnitId: string;
  }> {
    const tenant = await fixtures.createTenant(label);
    const organizationId = await fixtures.createOrganization(tenant.id);
    const businessUnitId = await fixtures.createBusinessUnit(
      tenant.id,
      organizationId,
    );
    return {
      businessUnitId,
      user: {
        userId: '00000000-0000-4000-8000-00000000000a',
        tenantId: tenant.id,
        tenantName: label,
        email: `${label}@example.invalid`,
        roleIds: [],
        roleKeys: [],
        permissionKeys: ['customization.read', 'customization.publish'],
      },
    };
  }

  async function employee(
    tenantId: string,
    businessUnitId: string,
    code: string,
  ) {
    const row = await prisma.employee.create({
      data: {
        tenantId,
        businessUnitId,
        employeeCode: `${code}-${fixtures.name('e').slice(-6)}`,
        firstName: code,
        lastName: code,
        email: `${fixtures.name(code)}@example.test`.toLowerCase(),
        phone: '+97400000000',
        hireDate: new Date('2020-01-01T00:00:00.000Z'),
        employmentStatus: 'ACTIVE',
      },
      select: { id: true },
    });
    return row.id;
  }

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

  async function fields(user: AuthenticatedUser) {
    await customization.createColumn(user, 'employees', {
      columnKey: 'lq_region',
      displayName: 'Region',
      dataType: 'text',
    });
    await customization.createColumn(user, 'employees', {
      columnKey: 'lq_score',
      displayName: 'Score',
      dataType: 'number',
    });
    await customization.createColumn(user, 'employees', {
      columnKey: 'lq_skills',
      displayName: 'Skills',
      dataType: 'multiselect',
      optionSetJson: {
        options: [
          { value: 'go', label: 'Go' },
          { value: 'ts', label: 'TypeScript' },
        ],
      } as unknown as Record<string, unknown>,
    });
    await customization.createColumn(user, 'employees', {
      columnKey: 'lq_badge',
      displayName: 'Badge',
      dataType: 'text',
      validationJson: { mask: true },
    });
    await customization.createColumn(user, 'employees', {
      columnKey: 'lq_salary_band',
      displayName: 'Salary band',
      dataType: 'text',
      validationJson: { readPermission: 'payroll.read' },
    });
    await publishAll(user);
  }

  async function store(
    user: AuthenticatedUser,
    recordId: string,
    input: Record<string, unknown>,
  ) {
    await values.write(
      user,
      'employees',
      recordId,
      await values.validate(user, 'employees', input, 'update'),
    );
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
        EmployeesRepository,
      ],
    }).compile();
    await moduleRef.init();
    prisma = moduleRef.get(PrismaService);
    customization = moduleRef.get(CustomizationService);
    values = moduleRef.get(CustomFieldValuesService);
    employees = moduleRef.get(EmployeesRepository);
    fixtures = new DbFixtures(prisma, 'cflistq');

    const a = await workspace('lqa');
    const b = await workspace('lqb');
    admin = a.user;
    other = b.user;
    await fields(admin);
    await fields(other);

    ids.north = await employee(admin.tenantId, a.businessUnitId, 'North');
    ids.south = await employee(admin.tenantId, a.businessUnitId, 'South');
    ids.unset = await employee(admin.tenantId, a.businessUnitId, 'Unset');
    ids.foreign = await employee(other.tenantId, b.businessUnitId, 'Foreign');

    /* Writing a masked or permission-gated field needs its write rights. */
    const writer = {
      ...admin,
      permissionKeys: [...admin.permissionKeys, 'payroll.read'],
    };
    await store(writer, ids.north, {
      lq_region: 'North 50%',
      lq_score: 10,
      lq_skills: ['go'],
      lq_badge: 'B-1',
      lq_salary_band: 'A',
    });
    await store(writer, ids.south, { lq_region: 'South', lq_score: 2 });
    await store(other, ids.foreign, { lq_region: 'North', lq_score: 99 });
  });

  afterAll(async () => {
    await prisma.customRecordExtension.deleteMany({
      where: { tenantId: { in: [admin.tenantId, other.tenantId] } },
    });
    await prisma.employee.deleteMany({
      where: { id: { in: Object.values(ids) } },
    });
    await fixtures.cleanup();
    await moduleRef.close();
  });

  const query = (overrides: Partial<EmployeeQueryDto> = {}) =>
    ({ page: 1, pageSize: 20, ...overrides }) as EmployeeQueryDto;

  async function list(
    filters: { field: string; operator: string; value?: string }[],
    sort?: { field: string; direction: 'asc' | 'desc' },
    paging: Partial<EmployeeQueryDto> = {},
  ) {
    const custom: EmployeeCustomListQuery = {
      idConstraints: await values.recordIdConstraints(
        admin,
        'employees',
        filters as never,
      ),
      sortIds: sort
        ? (recordIds) =>
            values.orderedRecordIds(
              admin,
              'employees',
              sort.field,
              sort.direction,
              recordIds,
            )
        : undefined,
    };
    const result = await employees.findByTenant(
      admin.tenantId,
      query(paging),
      {},
      undefined,
      custom,
    );
    return {
      total: result.total,
      names: result.items.map((item) => item.firstName),
    };
  }

  it('filters by a text field within the tenant only', async () => {
    expect(
      (await list([{ field: 'lq_region', operator: 'contains', value: 'nor' }]))
        .names,
    ).toEqual(['North']);
  });

  it('treats LIKE wildcards in the value as literal text', async () => {
    expect(
      (await list([{ field: 'lq_region', operator: 'contains', value: '%' }]))
        .names,
    ).toEqual(['North']);
    expect(
      (await list([{ field: 'lq_region', operator: 'contains', value: '_' }]))
        .names,
    ).toEqual([]);
  });

  it('includes records with no value in the negated operators', async () => {
    expect(
      (
        await list([
          { field: 'lq_region', operator: 'notEquals', value: 'north 50%' },
        ])
      ).names.sort(),
    ).toEqual(['South', 'Unset']);
    expect(
      (await list([{ field: 'lq_region', operator: 'isEmpty' }])).names,
    ).toEqual(['Unset']);
  });

  it('compares numbers and matches multiselect elements', async () => {
    expect(
      (await list([{ field: 'lq_score', operator: 'greaterThan', value: '5' }]))
        .names,
    ).toEqual(['North']);
    expect(
      (await list([{ field: 'lq_skills', operator: 'equals', value: 'go' }]))
        .names,
    ).toEqual(['North']);
    expect(
      (await list([{ field: 'lq_skills', operator: 'equals', value: 'ts,go' }]))
        .names,
    ).toEqual(['North']);
  });

  it('sorts by a custom field with the unset records last, and pages', async () => {
    expect(
      (await list([], { field: 'lq_score', direction: 'desc' })).names,
    ).toEqual(['North', 'South', 'Unset']);
    expect(
      (await list([], { field: 'lq_score', direction: 'asc' })).names,
    ).toEqual(['South', 'North', 'Unset']);
    expect(
      await list(
        [],
        { field: 'lq_score', direction: 'asc' },
        { page: 2, pageSize: 1 },
      ),
    ).toEqual({ total: 3, names: ['North'] });
  });

  it('never filters or sorts by a masked or unreadable field', async () => {
    for (const field of ['lq_badge', 'lq_salary_band']) {
      await expect(
        values.recordIdConstraints(admin, 'employees', [
          { field, operator: 'equals', value: 'A' },
        ]),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(
        await values.orderedRecordIds(admin, 'employees', field, 'asc', [
          ids.north,
        ]),
      ).toBeNull();
    }
  });
});
