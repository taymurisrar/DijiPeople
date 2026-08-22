import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  SupportCaseChannel,
  SupportCaseSeverity,
  SupportCaseStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { EmailService } from '../notifications/email/email.service';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import { toDisplayString } from '../../common/utils/display-string';
import {
  AddSupportCaseActivityDto,
  CreateSupportCaseDto,
  LinkSupportIncidentDto,
  MergeSupportCaseDto,
  SendCustomerUpdateDto,
  SupportCaseQueryDto,
  UpdateSupportCaseDto,
} from './dto/support-cases.dto';

const include = {
  assignedToUser: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
    },
  },
  customerAccount: {
    select: {
      id: true,
      companyName: true,
      primaryContactEmail: true,
      contactEmail: true,
    },
  },
  tenant: { select: { id: true, name: true, slug: true } },
  partner: { select: { id: true, code: true, displayName: true } },
  subscription: { select: { id: true, status: true } },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
  customerOnboarding: { select: { id: true, status: true } },
  contract: { select: { id: true, contractNumber: true, status: true } },
  parentCase: { select: { id: true, caseNumber: true, title: true } },
  childCases: {
    select: { id: true, caseNumber: true, title: true, status: true },
  },
  mergedIntoCase: { select: { id: true, caseNumber: true, title: true } },
  attachments: { orderBy: { createdAt: 'desc' as const } },
  timeline: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  communications: { orderBy: { createdAt: 'desc' as const }, take: 100 },
  incidentLinks: {
    include: { errorLog: true },
    orderBy: { createdAt: 'desc' as const },
  },
} satisfies Prisma.SupportCaseInclude;

@Injectable()
export class SupportCasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailService,
    private readonly storage: StorageService,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: SupportCaseQueryDto,
    runtime?: {
      filters?: Array<{ field: string; operator: string; value?: unknown }>;
      sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    },
  ) {
    this.assertPlatform(user);
    const now = new Date();
    const viewWhere: Prisma.SupportCaseWhereInput =
      query.viewKey === 'unassigned'
        ? { assignedToUserId: null, assignedTeam: null }
        : query.viewKey === 'my-cases'
          ? { assignedToUserId: user.platform?.id ?? '__none__' }
          : query.viewKey === 'sla-breached'
            ? { resolutionDueAt: { lt: now }, resolvedAt: null }
            : query.viewKey === 'at-risk'
              ? {
                  resolutionDueAt: {
                    gte: now,
                    lte: new Date(now.getTime() + 4 * 60 * 60 * 1000),
                  },
                  resolvedAt: null,
                }
              : {};
    const where: Prisma.SupportCaseWhereInput = {
      ...viewWhere,
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.assignedToUserId
        ? { assignedToUserId: query.assignedToUserId }
        : {}),
      ...(query.customerAccountId
        ? { customerAccountId: query.customerAccountId }
        : {}),
      ...(query.tenantId ? { tenantId: query.tenantId } : {}),
      ...(query.partnerId ? { partnerId: query.partnerId } : {}),
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? {
            OR: [
              { caseNumber: { contains: query.search, mode: 'insensitive' } },
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                requesterEmail: { contains: query.search, mode: 'insensitive' },
              },
            ],
          }
        : {}),
      ...supportRuntimeWhere(runtime?.filters ?? []),
    };
    const orderBy = supportRuntimeOrder(runtime?.sort ?? []);
    const [items, total, metrics] = await Promise.all([
      this.prisma.supportCase.findMany({
        where,
        include: {
          assignedToUser: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
            },
          },
          customerAccount: { select: { id: true, companyName: true } },
          tenant: { select: { id: true, name: true } },
          _count: { select: { incidentLinks: true } },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.supportCase.count({ where }),
      this.metrics(user),
    ]);
    return {
      items: items.map((item) => ({ ...item, slaStatus: slaStatus(item) })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
      metrics,
    };
  }

  async metrics(user: AuthenticatedUser) {
    this.assertPlatform(user);
    const now = new Date();
    const active = {
      status: {
        notIn: [SupportCaseStatus.CLOSED, SupportCaseStatus.CANCELLED],
      },
    } satisfies Prisma.SupportCaseWhereInput;
    const [open, unassigned, breached, critical, resolved24h, resolvedCases] =
      await Promise.all([
        this.prisma.supportCase.count({ where: active }),
        this.prisma.supportCase.count({
          where: { ...active, assignedToUserId: null, assignedTeam: null },
        }),
        this.prisma.supportCase.count({
          where: { ...active, resolutionDueAt: { lt: now }, resolvedAt: null },
        }),
        this.prisma.supportCase.count({
          where: { ...active, severity: SupportCaseSeverity.S1_CRITICAL },
        }),
        this.prisma.supportCase.count({
          where: { resolvedAt: { gte: new Date(now.getTime() - 86_400_000) } },
        }),
        this.prisma.supportCase.findMany({
          where: { resolvedAt: { not: null } },
          select: { createdAt: true, resolvedAt: true },
          orderBy: { resolvedAt: 'desc' },
          take: 500,
        }),
      ]);
    const meanResolutionHours = resolvedCases.length
      ? Math.round(
          (resolvedCases.reduce(
            (sum, item) =>
              sum +
              (item.resolvedAt!.getTime() - item.createdAt.getTime()) /
                3_600_000,
            0,
          ) /
            resolvedCases.length) *
            10,
        ) / 10
      : null;
    return {
      open,
      unassigned,
      breached,
      critical,
      resolvedLast24Hours: resolved24h,
      meanResolutionHours,
      generatedAt: now.toISOString(),
    };
  }

  async get(user: AuthenticatedUser, id: string) {
    this.assertPlatform(user);
    const item = await this.prisma.supportCase.findUnique({
      where: { id },
      include,
    });
    if (!item) throw new NotFoundException('Support case was not found.');
    return { ...item, slaStatus: slaStatus(item) };
  }

  async create(user: AuthenticatedUser, dto: CreateSupportCaseDto) {
    this.assertWrite(user);
    const settingRow = await this.prisma.platformSetting.findUnique({
      where: { key: 'support-settings' },
    });
    const settings =
      settingRow?.value &&
      typeof settingRow.value === 'object' &&
      !Array.isArray(settingRow.value)
        ? (settingRow.value as Record<string, unknown>)
        : {};
    const severity = dto.severity ?? SupportCaseSeverity.S3_MEDIUM;
    const targets = slaTargets(severity, settings);
    const casePrefix =
      typeof settings.casePrefix === 'string' &&
      /^[A-Z0-9-]{2,12}$/i.test(settings.casePrefix)
        ? settings.casePrefix.toUpperCase()
        : 'CASE';
    const item = await this.prisma.$transaction(async (tx) => {
      const created = await tx.supportCase.create({
        data: {
          caseNumber: reference(casePrefix),
          title: dto.title.trim(),
          description: dto.description.trim(),
          priority: dto.priority,
          severity: dto.severity,
          channel: dto.channel,
          customerAccountId: dto.customerAccountId,
          tenantId: dto.tenantId,
          partnerId: dto.partnerId,
          subscriptionId: dto.subscriptionId,
          invoiceId: dto.invoiceId,
          customerOnboardingId: dto.customerOnboardingId,
          contractId: dto.contractId,
          parentCaseId: dto.parentCaseId,
          category: dto.category,
          subcategory: dto.subcategory,
          productArea: dto.productArea,
          escalationLevel: dto.escalationLevel,
          requesterName: dto.requesterName,
          requesterEmail: dto.requesterEmail?.toLowerCase(),
          requesterUserId: dto.requesterUserId,
          assignedToUserId: dto.assignedToUserId,
          assignedTeam: dto.assignedTeam,
          firstResponseDueAt: new Date(
            Date.now() + targets.responseHours * 3_600_000,
          ),
          resolutionDueAt: new Date(
            Date.now() + targets.resolutionHours * 3_600_000,
          ),
          createdById: user.userId,
        },
      });
      await tx.supportCaseTimeline.create({
        data: {
          supportCaseId: created.id,
          eventType: 'CASE_CREATED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Support case ${created.caseNumber} was created.`,
        },
      });
      if (dto.errorLogId)
        await tx.supportCaseIncident.create({
          data: {
            supportCaseId: created.id,
            errorLogId: dto.errorLogId,
            linkedById: user.userId,
          },
        });
      return created;
    });
    return this.get(user, item.id);
  }

  async createFromIncident(user: AuthenticatedUser, errorLogId: string) {
    this.assertWrite(user);
    const incident = await this.prisma.errorLog.findUnique({
      where: { id: errorLogId },
    });
    if (!incident)
      throw new NotFoundException('Monitoring incident was not found.');
    const existing = await this.prisma.supportCaseIncident.findFirst({
      where: { errorLogId },
      include: { supportCase: true },
    });
    if (existing) return this.get(user, existing.supportCaseId);
    return this.create(user, {
      title: `${incident.errorCode}: ${incident.message}`.slice(0, 240),
      description: incident.description || incident.message,
      severity: mapSeverity(incident.severity),
      priority:
        incident.severity.toUpperCase() === 'CRITICAL' ? 'URGENT' : 'HIGH',
      channel: SupportCaseChannel.MONITORING,
      tenantId: incident.tenantId ?? undefined,
      requesterUserId: incident.userId ?? undefined,
      assignedToUserId: incident.assignedToUserId ?? undefined,
      errorLogId,
    });
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateSupportCaseDto) {
    this.assertWrite(user);
    const existing = await this.get(user, id);
    const resolved =
      dto.status === SupportCaseStatus.RESOLVED &&
      existing.status !== SupportCaseStatus.RESOLVED;
    const closed =
      dto.status === SupportCaseStatus.CLOSED &&
      existing.status !== SupportCaseStatus.CLOSED;
    await this.prisma.$transaction(async (tx) => {
      await tx.supportCase.update({
        where: { id },
        data: {
          ...dto,
          assignedToUserId: dto.assignedToUserId,
          resolvedAt: resolved
            ? new Date()
            : dto.status === SupportCaseStatus.REOPENED
              ? null
              : undefined,
          closedAt: closed ? new Date() : undefined,
          reopenedCount:
            dto.status === SupportCaseStatus.REOPENED &&
            existing.status !== SupportCaseStatus.REOPENED
              ? { increment: 1 }
              : undefined,
          firstRespondedAt:
            existing.firstRespondedAt ??
            (dto.status && dto.status !== SupportCaseStatus.NEW
              ? new Date()
              : undefined),
        },
      });
      await tx.supportCaseTimeline.create({
        data: {
          supportCaseId: id,
          eventType: dto.status ? 'STATUS_CHANGED' : 'CASE_UPDATED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: dto.status
            ? `Status changed from ${existing.status} to ${dto.status}.`
            : 'Support case details were updated.',
          metadata: dto as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return this.get(user, id);
  }

  async linkIncident(
    user: AuthenticatedUser,
    id: string,
    dto: LinkSupportIncidentDto,
  ) {
    this.assertWrite(user);
    await Promise.all([
      this.get(user, id),
      this.prisma.errorLog.findUniqueOrThrow({ where: { id: dto.errorLogId } }),
    ]);
    const link = await this.prisma.supportCaseIncident.upsert({
      where: {
        supportCaseId_errorLogId: {
          supportCaseId: id,
          errorLogId: dto.errorLogId,
        },
      },
      create: {
        supportCaseId: id,
        errorLogId: dto.errorLogId,
        linkedById: user.userId,
      },
      update: {},
    });
    await this.prisma.supportCaseTimeline.create({
      data: {
        supportCaseId: id,
        eventType: 'INCIDENT_LINKED',
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message: 'A sanitized monitoring incident was linked.',
      },
    });
    return link;
  }

  async merge(user: AuthenticatedUser, id: string, dto: MergeSupportCaseDto) {
    this.assertWrite(user);
    if (id === dto.targetCaseId)
      throw new BadRequestException('A case cannot be merged into itself.');
    const [source, target] = await Promise.all([
      this.get(user, id),
      this.get(user, dto.targetCaseId),
    ]);
    if (source.mergedIntoCaseId)
      throw new BadRequestException('This case has already been merged.');
    await this.prisma.$transaction([
      this.prisma.supportCase.update({
        where: { id },
        data: {
          mergedIntoCaseId: dto.targetCaseId,
          status: 'CLOSED',
          closedAt: new Date(),
          resolutionCategory: 'DUPLICATE',
          resolutionSummary: dto.reason ?? `Merged into ${target.caseNumber}.`,
        },
      }),
      this.prisma.supportCaseTimeline.create({
        data: {
          supportCaseId: id,
          eventType: 'CASE_MERGED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Merged into ${target.caseNumber}.`,
          metadata: { targetCaseId: dto.targetCaseId, reason: dto.reason },
        },
      }),
      this.prisma.supportCaseTimeline.create({
        data: {
          supportCaseId: dto.targetCaseId,
          eventType: 'DUPLICATE_CASE_MERGED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `${source.caseNumber} was merged into this case.`,
          metadata: { sourceCaseId: id },
        },
      }),
    ]);
    return this.get(user, dto.targetCaseId);
  }

  async uploadAttachment(
    user: AuthenticatedUser,
    id: string,
    file: {
      buffer: Buffer;
      originalname: string;
      mimetype: string;
      size: number;
    },
    customerSafe = false,
  ) {
    this.assertWrite(user);
    await this.get(user, id);
    const allowed = new Set([
      'application/pdf',
      'image/png',
      'image/jpeg',
      'text/plain',
    ]);
    if (!allowed.has(file.mimetype))
      throw new BadRequestException('Attach a PDF, PNG, JPEG, or TXT file.');
    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalFileName: file.originalname,
      subdirectory: `support-cases/${id}/attachments`,
    });
    const attachment = await this.prisma.supportCaseAttachment.create({
      data: {
        supportCaseId: id,
        fileName: file.originalname,
        mimeType: file.mimetype,
        storageKey: saved.storageKey,
        sizeBytes: saved.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex'),
        isCustomerSafe: customerSafe,
        uploadedById: user.userId,
      },
    });
    await this.prisma.supportCaseTimeline.create({
      data: {
        supportCaseId: id,
        eventType: 'ATTACHMENT_ADDED',
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message: `${file.originalname} was attached.`,
        metadata: { attachmentId: attachment.id, customerSafe },
      },
    });
    return attachment;
  }

  async openAttachment(user: AuthenticatedUser, attachmentId: string) {
    this.assertPlatform(user);
    const attachment = await this.prisma.supportCaseAttachment.findUnique({
      where: { id: attachmentId },
    });
    if (!attachment)
      throw new NotFoundException('Support attachment was not found.');
    return {
      attachment,
      file: await this.storage.openFile(attachment.storageKey),
    };
  }

  async addActivity(
    user: AuthenticatedUser,
    id: string,
    dto: AddSupportCaseActivityDto,
  ) {
    this.assertWrite(user);
    await this.get(user, id);
    return this.prisma.supportCaseTimeline.create({
      data: {
        supportCaseId: id,
        eventType: dto.eventType.trim().toUpperCase(),
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message: dto.message.trim(),
      },
    });
  }

  async sendCustomerUpdate(
    user: AuthenticatedUser,
    id: string,
    dto: SendCustomerUpdateDto,
  ) {
    this.assertWrite(user);
    const supportCase = await this.get(user, id);
    const recipient =
      dto.recipientEmail ??
      supportCase.requesterEmail ??
      supportCase.customerAccount?.primaryContactEmail ??
      supportCase.customerAccount?.contactEmail;
    if (!recipient)
      throw new BadRequestException('A customer email address is required.');
    if (!supportCase.tenantId)
      throw new BadRequestException(
        'Customer update email requires a linked tenant email configuration.',
      );
    const communication = await this.prisma.supportCaseCommunication.create({
      data: {
        supportCaseId: id,
        direction: 'OUTBOUND',
        channel: SupportCaseChannel.EMAIL,
        recipientEmail: recipient,
        subject: dto.subject,
        body: dto.body,
        deliveryStatus: 'QUEUED',
        createdById: user.userId,
      },
    });
    try {
      const delivery = await this.email.sendTemplateEmail({
        tenantId: supportCase.tenantId,
        eventCode: 'SUPPORT_CASE_UPDATE',
        templateKey: 'SUPPORT_CASE_UPDATE',
        recipient,
        variables: {
          caseNumber: supportCase.caseNumber,
          caseTitle: supportCase.title,
          customerName:
            supportCase.customerAccount?.companyName ??
            supportCase.requesterName ??
            'Customer',
          updateBody: dto.body,
        },
        metadata: { supportCaseId: id, communicationId: communication.id },
        requestedByUserId: user.userId,
      });
      await this.prisma.supportCaseCommunication.update({
        where: { id: communication.id },
        data: {
          deliveryStatus: delivery.status,
          sentAt: delivery.sent ? new Date() : null,
        },
      });
    } catch (error) {
      await this.prisma.supportCaseCommunication.update({
        where: { id: communication.id },
        data: {
          deliveryStatus: `FAILED: ${error instanceof Error ? error.message : 'Unknown error'}`,
        },
      });
      throw error;
    }
    await this.prisma.supportCase.update({
      where: { id },
      data: { customerUpdate: dto.body },
    });
    await this.addActivity(user, id, {
      eventType: 'CUSTOMER_UPDATE_SENT',
      message: `Customer update sent to ${recipient}.`,
    });
    return this.get(user, id);
  }

  private assertPlatform(user: AuthenticatedUser) {
    if (!user.platform?.id)
      throw new ForbiddenException('Platform access is required.');
    if (!userHasPlatformPermission(user, 'support.read'))
      throw new ForbiddenException('Support case access is required.');
  }
  private assertWrite(user: AuthenticatedUser) {
    this.assertPlatform(user);
    if (!userHasPlatformPermission(user, 'support.manage'))
      throw new ForbiddenException(
        'Support case management access is required.',
      );
  }
}

export function slaTargets(
  severity: SupportCaseSeverity,
  settings: Record<string, unknown> = {},
) {
  const prefix = severity.slice(0, 2).toLowerCase();
  const defaults =
    severity === 'S1_CRITICAL'
      ? { responseHours: 1, resolutionHours: 4 }
      : severity === 'S2_HIGH'
        ? { responseHours: 4, resolutionHours: 12 }
        : severity === 'S3_MEDIUM'
          ? { responseHours: 8, resolutionHours: 48 }
          : { responseHours: 24, resolutionHours: 120 };
  const response = Number(settings[`${prefix}ResponseHours`]);
  const resolution = Number(settings[`${prefix}ResolutionHours`]);
  return {
    responseHours:
      Number.isFinite(response) && response > 0
        ? response
        : defaults.responseHours,
    resolutionHours:
      Number.isFinite(resolution) && resolution > 0
        ? resolution
        : defaults.resolutionHours,
  };
}
function supportRuntimeWhere(
  filters: Array<{ field: string; operator: string; value?: unknown }>,
): Prisma.SupportCaseWhereInput {
  const clauses: Prisma.SupportCaseWhereInput[] = [];
  for (const filter of filters) {
    const value = toDisplayString(filter.value ?? '').trim();
    if (!value && !['isNull', 'isNotNull'].includes(filter.operator)) continue;
    if (
      [
        'caseNumber',
        'title',
        'category',
        'subcategory',
        'productArea',
        'assignedTeam',
      ].includes(filter.field)
    )
      clauses.push({
        [filter.field]: supportStringCondition(filter.operator, value),
      });
    else if (filter.field === 'status')
      clauses.push({ status: value as never });
    else if (filter.field === 'priority')
      clauses.push({ priority: value as never });
    else if (filter.field === 'severity')
      clauses.push({ severity: value as never });
    else if (filter.field === 'channel')
      clauses.push({ channel: value as never });
    else if (
      [
        'customerAccountId',
        'tenantId',
        'partnerId',
        'assignedToUserId',
        'subscriptionId',
        'invoiceId',
        'customerOnboardingId',
        'contractId',
      ].includes(filter.field)
    )
      clauses.push({
        [filter.field]: supportNullableScalar(filter.operator, value),
      });
    else if (
      [
        'createdAt',
        'firstResponseDueAt',
        'resolutionDueAt',
        'resolvedAt',
      ].includes(filter.field)
    )
      clauses.push({
        [filter.field]: supportDateCondition(filter.operator, value),
      });
  }
  return clauses.length ? { AND: clauses } : {};
}

function supportRuntimeOrder(
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>,
): Prisma.SupportCaseOrderByWithRelationInput[] {
  const supported = new Set([
    'caseNumber',
    'title',
    'severity',
    'priority',
    'status',
    'category',
    'assignedTeam',
    'firstResponseDueAt',
    'resolutionDueAt',
    'createdAt',
    'updatedAt',
  ]);
  const result = sort
    .filter((item) => supported.has(item.field))
    .map((item) => ({
      [item.field]: item.direction,
    })) as Prisma.SupportCaseOrderByWithRelationInput[];
  return result.length ? result : [{ priority: 'desc' }, { createdAt: 'desc' }];
}

function supportStringCondition(operator: string, value: string) {
  if (operator === 'isNull') return null;
  if (operator === 'isNotNull') return { not: null };
  if (operator === 'ne') return { not: value };
  if (operator === 'startsWith')
    return { startsWith: value, mode: 'insensitive' as const };
  if (operator === 'contains')
    return { contains: value, mode: 'insensitive' as const };
  return { equals: value, mode: 'insensitive' as const };
}
function supportNullableScalar(operator: string, value: string) {
  if (operator === 'isNull') return null;
  if (operator === 'isNotNull') return { not: null };
  if (operator === 'ne') return { not: value };
  return value;
}
function supportDateCondition(operator: string, value: string) {
  const date = new Date(value);
  if (operator === 'gt') return { gt: date };
  if (operator === 'gte') return { gte: date };
  if (operator === 'lt') return { lt: date };
  if (operator === 'lte') return { lte: date };
  if (operator === 'ne') return { not: date };
  return date;
}

function slaStatus(item: {
  resolutionDueAt: Date | null;
  resolvedAt: Date | null;
}) {
  if (item.resolvedAt) return 'MET';
  if (!item.resolutionDueAt) return 'NOT_APPLICABLE';
  const remaining = item.resolutionDueAt.getTime() - Date.now();
  return remaining < 0
    ? 'BREACHED'
    : remaining < 7_200_000
      ? 'DUE_SOON'
      : 'ON_TRACK';
}
function mapSeverity(value: string): SupportCaseSeverity {
  const key = value.toUpperCase();
  return key === 'CRITICAL' || key === 'FATAL'
    ? 'S1_CRITICAL'
    : key === 'ERROR' || key === 'HIGH'
      ? 'S2_HIGH'
      : key === 'WARNING' || key === 'MEDIUM'
        ? 'S3_MEDIUM'
        : 'S4_LOW';
}
function reference(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
}
