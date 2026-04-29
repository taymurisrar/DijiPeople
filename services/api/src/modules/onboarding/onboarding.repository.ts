import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { OnboardingQueryDto } from './dto/onboarding-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const onboardingInclude = {
  candidate: {
    select: {
      id: true,
      firstName: true,
      middleName: true,
      lastName: true,
      email: true,
      phone: true,
      currentStatus: true,
      dateOfBirth: true,
      gender: true,
      nationalityCountryId: true,
      nationality: true,
      currentCountryId: true,
      currentStateProvinceId: true,
      currentCityId: true,
      currentCountry: true,
      currentStateProvince: true,
      currentCity: true,
    },
  },
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      employmentStatus: true,
    },
  },
  template: true,
  tasks: {
    include: {
      assignedUser: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  },
} satisfies Prisma.EmployeeOnboardingInclude;

export type EmployeeOnboardingWithRelations =
  Prisma.EmployeeOnboardingGetPayload<{
    include: typeof onboardingInclude;
  }>;

@Injectable()
export class OnboardingRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findTemplates(tenantId: string, db: PrismaDb = this.prisma) {
    return db.onboardingTemplate.findMany({
      where: { tenantId },
      orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  findTemplateById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.onboardingTemplate.findFirst({
      where: { tenantId, id },
    });
  }

  createTemplate(
    data: Prisma.OnboardingTemplateUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.onboardingTemplate.create({ data });
  }

  updateTemplate(
    tenantId: string,
    id: string,
    data: Prisma.OnboardingTemplateUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.onboardingTemplate.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  async findOnboardings(
    tenantId: string,
    query: OnboardingQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.EmployeeOnboardingWhereInput = { tenantId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.candidateId) {
      where.candidateId = query.candidateId;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { candidate: { firstName: { contains: search, mode: 'insensitive' } } },
        { candidate: { lastName: { contains: search, mode: 'insensitive' } } },
        { employee: { firstName: { contains: search, mode: 'insensitive' } } },
        { employee: { lastName: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      db.employeeOnboarding.findMany({
        where,
        include: onboardingInclude,
        orderBy: [{ createdAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.employeeOnboarding.count({ where }),
    ]);

    return { items, total };
  }

  findOnboardingById(tenantId: string, id: string, db: PrismaDb = this.prisma) {
    return db.employeeOnboarding.findFirst({
      where: { tenantId, id },
      include: onboardingInclude,
    });
  }

  findActiveOnboardingByCandidate(
    tenantId: string,
    candidateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.employeeOnboarding.findFirst({
      where: {
        tenantId,
        candidateId,
        status: {
          in: [
            'DRAFT',
            'NOT_STARTED',
            'IN_PROGRESS',
            'AWAITING_CANDIDATE_INPUT',
            'READY_FOR_CONVERSION',
            'BLOCKED',
          ],
        },
      },
      include: onboardingInclude,
    });
  }

  createOnboarding(
    data: Prisma.EmployeeOnboardingUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.employeeOnboarding.create({ data });
  }

  createTasks(
    data: Prisma.OnboardingTaskUncheckedCreateInput[],
    db: PrismaDb = this.prisma,
  ) {
    return db.onboardingTask.createMany({ data });
  }

  updateOnboarding(
    tenantId: string,
    id: string,
    data: Prisma.EmployeeOnboardingUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.employeeOnboarding.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  findTaskById(
    tenantId: string,
    onboardingId: string,
    taskId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.onboardingTask.findFirst({
      where: { tenantId, employeeOnboardingId: onboardingId, id: taskId },
      include: {
        assignedUser: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  updateTask(
    tenantId: string,
    onboardingId: string,
    taskId: string,
    data: Prisma.OnboardingTaskUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.onboardingTask.updateMany({
      where: { tenantId, employeeOnboardingId: onboardingId, id: taskId },
      data,
    });
  }
}
