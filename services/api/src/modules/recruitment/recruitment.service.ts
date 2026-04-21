import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApplicationHistoryReason,
  CandidateHistoryReason,
  EmployeeEmploymentStatus,
  EmployeeType,
  EmployeeWorkMode,
  Prisma,
  RecruitmentStage,
} from '@prisma/client';
import { createHash } from 'crypto';
import { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { normalizeEmail } from '../../common/utils/email.util';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { ApplicationQueryDto } from './dto/application-query.dto';
import {
  CandidateEducationDto,
  CandidateExperienceDto,
  CreateCandidateDto,
} from './dto/create-candidate.dto';
import { CreateJobOpeningDto } from './dto/create-job-opening.dto';
import { JobOpeningQueryDto } from './dto/job-opening-query.dto';
import { MoveApplicationStageDto } from './dto/move-application-stage.dto';
import { RegisterCandidateDocumentDto } from './dto/register-candidate-document.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { TriggerDocumentParseDto } from './dto/trigger-document-parse.dto';
import { UpdateCandidateDto } from './dto/update-candidate.dto';
import { UpdateJobOpeningDto } from './dto/update-job-opening.dto';
import { UpsertCandidateEvaluationDto } from './dto/upsert-candidate-evaluation.dto';
import { CandidateQueryDto } from './dto/candidate-query.dto';
import { CandidateIdentityResolutionService } from './candidate-identity-resolution.service';
import { DocumentParsingService } from './document-parsing.service';
import {
  ApplicationForScoring,
  ApplicationSummaryWithRelations,
  ApplicationWithRelations,
  CandidateWithRelations,
  JobOpeningWithRelations,
  RecruitmentRepository,
} from './recruitment.repository';
import { RecruitmentScoringService } from './recruitment-scoring.service';

type UploadedResumeFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

@Injectable()
export class RecruitmentService {
  constructor(
    private readonly recruitmentRepository: RecruitmentRepository,
    private readonly documentParsingService: DocumentParsingService,
    private readonly recruitmentScoringService: RecruitmentScoringService,
    private readonly candidateIdentityResolutionService: CandidateIdentityResolutionService,
    private readonly tenantSettingsResolverService: TenantSettingsResolverService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  async findJobOpenings(tenantId: string, query: JobOpeningQueryDto) {
    const { items, total } = await this.recruitmentRepository.findJobOpenings(
      tenantId,
      query,
    );
    return {
      items: items.map((item) => this.mapJobOpening(item)),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
      filters: { search: query.search ?? null, status: query.status ?? null },
    };
  }

  async findJobOpeningById(tenantId: string, jobOpeningId: string) {
    const jobOpening = await this.recruitmentRepository.findJobOpeningById(
      tenantId,
      jobOpeningId,
    );
    if (!jobOpening) {
      throw new NotFoundException('Job opening was not found for this tenant.');
    }
    return this.mapJobOpening(jobOpening);
  }

  async createJobOpening(
    currentUser: AuthenticatedUser,
    dto: CreateJobOpeningDto,
  ) {
    const normalizedCriteria =
      this.recruitmentScoringService.normalizeMatchCriteria(dto.matchCriteria);
    this.recruitmentScoringService.validateMatchCriteria(normalizedCriteria);

    try {
      const jobOpening = await this.recruitmentRepository.createJobOpening({
        tenantId: currentUser.tenantId,
        title: dto.title.trim(),
        code: dto.code?.trim().toUpperCase(),
        description: dto.description?.trim(),
        status: dto.status ?? 'DRAFT',
        matchCriteria:
          normalizedCriteria === null
            ? Prisma.DbNull
            : (normalizedCriteria as unknown as Prisma.InputJsonValue),
        createdById: currentUser.userId,
        updatedById: currentUser.userId,
      });
      return this.mapJobOpening(jobOpening);
    } catch (error) {
      handleRecruitmentWriteError(error, 'Job opening');
    }
  }

  async updateJobOpening(
    currentUser: AuthenticatedUser,
    jobOpeningId: string,
    dto: UpdateJobOpeningDto,
  ) {
    const existing = await this.recruitmentRepository.findJobOpeningById(
      currentUser.tenantId,
      jobOpeningId,
    );
    if (!existing) {
      throw new NotFoundException('Job opening was not found for this tenant.');
    }

    const normalizedCriteria =
      dto.matchCriteria === undefined
        ? undefined
        : dto.matchCriteria === null
          ? null
          : this.recruitmentScoringService.normalizeMatchCriteria(
              dto.matchCriteria,
            );

    if (dto.matchCriteria !== undefined) {
      this.recruitmentScoringService.validateMatchCriteria(normalizedCriteria);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        await this.recruitmentRepository.updateJobOpening(
          currentUser.tenantId,
          jobOpeningId,
          {
            ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
            ...(dto.code !== undefined
              ? { code: dto.code?.trim().toUpperCase() ?? null }
              : {}),
            ...(dto.description !== undefined
              ? { description: dto.description?.trim() ?? null }
              : {}),
            ...(dto.status !== undefined ? { status: dto.status } : {}),
            ...(dto.matchCriteria !== undefined
              ? {
                  matchCriteria:
                    normalizedCriteria === null
                      ? Prisma.DbNull
                      : (normalizedCriteria as unknown as Prisma.InputJsonValue),
                }
              : {}),
            updatedById: currentUser.userId,
          },
          tx,
        );

        await this.recalculateApplicationsForJobOpening(
          currentUser.tenantId,
          jobOpeningId,
          currentUser.userId,
          tx,
        );
      });

      return this.findJobOpeningById(currentUser.tenantId, jobOpeningId);
    } catch (error) {
      handleRecruitmentWriteError(error, 'Job opening');
    }
  }

  async findCandidates(tenantId: string, query: CandidateQueryDto) {
    const { items, total } = await this.recruitmentRepository.findCandidates(
      tenantId,
      query,
    );
    return {
      items: items.map((item) => this.mapCandidate(item)),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
      filters: {
        search: query.search ?? null,
        currentStatus: query.currentStatus ?? null,
        source: query.source ?? null,
        skill: query.skill ?? null,
        city: query.city ?? null,
      },
    };
  }

  async findCandidateById(tenantId: string, candidateId: string) {
    const candidate = await this.recruitmentRepository.findCandidateById(
      tenantId,
      candidateId,
    );
    if (!candidate) {
      throw new NotFoundException('Candidate was not found for this tenant.');
    }
    return this.mapCandidate(candidate);
  }

  async createCandidate(
    currentUser: AuthenticatedUser,
    dto: CreateCandidateDto,
  ) {
    this.validateCandidateNestedRecords(
      dto.educationRecords,
      dto.experienceRecords,
    );
    const geo = await this.resolveCandidateGeo(dto);

    const identityResolution =
      await this.candidateIdentityResolutionService.resolveCandidate(
        currentUser.tenantId,
        {
          firstName: dto.firstName,
          lastName: dto.lastName,
          email: dto.email,
          personalEmail: dto.personalEmail,
          phone: dto.phone,
          alternatePhone: dto.alternatePhone,
          linkedInUrl: dto.linkedInUrl,
        },
      );
    if (identityResolution.resolution === 'ambiguous') {
      throw new BadRequestException(
        'Multiple possible existing candidates were found. Please review and choose a profile before attaching this resume.',
      );
    }
    try {
      const candidate = await this.prisma.$transaction(async (tx) => {
        const resolvedCandidateId = identityResolution.candidateId;
        const created =
          identityResolution.resolution === 'existing_exact' ||
          identityResolution.resolution === 'existing_probable'
            ? await this.hydrateExistingCandidateFromCreateDto(
                currentUser,
                resolvedCandidateId!,
                dto,
                geo,
                tx,
              )
            : await this.recruitmentRepository.createCandidate(
                {
                  tenantId: currentUser.tenantId,
                  firstName: dto.firstName.trim(),
                  middleName: dto.middleName?.trim(),
                  lastName: dto.lastName.trim(),
                  email: normalizeEmail(dto.email),
                  personalEmail: dto.personalEmail
                    ? normalizeEmail(dto.personalEmail)
                    : undefined,
                  phone: dto.phone.trim(),
                  alternatePhone: dto.alternatePhone?.trim(),
                  source: dto.source?.trim(),
                  currentStatus: dto.currentStatus ?? 'APPLIED',
                  gender: dto.gender,
                  dateOfBirth: dto.dateOfBirth
                    ? new Date(dto.dateOfBirth)
                    : undefined,
                  nationalityCountryId: dto.nationalityCountryId,
                  nationality: geo.nationality ?? undefined,
                  currentCountryId: dto.currentCountryId,
                  currentStateProvinceId: dto.currentStateProvinceId,
                  currentCityId: dto.currentCityId,
                  currentCountry: geo.country ?? undefined,
                  currentStateProvince: geo.stateProvince ?? undefined,
                  currentCity: geo.city ?? undefined,
                  addressArea: dto.addressArea?.trim(),
                  profileSummary: dto.profileSummary?.trim(),
                  currentEmployer: dto.currentEmployer?.trim(),
                  currentDesignation: dto.currentDesignation?.trim(),
                  totalYearsExperience: toDecimal(dto.totalYearsExperience),
                  relevantYearsExperience: toDecimal(
                    dto.relevantYearsExperience,
                  ),
                  currentSalary: toDecimal(dto.currentSalary),
                  expectedSalary: toDecimal(dto.expectedSalary),
                  noticePeriodDays: dto.noticePeriodDays,
                  earliestJoiningDate: dto.earliestJoiningDate
                    ? new Date(dto.earliestJoiningDate)
                    : undefined,
                  reasonForLeavingCurrentEmployer:
                    dto.reasonForLeavingCurrentEmployer?.trim(),
                  preferredWorkMode: dto.preferredWorkMode,
                  preferredLocation: dto.preferredLocation?.trim(),
                  willingToRelocate: dto.willingToRelocate,
                  skills: toJson(dto.skills),
                  certifications: toJson(dto.certifications),
                  portfolioUrl: dto.portfolioUrl?.trim(),
                  linkedInUrl: dto.linkedInUrl?.trim(),
                  otherProfileUrl: dto.otherProfileUrl?.trim(),
                  interests: toJson(dto.interests),
                  hobbies: toJson(dto.hobbies),
                  strengths: toJson(dto.strengths),
                  concerns: dto.concerns?.trim(),
                  recruiterNotes: dto.recruiterNotes?.trim(),
                  hrNotes: dto.hrNotes?.trim(),
                  resumeDocumentReference: dto.resumeDocumentReference?.trim(),
                  createdById: currentUser.userId,
                  updatedById: currentUser.userId,
                },
                tx,
              );

        await this.candidateIdentityResolutionService.syncIdentities({
          tenantId: currentUser.tenantId,
          candidateId: created.id,
          signals: {
            email: dto.email,
            personalEmail: dto.personalEmail,
            phone: dto.phone,
            alternatePhone: dto.alternatePhone,
            linkedInUrl: dto.linkedInUrl,
          },
          actorUserId: currentUser.userId,
          tx,
        });

        await this.replaceCandidateNestedRecords(
          currentUser,
          created.id,
          dto.educationRecords,
          dto.experienceRecords,
          tx,
        );
        return created;
      });
      return this.mapCandidate(candidate);
    } catch (error) {
      handleRecruitmentWriteError(error, 'Candidate');
    }
  }

  async updateCandidate(
    currentUser: AuthenticatedUser,
    candidateId: string,
    dto: UpdateCandidateDto,
  ) {
    const existing = await this.recruitmentRepository.findCandidateById(
      currentUser.tenantId,
      candidateId,
    );
    if (!existing) {
      throw new NotFoundException('Candidate was not found for this tenant.');
    }

    this.validateCandidateNestedRecords(
      dto.educationRecords,
      dto.experienceRecords,
    );
    const geo = await this.resolveCandidateGeo(dto);
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.createCandidateHistorySnapshot({
          tenantId: currentUser.tenantId,
          candidate: existing,
          reason: 'PROFILE_UPDATE',
          actorUserId: currentUser.userId,
          tx,
        });

        await this.recruitmentRepository.updateCandidate(
          currentUser.tenantId,
          candidateId,
          {
            ...(dto.firstName !== undefined
              ? { firstName: dto.firstName.trim() }
              : {}),
            ...(dto.middleName !== undefined
              ? { middleName: dto.middleName?.trim() ?? null }
              : {}),
            ...(dto.lastName !== undefined
              ? { lastName: dto.lastName.trim() }
              : {}),
            ...(dto.email !== undefined
              ? { email: normalizeEmail(dto.email) }
              : {}),
            ...(dto.personalEmail !== undefined
              ? {
                  personalEmail: dto.personalEmail
                    ? normalizeEmail(dto.personalEmail)
                    : null,
                }
              : {}),
            ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
            ...(dto.alternatePhone !== undefined
              ? { alternatePhone: dto.alternatePhone?.trim() ?? null }
              : {}),
            ...(dto.source !== undefined
              ? { source: dto.source?.trim() ?? null }
              : {}),
            ...(dto.currentStatus !== undefined
              ? { currentStatus: dto.currentStatus }
              : {}),
            ...(dto.gender !== undefined ? { gender: dto.gender ?? null } : {}),
            ...(dto.dateOfBirth !== undefined
              ? {
                  dateOfBirth: dto.dateOfBirth
                    ? new Date(dto.dateOfBirth)
                    : null,
                }
              : {}),
            ...(dto.nationalityCountryId !== undefined
              ? {
                  nationalityCountryId: dto.nationalityCountryId ?? null,
                  nationality: geo.nationality ?? null,
                }
              : {}),
            ...(dto.currentCountryId !== undefined
              ? {
                  currentCountryId: dto.currentCountryId ?? null,
                  currentCountry: geo.country ?? null,
                }
              : {}),
            ...(dto.currentStateProvinceId !== undefined
              ? {
                  currentStateProvinceId: dto.currentStateProvinceId ?? null,
                  currentStateProvince: geo.stateProvince ?? null,
                }
              : {}),
            ...(dto.currentCityId !== undefined
              ? {
                  currentCityId: dto.currentCityId ?? null,
                  currentCity: geo.city ?? null,
                }
              : {}),
            ...(dto.addressArea !== undefined
              ? { addressArea: dto.addressArea?.trim() ?? null }
              : {}),
            ...(dto.profileSummary !== undefined
              ? { profileSummary: dto.profileSummary?.trim() ?? null }
              : {}),
            ...(dto.currentEmployer !== undefined
              ? { currentEmployer: dto.currentEmployer?.trim() ?? null }
              : {}),
            ...(dto.currentDesignation !== undefined
              ? { currentDesignation: dto.currentDesignation?.trim() ?? null }
              : {}),
            ...(dto.totalYearsExperience !== undefined
              ? {
                  totalYearsExperience: nullableDecimal(
                    dto.totalYearsExperience,
                  ),
                }
              : {}),
            ...(dto.relevantYearsExperience !== undefined
              ? {
                  relevantYearsExperience: nullableDecimal(
                    dto.relevantYearsExperience,
                  ),
                }
              : {}),
            ...(dto.currentSalary !== undefined
              ? { currentSalary: nullableDecimal(dto.currentSalary) }
              : {}),
            ...(dto.expectedSalary !== undefined
              ? { expectedSalary: nullableDecimal(dto.expectedSalary) }
              : {}),
            ...(dto.noticePeriodDays !== undefined
              ? { noticePeriodDays: dto.noticePeriodDays ?? null }
              : {}),
            ...(dto.earliestJoiningDate !== undefined
              ? {
                  earliestJoiningDate: dto.earliestJoiningDate
                    ? new Date(dto.earliestJoiningDate)
                    : null,
                }
              : {}),
            ...(dto.reasonForLeavingCurrentEmployer !== undefined
              ? {
                  reasonForLeavingCurrentEmployer:
                    dto.reasonForLeavingCurrentEmployer?.trim() ?? null,
                }
              : {}),
            ...(dto.preferredWorkMode !== undefined
              ? { preferredWorkMode: dto.preferredWorkMode ?? null }
              : {}),
            ...(dto.preferredLocation !== undefined
              ? { preferredLocation: dto.preferredLocation?.trim() ?? null }
              : {}),
            ...(dto.willingToRelocate !== undefined
              ? { willingToRelocate: dto.willingToRelocate }
              : {}),
            ...(dto.skills !== undefined ? { skills: toJson(dto.skills) } : {}),
            ...(dto.certifications !== undefined
              ? { certifications: toJson(dto.certifications) }
              : {}),
            ...(dto.portfolioUrl !== undefined
              ? { portfolioUrl: dto.portfolioUrl?.trim() ?? null }
              : {}),
            ...(dto.linkedInUrl !== undefined
              ? { linkedInUrl: dto.linkedInUrl?.trim() ?? null }
              : {}),
            ...(dto.otherProfileUrl !== undefined
              ? { otherProfileUrl: dto.otherProfileUrl?.trim() ?? null }
              : {}),
            ...(dto.interests !== undefined
              ? { interests: toJson(dto.interests) }
              : {}),
            ...(dto.hobbies !== undefined
              ? { hobbies: toJson(dto.hobbies) }
              : {}),
            ...(dto.strengths !== undefined
              ? { strengths: toJson(dto.strengths) }
              : {}),
            ...(dto.concerns !== undefined
              ? { concerns: dto.concerns?.trim() ?? null }
              : {}),
            ...(dto.recruiterNotes !== undefined
              ? { recruiterNotes: dto.recruiterNotes?.trim() ?? null }
              : {}),
            ...(dto.hrNotes !== undefined
              ? { hrNotes: dto.hrNotes?.trim() ?? null }
              : {}),
            ...(dto.resumeDocumentReference !== undefined
              ? {
                  resumeDocumentReference:
                    dto.resumeDocumentReference?.trim() ?? null,
                }
              : {}),
            updatedById: currentUser.userId,
          },
          tx,
        );

        if (
          dto.educationRecords !== undefined ||
          dto.experienceRecords !== undefined
        ) {
          await this.replaceCandidateNestedRecords(
            currentUser,
            candidateId,
            dto.educationRecords,
            dto.experienceRecords,
            tx,
          );
        }

        await this.candidateIdentityResolutionService.syncIdentities({
          tenantId: currentUser.tenantId,
          candidateId,
          signals: {
            email: dto.email ?? existing.email,
            personalEmail: dto.personalEmail ?? existing.personalEmail,
            phone: dto.phone ?? existing.phone,
            alternatePhone: dto.alternatePhone ?? existing.alternatePhone,
            linkedInUrl: dto.linkedInUrl ?? existing.linkedInUrl,
          },
          actorUserId: currentUser.userId,
          tx,
        });

        await this.recalculateApplicationsForCandidate(
          currentUser.tenantId,
          candidateId,
          currentUser.userId,
          tx,
        );
      });

      return this.findCandidateById(currentUser.tenantId, candidateId);
    } catch (error) {
      handleRecruitmentWriteError(error, 'Candidate');
    }
  }

  async registerCandidateDocument(
    currentUser: AuthenticatedUser,
    candidateId: string,
    dto: RegisterCandidateDocumentDto,
  ) {
    const candidate = await this.recruitmentRepository.findCandidateById(
      currentUser.tenantId,
      candidateId,
    );
    if (!candidate) {
      throw new NotFoundException('Candidate was not found for this tenant.');
    }

    const isResumeKind =
      (dto.kind?.trim().toLowerCase() ?? 'resume') === 'resume';
    const storageKey = dto.storageKey?.trim();
    const checksumSha256 = storageKey
      ? createHash('sha256').update(storageKey).digest('hex')
      : undefined;

    await this.prisma.$transaction(async (tx) => {
      if (isResumeKind) {
        await this.createCandidateHistorySnapshot({
          tenantId: currentUser.tenantId,
          candidate,
          reason: 'REUPLOAD',
          actorUserId: currentUser.userId,
          sourceChannel:
            dto.sourceChannel?.trim() ?? candidate.source ?? 'manual_upload',
          tx,
        });
      }

      if (isResumeKind) {
        await this.recruitmentRepository.updateManyDocumentReferences(
          currentUser.tenantId,
          candidateId,
          { isLatestResume: false, updatedById: currentUser.userId },
          tx,
        );
      }

      const document = await this.recruitmentRepository.createDocumentReference(
        {
          tenantId: currentUser.tenantId,
          ownerType: 'CANDIDATE',
          name: dto.name.trim(),
          kind: dto.kind?.trim().toLowerCase() ?? 'resume',
          fileName: dto.fileName.trim(),
          contentType: dto.contentType?.trim(),
          fileSizeBytes: dto.fileSizeBytes,
          storageKey,
          uploadedAt: new Date(),
          candidateId,
          isResume: isResumeKind,
          isLatestResume: isResumeKind,
          isPrimaryResume:
            Boolean(dto.isPrimaryResume) ||
            (!candidate.resumeDocumentId && isResumeKind),
          sourceChannel:
            dto.sourceChannel?.trim() ?? candidate.source ?? 'manual_upload',
          checksumSha256,
          parserVersion: dto.parserVersion?.trim(),
          parsingStatus: parseDocumentParsingStatus(dto.parsingStatus),
          extractionConfidence: dto.extractionConfidence
            ? new Prisma.Decimal(dto.extractionConfidence)
            : undefined,
          parsingWarnings: dto.parsingWarnings
            ? (dto.parsingWarnings as Prisma.InputJsonValue)
            : undefined,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      if (
        isResumeKind &&
        (dto.isPrimaryResume || !candidate.resumeDocumentId)
      ) {
        await this.recruitmentRepository.updateManyDocumentReferences(
          currentUser.tenantId,
          candidateId,
          { isPrimaryResume: false, updatedById: currentUser.userId },
          tx,
        );
        await this.recruitmentRepository.updateDocumentReference(
          currentUser.tenantId,
          document.id,
          { isPrimaryResume: true, updatedById: currentUser.userId },
          tx,
        );
      }

      if (isResumeKind) {
        await this.recruitmentRepository.updateCandidate(
          currentUser.tenantId,
          candidateId,
          {
            latestResumeDocumentId: document.id,
            ...(dto.isPrimaryResume || !candidate.resumeDocumentId
              ? { resumeDocumentId: document.id }
              : {}),
            resumeDocumentReference: document.storageKey ?? document.fileName,
            updatedById: currentUser.userId,
          },
          tx,
        );
      }
    });

    return this.findCandidateById(currentUser.tenantId, candidateId);
  }

  async parseUploadedResumeDraft(
    currentUser: AuthenticatedUser,
    file: UploadedResumeFile | undefined,
  ) {
    const recruitmentSettings =
      await this.tenantSettingsResolverService.getRecruitmentSettings(
        currentUser.tenantId,
      );
    if (!recruitmentSettings.resumeParsingEnabled) {
      throw new BadRequestException(
        'Resume parsing is disabled in tenant recruitment settings.',
      );
    }

    if (!file || !file.buffer || file.size <= 0) {
      throw new BadRequestException(
        'Please upload a valid PDF or DOCX resume file.',
      );
    }
    return this.documentParsingService.extractAndParseUploadedResume(file);
  }

  async triggerCandidateDocumentParsing(
    currentUser: AuthenticatedUser,
    candidateId: string,
    documentId: string,
    dto: TriggerDocumentParseDto,
  ) {
    const candidate = await this.recruitmentRepository.findCandidateById(
      currentUser.tenantId,
      candidateId,
    );
    if (!candidate) {
      throw new NotFoundException('Candidate was not found for this tenant.');
    }

    const document = await this.recruitmentRepository.findDocumentReferenceById(
      currentUser.tenantId,
      documentId,
    );
    if (!document || document.candidateId !== candidateId) {
      throw new BadRequestException(
        'Selected document does not belong to this candidate.',
      );
    }

    const parsingJob = await this.recruitmentRepository.createParsingJob({
      ...this.documentParsingService.buildQueuedJob({
        tenantId: currentUser.tenantId,
        candidateId,
        documentReferenceId: documentId,
        parserKey: dto.parserKey,
        requestedById: currentUser.userId,
      }),
      status: 'SUCCEEDED',
      queuedAt: new Date(),
      startedAt: new Date(),
      completedAt: new Date(),
      resultMetadata: this.documentParsingService.buildParsedCandidateResult({
        fileName: document.fileName,
        candidate: {
          firstName: candidate.firstName,
          middleName: candidate.middleName,
          lastName: candidate.lastName,
          email: candidate.email,
          phone: candidate.phone,
          source: candidate.source,
        },
      }) as Prisma.InputJsonValue,
    });

    const extractionConfidence =
      typeof (parsingJob.resultMetadata as { extractionConfidence?: unknown })
        ?.extractionConfidence === 'number'
        ? (parsingJob.resultMetadata as { extractionConfidence: number })
            .extractionConfidence
        : null;
    const warnings = Array.isArray(
      (parsingJob.resultMetadata as { warnings?: unknown })?.warnings,
    )
      ? (parsingJob.resultMetadata as { warnings: unknown[] }).warnings.filter(
          (item): item is string => typeof item === 'string',
        )
      : [];

    await this.recruitmentRepository.updateDocumentReference(
      currentUser.tenantId,
      documentId,
      {
        parserVersion:
          (parsingJob.resultMetadata as { parserVersion?: string })
            ?.parserVersion ?? null,
        parsingStatus: 'SUCCEEDED',
        parsedAt: new Date(),
        extractionConfidence:
          extractionConfidence === null
            ? null
            : new Prisma.Decimal(extractionConfidence),
        parsingWarnings: warnings as unknown as Prisma.InputJsonValue,
        updatedById: currentUser.userId,
      },
    );

    return {
      id: parsingJob.id,
      status: parsingJob.status,
      parserKey: parsingJob.parserKey,
      requestedAt: parsingJob.requestedAt,
      completedAt: parsingJob.completedAt,
      resultMetadata: parsingJob.resultMetadata,
      documentReference: {
        id: parsingJob.documentReference.id,
        name: parsingJob.documentReference.name,
        fileName: parsingJob.documentReference.fileName,
        kind: parsingJob.documentReference.kind,
      },
      message: 'Resume parsing completed with a provider-neutral review draft.',
    };
  }

  async openCandidateDocumentForView(
    tenantId: string,
    candidateId: string,
    documentId: string,
  ) {
    const document = await this.recruitmentRepository.findDocumentReferenceById(
      tenantId,
      documentId,
    );
    if (
      !document ||
      document.candidateId !== candidateId ||
      !document.storageKey
    ) {
      throw new NotFoundException(
        'Candidate document was not found for this tenant.',
      );
    }

    if (isAbsoluteHttpUrl(document.storageKey)) {
      return {
        document,
        redirectUrl: document.storageKey,
        file: null,
      };
    }

    return {
      document,
      file: await this.storageService.openFile(document.storageKey),
      redirectUrl: null,
    };
  }

  async openCandidateDocumentForDownload(
    tenantId: string,
    candidateId: string,
    documentId: string,
  ) {
    return this.openCandidateDocumentForView(tenantId, candidateId, documentId);
  }

  async findApplications(tenantId: string, query: ApplicationQueryDto) {
    const { items, total } = await this.recruitmentRepository.findApplications(
      tenantId,
      query,
    );
    return {
      items: items.map((item) => this.mapApplication(item)),
      meta: buildPaginationMeta(query.page, query.pageSize, total),
      filters: {
        search: query.search ?? null,
        stage: query.stage ?? null,
        candidateId: query.candidateId ?? null,
        jobOpeningId: query.jobOpeningId ?? null,
        rejectionReason: query.rejectionReason ?? null,
      },
    };
  }

  async findApplicationById(tenantId: string, applicationId: string) {
    const application = await this.recruitmentRepository.findApplicationById(
      tenantId,
      applicationId,
    );
    if (!application) {
      throw new NotFoundException('Application was not found for this tenant.');
    }
    return this.mapApplication(application);
  }

  async submitApplication(
    currentUser: AuthenticatedUser,
    dto: SubmitApplicationDto,
  ) {
    const [candidate, jobOpening] = await Promise.all([
      this.recruitmentRepository.findCandidateById(
        currentUser.tenantId,
        dto.candidateId,
      ),
      this.recruitmentRepository.findJobOpeningById(
        currentUser.tenantId,
        dto.jobOpeningId,
      ),
    ]);
    if (!candidate) {
      throw new BadRequestException(
        'Selected candidate does not belong to this tenant.',
      );
    }
    if (!jobOpening) {
      throw new BadRequestException(
        'Selected job opening does not belong to this tenant.',
      );
    }
    if (!['DRAFT', 'OPEN', 'ON_HOLD'].includes(jobOpening.status)) {
      throw new BadRequestException(
        'Applications can only be submitted to active job openings.',
      );
    }

    const existing =
      await this.recruitmentRepository.findApplicationByCandidateAndJob(
        currentUser.tenantId,
        dto.candidateId,
        dto.jobOpeningId,
      );

    const scoring = this.recruitmentScoringService.calculateMatch(
      {
        id: candidate.id,
        skills: arr(candidate.skills),
        totalYearsExperience: num(candidate.totalYearsExperience),
        educationRecords: candidate.educationRecords.map((record) => ({
          degreeTitle: record.degreeTitle,
          fieldOfStudy: record.fieldOfStudy,
        })),
        currentCity: candidate.currentCity,
        currentCountry: candidate.currentCountry,
        preferredLocation: candidate.preferredLocation,
        willingToRelocate: candidate.willingToRelocate,
        noticePeriodDays: candidate.noticePeriodDays,
        preferredWorkMode: candidate.preferredWorkMode,
      },
      { id: jobOpening.id, matchCriteria: jobOpening.matchCriteria },
    );

    const application = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await this.createApplicationHistorySnapshot({
          tenantId: currentUser.tenantId,
          application: existing,
          reason: 'REAPPLY',
          actorUserId: currentUser.userId,
          tx,
        });

        await this.recruitmentRepository.updateApplication(
          currentUser.tenantId,
          existing.id,
          {
            stage: 'APPLIED',
            notes: dto.notes?.trim(),
            rejectionReason: null,
            rejectedAt: null,
            movedAt: new Date(),
            appliedAt: new Date(),
            matchScore: scoring.matchScore,
            matchBreakdown:
              scoring.matchBreakdown === null
                ? Prisma.DbNull
                : (scoring.matchBreakdown as unknown as Prisma.InputJsonValue),
            updatedById: currentUser.userId,
          },
          tx,
        );

        await this.recruitmentRepository.createApplicationStageHistory(
          {
            tenantId: currentUser.tenantId,
            applicationId: existing.id,
            fromStage: existing.stage,
            toStage: 'APPLIED',
            note: dto.notes?.trim() ?? 'Candidate reapplied to this opening.',
            changedByUserId: currentUser.userId,
            createdById: currentUser.userId,
            updatedById: currentUser.userId,
          },
          tx,
        );

        await this.recruitmentRepository.updateCandidate(
          currentUser.tenantId,
          dto.candidateId,
          { currentStatus: 'APPLIED', updatedById: currentUser.userId },
          tx,
        );

        const refreshed = await this.recruitmentRepository.findApplicationById(
          currentUser.tenantId,
          existing.id,
          tx,
        );
        if (!refreshed) {
          throw new NotFoundException(
            'Application was not found for this tenant.',
          );
        }
        return refreshed;
      }

      const created = await this.recruitmentRepository.createApplication(
        {
          tenantId: currentUser.tenantId,
          candidateId: dto.candidateId,
          jobOpeningId: dto.jobOpeningId,
          stage: 'APPLIED',
          notes: dto.notes?.trim(),
          movedAt: new Date(),
          matchScore: scoring.matchScore,
          matchBreakdown:
            scoring.matchBreakdown === null
              ? Prisma.DbNull
              : (scoring.matchBreakdown as unknown as Prisma.InputJsonValue),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      await this.recruitmentRepository.createApplicationStageHistory(
        {
          tenantId: currentUser.tenantId,
          applicationId: created.id,
          fromStage: null,
          toStage: 'APPLIED',
          note: dto.notes?.trim(),
          changedByUserId: currentUser.userId,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      await this.recruitmentRepository.updateCandidate(
        currentUser.tenantId,
        dto.candidateId,
        { currentStatus: 'APPLIED', updatedById: currentUser.userId },
        tx,
      );

      return created;
    });

    return this.mapApplication(application);
  }

  async moveApplicationStage(
    currentUser: AuthenticatedUser,
    applicationId: string,
    dto: MoveApplicationStageDto,
  ) {
    const application = await this.recruitmentRepository.findApplicationById(
      currentUser.tenantId,
      applicationId,
    );
    if (!application) {
      throw new NotFoundException('Application was not found for this tenant.');
    }
    if (application.stage === dto.stage) {
      if (dto.stage === 'HIRED') {
        await this.prisma.$transaction(async (tx) => {
          await this.ensureDraftEmployeeForHiredApplication({
            tenantId: currentUser.tenantId,
            application,
            actorUserId: currentUser.userId,
            tx,
          });
        });
        return this.findApplicationById(currentUser.tenantId, applicationId);
      }
      throw new BadRequestException(
        'Application is already in the requested stage.',
      );
    }

    const recruitmentSettings =
      await this.tenantSettingsResolverService.getRecruitmentSettings(
        currentUser.tenantId,
      );
    const configuredStages = recruitmentSettings.candidateStages
      .map((item) => parseRecruitmentStageFromConfig(item))
      .filter((item): item is RecruitmentStage => item !== null);

    if (configuredStages.length > 0 && !configuredStages.includes(dto.stage)) {
      throw new BadRequestException(
        `Stage ${dto.stage} is disabled in tenant recruitment pipeline settings.`,
      );
    }

    validateStageTransition(application.stage, dto.stage);

    if (dto.stage === 'REJECTED' && !dto.rejectionReason?.trim()) {
      throw new BadRequestException(
        'A rejection reason is required when rejecting an application.',
      );
    }

    await this.prisma.$transaction(async (tx) => {
      await this.createApplicationHistorySnapshot({
        tenantId: currentUser.tenantId,
        application,
        reason: 'STAGE_CHANGE',
        actorUserId: currentUser.userId,
        tx,
      });

      await this.recruitmentRepository.updateApplication(
        currentUser.tenantId,
        applicationId,
        {
          stage: dto.stage,
          notes: dto.notes?.trim() ?? application.notes,
          rejectionReason:
            dto.stage === 'REJECTED'
              ? dto.rejectionReason?.trim()
              : dto.rejectionReason !== undefined
                ? (dto.rejectionReason?.trim() ?? null)
                : application.rejectionReason,
          rejectedAt: dto.stage === 'REJECTED' ? new Date() : null,
          movedAt: new Date(),
          updatedById: currentUser.userId,
        },
        tx,
      );

      await this.recruitmentRepository.createApplicationStageHistory(
        {
          tenantId: currentUser.tenantId,
          applicationId,
          fromStage: application.stage,
          toStage: dto.stage,
          note: dto.notes?.trim() ?? dto.rejectionReason?.trim(),
          changedByUserId: currentUser.userId,
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        },
        tx,
      );

      await this.recruitmentRepository.updateCandidate(
        currentUser.tenantId,
        application.candidateId,
        { currentStatus: dto.stage, updatedById: currentUser.userId },
        tx,
      );

      if (dto.stage === 'HIRED') {
        await this.ensureDraftEmployeeForHiredApplication({
          tenantId: currentUser.tenantId,
          application,
          actorUserId: currentUser.userId,
          tx,
        });
      }
    });

    return this.findApplicationById(currentUser.tenantId, applicationId);
  }

  async createApplicationEvaluation(
    currentUser: AuthenticatedUser,
    applicationId: string,
    dto: UpsertCandidateEvaluationDto,
  ) {
    const application = await this.recruitmentRepository.findApplicationById(
      currentUser.tenantId,
      applicationId,
    );
    if (!application) {
      throw new NotFoundException('Application was not found for this tenant.');
    }

    await this.recruitmentRepository.createCandidateEvaluation({
      tenantId: currentUser.tenantId,
      candidateId: application.candidateId,
      applicationId,
      interviewRound: dto.interviewRound ?? application.evaluations.length + 1,
      interviewDate: dto.interviewDate
        ? new Date(dto.interviewDate)
        : undefined,
      interviewerUserId: dto.interviewerUserId,
      currentSalary: toDecimal(dto.currentSalary),
      expectedSalary: toDecimal(dto.expectedSalary),
      joiningAvailabilityDays: dto.joiningAvailabilityDays,
      cityOfResidence: dto.cityOfResidence?.trim(),
      countryOfResidence: dto.countryOfResidence?.trim(),
      interests: dto.interests?.trim(),
      hobbies: dto.hobbies?.trim(),
      reasonForLeaving: dto.reasonForLeaving?.trim(),
      technicalScore: dto.technicalScore,
      communicationScore: dto.communicationScore,
      cultureFitScore: dto.cultureFitScore,
      interviewOutcome: dto.interviewOutcome?.trim(),
      overallRecommendation: dto.overallRecommendation?.trim(),
      concerns: dto.concerns?.trim(),
      followUpNotes: dto.followUpNotes?.trim(),
      notes: dto.notes?.trim(),
      createdById: currentUser.userId,
      updatedById: currentUser.userId,
    });

    await this.createApplicationHistorySnapshot({
      tenantId: currentUser.tenantId,
      application,
      reason: 'MANUAL_EDIT',
      actorUserId: currentUser.userId,
      tx: this.prisma,
    });

    await this.recruitmentRepository.updateApplication(
      currentUser.tenantId,
      applicationId,
      {
        latestEvaluationSummary:
          [dto.overallRecommendation, dto.interviewOutcome, dto.notes]
            .filter(Boolean)
            .join(' • ') || null,
        updatedById: currentUser.userId,
      },
    );

    return this.findApplicationById(currentUser.tenantId, applicationId);
  }

  private mapJobOpening(jobOpening: JobOpeningWithRelations) {
    return {
      ...jobOpening,
      matchCriteria: this.recruitmentScoringService.normalizeMatchCriteria(
        jobOpening.matchCriteria,
      ),
      applications: jobOpening.applications.map((application) =>
        this.mapApplication(application),
      ),
    };
  }

  private mapCandidate(candidate: CandidateWithRelations) {
    const mappedDocuments = candidate.documents.map((document) => ({
      ...document,
      viewPath: document.storageKey
        ? `/api/candidates/${candidate.id}/documents/${document.id}/view`
        : null,
      downloadPath: document.storageKey
        ? `/api/candidates/${candidate.id}/documents/${document.id}/download`
        : null,
    }));

    return {
      ...candidate,
      fullName: [candidate.firstName, candidate.middleName, candidate.lastName]
        .filter(Boolean)
        .join(' '),
      totalYearsExperience: num(candidate.totalYearsExperience),
      relevantYearsExperience: num(candidate.relevantYearsExperience),
      currentSalary: num(candidate.currentSalary),
      expectedSalary: num(candidate.expectedSalary),
      skills: arr(candidate.skills),
      certifications: arr(candidate.certifications),
      interests: arr(candidate.interests),
      hobbies: arr(candidate.hobbies),
      strengths: arr(candidate.strengths),
      documents: mappedDocuments,
      resumeDocument: candidate.resumeDocument
        ? {
            ...candidate.resumeDocument,
            viewPath: candidate.resumeDocument.storageKey
              ? `/api/candidates/${candidate.id}/documents/${candidate.resumeDocument.id}/view`
              : null,
            downloadPath: candidate.resumeDocument.storageKey
              ? `/api/candidates/${candidate.id}/documents/${candidate.resumeDocument.id}/download`
              : null,
          }
        : null,
      latestResumeDocument: candidate.latestResumeDocument
        ? {
            ...candidate.latestResumeDocument,
            viewPath: candidate.latestResumeDocument.storageKey
              ? `/api/candidates/${candidate.id}/documents/${candidate.latestResumeDocument.id}/view`
              : null,
            downloadPath: candidate.latestResumeDocument.storageKey
              ? `/api/candidates/${candidate.id}/documents/${candidate.latestResumeDocument.id}/download`
              : null,
          }
        : null,
      identities: candidate.identities,
      educationRecords: candidate.educationRecords.map((record) => ({
        ...record,
      })),
      experienceRecords: candidate.experienceRecords.map((record) => ({
        ...record,
        finalSalary: num(record.finalSalary),
      })),
      evaluations: candidate.evaluations.map((evaluation) => ({
        ...evaluation,
        currentSalary: num(evaluation.currentSalary),
        expectedSalary: num(evaluation.expectedSalary),
      })),
      applications: candidate.applications.map((application) =>
        this.mapApplication(application),
      ),
    };
  }

  private mapApplication(
    application: ApplicationWithRelations | ApplicationSummaryWithRelations,
  ) {
    return {
      ...application,
      matchBreakdown: parseMatchBreakdown(application.matchBreakdown),
      candidate: {
        ...application.candidate,
        fullName: [
          application.candidate.firstName,
          application.candidate.middleName,
          application.candidate.lastName,
        ]
          .filter(Boolean)
          .join(' '),
        totalYearsExperience: num(application.candidate.totalYearsExperience),
      },
      jobOpening: {
        ...application.jobOpening,
        matchCriteria: this.recruitmentScoringService.normalizeMatchCriteria(
          application.jobOpening.matchCriteria,
        ),
      },
      draftEmployee: application.draftEmployee
        ? {
            id: application.draftEmployee.id,
            employeeCode: application.draftEmployee.employeeCode,
            firstName: application.draftEmployee.firstName,
            middleName: application.draftEmployee.middleName,
            lastName: application.draftEmployee.lastName,
            fullName: [
              application.draftEmployee.firstName,
              application.draftEmployee.middleName,
              application.draftEmployee.lastName,
            ]
              .filter(Boolean)
              .join(' '),
            isDraftProfile: application.draftEmployee.isDraftProfile,
            sourceCandidateId: application.draftEmployee.sourceCandidateId,
            sourceApplicationId: application.draftEmployee.sourceApplicationId,
            sourceJobOpeningId: application.draftEmployee.sourceJobOpeningId,
            createdAt: application.draftEmployee.createdAt,
            updatedAt: application.draftEmployee.updatedAt,
          }
        : null,
      historyRecords:
        'historyRecords' in application
          ? application.historyRecords.map((record) => ({
              ...record,
            }))
          : [],
    };
  }

  private async ensureDraftEmployeeForHiredApplication(params: {
    tenantId: string;
    application: ApplicationWithRelations | ApplicationSummaryWithRelations;
    actorUserId: string;
    tx: Prisma.TransactionClient;
  }) {
    const existing = await params.tx.employee.findFirst({
      where: {
        tenantId: params.tenantId,
        sourceApplicationId: params.application.id,
      },
      select: { id: true },
    });

    if (existing) {
      return existing.id;
    }

    const candidate = params.application.candidate;
    const employeeSettings =
      await this.tenantSettingsResolverService.getEmployeeSettings(
        params.tenantId,
      );
    const recruitmentSettings =
      await this.tenantSettingsResolverService.getRecruitmentSettings(
        params.tenantId,
      );

    if (
      employeeSettings.autoCreateDraftOnHire === false ||
      recruitmentSettings.autoCreateEmployeeFromCandidate === false
    ) {
      return null;
    }

    const prefix = employeeSettings.employeeIdPrefix.trim().toUpperCase();
    const sequenceLength = Math.max(
      1,
      Number(employeeSettings.employeeIdSequenceLength ?? 4),
    );
    const autoGenerateEmployeeId = employeeSettings.autoGenerateEmployeeId;
    const keepAsDraft =
      employeeSettings.keepEmployeeAsDraftUntilOnboardingComplete;
    const latestEmployee = await params.tx.employee.findFirst({
      where: { tenantId: params.tenantId },
      orderBy: [{ createdAt: 'desc' }],
      select: { employeeCode: true },
    });
    const nextNumber = Math.max(
      1,
      extractEmployeeSequence(
        latestEmployee?.employeeCode,
        prefix,
        sequenceLength,
      ) + 1,
    );

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const sequenceNumber = nextNumber + attempt;
      const generatedEmployeeCode = `${prefix}-${String(
        sequenceNumber,
      ).padStart(sequenceLength, '0')}`;

      try {
        const draft = await params.tx.employee.create({
          data: {
            tenantId: params.tenantId,
            employeeCode: autoGenerateEmployeeId
              ? (generatedEmployeeCode ?? '')
              : '',
            firstName: candidate.firstName,
            middleName: candidate.middleName,
            lastName: candidate.lastName,
            phone: candidate.phone?.trim() || 'pending',
            hireDate: new Date(),
            employmentStatus: mapEmployeeStatus(
              employeeSettings.defaultEmployeeStatus,
            ),
            employeeType: mapEmployeeType(
              employeeSettings.defaultEmploymentType,
            ),
            workMode: mapWorkMode(employeeSettings.defaultWorkMode),
            isDraftProfile: keepAsDraft,
            sourceCandidateId: params.application.candidateId,
            sourceApplicationId: params.application.id,
            sourceJobOpeningId: params.application.jobOpeningId,
            createdById: params.actorUserId,
            updatedById: params.actorUserId,
          },
          select: { id: true },
        });

        return draft.id;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join(',')
            : '';

          if (target.includes('sourceApplicationId')) {
            const winner = await params.tx.employee.findFirst({
              where: {
                tenantId: params.tenantId,
                sourceApplicationId: params.application.id,
              },
              select: { id: true },
            });

            if (winner) {
              return winner.id;
            }
          }

          if (autoGenerateEmployeeId && target.includes('employeeCode')) {
            continue;
          }
        }

        throw error;
      }
    }

    throw new ConflictException(
      'Unable to create employee draft after multiple retries. Please try again.',
    );
  }

  private async createCandidateHistorySnapshot(params: {
    tenantId: string;
    candidate: CandidateWithRelations;
    reason: CandidateHistoryReason;
    actorUserId: string;
    tx: Prisma.TransactionClient | PrismaService;
    sourceDocumentId?: string;
    sourceChannel?: string;
  }) {
    const snapshotVersion =
      (await this.recruitmentRepository.findLatestCandidateHistoryRevision(
        params.tenantId,
        params.candidate.id,
        params.tx,
      )) + 1;

    await this.recruitmentRepository.createCandidateHistory(
      {
        tenantId: params.tenantId,
        candidateId: params.candidate.id,
        snapshotVersion,
        snapshotReason: params.reason,
        snapshotTakenAt: new Date(),
        originalCreatedAt: params.candidate.createdAt,
        sourceDocumentId: params.sourceDocumentId,
        sourceChannel: params.sourceChannel ?? params.candidate.source ?? null,
        snapshotPayload: serializeJson(
          this.buildCandidateSnapshotPayload(params.candidate),
        ),
        createdById: params.actorUserId,
        updatedById: params.actorUserId,
      },
      params.tx,
    );
  }

  private async createApplicationHistorySnapshot(params: {
    tenantId: string;
    application: ApplicationWithRelations | ApplicationSummaryWithRelations;
    reason: ApplicationHistoryReason;
    actorUserId: string;
    tx: Prisma.TransactionClient | PrismaService;
  }) {
    const snapshotVersion =
      (await this.recruitmentRepository.findLatestApplicationHistoryRevision(
        params.tenantId,
        params.application.id,
        params.tx,
      )) + 1;

    await this.recruitmentRepository.createApplicationHistory(
      {
        tenantId: params.tenantId,
        applicationId: params.application.id,
        candidateId: params.application.candidateId,
        jobOpeningId: params.application.jobOpeningId,
        snapshotVersion,
        snapshotReason: params.reason,
        snapshotTakenAt: new Date(),
        originalAppliedAt: params.application.appliedAt,
        snapshotPayload: serializeJson(
          this.buildApplicationSnapshotPayload(params.application),
        ),
        createdById: params.actorUserId,
        updatedById: params.actorUserId,
      },
      params.tx,
    );
  }

  private buildCandidateSnapshotPayload(candidate: CandidateWithRelations) {
    return {
      candidate: {
        id: candidate.id,
        firstName: candidate.firstName,
        middleName: candidate.middleName,
        lastName: candidate.lastName,
        email: candidate.email,
        personalEmail: candidate.personalEmail,
        phone: candidate.phone,
        alternatePhone: candidate.alternatePhone,
        source: candidate.source,
        currentStatus: candidate.currentStatus,
        gender: candidate.gender,
        dateOfBirth: candidate.dateOfBirth,
        nationalityCountryId: candidate.nationalityCountryId,
        nationality: candidate.nationality,
        currentCountryId: candidate.currentCountryId,
        currentStateProvinceId: candidate.currentStateProvinceId,
        currentCityId: candidate.currentCityId,
        currentCountry: candidate.currentCountry,
        currentStateProvince: candidate.currentStateProvince,
        currentCity: candidate.currentCity,
        addressArea: candidate.addressArea,
        profileSummary: candidate.profileSummary,
        currentEmployer: candidate.currentEmployer,
        currentDesignation: candidate.currentDesignation,
        totalYearsExperience: num(candidate.totalYearsExperience),
        relevantYearsExperience: num(candidate.relevantYearsExperience),
        currentSalary: num(candidate.currentSalary),
        expectedSalary: num(candidate.expectedSalary),
        noticePeriodDays: candidate.noticePeriodDays,
        earliestJoiningDate: candidate.earliestJoiningDate,
        reasonForLeavingCurrentEmployer:
          candidate.reasonForLeavingCurrentEmployer,
        preferredWorkMode: candidate.preferredWorkMode,
        preferredLocation: candidate.preferredLocation,
        willingToRelocate: candidate.willingToRelocate,
        skills: arr(candidate.skills),
        certifications: arr(candidate.certifications),
        portfolioUrl: candidate.portfolioUrl,
        linkedInUrl: candidate.linkedInUrl,
        otherProfileUrl: candidate.otherProfileUrl,
        interests: arr(candidate.interests),
        hobbies: arr(candidate.hobbies),
        strengths: arr(candidate.strengths),
        concerns: candidate.concerns,
        recruiterNotes: candidate.recruiterNotes,
        hrNotes: candidate.hrNotes,
        resumeDocumentReference: candidate.resumeDocumentReference,
        resumeDocumentId: candidate.resumeDocumentId,
        latestResumeDocumentId: candidate.latestResumeDocumentId,
        createdAt: candidate.createdAt,
        updatedAt: candidate.updatedAt,
      },
      identities: candidate.identities.map((identity) => ({
        id: identity.id,
        type: identity.type,
        value: identity.value,
        normalizedValue: identity.normalizedValue,
        isPrimary: identity.isPrimary,
        source: identity.source,
        confidence: identity.confidence,
      })),
      educationRecords: candidate.educationRecords.map((record) => ({
        institutionName: record.institutionName,
        degreeTitle: record.degreeTitle,
        fieldOfStudy: record.fieldOfStudy,
        startDate: record.startDate,
        endDate: record.endDate,
        gradeOrCgpa: record.gradeOrCgpa,
        country: record.country,
        notes: record.notes,
      })),
      experienceRecords: candidate.experienceRecords.map((record) => ({
        companyName: record.companyName,
        designation: record.designation,
        location: record.location,
        employmentType: record.employmentType,
        startDate: record.startDate,
        endDate: record.endDate,
        responsibilities: record.responsibilities,
        finalSalary: num(record.finalSalary),
        reasonForLeaving: record.reasonForLeaving,
      })),
      documents: candidate.documents.map((document) => ({
        id: document.id,
        name: document.name,
        kind: document.kind,
        fileName: document.fileName,
        contentType: document.contentType,
        fileSizeBytes: document.fileSizeBytes,
        storageKey: document.storageKey,
        isResume: document.isResume,
        isPrimaryResume: document.isPrimaryResume,
        isLatestResume: document.isLatestResume,
        sourceChannel: document.sourceChannel,
        parserVersion: document.parserVersion,
        parsingStatus: document.parsingStatus,
        parsedAt: document.parsedAt,
        extractionConfidence: num(document.extractionConfidence),
        parsingWarnings: document.parsingWarnings,
        uploadedAt: document.uploadedAt,
      })),
    };
  }

  private buildApplicationSnapshotPayload(
    application: ApplicationWithRelations | ApplicationSummaryWithRelations,
  ) {
    return {
      application: {
        id: application.id,
        candidateId: application.candidateId,
        jobOpeningId: application.jobOpeningId,
        stage: application.stage,
        notes: application.notes,
        rejectionReason: application.rejectionReason,
        recruiterOwnerUserId: application.recruiterOwnerUserId,
        matchScore: application.matchScore,
        matchBreakdown: parseMatchBreakdown(application.matchBreakdown),
        latestEvaluationSummary: application.latestEvaluationSummary,
        rejectedAt: application.rejectedAt,
        appliedAt: application.appliedAt,
        movedAt: application.movedAt,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
      },
      stageHistory: application.stageHistory.map((record) => ({
        fromStage: record.fromStage,
        toStage: record.toStage,
        note: record.note,
        changedByUserId: record.changedByUserId,
        changedAt: record.changedAt,
      })),
      evaluations: application.evaluations.map((evaluation) => ({
        interviewRound: evaluation.interviewRound,
        interviewDate: evaluation.interviewDate,
        interviewerUserId: evaluation.interviewerUserId,
        technicalScore: evaluation.technicalScore,
        communicationScore: evaluation.communicationScore,
        cultureFitScore: evaluation.cultureFitScore,
        interviewOutcome: evaluation.interviewOutcome,
        overallRecommendation: evaluation.overallRecommendation,
        notes: evaluation.notes,
        createdAt: evaluation.createdAt,
      })),
      candidate: {
        id: application.candidate.id,
        firstName: application.candidate.firstName,
        middleName: application.candidate.middleName,
        lastName: application.candidate.lastName,
        email: application.candidate.email,
        phone: application.candidate.phone,
      },
      jobOpening: {
        id: application.jobOpening.id,
        title: application.jobOpening.title,
        code: application.jobOpening.code,
        status: application.jobOpening.status,
        matchCriteria: this.recruitmentScoringService.normalizeMatchCriteria(
          application.jobOpening.matchCriteria,
        ),
      },
    };
  }

  private async recalculateApplicationsForJobOpening(
    tenantId: string,
    jobOpeningId: string,
    updatedById: string,
    tx: Prisma.TransactionClient,
  ) {
    const applications =
      await this.recruitmentRepository.findApplicationsForJobOpeningScoring(
        tenantId,
        jobOpeningId,
        tx,
      );
    await this.recalculateAndPersistScores(
      applications,
      tenantId,
      updatedById,
      tx,
    );
  }

  private async recalculateApplicationsForCandidate(
    tenantId: string,
    candidateId: string,
    updatedById: string,
    tx: Prisma.TransactionClient,
  ) {
    const applications =
      await this.recruitmentRepository.findApplicationsForCandidateScoring(
        tenantId,
        candidateId,
        tx,
      );
    await this.recalculateAndPersistScores(
      applications,
      tenantId,
      updatedById,
      tx,
    );
  }

  private async recalculateAndPersistScores(
    applications: ApplicationForScoring[],
    tenantId: string,
    updatedById: string,
    tx: Prisma.TransactionClient,
  ) {
    await Promise.all(
      applications.map(async (application) => {
        const scoring = this.recruitmentScoringService.calculateMatch(
          {
            id: application.candidate.id,
            skills: arr(application.candidate.skills),
            totalYearsExperience: num(
              application.candidate.totalYearsExperience,
            ),
            educationRecords: application.candidate.educationRecords.map(
              (record) => ({
                degreeTitle: record.degreeTitle,
                fieldOfStudy: record.fieldOfStudy,
              }),
            ),
            currentCity: application.candidate.currentCity,
            currentCountry: application.candidate.currentCountry,
            preferredLocation: application.candidate.preferredLocation,
            willingToRelocate: application.candidate.willingToRelocate,
            noticePeriodDays: application.candidate.noticePeriodDays,
            preferredWorkMode: application.candidate.preferredWorkMode,
          },
          {
            id: application.jobOpening.id,
            matchCriteria: application.jobOpening.matchCriteria,
          },
        );

        const normalizedExisting = parseMatchBreakdown(
          application.matchBreakdown,
        );
        const normalizedNext = scoring.matchBreakdown;
        const scoreChanged =
          (application.matchScore ?? null) !== (scoring.matchScore ?? null);
        const breakdownChanged =
          JSON.stringify(normalizedExisting ?? null) !==
          JSON.stringify(normalizedNext ?? null);

        if (scoreChanged || breakdownChanged) {
          const fullApplication =
            await this.recruitmentRepository.findApplicationById(
              tenantId,
              application.id,
              tx,
            );
          if (!fullApplication) {
            return;
          }
          await this.createApplicationHistorySnapshot({
            tenantId,
            application: fullApplication,
            reason: 'MATCH_RECALCULATION',
            actorUserId: updatedById,
            tx,
          });
        }

        await this.recruitmentRepository.updateApplication(
          tenantId,
          application.id,
          {
            matchScore: scoring.matchScore,
            matchBreakdown:
              scoring.matchBreakdown === null
                ? Prisma.DbNull
                : (scoring.matchBreakdown as unknown as Prisma.InputJsonValue),
            updatedById,
          },
          tx,
        );
      }),
    );
  }

  private async replaceCandidateNestedRecords(
    currentUser: AuthenticatedUser,
    candidateId: string,
    educationRecords: CandidateEducationDto[] | undefined,
    experienceRecords: CandidateExperienceDto[] | undefined,
    tx: Prisma.TransactionClient,
  ) {
    if (educationRecords !== undefined) {
      await this.recruitmentRepository.deleteCandidateEducationRecords(
        currentUser.tenantId,
        candidateId,
        tx,
      );
      await this.recruitmentRepository.createCandidateEducationRecords(
        educationRecords.map((record) => ({
          tenantId: currentUser.tenantId,
          candidateId,
          institutionName: record.institutionName.trim(),
          degreeTitle: record.degreeTitle.trim(),
          fieldOfStudy: record.fieldOfStudy?.trim(),
          startDate: record.startDate ? new Date(record.startDate) : undefined,
          endDate: record.endDate ? new Date(record.endDate) : undefined,
          gradeOrCgpa: record.gradeOrCgpa?.trim(),
          country: record.country?.trim(),
          notes: record.notes?.trim(),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        })),
        tx,
      );
    }

    if (experienceRecords !== undefined) {
      await this.recruitmentRepository.deleteCandidateExperienceRecords(
        currentUser.tenantId,
        candidateId,
        tx,
      );
      await this.recruitmentRepository.createCandidateExperienceRecords(
        experienceRecords.map((record) => ({
          tenantId: currentUser.tenantId,
          candidateId,
          companyName: record.companyName.trim(),
          designation: record.designation.trim(),
          location: record.location?.trim(),
          employmentType: record.employmentType?.trim(),
          startDate: record.startDate ? new Date(record.startDate) : undefined,
          endDate: record.endDate ? new Date(record.endDate) : undefined,
          responsibilities: record.responsibilities?.trim(),
          finalSalary: toDecimal(record.finalSalary),
          reasonForLeaving: record.reasonForLeaving?.trim(),
          createdById: currentUser.userId,
          updatedById: currentUser.userId,
        })),
        tx,
      );
    }
  }

  private async hydrateExistingCandidateFromCreateDto(
    currentUser: AuthenticatedUser,
    candidateId: string,
    dto: CreateCandidateDto,
    geo: {
      nationality: string | null;
      country: string | null;
      stateProvince: string | null;
      city: string | null;
    },
    tx: Prisma.TransactionClient,
  ) {
    const existing = await this.recruitmentRepository.findCandidateById(
      currentUser.tenantId,
      candidateId,
      tx,
    );

    if (!existing) {
      throw new NotFoundException('Candidate was not found for this tenant.');
    }

    await this.createCandidateHistorySnapshot({
      tenantId: currentUser.tenantId,
      candidate: existing,
      reason: 'REUPLOAD',
      actorUserId: currentUser.userId,
      sourceChannel: dto.source?.trim() ?? 'parser_intake',
      tx,
    });

    await this.recruitmentRepository.updateCandidate(
      currentUser.tenantId,
      candidateId,
      {
        ...(dto.firstName ? { firstName: dto.firstName.trim() } : {}),
        ...(dto.middleName ? { middleName: dto.middleName.trim() } : {}),
        ...(dto.lastName ? { lastName: dto.lastName.trim() } : {}),
        ...(dto.personalEmail
          ? { personalEmail: normalizeEmail(dto.personalEmail) }
          : {}),
        ...(dto.alternatePhone
          ? { alternatePhone: dto.alternatePhone.trim() }
          : {}),
        ...(dto.source ? { source: dto.source.trim() } : {}),
        ...(dto.gender ? { gender: dto.gender } : {}),
        ...(dto.dateOfBirth ? { dateOfBirth: new Date(dto.dateOfBirth) } : {}),
        ...(dto.nationalityCountryId
          ? {
              nationalityCountryId: dto.nationalityCountryId,
              nationality: geo.nationality,
            }
          : {}),
        ...(dto.currentCountryId
          ? {
              currentCountryId: dto.currentCountryId,
              currentCountry: geo.country,
            }
          : {}),
        ...(dto.currentStateProvinceId
          ? {
              currentStateProvinceId: dto.currentStateProvinceId,
              currentStateProvince: geo.stateProvince,
            }
          : {}),
        ...(dto.currentCityId
          ? {
              currentCityId: dto.currentCityId,
              currentCity: geo.city,
            }
          : {}),
        ...(dto.addressArea ? { addressArea: dto.addressArea.trim() } : {}),
        ...(dto.profileSummary
          ? { profileSummary: dto.profileSummary.trim() }
          : {}),
        ...(dto.currentEmployer
          ? { currentEmployer: dto.currentEmployer.trim() }
          : {}),
        ...(dto.currentDesignation
          ? { currentDesignation: dto.currentDesignation.trim() }
          : {}),
        ...(dto.totalYearsExperience !== undefined
          ? { totalYearsExperience: toDecimal(dto.totalYearsExperience) }
          : {}),
        ...(dto.relevantYearsExperience !== undefined
          ? { relevantYearsExperience: toDecimal(dto.relevantYearsExperience) }
          : {}),
        ...(dto.currentSalary !== undefined
          ? { currentSalary: toDecimal(dto.currentSalary) }
          : {}),
        ...(dto.expectedSalary !== undefined
          ? { expectedSalary: toDecimal(dto.expectedSalary) }
          : {}),
        ...(dto.noticePeriodDays !== undefined
          ? { noticePeriodDays: dto.noticePeriodDays }
          : {}),
        ...(dto.earliestJoiningDate
          ? { earliestJoiningDate: new Date(dto.earliestJoiningDate) }
          : {}),
        ...(dto.reasonForLeavingCurrentEmployer
          ? {
              reasonForLeavingCurrentEmployer:
                dto.reasonForLeavingCurrentEmployer.trim(),
            }
          : {}),
        ...(dto.preferredWorkMode
          ? { preferredWorkMode: dto.preferredWorkMode }
          : {}),
        ...(dto.preferredLocation
          ? { preferredLocation: dto.preferredLocation.trim() }
          : {}),
        ...(dto.willingToRelocate !== undefined
          ? { willingToRelocate: dto.willingToRelocate }
          : {}),
        ...(dto.skills ? { skills: toJson(dto.skills) } : {}),
        ...(dto.certifications
          ? { certifications: toJson(dto.certifications) }
          : {}),
        ...(dto.portfolioUrl ? { portfolioUrl: dto.portfolioUrl.trim() } : {}),
        ...(dto.linkedInUrl ? { linkedInUrl: dto.linkedInUrl.trim() } : {}),
        ...(dto.otherProfileUrl
          ? { otherProfileUrl: dto.otherProfileUrl.trim() }
          : {}),
        ...(dto.interests ? { interests: toJson(dto.interests) } : {}),
        ...(dto.hobbies ? { hobbies: toJson(dto.hobbies) } : {}),
        ...(dto.strengths ? { strengths: toJson(dto.strengths) } : {}),
        ...(dto.concerns ? { concerns: dto.concerns.trim() } : {}),
        ...(dto.recruiterNotes
          ? { recruiterNotes: dto.recruiterNotes.trim() }
          : {}),
        ...(dto.hrNotes ? { hrNotes: dto.hrNotes.trim() } : {}),
        ...(dto.resumeDocumentReference
          ? { resumeDocumentReference: dto.resumeDocumentReference.trim() }
          : {}),
        updatedById: currentUser.userId,
      },
      tx,
    );

    const hydrated = await this.recruitmentRepository.findCandidateById(
      currentUser.tenantId,
      candidateId,
      tx,
    );

    if (!hydrated) {
      throw new NotFoundException('Candidate was not found for this tenant.');
    }

    return hydrated;
  }

  private async resolveCandidateGeo(
    dto: Pick<
      CreateCandidateDto | UpdateCandidateDto,
      | 'nationalityCountryId'
      | 'currentCountryId'
      | 'currentStateProvinceId'
      | 'currentCityId'
    >,
  ) {
    const [nationality, country, stateProvince, city] = await Promise.all([
      dto.nationalityCountryId
        ? this.prisma.country.findFirst({
            where: { id: dto.nationalityCountryId, isActive: true },
            select: { name: true },
          })
        : Promise.resolve(null),
      dto.currentCountryId
        ? this.prisma.country.findFirst({
            where: { id: dto.currentCountryId, isActive: true },
            select: { name: true },
          })
        : Promise.resolve(null),
      dto.currentStateProvinceId
        ? this.prisma.stateProvince.findFirst({
            where: {
              id: dto.currentStateProvinceId,
              isActive: true,
              ...(dto.currentCountryId
                ? { countryId: dto.currentCountryId }
                : {}),
            },
            select: { name: true },
          })
        : Promise.resolve(null),
      dto.currentCityId
        ? this.prisma.city.findFirst({
            where: {
              id: dto.currentCityId,
              isActive: true,
              ...(dto.currentCountryId
                ? { countryId: dto.currentCountryId }
                : {}),
              ...(dto.currentStateProvinceId
                ? { stateProvinceId: dto.currentStateProvinceId }
                : {}),
            },
            select: { name: true },
          })
        : Promise.resolve(null),
    ]);

    if (dto.nationalityCountryId && !nationality) {
      throw new BadRequestException('Selected nationality is invalid.');
    }
    if (dto.currentCountryId && !country) {
      throw new BadRequestException('Selected country is invalid.');
    }
    if (dto.currentStateProvinceId && !stateProvince) {
      throw new BadRequestException(
        'Selected state or province is invalid for the chosen country.',
      );
    }
    if (dto.currentCityId && !city) {
      throw new BadRequestException(
        'Selected city is invalid for the chosen state or country.',
      );
    }

    return {
      nationality: nationality?.name ?? null,
      country: country?.name ?? null,
      stateProvince: stateProvince?.name ?? null,
      city: city?.name ?? null,
    };
  }

  private validateCandidateNestedRecords(
    educationRecords?: CandidateEducationDto[],
    experienceRecords?: CandidateExperienceDto[],
  ) {
    for (const record of educationRecords ?? []) {
      if (
        record.startDate &&
        record.endDate &&
        record.endDate < record.startDate
      ) {
        throw new BadRequestException(
          'Candidate education end date cannot be before the start date.',
        );
      }
    }
    for (const record of experienceRecords ?? []) {
      if (
        record.startDate &&
        record.endDate &&
        record.endDate < record.startDate
      ) {
        throw new BadRequestException(
          'Candidate experience end date cannot be before the start date.',
        );
      }
    }
  }
}

function buildPaginationMeta(page: number, pageSize: number, total: number) {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

function validateStageTransition(
  currentStage: RecruitmentStage,
  nextStage: RecruitmentStage,
) {
  const ordered: RecruitmentStage[] = [
    'APPLIED',
    'SCREENING',
    'SHORTLISTED',
    'INTERVIEW',
    'FINAL_REVIEW',
    'OFFER',
    'APPROVED',
    'HIRED',
  ];
  if (currentStage === 'REJECTED' || currentStage === 'WITHDRAWN') {
    throw new BadRequestException(
      'Rejected or withdrawn applications cannot be progressed further.',
    );
  }
  if (
    nextStage === 'REJECTED' ||
    nextStage === 'WITHDRAWN' ||
    nextStage === 'ON_HOLD' ||
    currentStage === 'ON_HOLD'
  ) {
    return;
  }
  const from = ordered.indexOf(currentStage);
  const to = ordered.indexOf(nextStage);
  if (from === -1 || to === -1) {
    throw new BadRequestException('Invalid recruitment stage transition.');
  }
  if (to < from) {
    throw new BadRequestException(
      'Application stage cannot move backward in the current workflow.',
    );
  }
}

function parseRecruitmentStageFromConfig(
  value: string,
): RecruitmentStage | null {
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '_');
  return Object.values(RecruitmentStage).includes(
    normalized as RecruitmentStage,
  )
    ? (normalized as RecruitmentStage)
    : null;
}

function mapEmployeeStatus(value: string): EmployeeEmploymentStatus {
  const normalized = value.trim().toUpperCase();
  return Object.values(EmployeeEmploymentStatus).includes(
    normalized as EmployeeEmploymentStatus,
  )
    ? (normalized as EmployeeEmploymentStatus)
    : EmployeeEmploymentStatus.ACTIVE;
}

function mapEmployeeType(value: string): EmployeeType {
  const normalized = value.trim().toUpperCase();
  return Object.values(EmployeeType).includes(normalized as EmployeeType)
    ? (normalized as EmployeeType)
    : EmployeeType.FULL_TIME;
}

function mapWorkMode(value: string): EmployeeWorkMode {
  const normalized = value.trim().toUpperCase();
  return Object.values(EmployeeWorkMode).includes(
    normalized as EmployeeWorkMode,
  )
    ? (normalized as EmployeeWorkMode)
    : EmployeeWorkMode.OFFICE;
}

function extractEmployeeSequence(
  employeeCode: string | null | undefined,
  prefix: string,
  sequenceLength: number,
) {
  if (!employeeCode) {
    return 0;
  }
  const normalizedCode = employeeCode.trim().toUpperCase();
  const basePrefix = `${prefix}-`;
  if (!normalizedCode.startsWith(basePrefix)) {
    return 0;
  }
  const numericPart = normalizedCode.slice(
    basePrefix.length,
    basePrefix.length + sequenceLength,
  );
  const sequence = Number.parseInt(numericPart, 10);
  return Number.isFinite(sequence) ? sequence : 0;
}

function handleRecruitmentWriteError(
  error: unknown,
  entityName: 'Job opening' | 'Candidate',
): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      `${entityName} name, code, or email is already in use for this tenant.`,
    );
  }
  throw error;
}

function toDecimal(value?: number) {
  return value === undefined ? undefined : new Prisma.Decimal(value);
}

function nullableDecimal(value?: number | null) {
  return value === undefined
    ? undefined
    : value === null
      ? null
      : new Prisma.Decimal(value);
}

function toJson(value?: string[]) {
  return value === undefined
    ? undefined
    : (value as unknown as Prisma.InputJsonValue);
}

function arr(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function parseMatchBreakdown(value: unknown) {
  if (!value || value === Prisma.JsonNull || value === Prisma.DbNull) {
    return null;
  }
  if (typeof value === 'object') {
    return value;
  }
  return null;
}

function num(value?: Prisma.Decimal | null) {
  return value === null || value === undefined ? null : Number(value);
}

function serializeJson<T>(value: T): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function isAbsoluteHttpUrl(value: string) {
  return /^https?:\/\//i.test(value);
}

function parseDocumentParsingStatus(
  value?: string,
): Prisma.DocumentReferenceUncheckedCreateInput['parsingStatus'] | undefined {
  if (!value) {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  const allowed = new Set([
    'PENDING',
    'QUEUED',
    'PROCESSING',
    'SUCCEEDED',
    'FAILED',
  ]);
  if (!allowed.has(normalized)) {
    return undefined;
  }
  return normalized as Prisma.DocumentReferenceUncheckedCreateInput['parsingStatus'];
}
