import { EMPLOYEE_IMPORT_COLUMNS, EmployeesService } from './employees.service';
import { splitCsvLine } from '../../common/utils/csv.util';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import type { EmployeeQueryDto } from './dto/employee-query.dto';

/**
 * Pins the employee export to the employee import contract.
 *
 * The export and the import template were built independently and drifted into
 * two disjoint column sets — eleven human-titled report headings against
 * twenty-one field keys — so the export → edit in a spreadsheet → re-upload
 * round trip a customer attempts during onboarding could not work: no column
 * name was shared, `Full Name` had to be split three ways, the manager came out
 * as a display name where the importer wants an employee code, and the four
 * emergency-contact columns the create path requires were missing entirely.
 *
 * These tests are the real fix. They fail the moment either side gains, loses
 * or renames a column without the other following.
 */
describe('employee export / import column contract', () => {
  const tenantId = 'tenant-1';

  const currentUser = {
    userId: 'user-1',
    tenantId,
    roleIds: [],
    roleKeys: ['hr'],
    permissionKeys: [],
  } as unknown as AuthenticatedUser;

  const exportedEmployee = {
    id: 'employee-1',
    employeeCode: 'EMP-0012',
    firstName: 'Ada',
    middleName: 'Byron',
    lastName: 'Lovelace',
    preferredName: 'Ada',
    fullName: 'Ada Byron Lovelace',
    workEmail: 'ada@example.com',
    personalEmail: 'ada@personal.example.com',
    phone: '+9715550000',
    hireDate: new Date('2026-01-15T00:00:00.000Z'),
    employmentStatus: 'Active',
    employeeType: 'FULL_TIME',
    workMode: 'ONSITE',
    contractType: 'PERMANENT',
    department: { id: 'dept-1', name: 'Marketing' },
    designation: { id: 'desig-1', name: 'Marketing Specialist' },
    reportingManager: {
      id: 'employee-2',
      employeeCode: 'EMP-0001',
      firstName: 'Grace',
      lastName: 'Hopper',
    },
    ownerUser: {
      id: 'user-2',
      email: 'owner@example.com',
      fullName: 'Owner One',
    },
    emergencyContactName: 'Charles Babbage',
    emergencyContactPhone: '+9715550001',
    emergencyContactRelation: 'Husband',
    emergencyContactRelationType: { id: 'rel-1', name: 'Spouse' },
  };

  let service: EmployeesService;
  let organizationRepository: {
    findDepartments: jest.Mock;
    findDesignations: jest.Mock;
  };
  let prisma: { relationType: { findMany: jest.Mock } };
  let auditService: { log: jest.Mock };

  beforeEach(() => {
    organizationRepository = {
      findDepartments: jest
        .fn()
        .mockResolvedValue([{ id: 'dept-1', name: 'Marketing' }]),
      findDesignations: jest
        .fn()
        .mockResolvedValue([{ id: 'desig-1', name: 'Marketing Specialist' }]),
    };
    prisma = {
      relationType: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'rel-1', name: 'Spouse' }]),
      },
    };
    auditService = { log: jest.fn() };

    service = new EmployeesService(
      prisma as never,
      {} as never,
      organizationRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      auditService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
  });

  function stubList(items: unknown[]) {
    jest.spyOn(service, 'findByTenant').mockResolvedValue({
      items,
      meta: { page: 1, pageSize: 10000, total: items.length, totalPages: 1 },
      filters: {
        search: null,
        employmentStatus: null,
        reportingManagerEmployeeId: null,
      },
    } as never);
  }

  async function exportHeaderAndRows(query: Partial<EmployeeQueryDto> = {}) {
    const file = await service.exportEmployees(
      currentUser,
      query as EmployeeQueryDto,
    );
    const csv = file.buffer.toString('utf8');
    const lines = csv.split('\n').filter((line) => line.length > 0);

    return {
      csv,
      headers: splitCsvLine(lines[0]).map((header) => header.trim()),
      rows: lines
        .slice(1)
        .map((line) => splitCsvLine(line).map((value) => value.trim())),
    };
  }

  function templateHeaders() {
    return splitCsvLine(
      service.exportEmployeeTemplate().buffer.toString('utf8').split('\n')[0],
    ).map((header) => header.trim());
  }

  it('exports every column the import template declares, under the same keys', async () => {
    stubList([exportedEmployee]);
    const { headers } = await exportHeaderAndRows();

    expect(headers).toEqual(templateHeaders());
  });

  it('keeps the import template equal to the declared contract', () => {
    expect(templateHeaders()).toEqual([...EMPLOYEE_IMPORT_COLUMNS]);
  });

  it('emits the manager as an employee code and carries the emergency contact', async () => {
    stubList([exportedEmployee]);
    const { headers, rows } = await exportHeaderAndRows();
    const cell = (column: string) => rows[0][headers.indexOf(column)];

    expect(cell('reportingManagerEmployeeCode')).toBe('EMP-0001');
    expect(cell('firstName')).toBe('Ada');
    expect(cell('middleName')).toBe('Byron');
    expect(cell('lastName')).toBe('Lovelace');
    expect(cell('emergencyContactName')).toBe('Charles Babbage');
    expect(cell('emergencyContactPhone')).toBe('+9715550001');
    expect(cell('emergencyContactRelation')).toBe('Husband');
    expect(cell('emergencyContactRelationType')).toBe('Spouse');
    expect(cell('hireDate')).toBe('2026-01-15');
  });

  it('populates every contract column for a fully-populated employee', async () => {
    // Header agreement alone would still pass if a column were added to the
    // contract and never wired into the export projection: the header would
    // appear and every cell under it would be blank. This asserts the values.
    stubList([exportedEmployee]);
    const { headers, rows } = await exportHeaderAndRows();

    for (const column of EMPLOYEE_IMPORT_COLUMNS) {
      expect(rows[0][headers.indexOf(column)]).not.toBe('');
    }
  });

  it('cannot be narrowed below the contract by a view column selection', async () => {
    stubList([exportedEmployee]);
    // A saved view showing three columns still has to produce an importable
    // file, so the selection may only add report columns on top of the contract.
    const { headers } = await exportHeaderAndRows({
      columns: ['employeeCode', 'fullName', 'ownerUserId'],
    } as Partial<EmployeeQueryDto>);

    for (const column of EMPLOYEE_IMPORT_COLUMNS) {
      expect(headers).toContain(column);
    }
    expect(headers.slice(0, EMPLOYEE_IMPORT_COLUMNS.length)).toEqual([
      ...EMPLOYEE_IMPORT_COLUMNS,
    ]);
    // `ownerUserId` is an older view's key for the owner's display name.
    expect(headers.slice(EMPLOYEE_IMPORT_COLUMNS.length)).toEqual([
      'fullName',
      'ownerName',
    ]);
  });

  it('still writes a header row when there is nothing to export', async () => {
    stubList([]);
    const { headers, rows } = await exportHeaderAndRows();

    expect(headers).toEqual(templateHeaders());
    expect(rows).toHaveLength(0);
  });

  it('round-trips: an exported file is accepted by the importer unedited', async () => {
    stubList([exportedEmployee]);
    const file = await service.exportEmployees(
      currentUser,
      {} as EmployeeQueryDto,
    );

    const create = jest
      .spyOn(service, 'create')
      .mockResolvedValue({ id: 'employee-3' } as never);

    const result = await service.importEmployees(currentUser, {
      buffer: file.buffer,
      originalname: file.filename,
      mimetype: 'text/csv',
    });

    expect(result).toMatchObject({
      totalRows: 1,
      successCount: 1,
      failureCount: 0,
      errors: [],
    });
    expect(create).toHaveBeenCalledTimes(1);

    const [, dto] = create.mock.calls[0];
    expect(dto).toMatchObject({
      firstName: 'Ada',
      middleName: 'Byron',
      lastName: 'Lovelace',
      preferredName: 'Ada',
      workEmail: 'ada@example.com',
      personalEmail: 'ada@personal.example.com',
      phone: '+9715550000',
      hireDate: '2026-01-15',
      employmentStatus: 'Active',
      departmentId: 'dept-1',
      designationId: 'desig-1',
      emergencyContactName: 'Charles Babbage',
      emergencyContactPhone: '+9715550001',
      emergencyContactRelation: 'Husband',
      emergencyContactRelationTypeId: 'rel-1',
    });
  });
});
