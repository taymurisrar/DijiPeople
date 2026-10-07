import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PartnerAccountStatus,
  PartnerCommissionStatus,
  PartnerStatus,
  PartnerType,
  Prisma,
} from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import { toDisplayString } from '../../common/utils/display-string';
import { AuditService } from '../audit/audit.service';
import { PlatformNumberingService } from '../../common/numbering/platform-numbering.service';
import { assertCurrencyEnabled } from '../../common/reference-data/platform-enabled-currencies';
import { AppError } from '../../common/errors/app-error';
import {
  assertCommissionLinksBelongToPartner,
  commissionActionForTarget,
  commissionSourceLabel,
  commissionTransition,
  computeCommissionAmount,
  normalizeCommission,
  resolveCommissionRate,
  type PartnerCommissionActionKey,
} from './partner-commission-lifecycle';
import {
  assertNoPartnerDuplicate,
  findPartnerDuplicate,
} from './partner-duplicate-detection';
import { missingAdminIdentityFields } from './partner-type-policy';
import {
  accountStatusAfterAction,
  partnerStatusRequiresAction,
  partnerTransition,
} from './partner-lifecycle';
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly numbering: PlatformNumberingService,
  ) {}

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
    return this.create(dto, user.userId);
  }

  updateForUser(user: AuthenticatedUser, id: string, dto: UpdatePartnerDto) {
    this.assertWrite(user);
    return this.update(id, dto, user.userId);
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
    return this.createCommission(id, dto, user.userId);
  }

  updateCommissionForUser(
    user: AuthenticatedUser,
    id: string,
    commissionId: string,
    dto: UpdatePartnerCommissionDto,
  ) {
    this.assertWrite(user);
    return this.updateCommission(id, commissionId, dto, user.userId);
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
              {
                partnerNumber: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
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
    return normalizePartner({
      ...item,
      commissions: await this.describeCommissions(item.commissions),
    });
  }

  async lifecycleAction(
    id: string,
    actorId: string,
    dto: PartnerLifecycleActionDto,
  ) {
    const partner = await this.get(id);
    const next = partnerTransition(partner.status, dto.action);
    const accountStatus = accountStatusAfterAction(
      dto.action,
      partner.portalUsers.some(
        (portalUser: { status: string }) => portalUser.status === 'ACTIVE',
      ),
    );
    const eventType = `PARTNER_${dto.action.toUpperCase().replaceAll('-', '_')}`;
    await this.prisma.$transaction([
      this.prisma.partner.update({
        where: { id },
        data: { status: next, ...(accountStatus ? { accountStatus } : {}) },
      }),
      this.prisma.partnerTimeline.create({
        data: {
          partnerId: id,
          eventType,
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
    /*
     * BUG-3551. Every lifecycle transition wrote to `PartnerTimeline` — a
     * partner-scoped, free-text table reachable only from that partner's own
     * detail page — and never to `AuditService`/`PlatformAuditLog`, the table
     * the platform's general audit views actually read. `leads.service.ts`,
     * the sibling funnel, has audited its transitions since it was written;
     * this was the omission, not a decision (D2 discovery, §6/§10.1).
     */
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: actorId,
      action: eventType,
      entityType: 'Partner',
      entityId: id,
      beforeSnapshot: {
        status: partner.status,
        accountStatus: partner.accountStatus,
      },
      afterSnapshot: {
        status: next,
        accountStatus: accountStatus ?? partner.accountStatus,
        reason: dto.reason ?? null,
      },
    });
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
      // Only platform-authorized regeneration reaches here through
      // `referralLinkActionForUser`; the Partner-portal caller creates links
      // through `createPartnerReferralLink` in partner-experience.service.ts,
      // which does not call this method.
      await this.auditService.log({
        tenantId: 'platform',
        actorUserId: actorId ?? null,
        action: 'PARTNER_REFERRAL_LINK_REGENERATED',
        entityType: 'PartnerReferralLink',
        entityId: link.id,
        beforeSnapshot: { code: link.code, status: link.status },
        afterSnapshot: {
          replacedById: replacement.id,
          newCode: replacement.code,
        },
      });
      return replacement;
    }
    const updated = await this.prisma.partnerReferralLink.update({
      where: { id: link.id },
      data:
        action === 'enable'
          ? { status: 'ACTIVE', expiresAt: null }
          : action === 'disable'
            ? { status: 'DISABLED', isDefault: false }
            : { status: 'EXPIRED', expiresAt: new Date(), isDefault: false },
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: actorId ?? null,
      action: `PARTNER_REFERRAL_LINK_${action.toUpperCase()}`,
      entityType: 'PartnerReferralLink',
      entityId: link.id,
      beforeSnapshot: { status: link.status },
      afterSnapshot: { status: updated.status },
    });
    return updated;
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
  async create(dto: CreatePartnerDto, actorId?: string) {
    await this.validateOwner(dto.assignedToUserId);
    assertPartnerIdentityFields(dto);
    /*
     * BUG-3550. This was the path with no duplicate detection at all — an
     * operator could create any number of `Partner` rows sharing an email,
     * tax id or company name through `POST /partners`. The public inquiry
     * path (`submitInquiry`) already checked email/company-name; this brings
     * the internal path to at least the same standard, and adds `taxId`,
     * which neither path checked before.
     */
    assertNoPartnerDuplicate(await findPartnerDuplicate(this.prisma, dto));
    // ADR-0026 D4: a chosen currency must be enabled; the fallback always is.
    if (dto.currencyCode)
      await assertCurrencyEnabled(this.prisma, dto.currencyCode);
    const currencyCode = dto.currencyCode ?? (await this.reportingCurrency());
    /*
     * ADR-0027. The partner number is allocated on the create's own
     * transaction, last, so the sequence row is locked only for the insert and
     * a refused create (a unique clash, say) hands its number back. It is set
     * after the DTO spread so nothing a caller sends can supply it, and no
     * update path writes it — `partnerUpdateData` does not know the field.
     */
    const created = await this.prisma.$transaction(async (tx) => {
      const partnerNumber = await this.numbering.next('partner', tx);
      const row = await tx.partner.create({
        data: {
          ...partnerData(dto, currencyCode),
          code: createReference('PTR'),
          partnerNumber,
        },
      });
      await this.auditService.log(
        {
          tenantId: 'platform',
          actorUserId: actorId ?? null,
          action: 'PARTNER_CREATED',
          entityType: 'Partner',
          entityId: row.id,
          afterSnapshot: partnerAuditSnapshot(row),
        },
        tx,
      );
      return row;
    });
    return normalizePartner(created);
  }
  async update(id: string, dto: UpdatePartnerDto, actorId?: string) {
    const existing = await this.get(id);
    /*
     * ADR-0026 D1 — update never changes status. The DTO no longer declares it,
     * so an HTTP body carrying it is refused by `forbidNonWhitelisted` before
     * reaching here; this is the guard for an internal caller handing over an
     * object that still has one (the runtime header status once spread the
     * whole GET record into this method).
     *
     * REG-015 pinned two directions — into ACTIVE and out of ACTIVE. Both are
     * now one rule: any status other than the current one is a lifecycle
     * action's job, because only an action checks the from-state, records a
     * timeline entry and audits the reason.
     */
    const requestedStatus = (dto as { status?: unknown }).status;
    if (requestedStatus !== undefined && requestedStatus !== existing.status)
      throw partnerStatusRequiresAction(existing.status);
    await this.validateOwner(dto.assignedToUserId);
    /*
     * WP-08 finding 3. `dto` may now be a genuinely partial patch — validate
     * the record as it would read *after* the patch, not the patch body in
     * isolation. A `{ notes: '...' }` patch on an already-compliant COMPANY
     * partner must not be told it is missing a company name it never touched;
     * a patch that clears the one it has must still be refused.
     */
    const merged = mergedPartnerIdentity(existing, dto);
    assertPartnerIdentityFields(merged);
    assertNoPartnerDuplicate(
      await findPartnerDuplicate(this.prisma, merged, id),
    );
    /*
     * ADR-0026 D4. Only a *change* of currency is checked against the enabled
     * set: a partner whose currency was disabled after it was chosen keeps it
     * through every unrelated edit (the runtime form resubmits the field).
     */
    if (
      dto.currencyCode !== undefined &&
      dto.currencyCode.toUpperCase() !== existing.currencyCode
    )
      await assertCurrencyEnabled(this.prisma, dto.currencyCode);
    const updated = await this.prisma.partner.update({
      where: { id },
      data: partnerUpdateData(dto),
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: actorId ?? null,
      action: 'PARTNER_UPDATED',
      entityType: 'Partner',
      entityId: id,
      beforeSnapshot: partnerAuditSnapshot(existing),
      afterSnapshot: partnerAuditSnapshot(updated),
    });
    return normalizePartner(updated);
  }

  /**
   * Record a commission against a partner (ADR-0026 D3; EXECPLAN-0055 WP-06).
   *
   * An operator-created ledger entry — nothing accrues these from billing.
   * Every column is picked explicitly: the DTO used to be spread into the
   * create, so whatever it gained reached the row. The rate defaults to the
   * partner's configured default, the amount is computed here, the currency
   * defaults to the partner's own, and a linked lead, customer or invoice must
   * be one this partner referred.
   */
  async createCommission(
    partnerId: string,
    dto: CreatePartnerCommissionDto,
    actorId?: string,
  ) {
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        id: true,
        displayName: true,
        currencyCode: true,
        defaultCommissionRate: true,
      },
    });
    if (!partner) throw new NotFoundException('Partner was not found.');
    const rate = resolveCommissionRate(
      dto.commissionRate,
      partner.defaultCommissionRate,
    );
    const requestedCurrency = dto.currencyCode?.toUpperCase();
    // ADR-0026 D4: an explicitly chosen currency other than the partner's own.
    if (requestedCurrency && requestedCurrency !== partner.currencyCode)
      await assertCurrencyEnabled(this.prisma, requestedCurrency);
    await assertCommissionLinksBelongToPartner(this.prisma, partnerId, {
      leadId: dto.leadId,
      customerAccountId: dto.customerAccountId,
      invoiceId: dto.invoiceId,
    });
    const currencyCode =
      requestedCurrency ??
      partner.currencyCode ??
      (await this.reportingCurrency());
    const commissionAmount = computeCommissionAmount(dto.baseAmount, rate);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.partnerCommission.create({
        data: {
          partnerId,
          leadId: dto.leadId ?? null,
          customerAccountId: dto.customerAccountId ?? null,
          invoiceId: dto.invoiceId ?? null,
          commissionNumber: createReference('COM'),
          status: PartnerCommissionStatus.PENDING,
          baseAmount: dto.baseAmount,
          commissionRate: rate,
          commissionAmount,
          currencyCode,
          description: dto.description?.trim() || null,
          earnedAt: dto.earnedAt ? new Date(dto.earnedAt) : null,
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
        },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId,
          eventType: 'COMMISSION_CREATED',
          actorType: 'PLATFORM_USER',
          actorId,
          message: `Commission ${row.commissionNumber} of ${currencyCode} ${commissionAmount.toFixed(2)} (${rate.toString()}% of ${currencyCode} ${Number(dto.baseAmount).toFixed(2)}) was recorded.`,
          metadata: {
            commissionId: row.id,
            commissionNumber: row.commissionNumber,
          },
        },
      });
      await this.auditService.log(
        {
          tenantId: 'platform',
          actorUserId: actorId ?? null,
          action: 'PARTNER_COMMISSION_CREATED',
          entityType: 'PartnerCommission',
          entityId: row.id,
          afterSnapshot: commissionAuditSnapshot(row),
        },
        tx,
      );
      return row;
    });
    return normalizeCommission(created);
  }

  /**
   * `PATCH /partners/:id/commissions/:commissionId { status }` — kept for
   * existing callers, and held to the same machine as the actions: the target
   * status is translated to the one action that reaches it from the current
   * status, or refused.
   */
  async updateCommission(
    partnerId: string,
    id: string,
    dto: UpdatePartnerCommissionDto,
    actorId?: string,
  ) {
    const item = await this.prisma.partnerCommission.findFirst({
      where: { id, partnerId },
      select: { id: true, status: true },
    });
    if (!item) throw new NotFoundException('Commission was not found.');
    return this.commissionAction(
      id,
      commissionActionForTarget(item.status, dto.status),
      actorId,
      dto.reason,
      partnerId,
    );
  }

  /**
   * Move a commission one step through its status machine. Approve, mark
   * payable, mark paid, or void (until paid). Paid stamps `paidAt`; nothing
   * else about the entry changes. Audited with the actor and written to the
   * partner's timeline in the same transaction.
   */
  async commissionAction(
    id: string,
    action: PartnerCommissionActionKey,
    actorId?: string,
    reason?: string | null,
    partnerId?: string,
  ) {
    const item = await this.prisma.partnerCommission.findFirst({
      where: { id, ...(partnerId ? { partnerId } : {}) },
    });
    if (!item) throw new NotFoundException('Commission was not found.');
    const next = commissionTransition(item.status, action);
    const updated = await this.prisma.$transaction(async (tx) => {
      /*
       * Conditional on the status read above, so two operators pressing
       * different buttons at once cannot both succeed — the second matches no
       * row and is told to refresh.
       */
      const changed = await tx.partnerCommission.updateMany({
        where: { id, status: item.status },
        data: {
          status: next,
          ...(next === PartnerCommissionStatus.PAID
            ? { paidAt: new Date() }
            : {}),
        },
      });
      if (changed.count !== 1)
        throw new AppError('PARTNER_COMMISSION_TRANSITION_NOT_ALLOWED', {
          message:
            'The commission was changed by someone else. Refresh it to see its current status.',
        });
      const row = await tx.partnerCommission.findUniqueOrThrow({
        where: { id },
      });
      await tx.partnerTimeline.create({
        data: {
          partnerId: item.partnerId,
          eventType: `COMMISSION_${next}`,
          actorType: 'PLATFORM_USER',
          actorId,
          message: `Commission ${item.commissionNumber} moved from ${item.status} to ${next}.`,
          metadata: {
            commissionId: id,
            commissionNumber: item.commissionNumber,
            ...(reason ? { reason } : {}),
          },
        },
      });
      await this.auditService.log(
        {
          tenantId: 'platform',
          actorUserId: actorId ?? null,
          action: `PARTNER_COMMISSION_${next}`,
          entityType: 'PartnerCommission',
          entityId: id,
          beforeSnapshot: commissionAuditSnapshot(item),
          afterSnapshot: {
            ...commissionAuditSnapshot(row),
            reason: reason ?? null,
          },
        },
        tx,
      );
      return row;
    });
    return normalizeCommission(updated);
  }

  /**
   * Commissions as reads return them: decimals as numbers, plus a
   * `sourceLabel` naming the lead, customer or invoice each was recorded
   * against (the ids are plain columns, so the names are looked up here).
   */
  async describeCommissions<
    T extends {
      leadId: string | null;
      customerAccountId: string | null;
      invoiceId: string | null;
      baseAmount: unknown;
      commissionRate: unknown;
      commissionAmount: unknown;
    },
  >(commissions: T[]) {
    const ids = (pick: (row: T) => string | null) => [
      ...new Set(commissions.map(pick).filter((v): v is string => !!v)),
    ];
    const leadIds = ids((c) => c.leadId);
    const customerIds = ids((c) => c.customerAccountId);
    const invoiceIds = ids((c) => c.invoiceId);
    const [leads, customers, invoices] = await Promise.all([
      leadIds.length
        ? this.prisma.lead.findMany({
            where: { id: { in: leadIds } },
            select: { id: true, companyName: true },
          })
        : ([] as Array<{ id: string; companyName: string }>),
      customerIds.length
        ? this.prisma.customerAccount.findMany({
            where: { id: { in: customerIds } },
            select: { id: true, companyName: true },
          })
        : ([] as Array<{ id: string; companyName: string }>),
      invoiceIds.length
        ? this.prisma.invoice.findMany({
            where: { id: { in: invoiceIds } },
            select: { id: true, invoiceNumber: true },
          })
        : ([] as Array<{ id: string; invoiceNumber: string }>),
    ]);
    const names = {
      leads: new Map<string, string>(
        leads.map((row): [string, string] => [row.id, row.companyName]),
      ),
      customers: new Map<string, string>(
        customers.map((row): [string, string] => [row.id, row.companyName]),
      ),
      invoices: new Map<string, string>(
        invoices.map((row): [string, string] => [row.id, row.invoiceNumber]),
      ),
    };
    return commissions.map((commission) => ({
      ...normalizeCommission(commission),
      sourceLabel: commissionSourceLabel(commission, names),
    }));
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
    else if (filter.field === 'partnerNumber')
      clauses.push({
        partnerNumber: nullableStringCondition(filter.operator, value),
      });
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
    'partnerNumber',
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
/**
 * BUG-3549. `type` (INDIVIDUAL/COMPANY) used to accept any combination of
 * identity fields — an individual could be created with no name at all, and a
 * company with no company name. `partner-type-policy.ts` is the one place
 * that now says what each type requires.
 *
 * A free function, not a method: `partner-lifecycle-guards.spec.ts` exercises
 * `update()` through a structural `this` cast carrying only the collaborators
 * that test needs, and a method reaching back into `this` for a pure
 * validation rule would make that test's minimal context an accidental
 * dependency of this one.
 */
function assertPartnerIdentityFields(identity: {
  type: PartnerType;
  companyName?: string | null;
  contactFirstName?: string | null;
  contactLastName?: string | null;
}) {
  const missing = missingAdminIdentityFields(identity.type, identity);
  if (missing.length)
    throw new BadRequestException(
      `${identity.type === 'COMPANY' ? 'A company' : 'An individual'} partner requires: ${missing.join(', ')}.`,
    );
}

/*
 * Fields are picked, not spread (ADR-0026 D1). `...dto` carried `status`
 * straight into the insert, so a partner could be created ACTIVE; and a spread
 * writes whatever an internal caller's object happens to hold. Every partner
 * starts at DRAFT with no portal account — both move only through lifecycle
 * actions.
 */
function partnerData(dto: CreatePartnerDto, currencyCode: string) {
  return {
    type: dto.type,
    displayName: dto.displayName.trim(),
    legalName: dto.legalName,
    companyName: dto.companyName,
    contactFirstName: dto.contactFirstName,
    contactLastName: dto.contactLastName,
    email: dto.email.trim().toLowerCase(),
    phone: dto.phone,
    country: dto.country,
    website: dto.website,
    taxId: dto.taxId,
    partnershipModel: dto.partnershipModel,
    defaultCommissionRate: dto.defaultCommissionRate,
    currencyCode: currencyCode.toUpperCase(),
    assignedToUserId: dto.assignedToUserId,
    notes: dto.notes,
    status: PartnerStatus.DRAFT,
    accountStatus: PartnerAccountStatus.NOT_PROVISIONED,
  };
}

/**
 * WP-08 finding 3. What `PATCH /partners/:id` actually writes, now that
 * `UpdatePartnerDto` is genuinely partial (`PartialType(CreatePartnerDto)`).
 *
 * `partnerData()` above assumes every field is present — true for `create()`,
 * where the DTO's own required decorators guarantee it, and no longer true
 * here. Spreading `...dto` the way `partnerData()` does would write
 * `undefined` over every column the patch did not mention (Prisma treats an
 * explicit `undefined` in `data` as "do not touch this field" in some
 * versions and as a validation error in others — either way, not what a
 * caller who sent `{ notes: '...' }` meant), and unconditionally defaulting
 * `status` to `DRAFT` would silently demote every partner whose patch simply
 * did not mention status. Each field is written only when the patch actually
 * included it.
 */
function partnerUpdateData(dto: UpdatePartnerDto) {
  const data: Record<string, unknown> = {};
  if (dto.type !== undefined) data.type = dto.type;
  if (dto.displayName !== undefined) data.displayName = dto.displayName.trim();
  if (dto.legalName !== undefined) data.legalName = dto.legalName;
  if (dto.companyName !== undefined) data.companyName = dto.companyName;
  if (dto.contactFirstName !== undefined)
    data.contactFirstName = dto.contactFirstName;
  if (dto.contactLastName !== undefined)
    data.contactLastName = dto.contactLastName;
  if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
  if (dto.phone !== undefined) data.phone = dto.phone;
  if (dto.country !== undefined) data.country = dto.country;
  if (dto.website !== undefined) data.website = dto.website;
  if (dto.taxId !== undefined) data.taxId = dto.taxId;
  if (dto.partnershipModel !== undefined)
    data.partnershipModel = dto.partnershipModel;
  if (dto.defaultCommissionRate !== undefined)
    data.defaultCommissionRate = dto.defaultCommissionRate;
  if (dto.currencyCode !== undefined)
    data.currencyCode = dto.currencyCode.toUpperCase();
  if (dto.assignedToUserId !== undefined)
    data.assignedToUserId = dto.assignedToUserId;
  if (dto.notes !== undefined) data.notes = dto.notes;
  return data;
}

/**
 * The identity/identifier fields a patch would leave the partner with, for
 * validating against `partner-type-policy.ts` and re-running duplicate
 * detection (`partner-duplicate-detection.ts`) — the field the patch sent, or
 * the value already on the record when the patch did not touch it.
 */
function mergedPartnerIdentity(
  existing: {
    type: PartnerType;
    email: string;
    taxId: string | null;
    companyName: string | null;
    contactFirstName: string | null;
    contactLastName: string | null;
  },
  dto: UpdatePartnerDto,
) {
  return {
    type: dto.type ?? existing.type,
    email: dto.email ?? existing.email,
    taxId: dto.taxId !== undefined ? dto.taxId : existing.taxId,
    companyName:
      dto.companyName !== undefined ? dto.companyName : existing.companyName,
    contactFirstName:
      dto.contactFirstName !== undefined
        ? dto.contactFirstName
        : existing.contactFirstName,
    contactLastName:
      dto.contactLastName !== undefined
        ? dto.contactLastName
        : existing.contactLastName,
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

/**
 * The fields an auditor querying "who changed this partner" needs — not the
 * whole row. `applicationSnapshot` (the raw original submission) and `notes`
 * are left out: the former duplicates what the audit trail already has a
 * dedicated origin for, and neither is a field an audit reviewer changes
 * decisions on the way status, ownership or commission terms are.
 */
function partnerAuditSnapshot(partner: {
  id: string;
  code: string;
  partnerNumber?: string | null;
  type: string;
  displayName: string;
  companyName: string | null;
  email: string;
  status: string;
  accountStatus: string;
  assignedToUserId: string | null;
  defaultCommissionRate: unknown;
  currencyCode: string;
}) {
  return {
    id: partner.id,
    code: partner.code,
    partnerNumber: partner.partnerNumber ?? null,
    type: partner.type,
    displayName: partner.displayName,
    companyName: partner.companyName,
    email: partner.email,
    status: partner.status,
    accountStatus: partner.accountStatus,
    assignedToUserId: partner.assignedToUserId,
    defaultCommissionRate: Number(partner.defaultCommissionRate),
    currencyCode: partner.currencyCode,
  };
}

/** The money terms and state of a commission, for its audit rows. */
function commissionAuditSnapshot(commission: {
  partnerId: string;
  commissionNumber: string;
  status: string;
  baseAmount: unknown;
  commissionRate: unknown;
  commissionAmount: unknown;
  currencyCode: string;
  leadId: string | null;
  customerAccountId: string | null;
  invoiceId: string | null;
  paidAt: Date | null;
}) {
  return {
    partnerId: commission.partnerId,
    commissionNumber: commission.commissionNumber,
    status: commission.status,
    baseAmount: Number(commission.baseAmount),
    commissionRate: Number(commission.commissionRate),
    commissionAmount: Number(commission.commissionAmount),
    currencyCode: commission.currencyCode,
    leadId: commission.leadId,
    customerAccountId: commission.customerAccountId,
    invoiceId: commission.invoiceId,
    paidAt: commission.paidAt,
  };
}

function createReference(prefix: string) {
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}
