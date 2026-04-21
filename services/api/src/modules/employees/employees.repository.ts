import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
  firstName: true,
  lastName: true,
  preferredName: true,
  employmentStatus: true,
  managerEmployeeId: true,
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

  async findByTenant(tenantId: string, query: EmployeeQueryDto, db: PrismaDb = this.prisma) {
    const where = this.buildWhereClause(tenantId, query);
    const skip = (query.page - 1) * query.pageSize;

    const [items, total] = await Promise.all([
      db.employee.findMany({
        where,
        include: employeeInclude,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
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
    db: PrismaDb = this.prisma,
  ) {
    return db.employee.findFirst({
      where: {
        id: employeeId,
        tenantId,
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
      },
      include: employeeInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  private buildWhereClause(tenantId: string, query: EmployeeQueryDto): Prisma.EmployeeWhereInput {
    const where: Prisma.EmployeeWhereInput = {
      tenantId,
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

    return where;
  }
}
