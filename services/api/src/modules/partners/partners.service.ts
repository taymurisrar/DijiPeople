import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PartnerStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import { toDisplayString } from '../../common/utils/display-string';
import {
  CreatePartnerCommissionDto,
  CreatePartnerDto,
  CreatePartnerReferralLinkDto,
  PartnerLifecycleActionDto,
  PartnerReferralLinkActionDto,
  PartnerQueryDto,
  UpdatePartnerCommissionDto,
  UpdatePartnerDto,
} from './dto/partner.dto';

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  listForUser(user: AuthenticatedUser, query: PartnerQueryDto) {
    this.assertRead(user);
    return this.list(query);
  }

  getForUser(user: AuthenticatedUser, id: string) {
    this.assertRead(user);
    return this.get(id);
  }

  createForUser(user: AuthenticatedUser, dto: CreatePartnerDto) {
    this.assertWrite(user);
    return this.create(dto);
  }

  updateForUser(user: AuthenticatedUser, id: string, dto: UpdatePartnerDto) {
    this.assertWrite(user);
    return this.update(id, dto);
  }

  lifecycleActionForUser(
    user: AuthenticatedUser,
    id: string,
    dto: PartnerLifecycleActionDto,
  ) {
    this.assertWrite(user);
    return this.lifecycleAction(id, user.userId, dto);
  }

  createReferralLinkForUser(
    user: AuthenticatedUser,
    id: string,
    dto: CreatePartnerReferralLinkDto,
  ) {
    this.assertWrite(user);
    return this.createReferralLink(id, dto, user.userId);
  }

  referralLinkActionForUser(
    user: AuthenticatedUser,
    id: string,
    linkId: string,
    action: PartnerReferralLinkActionDto['action'],
  ) {
    this.assertWrite(user);
    return this.referralLinkAction(id, linkId, action, user.userId);
  }

  createCommissionForUser(
    user: AuthenticatedUser,
    id: string,
    dto: CreatePartnerCommissionDto,
  ) {
    this.assertWrite(user);
    return this.createCommission(id, dto);
  }

  updateCommissionForUser(
    user: AuthenticatedUser,
    id: string,
    commissionId: string,
    dto: UpdatePartnerCommissionDto,
  ) {
    this.assertWrite(user);
    return this.updateCommission(id, commissionId, dto);
  }

  private assertRead(user: AuthenticatedUser) {
    if (!user.platform?.id) {
      throw new ForbiddenException('Platform access is required.');
    }
    if (!userHasPlatformPermission(user, 'partners.read')) {
      throw new ForbiddenException('Partner read access is required.');
    }
  }

  private assertWrite(user: AuthenticatedUser) {
    this.assertRead(user);
    if (!userHasPlatformPermission(user, 'partners.manage')) {
      throw new ForbiddenException('Partner management access is required.');
    }
  }
  async list(
    query: PartnerQueryDto,
    runtime?: {
      filters?: Array<{ field: string; operator: string; value?: unknown }>;
      sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    },
  ) {
    const where: Prisma.PartnerWhereInput = {
      ...partnerViewWhere(query.viewKey),
      ...(query.status ? { status: query.status } : {}),
      ...(query.search
        ? {
            OR: [
              { displayName: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } },
              { email: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...partnerRuntimeWhere(runtime?.filters ?? []),
    };
    const orderBy = partnerRuntimeOrder(runtime?.sort ?? []);
    const [items, total] = await Promise.all([
      this.prisma.partner.findMany({
        where,
        include: {
          assignedToUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          onboardingApplications: {
            select: { id: true, status: true, updatedAt: true },
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
          agreements: {
            select: {
              id: true,
              status: true,
              updatedAt: true,
              signatureRequests: {
                select: { id: true, status: true, updatedAt: true },
                orderBy: { updatedAt: 'desc' },
                take: 1,
              },
            },
            orderBy: { updatedAt: 'desc' },
            take: 1,
          },
          _count: {
            select: {
              leads: true,
              agreements: true,
              commissions: true,
              referralLinks: true,
            },
          },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.partner.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        defaultCommissionRate: Number(item.defaultCommissionRate),
        onboardingStatus: item.onboardingApplications[0]?.status ?? null,
        agreementStatus: item.agreements[0]?.status ?? null,
        signatureStatus:
          item.agreements[0]?.signatureRequests[0]?.status ?? null,
        _count: { ...item._count, contracts: item._count.agreements },
      })),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }
  async get(id: string) {
    const item = await this.prisma.partner.findUnique({
      where: { id },
      include: {
        assignedToUser: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
        leads: {
          select: { id: true, companyName: true, fullName: true, status: true },
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        agreements: {
          include: {
            versions: { orderBy: { version: 'desc' }, take: 1 },
            signatureRequests: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
          orderBy: { createdAt: 'desc' },
        },
        commissions: { orderBy: { createdAt: 'desc' } },
        inquiries: { orderBy: { submittedAt: 'desc' } },
        onboardingApplications: {
          include: { submissions: { orderBy: { version: 'desc' }, take: 1 } },
          orderBy: { updatedAt: 'desc' },
        },
        portalUsers: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            status: true,
            activatedAt: true,
            lastActiveAt: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        referralLinks: {
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        },
        attributedCustomers: {
          select: {
            id: true,
            companyName: true,
            status: true,
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
        },
        attributedTenants: {
          select: { id: true, name: true, status: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        timeline: { orderBy: { createdAt: 'desc' }, take: 100 },
      },
    });
    if (!item) throw new NotFoundException('Partner was not found.');
    return normalizePartner(item);
  }

  async lifecycleAction(
    id: string,
    actorId: string,
    dto: PartnerLifecycleActionDto,
  ) {
    const partner = await this.get(id);
    const next = partnerTransition(partner.status, dto.action);
    await this.prisma.$transaction([
      this.prisma.partner.update({
        where: { id },
        data: {
          status: next,
          ...(dto.action === 'suspend'
            ? { accountStatus: 'SUSPENDED' }
            : dto.action === 'reactivate'
              ? { accountStatus: 'ACTIVE' }
              : dto.action === 'deactivate'
                ? { accountStatus: 'DISABLED' }
                : {}),
        },
      }),
      this.prisma.partnerTimeline.create({
        data: {
          partnerId: id,
          eventType: `PARTNER_${dto.action.toUpperCase().replaceAll('-', '_')}`,
          actorType: 'PLATFORM_USER',
          actorId,
          message: partnerActionMessage(dto.action, partner.displayName),
          metadata: dto.reason ? { reason: dto.reason } : undefined,
        },
      }),
      ...(dto.action === 'start-review'
        ? [
            this.prisma.partnerInquiry.updateMany({
              where: { partnerId: id, status: 'NEW' },
              data: { status: 'QUALIFYING', assignedToUserId: actorId },
            }),
          ]
        : []),
    ]);
    return this.get(id);
  }

  async createReferralLink(
    partnerId: string,
    dto: CreatePartnerReferralLinkDto,
    actorId?: string,
  ) {
    const partner = await this.get(partnerId);
    if (partner.status !== PartnerStatus.ACTIVE)
      throw new BadRequestException(
        'Referral links are available only after the partner is active.',
      );
    const code = await this.uniqueReferralCode();
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault)
        await tx.partnerReferralLink.updateMany({
          where: { partnerId, isDefault: true },
          data: { isDefault: false },
        });
      const link = await tx.partnerReferralLink.create({
        data: {
          partnerId,
          name: dto.name.trim(),
          campaignName: dto.campaignName?.trim(),
          targetPath: normalizeTargetPath(dto.targetPath),
          isDefault: dto.isDefault ?? false,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          code,
          createdById: actorId,
        },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId,
          eventType: 'REFERRAL_LINK_CREATED',
          actorType: actorId ? 'PLATFORM_USER' : 'PARTNER_USER',
          actorId,
          message: `Referral link ${link.name} was created.`,
          metadata: { referralLinkId: link.id, code: link.code },
        },
      });
      return link;
    });
  }

  async referralLinkAction(
    partnerId: string,
    linkId: string,
    action: 'enable' | 'disable' | 'expire' | 'regenerate',
    actorId?: string,
  ) {
    const link = await this.prisma.partnerReferralLink.findFirst({
      where: { id: linkId, partnerId },
    });
    if (!link) throw new NotFoundException('Referral link was not found.');
    if (action === 'regenerate') {
      const replacement = await this.createReferralLink(
        partnerId,
        {
          name: link.name,
          campaignName: link.campaignName ?? undefined,
          targetPath: link.targetPath,
          isDefault: link.isDefault,
          expiresAt: link.expiresAt?.toISOString(),
        },
        actorId,
      );
      await this.prisma.partnerReferralLink.update({
        where: { id: link.id },
        data: {
          status: 'REGENERATED',
          isDefault: false,
          replacedById: replacement.id,
        },
      });
      return replacement;
    }
    return this.prisma.partnerReferralLink.update({
      where: { id: link.id },
      data:
        action === 'enable'
          ? { status: 'ACTIVE', expiresAt: null }
          : action === 'disable'
            ? { status: 'DISABLED', isDefault: false }
            : { status: 'EXPIRED', expiresAt: new Date(), isDefault: false },
    });
  }

  async ensureDefaultReferralLink(partnerId: string, actorId?: string) {
    const current = await this.prisma.partnerReferralLink.findFirst({
      where: { partnerId, isDefault: true, status: 'ACTIVE' },
    });
    if (current) return current;
    return this.createReferralLink(
      partnerId,
      { name: 'Default referral link', isDefault: true },
      actorId,
    );
  }
  async create(dto: CreatePartnerDto) {
    await this.validateOwner(dto.assignedToUserId);
    const currencyCode = dto.currencyCode ?? (await this.reportingCurrency());
    return normalizePartner(
      await this.prisma.partner.create({
        data: {
          ...partnerData(dto, currencyCode),
          code: createReference('PTR'),
        },
      }),
    );
  }
  async update(id: string, dto: UpdatePartnerDto) {
    const existing = await this.get(id);
    if (
      dto.status === PartnerStatus.ACTIVE &&
      existing.status !== PartnerStatus.ACTIVE
    )
      throw new BadRequestException(
        'Activate partners through the governed activation action after onboarding and agreement verification.',
      );
    /*
     * The mirror of the guard above, which was missing. Entering ACTIVE was
     * governed; leaving it was not, so a generic PATCH could take a live
     * partner — signed agreement, working referral link — straight to
     * REJECTED or TERMINATED with no timeline entry and no from-set check,
     * bypassing `partnerTransition` entirely. Suspension, deactivation and
     * reactivation already have governed actions that record why.
     */
    if (
      existing.status === PartnerStatus.ACTIVE &&
      dto.status !== undefined &&
      dto.status !== PartnerStatus.ACTIVE
    )
      throw new BadRequestException(
        'A live partner’s status is changed through the governed lifecycle actions — suspend, deactivate or reactivate — so the reason is recorded.',
      );
    await this.validateOwner(dto.assignedToUserId);
    return normalizePartner(
      await this.prisma.partner.update({
        where: { id },
        data: partnerData(dto, dto.currencyCode ?? existing.currencyCode),
      }),
    );
  }
  async createCommission(partnerId: string, dto: CreatePartnerCommissionDto) {
    const partner = await this.get(partnerId);
    const amount = Math.round(dto.baseAmount * dto.commissionRate) / 100;
    return this.prisma.partnerCommission.create({
      data: {
        partnerId,
        ...dto,
        currencyCode:
          dto.currencyCode ??
          partner.currencyCode ??
          (await this.reportingCurrency()),
        commissionNumber: createReference('COM'),
        commissionAmount: amount,
        earnedAt: dto.earnedAt ? new Date(dto.earnedAt) : null,
        dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      },
    });
  }
  async updateCommission(
    partnerId: string,
    id: string,
    dto: UpdatePartnerCommissionDto,
  ) {
    const item = await this.prisma.partnerCommission.findFirst({
      where: { id, partnerId },
    });
    if (!item) throw new NotFoundException('Commission was not found.');
    return this.prisma.partnerCommission.update({
      where: { id },
      data: {
        status: dto.status,
        ...(dto.status === 'PAID' ? { paidAt: new Date() } : {}),
      },
    });
  }
  private async validateOwner(id?: string) {
    if (!id) return;
    const owner = await this.prisma.platformUser.findFirst({
      where: { id, status: 'ACTIVE' },
    });
    if (!owner)
      throw new BadRequestException('Select an active platform owner.');
  }

  private async reportingCurrency() {
    const setting = await this.prisma.platformSetting.findUnique({
      where: { key: 'platform-defaults' },
      select: { value: true },
    });
    const value =
      setting?.value &&
      typeof setting.value === 'object' &&
      !Array.isArray(setting.value)
        ? (setting.value as Record<string, unknown>)
        : {};
    return typeof value.reportingCurrency === 'string'
      ? value.reportingCurrency.toUpperCase()
      : typeof value.currency === 'string'
        ? value.currency.toUpperCase()
        : 'USD';
  }

  private async uniqueReferralCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const code = `DP-P-${randomBytes(6)
        .toString('base64url')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 10)}`;
      if (
        !(await this.prisma.partnerReferralLink.findUnique({ where: { code } }))
      )
        return code;
    }
    throw new BadRequestException('Unable to generate a unique referral code.');
  }
}

function partnerViewWhere(viewKey?: string): Prisma.PartnerWhereInput {
  const statuses: Record<string, PartnerStatus[]> = {
    'partner-inquiries': [PartnerStatus.INQUIRY, PartnerStatus.NEW_INQUIRY],
    'under-review': [PartnerStatus.UNDER_REVIEW],
    'more-information-required': [PartnerStatus.MORE_INFORMATION_REQUIRED],
    'agreement-pending': [PartnerStatus.APPROVED_AWAITING_AGREEMENT],
    'pending-onboarding': [
      PartnerStatus.ONBOARDING_PENDING,
      PartnerStatus.ONBOARDING_INVITED,
      PartnerStatus.ONBOARDING_IN_PROGRESS,
    ],
    active: [PartnerStatus.ACTIVE],
    suspended: [PartnerStatus.SUSPENDED],
    rejected: [PartnerStatus.REJECTED],
    inactive: [PartnerStatus.INACTIVE, PartnerStatus.TERMINATED],
  };
  if (viewKey === 'awaiting-dijipeople-signature')
    return {
      agreements: {
        some: {
          status: {
            in: ['SENT', 'VIEWED', 'SIGNATURE_IN_PROGRESS', 'PARTIALLY_SIGNED'],
          },
          signatureRequests: {
            some: {
              recipients: {
                some: {
                  role: { contains: 'DijiPeople', mode: 'insensitive' },
                  status: { not: 'SIGNED' },
                },
              },
            },
          },
        },
      },
    };
  if (viewKey === 'awaiting-partner-signature')
    return {
      agreements: {
        some: {
          status: {
            in: ['SENT', 'VIEWED', 'SIGNATURE_IN_PROGRESS', 'PARTIALLY_SIGNED'],
          },
          signatureRequests: {
            some: {
              recipients: {
                some: {
                  NOT: {
                    role: { contains: 'DijiPeople', mode: 'insensitive' },
                  },
                  status: { not: 'SIGNED' },
                },
              },
            },
          },
        },
      },
    };
  const values = viewKey ? statuses[viewKey] : undefined;
  return values ? { status: { in: values } } : {};
}

function partnerTransition(
  current: PartnerStatus,
  action: PartnerLifecycleActionDto['action'],
) {
  const allowed: Record<
    PartnerLifecycleActionDto['action'],
    { from: PartnerStatus[]; to: PartnerStatus }
  > = {
    'start-review': {
      from: [
        PartnerStatus.INQUIRY,
        PartnerStatus.NEW_INQUIRY,
        PartnerStatus.MORE_INFORMATION_REQUIRED,
      ],
      to: PartnerStatus.UNDER_REVIEW,
    },
    approve: {
      from: [
        PartnerStatus.INQUIRY,
        PartnerStatus.NEW_INQUIRY,
        PartnerStatus.UNDER_REVIEW,
        PartnerStatus.MORE_INFORMATION_REQUIRED,
      ],
      to: PartnerStatus.APPROVED_AWAITING_AGREEMENT,
    },
    reject: {
      from: [
        PartnerStatus.INQUIRY,
        PartnerStatus.NEW_INQUIRY,
        PartnerStatus.UNDER_REVIEW,
        PartnerStatus.MORE_INFORMATION_REQUIRED,
        PartnerStatus.APPROVED_AWAITING_AGREEMENT,
      ],
      to: PartnerStatus.REJECTED,
    },
    'request-information': {
      from: [
        PartnerStatus.INQUIRY,
        PartnerStatus.NEW_INQUIRY,
        PartnerStatus.UNDER_REVIEW,
      ],
      to: PartnerStatus.MORE_INFORMATION_REQUIRED,
    },
    suspend: { from: [PartnerStatus.ACTIVE], to: PartnerStatus.SUSPENDED },
    reactivate: {
      from: [PartnerStatus.SUSPENDED, PartnerStatus.INACTIVE],
      to: PartnerStatus.ACTIVE,
    },
    deactivate: {
      from: [PartnerStatus.ACTIVE, PartnerStatus.SUSPENDED],
      to: PartnerStatus.INACTIVE,
    },
  };
  const rule = allowed[action];
  if (!rule.from.includes(current))
    throw new BadRequestException(
      `Action ${action} is not available while the partner is ${current}.`,
    );
  return rule.to;
}

function partnerActionMessage(
  action: PartnerLifecycleActionDto['action'],
  name: string,
) {
  const messages = {
    'start-review': `Partner application for ${name} moved to review.`,
    approve: `Partner application for ${name} was approved pending agreement.`,
    reject: `Partner application for ${name} was rejected.`,
    'request-information': `More information was requested from ${name}.`,
    suspend: `Partner account for ${name} was suspended.`,
    reactivate: `Partner account for ${name} was reactivated.`,
    deactivate: `Partner account for ${name} was deactivated.`,
  };
  return messages[action];
}

function normalizeTargetPath(value?: string) {
  const path = value?.trim() || '/request-demo';
  if (!path.startsWith('/') || path.startsWith('//'))
    throw new BadRequestException(
      'Referral target must be a safe site-relative path.',
    );
  return path;
}

function partnerRuntimeWhere(
  filters: Array<{ field: string; operator: string; value?: unknown }>,
): Prisma.PartnerWhereInput {
  const clauses: Prisma.PartnerWhereInput[] = [];
  for (const filter of filters) {
    const value = toDisplayString(filter.value ?? '').trim();
    if (!value && !['isNull', 'isNotNull'].includes(filter.operator)) continue;
    if (filter.field === 'type') clauses.push({ type: value as never });
    else if (filter.field === 'status')
      clauses.push({ status: value as never });
    else if (filter.field === 'displayName')
      clauses.push({ displayName: stringCondition(filter.operator, value) });
    else if (filter.field === 'email')
      clauses.push({ email: stringCondition(filter.operator, value) });
    else if (filter.field === 'country')
      clauses.push({
        country: nullableStringCondition(filter.operator, value),
      });
    else if (filter.field === 'assignedToUserId')
      clauses.push({
        assignedToUserId: nullableScalarCondition(filter.operator, value),
      });
    else if (filter.field === 'onboardingStatus')
      clauses.push({
        onboardingApplications: { some: { status: value as never } },
      });
    else if (filter.field === 'agreementStatus')
      clauses.push({ agreements: { some: { status: value as never } } });
    else if (filter.field === 'signatureStatus')
      clauses.push({
        agreements: {
          some: { signatureRequests: { some: { status: value as never } } },
        },
      });
    else if (filter.field === 'defaultCommissionRate')
      clauses.push({
        defaultCommissionRate: numericCondition(filter.operator, Number(value)),
      });
    else if (filter.field === 'createdAt')
      clauses.push({ createdAt: dateCondition(filter.operator, value) });
  }
  return clauses.length ? { AND: clauses } : {};
}

function partnerRuntimeOrder(
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>,
): Prisma.PartnerOrderByWithRelationInput[] {
  const supported = new Set([
    'displayName',
    'type',
    'status',
    'email',
    'country',
    'defaultCommissionRate',
    'createdAt',
    'updatedAt',
  ]);
  const result = sort
    .filter((item) => supported.has(item.field))
    .map((item) => ({
      [item.field]: item.direction,
    })) as Prisma.PartnerOrderByWithRelationInput[];
  return result.length ? result : [{ createdAt: 'desc' }];
}

function stringCondition(operator: string, value: string) {
  if (operator === 'ne') return { not: value };
  if (operator === 'startsWith')
    return { startsWith: value, mode: 'insensitive' as const };
  if (operator === 'contains')
    return { contains: value, mode: 'insensitive' as const };
  return { equals: value, mode: 'insensitive' as const };
}
function nullableStringCondition(operator: string, value: string) {
  if (operator === 'isNull') return null;
  if (operator === 'isNotNull') return { not: null };
  return stringCondition(operator, value);
}
function nullableScalarCondition(operator: string, value: string) {
  if (operator === 'isNull') return null;
  if (operator === 'isNotNull') return { not: null };
  if (operator === 'ne') return { not: value };
  return value;
}
function numericCondition(operator: string, value: number) {
  if (operator === 'gt') return { gt: value };
  if (operator === 'gte') return { gte: value };
  if (operator === 'lt') return { lt: value };
  if (operator === 'lte') return { lte: value };
  if (operator === 'ne') return { not: value };
  return value;
}
function dateCondition(operator: string, value: string) {
  const date = new Date(value);
  if (operator === 'gt') return { gt: date };
  if (operator === 'gte') return { gte: date };
  if (operator === 'lt') return { lt: date };
  if (operator === 'lte') return { lte: date };
  if (operator === 'ne') return { not: date };
  return date;
}
function partnerData(
  dto: CreatePartnerDto | UpdatePartnerDto,
  currencyCode: string,
) {
  return {
    ...dto,
    displayName: dto.displayName.trim(),
    email: dto.email.trim().toLowerCase(),
    currencyCode: currencyCode.toUpperCase(),
    status: dto.status ?? PartnerStatus.DRAFT,
    defaultCommissionRate: dto.defaultCommissionRate,
  };
}
function normalizePartner<T extends Record<string, any>>(item: T) {
  return {
    ...item,
    defaultCommissionRate:
      item.defaultCommissionRate !== undefined
        ? Number(item.defaultCommissionRate)
        : undefined,
    agreements: item.agreements?.map((c: any) => ({
      ...c,
      contractValue:
        c.contractValue === null || c.contractValue === undefined
          ? null
          : Number(c.contractValue),
    })),
    commissions: item.commissions?.map((c: any) => ({
      ...c,
      baseAmount: Number(c.baseAmount),
      commissionRate: Number(c.commissionRate),
      commissionAmount: Number(c.commissionAmount),
    })),
  };
}

function createReference(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
