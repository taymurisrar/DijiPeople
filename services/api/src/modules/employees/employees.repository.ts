import { Injectable } from '@nestjs/common';
import { EmployeeEmploymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmployeeQueryDto } from './dto/employee-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const employeeInclude = {
  manager: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      preferredName: true,
      employmentStatus: true,
      userId: true,
    },
  },
  user: {
    include: {
      userRoles: {
        include: {
          role: {
            select: {
              id: true,
              key: true,
              name: true,
            },
          },
        },
      },
    },
  },
  ownerUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
    },
  },
  profileImageDocument: {
    select: {
      id: true,
      originalFileName: true,
      mimeType: true,
      sizeInBytes: true,
      storageKey: true,
      createdAt: true,
    },
  },
  countryLookup: {
    select: {
      id: true,
      name: true,
    },
  },
  stateProvinceLookup: {
    select: {
      id: true,
      name: true,
    },
  },
  cityLookup: {
    select: {
      id: true,
      name: true,
    },
  },
  emergencyContactRelationType: {
    select: {
      id: true,
      key: true,
      name: true,
      isActive: true,
    },
  },
  organization: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
    },
  },
  businessUnit: {
    select: {
      id: true,
      name: true,
      code: true,
      organizationId: true,
      isActive: true,
    },
  },
  department: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
    },
  },
  team: {
    select: {
      id: true,
      name: true,
      key: true,
      departmentId: true,
      isActive: true,
    },
  },
  designation: {
    select: {
      id: true,
      name: true,
      level: true,
      employeeLevelId: true,
      isActive: true,
    },
  },
  employeeLevel: {
    select: {
      id: true,
      code: true,
      name: true,
      rank: true,
      description: true,
      isActive: true,
    },
  },
  location: {
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      country: true,
      timezone: true,
      isActive: true,
    },
  },
  defaultWorkSchedule: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
    },
  },
  officialJoiningLocation: {
    select: {
      id: true,
      name: true,
      city: true,
      state: true,
      country: true,
      timezone: true,
      isActive: true,
    },
  },
  _count: {
    select: {
      directReports: true,
      educationRecords: true,
      historyRecords: true,
      documentLinks: true,
      emergencyContacts: true,
      documentReferences: true,
    },
  },
} satisfies Prisma.EmployeeInclude;

const hierarchyNodeSelect = {
  id: true,
  tenantId: true,
  employeeCode: true,
  recordType: true,
  firstName: true,
  lastName: true,
  preferredName: true,
  employmentStatus: true,
  businessUnitId: true,
  managerEmployeeId: true,
  user: {
    select: {
      businessUnitId: true,
    },
  },
} satisfies Prisma.EmployeeSelect;

export type EmployeeWithRelations = Prisma.EmployeeGetPayload<{
  include: typeof employeeInclude;
}>;

export type EmployeeHierarchyNode = Prisma.EmployeeGetPayload<{
  select: typeof hierarchyNodeSelect;
}>;

/** Operators whose multi-column match must hold for every column, not any. */
function isNegatedOperator(operator: string | undefined) {
  return operator === 'notContains' || operator === 'notEquals';
}

@Injectable()
export class EmployeesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(
    tenantId: string,
    query: EmployeeQueryDto,
    accessWhere: Prisma.EmployeeWhereInput = {},
    db: PrismaDb = this.prisma,
  ) {
    const where = {
      AND: [this.buildWhereClause(tenantId, query), accessWhere],
    } satisfies Prisma.EmployeeWhereInput;
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.pageSize,
      }),
      db.employee.count({ where }),
    ]);

    return { items, total };
  }

  findByIdAndTenant(
    tenantId: string,
    employeeId: string,
    accessWhere: Prisma.EmployeeWhereInput = {},
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findFirst({
      where: {
        AND: [
          { id: employeeId, tenantId, isDeleted: false, deletedAt: null },
          accessWhere,
        ],
      },
      include: employeeInclude,
    });
  }

  findByUserIdAndTenant(
    tenantId: string,
    userId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findFirst({
      where: {
        tenantId,
        userId,
        isDeleted: false,
        deletedAt: null,
      },
      include: employeeInclude,
    });
  }

  create(
    data: Prisma.EmployeeUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.create({ data });
  }

  update(
    tenantId: string,
    employeeId: string,
    data: Prisma.EmployeeUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.updateMany({
      where: {
        id: employeeId,
        tenantId,
        isDeleted: false,
        deletedAt: null,
      },
      data,
    });
  }

  findHierarchyNodeByIdAndTenant(
    tenantId: string,
    employeeId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
        isDeleted: false,
        deletedAt: null,
      },
      select: hierarchyNodeSelect,
    });
  }

  findDirectReports(
    tenantId: string,
    managerEmployeeId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findMany({
      where: {
        tenantId,
        managerEmployeeId,
        isDeleted: false,
        deletedAt: null,
      },
      include: employeeInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private buildWhereClause(
    tenantId: string,
    query: EmployeeQueryDto,
  ): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
      isDeleted: false,
      deletedAt: null,
    };

    if (query.search) {
      const search = query.search.trim();
      where.OR = [
        { employeeCode: { contains: search, mode: 'insensitive' } },
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { preferredName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (query.employmentStatus) {
      where.employmentStatus = query.employmentStatus;
    }

    if (query.reportingManagerEmployeeId) {
      where.managerEmployeeId = query.reportingManagerEmployeeId;
    }

    const columnFilters: Prisma.EmployeeWhereInput[] = [];

    if (query.nameFilter) {
      const nameFilter = this.buildNameFilter(
        query.nameFilter,
        query.nameFilterOperator,
      );

      if (nameFilter) {
        columnFilters.push(nameFilter);
      }
    }

    if (query.codeFilter) {
      columnFilters.push({
        employeeCode: this.buildStringFilter(
          query.codeFilter,
          query.codeFilterOperator,
        ),
      });
    }

    if (query.statusFilter) {
      const statuses = query.statusFilter
        .split(',')
        .map((status) => status.trim())
        .filter((status): status is EmployeeEmploymentStatus =>
          Object.values(EmployeeEmploymentStatus).includes(
            status as EmployeeEmploymentStatus,
          ),
        );

      if (statuses.length === 1) {
        columnFilters.push({ employmentStatus: statuses[0] });
      } else if (statuses.length > 1) {
        columnFilters.push({ employmentStatus: { in: statuses } });
      }
    }

    if (query.reportingManagerFilter) {
      const managerFilter = this.buildStringFilter(
        query.reportingManagerFilter,
        query.reportingManagerFilterOperator,
      );

      const managerClauses = [
        { firstName: managerFilter },
        { lastName: managerFilter },
        { preferredName: managerFilter },
        { employeeCode: managerFilter },
        { email: managerFilter },
      ];

      columnFilters.push({
        manager: isNegatedOperator(query.reportingManagerFilterOperator)
          ? { AND: managerClauses }
          : { OR: managerClauses },
      });
    }

    if (query.hireDateFilter) {
      const hireDateFilter = this.buildDateFilter(
        query.hireDateFilter,
        query.hireDateFilterOperator,
        query.hireDateFilterTo,
      );

      if (hireDateFilter) {
        columnFilters.push({ hireDate: hireDateFilter });
      }
    }

    if (query.contactFilter) {
      const contactFilter = this.buildStringFilter(
        query.contactFilter,
        query.contactFilterOperator,
      );

      const contactClauses = [
        { email: contactFilter },
        { phone: contactFilter },
      ];

      columnFilters.push(
        isNegatedOperator(query.contactFilterOperator)
          ? { AND: contactClauses }
          : { OR: contactClauses },
      );
    }

    if (columnFilters.length) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : []),
        ...columnFilters,
      ];
    }

    return where;
  }

  private buildStringFilter(
    value: string,
    operator: EmployeeQueryDto['codeFilterOperator'] = 'contains',
  ): Prisma.StringFilter<'Employee'> {
    const trimmed = value.trim();

    switch (operator) {
      case 'equals':
        return { equals: trimmed, mode: 'insensitive' };
      case 'notEquals':
        return { not: trimmed, mode: 'insensitive' };
      case 'startsWith':
        return { startsWith: trimmed, mode: 'insensitive' };
      case 'endsWith':
        return { endsWith: trimmed, mode: 'insensitive' };
      case 'notContains':
        // Prisma has no negated contains, so the match is inverted by the
        // caller's AND block through an empty-string fallback comparison.
        return { not: { contains: trimmed } };
      // A blank column is stored as either empty text or null, so both count.
      case 'isEmpty':
        return { in: [''] };
      case 'isNotEmpty':
        return { not: { in: [''] } };
      default:
        return { contains: trimmed, mode: 'insensitive' };
    }
  }

  private buildNameFilter(
    value: string,
    operator: EmployeeQueryDto['nameFilterOperator'] = 'contains',
  ): Prisma.EmployeeWhereInput {
    const filter = this.buildStringFilter(value, operator);
    const clauses = [
      { firstName: filter },
      { lastName: filter },
      { preferredName: filter },
      { email: filter },
      { employeeCode: filter },
    ];

    // A negated match across several columns must hold for every column.
    // Using OR here would match any record where a single other column
    // happened to differ, which returns almost the whole table.
    return isNegatedOperator(operator) ? { AND: clauses } : { OR: clauses };
  }

  private buildDateFilter(
    value: string,
    operator: EmployeeQueryDto['hireDateFilterOperator'] = 'equals',
    valueTo?: string,
  ): Prisma.DateTimeFilter<'Employee'> {
    const date = this.parseDate(value);

    if (!date) {
      return {};
    }

    if (operator === 'before') {
      return { lt: date.start };
    }

    if (operator === 'after') {
      return { gt: date.end };
    }

    if (operator === 'onOrBefore') {
      return { lte: date.end };
    }

    if (operator === 'onOrAfter') {
      return { gte: date.start };
    }

    if (operator === 'between' && valueTo) {
      const endDate = this.parseDate(valueTo);

      return endDate ? { gte: date.start, lte: endDate.end } : {};
    }

    return { gte: date.start, lte: date.end };
  }

  private parseDate(value: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return null;
    }

    const start = new Date(`${value}T00:00:00.000Z`);
    const end = new Date(`${value}T23:59:59.999Z`);

    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }

    return { start, end };
  }

  private buildOrderBy(
    query: EmployeeQueryDto,
  ): Prisma.EmployeeOrderByWithRelationInput[] {
    const fallback: Prisma.EmployeeOrderByWithRelationInput[] = [
      { lastName: 'asc' },
      { firstName: 'asc' },
    ];

    const match = query.orderBy?.match(
      /^([A-Za-z][A-Za-z0-9_]*)\s+(asc|desc)$/,
    );

    if (!match) {
      return fallback;
    }

    const direction = match[2] as Prisma.SortOrder;

    // The runtime list emits the column's logical name, which differs from the
    // persisted field name for several columns. Both spellings are accepted so
    // a column sort cannot silently fall through to the default order.
    switch (match[1]) {
      case 'firstName':
      case 'fullName':
        return [{ firstName: direction }, { lastName: direction }];
      case 'lastName':
        return [{ lastName: direction }, { firstName: direction }];
      case 'employeeCode':
        return [{ employeeCode: direction }];
      case 'employmentStatus':
        return [{ employmentStatus: direction }];
      case 'managerEmployeeId':
      case 'reportingManagerEmployeeId':
        return [
          { manager: { firstName: direction } },
          { manager: { lastName: direction } },
        ];
      case 'hireDate':
        return [{ hireDate: direction }];
      case 'email':
      case 'workEmail':
        return [{ email: direction }];
      default:
        return fallback;
    }
  }
}
