import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { JobOpeningQueryDto } from './dto/job-opening-query.dto';

type PrismaDb = PrismaService | Prisma.TransactionClient;

const candidateSummarySelect = {
  id: true,
  firstName: true,
  middleName: true,
  lastName: true,
  email: true,
  phone: true,
  source: true,
  currentStatus: true,
  currentCity: true,
  currentCountry: true,
  totalYearsExperience: true,
  preferredWorkMode: true,
  resumeDocumentReference: true,
} satisfies Prisma.CandidateSelect;

const evaluationInclude = {
  orderBy: [{ interviewRound: 'asc' }, { createdAt: 'desc' }],
} satisfies Prisma.CandidateEvaluationFindManyArgs;

const applicationSummaryInclude = {
  candidate: {
    select: candidateSummarySelect,
  },
  jobOpening: {
    select: {
      id: true,
      title: true,
      code: true,
      status: true,
      description: true,
      matchCriteria: true,
    },
  },
  draftEmployee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      middleName: true,
      lastName: true,
      isDraftProfile: true,
      sourceCandidateId: true,
      sourceApplicationId: true,
      sourceJobOpeningId: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  evaluations: evaluationInclude,
  stageHistory: {
    orderBy: [{ changedAt: 'desc' }],
  },
} satisfies Prisma.ApplicationInclude;

const jobOpeningInclude = {
  applications: {
    include: applicationSummaryInclude,
    orderBy: [{ updatedAt: 'desc' }],
  },
} satisfies Prisma.JobOpeningInclude;

const candidateInclude = {
  resumeDocument: true,
  latestResumeDocument: true,
  documents: {
    orderBy: [{ uploadedAt: 'desc' }, { createdAt: 'desc' }],
  },
  identities: {
    orderBy: [{ createdAt: 'desc' }],
  },
  historyRecords: {
    orderBy: [{ snapshotTakenAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      snapshotVersion: true,
      snapshotReason: true,
      snapshotTakenAt: true,
      originalCreatedAt: true,
      sourceDocumentId: true,
      sourceChannel: true,
    },
  },
  parsingJobs: {
    orderBy: [{ createdAt: 'desc' }],
    take: 10,
    include: {
      documentReference: true,
    },
  },
  educationRecords: {
    orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }],
  },
  experienceRecords: {
    orderBy: [{ endDate: 'desc' }, { createdAt: 'desc' }],
  },
  evaluations: evaluationInclude,
  applications: {
    include: applicationSummaryInclude,
    orderBy: [{ updatedAt: 'desc' }],
  },
} satisfies Prisma.CandidateInclude;

const applicationDetailWithHistoryInclude = {
  ...applicationSummaryInclude,
  historyRecords: {
    orderBy: [{ snapshotTakenAt: 'desc' }],
    take: 20,
    select: {
      id: true,
      snapshotVersion: true,
      snapshotReason: true,
      snapshotTakenAt: true,
      originalAppliedAt: true,
    },
  },
} satisfies Prisma.ApplicationInclude;

const applicationScoringInclude = {
  candidate: {
    select: {
      id: true,
      skills: true,
      totalYearsExperience: true,
      educationRecords: {
        select: {
          degreeTitle: true,
          fieldOfStudy: true,
        },
      },
      currentCity: true,
      currentCountry: true,
      preferredLocation: true,
      willingToRelocate: true,
      noticePeriodDays: true,
      preferredWorkMode: true,
    },
  },
  jobOpening: {
    select: {
      id: true,
      matchCriteria: true,
    },
  },
} satisfies Prisma.ApplicationInclude;

export type JobOpeningWithRelations = Prisma.JobOpeningGetPayload<{
  include: typeof jobOpeningInclude;
}>;

export type CandidateWithRelations = Prisma.CandidateGetPayload<{
  include: typeof candidateInclude;
}>;

export type ApplicationWithRelations = Prisma.ApplicationGetPayload<{
  include: typeof applicationDetailWithHistoryInclude;
}>;

export type ApplicationSummaryWithRelations = Prisma.ApplicationGetPayload<{
  include: typeof applicationSummaryInclude;
}>;

export type ApplicationForScoring = Prisma.ApplicationGetPayload<{
  include: typeof applicationScoringInclude;
}>;

@Injectable()
export class RecruitmentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findJobOpenings(
    tenantId: string,
    query: JobOpeningQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.JobOpeningWhereInput = { tenantId };

    if (query.status) {
      where.status = query.status;
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      db.jobOpening.findMany({
        where,
        include: jobOpeningInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.jobOpening.count({ where }),
    ]);

    return { items, total };
  }

  findJobOpeningById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.jobOpening.findFirst({
      where: { tenantId, id },
      include: jobOpeningInclude,
    });
  }

  createJobOpening(
    data: Prisma.JobOpeningUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.jobOpening.create({
      data,
      include: jobOpeningInclude,
    });
  }

  updateJobOpening(
    tenantId: string,
    id: string,
    data: Prisma.JobOpeningUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.jobOpening.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  async findCandidates(
    tenantId: string,
    query: CandidateQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.CandidateWhereInput = { tenantId };

    if (query.currentStatus) {
      where.currentStatus = query.currentStatus;
    }

    if (query.source?.trim()) {
      where.source = { equals: query.source.trim(), mode: 'insensitive' };
    }

    if (query.city?.trim()) {
      where.currentCity = { contains: query.city.trim(), mode: 'insensitive' };
    }

    if (query.skill?.trim()) {
      where.skills = {
        array_contains: [query.skill.trim()],
      };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { firstName: { contains: search, mode: 'insensitive' } },
        { lastName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { currentEmployer: { contains: search, mode: 'insensitive' } },
        { currentDesignation: { contains: search, mode: 'insensitive' } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      db.candidate.findMany({
        where,
        include: candidateInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.candidate.count({ where }),
    ]);

    return { items, total };
  }

  findCandidateById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidate.findFirst({
      where: { tenantId, id },
      include: candidateInclude,
    });
  }

  createCandidate(
    data: Prisma.CandidateUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidate.create({
      data,
      include: candidateInclude,
    });
  }

  updateCandidate(
    tenantId: string,
    id: string,
    data: Prisma.CandidateUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidate.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  findCandidateIdentitiesBySignals(
    tenantId: string,
    where: Prisma.CandidateIdentityWhereInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidateIdentity.findMany({
      where: { tenantId, ...where },
    });
  }

  upsertCandidateIdentity(
    data: {
      tenantId: string;
      candidateId: string;
      type: Prisma.CandidateIdentityUncheckedCreateInput['type'];
      value: string;
      normalizedValue: string;
      isPrimary: boolean;
      source?: string;
      confidence?: number;
      actorUserId: string;
    },
    db: PrismaDb = this.prisma,
  ) {
    return db.candidateIdentity.upsert({
      where: {
        tenantId_type_normalizedValue: {
          tenantId: data.tenantId,
          type: data.type,
          normalizedValue: data.normalizedValue,
        },
      },
      create: {
        tenantId: data.tenantId,
        candidateId: data.candidateId,
        type: data.type,
        value: data.value,
        normalizedValue: data.normalizedValue,
        isPrimary: data.isPrimary,
        source: data.source,
        confidence: data.confidence ?? 100,
        createdById: data.actorUserId,
        updatedById: data.actorUserId,
      },
      update: {
        candidateId: data.candidateId,
        value: data.value,
        isPrimary: data.isPrimary,
        source: data.source,
        confidence: data.confidence ?? 100,
        updatedById: data.actorUserId,
      },
    });
  }

  deleteCandidateEducationRecords(
    tenantId: string,
    candidateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidateEducation.deleteMany({
      where: { tenantId, candidateId },
    });
  }

  createCandidateEducationRecords(
    data: Prisma.CandidateEducationCreateManyInput[],
    db: PrismaDb = this.prisma,
  ) {
    if (data.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    return db.candidateEducation.createMany({ data });
  }

  deleteCandidateExperienceRecords(
    tenantId: string,
    candidateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidateExperience.deleteMany({
      where: { tenantId, candidateId },
    });
  }

  createCandidateExperienceRecords(
    data: Prisma.CandidateExperienceCreateManyInput[],
    db: PrismaDb = this.prisma,
  ) {
    if (data.length === 0) {
      return Promise.resolve({ count: 0 });
    }

    return db.candidateExperience.createMany({ data });
  }

  createCandidateEvaluation(
    data: Prisma.CandidateEvaluationUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidateEvaluation.create({ data });
  }

  createDocumentReference(
    data: Prisma.DocumentReferenceUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.documentReference.create({ data });
  }

  updateManyDocumentReferences(
    tenantId: string,
    candidateId: string,
    data: Prisma.DocumentReferenceUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.documentReference.updateMany({
      where: { tenantId, candidateId },
      data,
    });
  }

  updateDocumentReference(
    tenantId: string,
    id: string,
    data: Prisma.DocumentReferenceUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.documentReference.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  findDocumentReferenceById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.documentReference.findFirst({
      where: { tenantId, id },
    });
  }

  createParsingJob(
    data: Prisma.DocumentParsingJobUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.documentParsingJob.create({
      data,
      include: {
        documentReference: true,
      },
    });
  }

  async findApplications(
    tenantId: string,
    query: ApplicationQueryDto,
    db: PrismaDb = this.prisma,
  ) {
    const where: Prisma.ApplicationWhereInput = { tenantId };

    if (query.stage) {
      where.stage = query.stage;
    }

    if (query.candidateId) {
      where.candidateId = query.candidateId;
    }

    if (query.jobOpeningId) {
      where.jobOpeningId = query.jobOpeningId;
    }

    if (query.rejectionReason?.trim()) {
      where.rejectionReason = {
        contains: query.rejectionReason.trim(),
        mode: 'insensitive',
      };
    }

    if (query.search?.trim()) {
      const search = query.search.trim();
      where.OR = [
        { candidate: { firstName: { contains: search, mode: 'insensitive' } } },
        { candidate: { lastName: { contains: search, mode: 'insensitive' } } },
        { candidate: { email: { contains: search, mode: 'insensitive' } } },
        { jobOpening: { title: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const skip = (query.page - 1) * query.pageSize;
    const [items, total] = await Promise.all([
      db.application.findMany({
        where,
        include: applicationDetailWithHistoryInclude,
        orderBy: [{ updatedAt: 'desc' }],
        skip,
        take: query.pageSize,
      }),
      db.application.count({ where }),
    ]);

    return { items, total };
  }

  findApplicationById(
    tenantId: string,
    id: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.application.findFirst({
      where: { tenantId, id },
      include: applicationDetailWithHistoryInclude,
    });
  }

  findApplicationByCandidateAndJob(
    tenantId: string,
    candidateId: string,
    jobOpeningId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.application.findFirst({
      where: { tenantId, candidateId, jobOpeningId },
      include: applicationDetailWithHistoryInclude,
    });
  }

  createApplication(
    data: Prisma.ApplicationUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.application.create({
      data,
      include: applicationDetailWithHistoryInclude,
    });
  }

  updateApplication(
    tenantId: string,
    id: string,
    data: Prisma.ApplicationUncheckedUpdateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.application.updateMany({
      where: { tenantId, id },
      data,
    });
  }

  createApplicationStageHistory(
    data: Prisma.ApplicationStageHistoryUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.applicationStageHistory.create({ data });
  }

  findApplicationsForJobOpeningScoring(
    tenantId: string,
    jobOpeningId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.application.findMany({
      where: { tenantId, jobOpeningId },
      include: applicationScoringInclude,
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  findApplicationsForCandidateScoring(
    tenantId: string,
    candidateId: string,
    db: PrismaDb = this.prisma,
  ) {
    return db.application.findMany({
      where: { tenantId, candidateId },
      include: applicationScoringInclude,
      orderBy: [{ updatedAt: 'desc' }],
    });
  }

  async findLatestCandidateHistoryRevision(
    tenantId: string,
    candidateId: string,
    db: PrismaDb = this.prisma,
  ) {
    const latest = await db.candidateHistory.findFirst({
      where: { tenantId, candidateId },
      orderBy: [{ snapshotVersion: 'desc' }],
      select: { snapshotVersion: true },
    });
    return latest?.snapshotVersion ?? 0;
  }

  createCandidateHistory(
    data: Prisma.CandidateHistoryUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.candidateHistory.create({ data });
  }

  async findLatestApplicationHistoryRevision(
    tenantId: string,
    applicationId: string,
    db: PrismaDb = this.prisma,
  ) {
    const latest = await db.applicationHistory.findFirst({
      where: { tenantId, applicationId },
      orderBy: [{ snapshotVersion: 'desc' }],
      select: { snapshotVersion: true },
    });
    return latest?.snapshotVersion ?? 0;
  }

  createApplicationHistory(
    data: Prisma.ApplicationHistoryUncheckedCreateInput,
    db: PrismaDb = this.prisma,
  ) {
    return db.applicationHistory.create({ data });
  }
}
