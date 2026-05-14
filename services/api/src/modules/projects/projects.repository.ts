import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ProjectQueryDto } from './dto/project-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const projectInclude = {
  customer: {
    select: {
      id: true,
      name: true,
      code: true,
      industry: true,
      status: true,
    },
  },
  businessUnit: {
    select: {
      id: true,
      name: true,
      organizationId: true,
    },
  },
  assignments: {
    include: {
      projectRole: {
        select: {
          id: true,
          name: true,
          code: true,
        },
      },
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          preferredName: true,
          department: {
            select: {
              id: true,
              name: true,
              code: true,
            },
          },
          designation: {
            select: {
              id: true,
              name: true,
              level: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
  },
} satisfies Prisma.ProjectInclude;

export type ProjectWithRelations = Prisma.ProjectGetPayload<{
  include: typeof projectInclude;
}>;

@Injectable()
export class ProjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByTenant(
    tenantId: string,
    query: ProjectQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.ProjectWhereInput = { tenantId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      db.project.findMany({
        where,
        include: projectInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.project.count({ where }),
    ]);

    return { items, total };
  }

  findById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.project.findFirst({
      where: { tenantId, id },
      include: projectInclude,
    });
  }

  findActiveAssignedProjectsForEmployee(
    tenantId: string,
    employeeId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.project.findMany({
      where: {
        tenantId,
        status: {
          in: ['PLANNING', 'ACTIVE', 'ON_HOLD'],
        },
        allowTimesheets: true,
        assignments: {
          some: {
            employeeId,
            status: 'ACTIVE',
          },
        },
      },
      select: {
        id: true,
        name: true,
        code: true,
        status: true,
        timezone: true,
        currencyCode: true,
      },
      orderBy: [{ name: 'asc' }],
    });
  }

  create(data: Prisma.ProjectUncheckedCreateInput, db: PrismaDb = this.prisma) {
    return db.project.create({
      data,
      include: projectInclude,
    });
  }

  update(
    tenantId: string,
    id: string,
    data: Prisma.ProjectUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.project.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  findAssignment(
    tenantId: string,
    projectId: string,
    employeeId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.projectAssignment.findFirst({
      where: { tenantId, projectId, employeeId },
    });
  }

  createAssignment(
    data: Prisma.ProjectAssignmentUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.projectAssignment.create({ data });
  }

  updateAssignment(
    tenantId: string,
    id: string,
    data: Prisma.ProjectAssignmentUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.projectAssignment.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  findActiveAssignmentsForEmployee(
    tenantId: string,
    employeeId: string,
    input: {
      projectIdToExclude?: string | null;
      startDate?: Date | null;
      endDate?: Date | null;
    },
    db: PrismaDb = this.prisma,
  ) {
    const startDate = input.startDate ?? new Date('0001-01-01T00:00:00.000Z');
    const endDate = input.endDate ?? new Date('9999-12-31T00:00:00.000Z');

    return db.projectAssignment.findMany({
      where: {
        tenantId,
        employeeId,
        status: 'ACTIVE',
        allocationType: 'PERCENTAGE',
        ...(input.projectIdToExclude
          ? { projectId: { not: input.projectIdToExclude } }
          : {}),
        OR: [
          {
            startDate: { lte: endDate },
            OR: [{ endDate: null }, { endDate: { gte: startDate } }],
          },
          {
            startDate: null,
            OR: [{ endDate: null }, { endDate: { gte: startDate } }],
          },
        ],
      },
      select: {
        id: true,
        projectId: true,
        allocationPercent: true,
        startDate: true,
        endDate: true,
      },
    });
  }

  findTimesheetEntriesForProject(
    tenantId: string,
    projectId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.timesheetEntry.findMany({
      where: { tenantId, projectId },
      select: {
        id: true,
        date: true,
        hours: true,
        billableFlag: true,
        activityCode: true,
        note: true,
        timezone: true,
        currencyCode: true,
        timesheet: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            approvedAt: true,
          },
        },
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ date: 'desc' }],
    });
  }
}
