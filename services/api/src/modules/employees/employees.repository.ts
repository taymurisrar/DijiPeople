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
  department: {
    select: {
      id: true,
      name: true,
      code: true,
      isActive: true,
    },
  },
  designation: {
    select: {
      id: true,
      name: true,
      level: true,
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

      columnFilters.push({
        manager: {
          OR: [
            { firstName: managerFilter },
            { lastName: managerFilter },
            { preferredName: managerFilter },
            { employeeCode: managerFilter },
            { email: managerFilter },
          ],
        },
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

      columnFilters.push({
        OR: [{ email: contactFilter }, { phone: contactFilter }],
      });
    }

    if (columnFilters.length) {
      where.AND = [...(Array.isArray(where.AND) ? where.AND : []), ...columnFilters];
    }

    return where;
  }

  private buildStringFilter(
    value: string,
    operator: EmployeeQueryDto['codeFilterOperator'] = 'contains',
  ): Prisma.StringFilter<'Employee'> {
    const trimmed = value.trim();

    if (operator === 'equals') {
      return { equals: trimmed, mode: 'insensitive' };
    }

    if (operator === 'startsWith') {
      return { startsWith: trimmed, mode: 'insensitive' };
    }

    return { contains: trimmed, mode: 'insensitive' };
  }

  private buildNameFilter(
    value: string,
    operator: EmployeeQueryDto['nameFilterOperator'] = 'contains',
  ): Prisma.EmployeeWhereInput {
    const filter = this.buildStringFilter(value, operator);

    return {
      OR: [
        { firstName: filter },
        { lastName: filter },
        { preferredName: filter },
        { email: filter },
        { employeeCode: filter },
      ],
    };
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

  private buildOrderBy(query: EmployeeQueryDto): Prisma.EmployeeOrderByWithRelationInput[] {
    const fallback: Prisma.EmployeeOrderByWithRelationInput[] = [
      { lastName: 'asc' },
      { firstName: 'asc' },
    ];

    const match = query.orderBy?.match(/^([A-Za-z][A-Za-z0-9_]*)\s+(asc|desc)$/);

    if (!match) {
      return fallback;
    }

    const direction = match[2] as Prisma.SortOrder;

    switch (match[1]) {
      case 'firstName':
        return [{ firstName: direction }, { lastName: direction }];
      case 'employeeCode':
        return [{ employeeCode: direction }];
      case 'employmentStatus':
        return [{ employmentStatus: direction }];
      case 'managerEmployeeId':
        return [{ manager: { firstName: direction } }, { manager: { lastName: direction } }];
      case 'hireDate':
        return [{ hireDate: direction }];
      case 'email':
        return [{ email: direction }];
      default:
        return fallback;
    }
  }
}
