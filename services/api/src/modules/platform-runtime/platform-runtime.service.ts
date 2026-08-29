import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { LeadsService } from '../leads/leads.service';
import {
  CreateAdminLeadDto,
  ConvertLeadToCustomerDto,
  LeadQueryDto,
  UpdateAdminLeadDto,
} from '../leads/dto/admin-lead.dto';
import { PartnersService } from '../partners/partners.service';
import {
  CreatePartnerDto,
  PartnerQueryDto,
  UpdatePartnerDto,
} from '../partners/dto/partner.dto';
import { PartnerDeletionService } from '../partners/partner-deletion.service';
import { SuperAdminService } from '../super-admin/super-admin.service';
import {
  CreateCustomerDto,
  CreateCustomerOnboardingRecordDto,
  CustomerOnboardingQueryDto,
  CustomerQueryDto,
  UpdateCustomerDto,
  UpdateCustomerOnboardingDto,
} from '../super-admin/dto/customer-lifecycle.dto';
import { UpdateTenantDto } from '../super-admin/dto/update-tenant.dto';
import { UpdatePlanDto } from '../super-admin/dto/update-plan.dto';
import { PlatformMonitoringService } from '../platform-monitoring/platform-monitoring.service';
import { AuditService } from '../audit/audit.service';
import { ContractsService } from '../contracts/contracts.service';
import {
  ContractQueryDto,
  CreateContractDto,
  UpdateContractDto,
} from '../contracts/dto/contracts.dto';
import { SupportCasesService } from '../support-cases/support-cases.service';
import {
  CreateSupportCaseDto,
  SupportCaseQueryDto,
  UpdateSupportCaseDto,
} from '../support-cases/dto/support-cases.dto';
import type {
  PlatformRuntimeModuleKey,
  PlatformRuntimeQuery,
} from './platform-runtime.types';
import { PartnerExperienceService } from '../partner-experience/partner-experience.service';
import {
  type PlatformPermission,
  userHasPlatformPermission,
} from '../platform-auth/platform-permissions';
import { resolveRuntimeField, resolveRuntimeViewRule } from '@repo/config';
import { runtimeViewWhere } from './runtime-view-where';
import { PlatformRuntimeRelationsService } from './platform-runtime-relations.service';
import { TenantControlPlaneService } from '../tenant-control-plane/tenant-control-plane.service';
import { toDisplayString } from '../../common/utils/display-string';

@Injectable()
export class PlatformRuntimeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leads: LeadsService,
    private readonly partners: PartnersService,
    private readonly superAdmin: SuperAdminService,
    private readonly partnerDeletion: PartnerDeletionService,
    private readonly monitoring: PlatformMonitoringService,
    private readonly audit: AuditService,
    private readonly contracts: ContractsService,
    private readonly supportCases: SupportCasesService,
    private readonly partnerExperience: PartnerExperienceService,
    private readonly relations: PlatformRuntimeRelationsService,
    private readonly tenantControlPlane: TenantControlPlaneService,
  ) {}
  async list(
    user: AuthenticatedUser,
    moduleKey: string,
    query: PlatformRuntimeQuery,
  ) {
    this.assertPlatform(user);
    const key = this.key(moduleKey);
    this.assertModuleRead(user, key);
    const page = positive(query.page, 1);
    const pageSize = Math.min(positive(query.pageSize, 25), 100);
    const filter = readRuntimeFilters(query.filters);
    const sort = readRuntimeSort(query.sort);
    this.validateRuntimeQuery(key, filter, sort);
    switch (key) {
      case 'leads':
        return this.leads.listLeads(
          user,
          await dto(LeadQueryDto, {
            search: query.search,
            viewKey: query.viewKey,
            page,
            pageSize,
            status:
              stringFilter(filter, 'status') ??
              viewStatus(query.viewKey, {
                new: 'NEW',
                qualified: 'QUALIFIED',
                converted: 'CONVERTED',
              }),
            industry: stringFilter(filter, 'industry'),
            source: stringFilter(filter, 'source'),
            assignedToUserId:
              stringFilter(filter, 'assignedToUserId') ??
              stringFilter(filter, 'assignedToUser.id'),
            partnerId:
              stringFilter(filter, 'partnerId') ??
              stringFilter(filter, 'partner.id'),
            createdFrom: comparisonFilter(filter, 'createdAt', ['gte', 'gt']),
            createdTo: comparisonFilter(filter, 'createdAt', ['lte', 'lt']),
            sortField: sort[0]?.field,
            sortDirection: sort[0]?.direction,
          }),
        );
      case 'partners':
        return this.partners.list(
          await dto(PartnerQueryDto, {
            search: query.search,
            page,
            pageSize,
            status:
              stringFilter(filter, 'status') ??
              viewStatus(query.viewKey, {
                active: 'ACTIVE',
                suspended: 'SUSPENDED',
              }),
          }),
          { filters: filter, sort },
        );
      case 'partner-inquiries': {
        const items = await this.prisma.partnerInquiry.findMany({
          include: { partner: true },
          orderBy: { createdAt: 'desc' },
        });
        return paginateRuntimeRecords(
          items,
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      }
      case 'customers':
        return this.superAdmin.listCustomers(
          user,
          await dto(CustomerQueryDto, {
            search: query.search,
            viewKey: query.viewKey,
            page,
            pageSize,
            status: stringFilter(filter, 'status'),
            assignedToUserId:
              stringFilter(filter, 'assignedToUserId') ??
              stringFilter(filter, 'assignedToUser.id'),
          }),
          { sort },
        );
      case 'customer-onboarding':
        return this.superAdmin.listCustomerOnboardings(
          user,
          await dto(CustomerOnboardingQueryDto, {
            search: query.search,
            viewKey: query.viewKey,
            page,
            pageSize,
            status: stringFilter(filter, 'status'),
            onboardingOwnerUserId:
              stringFilter(filter, 'onboardingOwnerUserId') ??
              stringFilter(filter, 'onboardingOwner.id'),
          }),
        );
      case 'monitoring-incidents':
        return this.monitoring.listEvents(user, {
          search: query.search,
          viewKey: query.viewKey,
          page: String(page),
          pageSize: String(pageSize),
          status: stringFilter(filter, 'supportStatus'),
        });
      case 'contracts':
        return this.contracts.list(
          user,
          await dto(ContractQueryDto, {
            search: query.search,
            viewKey: query.viewKey,
            page,
            pageSize,
            status: stringFilter(filter, 'status'),
          }),
          { filters: filter, sort },
        );
      case 'contract-templates':
        return paginateRuntimeRecords(
          (await this.contracts.listTemplates(user)).items,
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      case 'signature-requests':
        return this.listSignatureRequests(
          page,
          pageSize,
          query.search,
          query.viewKey,
          user.platform?.id,
        );
      case 'support-cases':
        return this.supportCases.list(
          user,
          await dto(SupportCaseQueryDto, {
            search: query.search,
            viewKey: query.viewKey,
            page,
            pageSize,
            status: stringFilter(filter, 'status'),
          }),
          { filters: filter, sort },
        );
      case 'partner-onboarding': {
        const items = await this.prisma.partnerOnboardingApplication.findMany({
          include: {
            partner: true,
            submissions: { orderBy: { version: 'desc' }, take: 1 },
          },
          orderBy: { updatedAt: 'desc' },
        });
        return paginateRuntimeRecords(
          items,
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      }
      case 'commissions': {
        const items = await this.prisma.partnerCommission.findMany({
          include: { partner: true },
          orderBy: { createdAt: 'desc' },
        });
        return paginateRuntimeRecords(
          items,
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      }
      case 'tenants':
        return paginateRuntimeRecords(
          await this.superAdmin.listTenants(),
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      case 'subscriptions':
        return paginateRuntimeRecords(
          await this.superAdmin.listSubscriptions(),
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      case 'plans':
        return paginateRuntimeRecords(
          await this.superAdmin.listPlans(),
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      case 'invoices':
        return paginateRuntimeRecords(
          await this.superAdmin.listInvoices(),
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
      case 'payments':
        return paginateRuntimeRecords(
          await this.superAdmin.listPayments(),
          page,
          pageSize,
          query.search,
          query.viewKey,
          sort,
          filter,
          { moduleKey: key, platformUserId: user.platform?.id },
        );
    }
  }

  private validateRuntimeQuery(
    moduleKey: PlatformRuntimeModuleKey,
    filters: ReturnType<typeof readRuntimeFilters>,
    sort: ReturnType<typeof readRuntimeSort>,
  ) {
    for (const filter of filters) {
      const field = resolveRuntimeField(moduleKey, filter.field);
      if (!field)
        throw new BadRequestException(
          `Filter field ${filter.field} does not exist for ${moduleKey}.`,
        );
      if (!field.filterable)
        throw new BadRequestException(
          `Filter field ${filter.field} is not filterable.`,
        );
    }
    for (const item of sort) {
      const field = resolveRuntimeField(moduleKey, item.field);
      if (!field)
        throw new BadRequestException(
          `Sort field ${item.field} does not exist for ${moduleKey}.`,
        );
      if (!field.sortable)
        throw new BadRequestException(
          `Sort field ${item.field} is not sortable.`,
        );
    }
  }
  async get(user: AuthenticatedUser, moduleKey: string, id: string) {
    this.assertPlatform(user);
    const key = this.key(moduleKey);
    this.assertModuleRead(user, key);
    switch (key) {
      case 'leads':
        return envelope(await this.leads.getLead(user, id));
      case 'partners':
        return envelope(await this.partners.get(id));
      case 'partner-inquiries': {
        const item = await this.prisma.partnerInquiry.findUnique({
          where: { id },
          include: { partner: true },
        });
        if (!item)
          throw new NotFoundException('Partner inquiry was not found.');
        return envelope(item);
      }
      case 'customers':
        return envelope(await this.superAdmin.getCustomerDetail(user, id));
      case 'customer-onboarding':
        return envelope(await this.superAdmin.getCustomerOnboarding(user, id));
      case 'tenants':
        return envelope(await this.superAdmin.getTenantDetail(id));
      case 'plans':
        return envelope(await this.superAdmin.getPlanDetail(id));
      case 'invoices':
        return envelope(await this.superAdmin.getInvoiceDetail(id));
      case 'contracts':
        return envelope(await this.contracts.get(user, id));
      case 'support-cases':
        return envelope(await this.supportCases.get(user, id));
      case 'monitoring-incidents':
        return envelope(await this.monitoring.getEvent(user, id));
      case 'partner-onboarding': {
        const item = await this.prisma.partnerOnboardingApplication.findUnique({
          where: { id },
          include: {
            partner: true,
            submissions: { orderBy: { version: 'desc' } },
          },
        });
        if (!item)
          throw new NotFoundException(
            'Partner onboarding application was not found.',
          );
        return envelope(item);
      }
      case 'commissions': {
        const item = await this.prisma.partnerCommission.findUnique({
          where: { id },
          include: { partner: true },
        });
        if (!item)
          throw new NotFoundException('Partner commission was not found.');
        return envelope(item);
      }
      default: {
        const item = await this.findGeneric(this.key(moduleKey), id);
        return envelope(item);
      }
    }
  }
  async create(
    user: AuthenticatedUser,
    moduleKey: string,
    body: { values?: Record<string, unknown> },
  ) {
    const key = this.key(moduleKey);
    this.assertModuleWrite(user, key);
    const values = body.values ?? {};
    switch (key) {
      case 'leads':
        return envelope(
          await this.leads.createLead(
            user,
            await dto(CreateAdminLeadDto, values),
          ),
        );
      case 'partners':
        return envelope(
          await this.partners.create(await dto(CreatePartnerDto, values)),
        );
      case 'customers':
        return envelope(
          await this.superAdmin.createCustomer(
            user,
            await dto(CreateCustomerDto, values),
          ),
        );
      case 'customer-onboarding':
        return envelope(
          await this.superAdmin.createCustomerOnboarding(
            user,
            await dto(CreateCustomerOnboardingRecordDto, values),
          ),
        );
      case 'contracts':
        return envelope(
          await this.contracts.create(
            user,
            await dto(CreateContractDto, values),
          ),
        );
      case 'support-cases':
        return envelope(
          await this.supportCases.create(
            user,
            await dto(CreateSupportCaseDto, values),
          ),
        );
      default:
        throw new BadRequestException(
          'Create is not available for this module through the runtime.',
        );
    }
  }
  async update(
    user: AuthenticatedUser,
    moduleKey: string,
    id: string,
    body: { values?: Record<string, unknown>; version?: number },
  ) {
    const key = this.key(moduleKey);
    this.assertModuleWrite(user, key);
    const values = body.values ?? {};
    switch (key) {
      case 'leads':
        return envelope(
          await this.leads.updateLead(
            user,
            id,
            await dto(UpdateAdminLeadDto, values),
          ),
        );
      case 'partners':
        return envelope(
          await this.partners.update(id, await dto(UpdatePartnerDto, values)),
        );
      case 'customers':
        return envelope(
          await this.superAdmin.updateCustomer(
            user,
            id,
            await dto(UpdateCustomerDto, values),
          ),
        );
      case 'customer-onboarding':
        return envelope(
          await this.superAdmin.updateCustomerOnboarding(
            user,
            id,
            await dto(UpdateCustomerOnboardingDto, values),
          ),
        );
      case 'tenants':
        return envelope(
          await this.superAdmin.updateTenant(
            user,
            id,
            await dto(UpdateTenantDto, values),
          ),
        );
      case 'contracts': {
        const { contentHtml, ...contractValues } = values;
        await this.contracts.update(
          user,
          id,
          await dto(UpdateContractDto, contractValues),
        );
        if (typeof contentHtml === 'string') {
          return envelope(
            await this.contracts.saveVersion(user, id, {
              contentHtml,
              changeSummary: 'Updated in the shared contract editor.',
            }),
          );
        }
        return envelope(await this.contracts.get(user, id));
      }
      case 'support-cases':
        return envelope(
          await this.supportCases.update(
            user,
            id,
            await dto(UpdateSupportCaseDto, values),
          ),
        );
      case 'plans':
        return envelope(
          await this.superAdmin.updatePlan(
            user,
            id,
            await dto(UpdatePlanDto, values),
          ),
        );
      default:
        throw new BadRequestException(
          'Update is not available for this module through the runtime.',
        );
    }
  }
  /**
   * Delete one record, or many, through one rule.
   *
   * `remove` and `bulkDelete` used to be two independent switch statements over
   * the same modules, and they had already drifted apart: `leads` was reachable
   * through one and absent from the other. Selecting five leads and pressing
   * Delete answered 400 "Bulk delete is not available for this module" while
   * deleting the same five one at a time succeeded — the console offering an
   * action the API refused, which is what an operator hit in production on
   * 2026-08-28.
   *
   * Two lists describing one decision will diverge again, so there is now one.
   * What a module refuses, it refuses both ways; what it allows, it allows both
   * ways. `generic-delete.spec.ts` asserts that equality directly, so restoring
   * the drift fails a test rather than reaching an operator.
   */
  private async deleteRecords(
    user: AuthenticatedUser,
    key: PlatformRuntimeModuleKey,
    ids: string[],
  ) {
    /*
     * Both checks, for one record or for a hundred.
     *
     * These had split too: single delete asked only for the module's write
     * permission, bulk delete asked only for a platform admin role. The union
     * is deliberate and was decided on 2026-08-28 — it narrows single-record
     * delete for the presales roles, which hold `leads.*` without being
     * administrators. Deleting a commercial record is an administrative act
     * whether it is one row or five.
     */
    this.assertModuleWrite(user, key);
    this.assertAdmin(user);

    switch (key) {
      case 'leads':
        return result(await this.leads.bulkDeleteLeads(user, ids));
      case 'customers':
        return result(await this.superAdmin.bulkDeleteCustomers(user, { ids }));
      case 'customer-onboarding':
        return result(
          await this.superAdmin.bulkDeleteCustomerOnboardings(user, { ids }),
        );
      case 'partners':
        return result(await this.partnerDeletion.deletePartners(user, ids));
      case 'partner-inquiries':
        return result(
          await this.partnerDeletion.deletePartnerInquiries(user, ids),
        );
      case 'partner-onboarding':
        return result(
          await this.partnerDeletion.deletePartnerOnboarding(user, ids),
        );
      default:
        /*
         * Not an oversight. The modules that land here hold records the
         * business has to be able to produce later — invoices, payments,
         * commissions, executed agreements, signature evidence — or, for
         * tenants, an entire customer workspace behind a cascade. The console
         * says which of those applies rather than offering a button that would
         * be wrong to press; see `DELETE_REFUSALS` in the module registry.
         *
         * One message for one refusal: the operator is told the module does not
         * permit deletion, rather than being told that some other quantity of it
         * might be permitted.
         */
        throw new BadRequestException(
          'Delete is not available for this module or is prevented by retention policy.',
        );
    }
  }

  async remove(user: AuthenticatedUser, moduleKey: string, id: string) {
    return this.deleteRecords(user, this.key(moduleKey), [id]);
  }

  async execute(
    user: AuthenticatedUser,
    moduleKey: string,
    action: string,
    input: Record<string, unknown>,
    id?: string,
  ) {
    const key = this.key(moduleKey);
    this.assertModuleWrite(user, key);
    if (action === 'bulk-delete')
      return this.deleteRecords(user, key, toIds(input.ids));
    if (action === 'bulk-assign')
      return this.bulkAssign(
        user,
        key,
        toIds(input.ids),
        textOrNull(input.ownerId),
      );
    if (action === 'assign' && id)
      return this.bulkAssign(user, key, [id], textOrNull(input.ownerId));
    if (action === 'convert' && id && key === 'leads') {
      const customer = await this.superAdmin.convertLeadToCustomer(
        user,
        id,
        await dto(
          ConvertLeadToCustomerDto,
          input.values && typeof input.values === 'object'
            ? (input.values as Record<string, unknown>)
            : {},
        ),
      );
      return {
        success: true,
        message:
          'Lead converted to a customer. Tenant provisioning remains a separate onboarding step.',
        data: customer,
      };
    }
    if (action === 'activate' && id && key === 'partners')
      return this.partnerExperience.activatePartner(user, id);
    if (id && key === 'partners') {
      if (action === 'approve-partner' || action === 'reject-partner') {
        const inquiry = await this.prisma.partnerInquiry.findFirst({
          where: { partnerId: id },
          orderBy: { createdAt: 'desc' },
        });
        if (!inquiry)
          throw new BadRequestException(
            'The immutable partner application submission was not found.',
          );
        const review = {
          notes:
            textOrNull(input.reason) ??
            (action === 'approve-partner'
              ? 'Approved from the Partner runtime.'
              : 'Rejected from the Partner runtime.'),
        };
        return result(
          action === 'approve-partner'
            ? await this.partnerExperience.qualifyInquiry(
                user,
                inquiry.id,
                review,
              )
            : await this.partnerExperience.rejectInquiry(
                user,
                inquiry.id,
                review,
              ),
        );
      }
      const partnerActions: Record<
        string,
        | 'start-review'
        | 'approve'
        | 'reject'
        | 'request-information'
        | 'suspend'
        | 'reactivate'
        | 'deactivate'
      > = {
        'start-review': 'start-review',
        'request-information': 'request-information',
        'suspend-partner': 'suspend',
        'reactivate-partner': 'reactivate',
        'deactivate-partner': 'deactivate',
      };
      if (partnerActions[action])
        return envelope(
          await this.partners.lifecycleAction(id, user.userId, {
            action: partnerActions[action],
            reason: textOrNull(input.reason) ?? undefined,
          }),
        );
      if (action === 'send-onboarding-link')
        return result(
          await this.partnerExperience.sendOnboardingInvitation(user, id),
        );
    }
    if (id && key === 'contracts') {
      if (action === 'void-agreement')
        return envelope(
          await this.contracts.voidContract(
            user,
            id,
            textOrNull(input.reason) ?? 'Voided from the agreement action bar.',
          ),
        );
      if (action === 'terminate-agreement')
        return envelope(
          await this.contracts.terminateContract(
            user,
            id,
            textOrNull(input.reason) ??
              'Terminated from the agreement action bar.',
          ),
        );
      if (action === 'amend' || action === 'renew') {
        const contract = await this.contracts.get(user, id);
        return envelope(
          await this.contracts.createDerivedContract(
            user,
            id,
            action === 'amend' ? 'AMENDMENT' : 'RENEWAL',
            {
              title: `${action === 'amend' ? 'Amendment to' : 'Renewal of'} ${contract.title}`,
            },
          ),
        );
      }
      if (action === 'new-version') {
        const contract = await this.contracts.get(user, id);
        const version =
          contract.versions.find(
            (item) => item.version === contract.currentVersionNumber,
          ) ?? contract.versions[0];
        if (!version)
          throw new BadRequestException('No agreement version is available.');
        return envelope(
          await this.contracts.saveVersion(user, id, {
            contentHtml: version.contentHtml,
            contentText: version.contentText,
            changeSummary: 'New version created from the action bar.',
          }),
        );
      }
    }
    if (action === 'change-status' && id)
      return this.changeStatus(
        user,
        key,
        id,
        toDisplayString(input.status ?? ''),
        textOrNull(input.reason),
        textOrNull(input.subStatus),
      );
    throw new BadRequestException(
      `Action ${action} is not available for ${key}.`,
    );
  }
  async timeline(user: AuthenticatedUser, moduleKey: string, id: string) {
    const key = this.key(moduleKey);
    this.assertModuleRead(user, key);
    if (key === 'contracts') {
      const contract = await this.contracts.get(user, id);
      return { items: contract.timeline };
    }
    if (key === 'partners') {
      const partner = await this.partners.get(id);
      return { items: partner.timeline };
    }
    if (key === 'support-cases') {
      const supportCase = await this.supportCases.get(user, id);
      return { items: supportCase.timeline };
    }
    /*
     * A tenant's audit rows are written under that tenant's own id, not under
     * the platform operator's. Reading them with `user.tenantId` matched
     * nothing, which is why the Tenant timeline came back empty however much
     * had happened to the record.
     */
    if (key === 'tenants') {
      return this.tenantControlPlane.timeline(user, id);
    }
    return this.audit.listRecordTimeline({
      tenantId: user.tenantId,
      entityType: entityType(key),
      entityId: id,
      recordHref: `/${moduleKey}/${id}`,
    });
  }
  async addTimeline(
    user: AuthenticatedUser,
    moduleKey: string,
    id: string,
    input: Record<string, unknown>,
  ) {
    const key = this.key(moduleKey);
    this.assertModuleWrite(user, key);
    if (key === 'support-cases') {
      await this.supportCases.addActivity(user, id, {
        eventType: toDisplayString(input.activityType ?? 'NOTE'),
        message: toDisplayString(input.message ?? ''),
      });
      return { success: true, message: 'Timeline activity added.' };
    }
    await this.audit.log({
      /* Same reason as the read path: the note belongs to the tenant's history. */
      tenantId: key === 'tenants' ? id : user.tenantId,
      actorUserId: user.userId,
      action: 'TIMELINE_ACTIVITY_ADDED',
      entityType: entityType(key),
      entityId: id,
      sourceModule: 'platform-runtime',
      afterSnapshot: {
        message: toDisplayString(input.message ?? ''),
        activityType: toDisplayString(input.activityType ?? 'NOTE'),
      },
    });
    return { success: true, message: 'Timeline activity added.' };
  }
  async process(user: AuthenticatedUser, moduleKey: string, id: string) {
    const item = (await this.get(user, moduleKey, id)) as {
      item: Record<string, unknown>;
    };
    return {
      success: true,
      data: {
        currentStage: item.item.processStage ?? item.item.status ?? null,
      },
    };
  }
  async updateProcess(
    user: AuthenticatedUser,
    moduleKey: string,
    id: string,
    input: Record<string, unknown>,
  ) {
    const key = this.key(moduleKey);
    this.assertModuleWrite(user, key);
    return this.changeStatus(
      user,
      key,
      id,
      toDisplayString(input.stage ?? ''),
      textOrNull(input.reason),
      textOrNull(input.subStatus),
    );
  }
  async related(
    user: AuthenticatedUser,
    moduleKey: string,
    id: string,
    relationshipKey: string,
    query: PlatformRuntimeQuery,
  ) {
    const key = this.key(moduleKey);
    this.assertModuleRead(user, key);
    this.relations.assertAllowed(key, relationshipKey);
    const direct = await this.relations.findDirectRecords(
      key,
      id,
      relationshipKey,
    );
    if (direct) {
      return paginateRuntimeRecords(
        direct.records,
        positive(query.page, 1),
        Math.min(positive(query.pageSize, direct.defaultPageSize ?? 25), 100),
        query.search,
      );
    }
    const response = (await this.get(user, key, id)) as {
      item: Record<string, unknown>;
    };
    const records = response.item[relationshipKey];
    if (!Array.isArray(records))
      return {
        items: [],
        meta: { page: 1, pageSize: 25, total: 0, totalPages: 1 },
      };
    return paginateRuntimeRecords(
      records,
      positive(query.page, 1),
      Math.min(positive(query.pageSize, 25), 100),
      query.search,
      query.viewKey,
      readRuntimeSort(query.sort),
      readRuntimeFilters(query.filters),
    );
  }

  async validate(
    user: AuthenticatedUser,
    moduleKey: string,
    body: { values?: Record<string, unknown>; mode?: string },
  ) {
    this.assertPlatform(user);
    const key = this.key(moduleKey);
    const Class: (new () => object) | null =
      key === 'leads'
        ? body.mode === 'create'
          ? CreateAdminLeadDto
          : UpdateAdminLeadDto
        : key === 'partners'
          ? body.mode === 'create'
            ? CreatePartnerDto
            : UpdatePartnerDto
          : key === 'customers'
            ? body.mode === 'create'
              ? CreateCustomerDto
              : UpdateCustomerDto
            : key === 'customer-onboarding'
              ? body.mode === 'create'
                ? CreateCustomerOnboardingRecordDto
                : UpdateCustomerOnboardingDto
              : key === 'tenants' && body.mode !== 'create'
                ? UpdateTenantDto
                : key === 'contracts'
                  ? body.mode === 'create'
                    ? CreateContractDto
                    : UpdateContractDto
                  : key === 'support-cases'
                    ? body.mode === 'create'
                      ? CreateSupportCaseDto
                      : UpdateSupportCaseDto
                    : /*
                       * Plans validate on update only — the runtime does not
                       * create them. Without this entry every plan edit
                       * validated vacuously and then failed at save with a
                       * whole-request 400, because `dto()` runs with
                       * `forbidNonWhitelisted` and the form had no way to know
                       * which field was the problem.
                       */
                      key === 'plans' && body.mode !== 'create'
                      ? UpdatePlanDto
                      : null;
    if (!Class) return { success: true };
    try {
      const validationValues = { ...(body.values ?? {}) };
      if (key === 'contracts' && body.mode !== 'create') {
        delete validationValues.contentHtml;
      }
      await dto(Class, validationValues);
      return { success: true };
    } catch (error) {
      return readValidationFailure(error);
    }
  }
  async export(
    user: AuthenticatedUser,
    moduleKey: string,
    query: PlatformRuntimeQuery,
  ) {
    const response = await this.list(user, moduleKey, {
      ...query,
      page: '1',
      pageSize: '100',
    });
    const items =
      (response as { items?: Record<string, unknown>[] }).items ?? [];
    const fields =
      query.selectedColumns?.split(',').filter(Boolean) ??
      Object.keys(items[0] ?? {}).filter(
        (key) => typeof items[0]?.[key] !== 'object',
      );
    return [
      fields.join(','),
      ...items.map((item) =>
        fields
          .map((field) => csv(toDisplayString(readPath(item, field) ?? '')))
          .join(','),
      ),
    ].join('\n');
  }
  private async bulkAssign(
    user: AuthenticatedUser,
    key: PlatformRuntimeModuleKey,
    ids: string[],
    ownerId: string | null,
  ) {
    if (key === 'leads')
      return result(
        await this.leads.bulkAssignLeads(user, {
          ids,
          assignedToUserId: ownerId ?? undefined,
        }),
      );
    const model =
      key === 'partners'
        ? 'partner'
        : key === 'customers'
          ? 'customerAccount'
          : key === 'support-cases'
            ? 'supportCase'
            : null;
    if (!model)
      throw new BadRequestException(
        'Assignment is not available for this module.',
      );
    await (
      this.prisma[model] as never as {
        updateMany(args: unknown): Promise<unknown>;
      }
    ).updateMany({
      where: { id: { in: ids } },
      data: { assignedToUserId: ownerId },
    });
    return { success: true, message: `Assigned ${ids.length} record(s).` };
  }
  private async changeStatus(
    user: AuthenticatedUser,
    key: PlatformRuntimeModuleKey,
    id: string,
    status: string,
    reason: string | null,
    subStatus: string | null,
  ) {
    if (!status) throw new BadRequestException('Status is required.');
    if (key === 'leads')
      return envelope(
        await this.leads.updateLead(
          user,
          id,
          await dto(UpdateAdminLeadDto, {
            status,
            ...(status === 'QUALIFIED' ? { isQualified: true } : {}),
            ...(subStatus ? { subStatus } : {}),
            ...(reason ? { notes: reason } : {}),
          }),
        ),
      );
    if (key === 'partners') {
      const existing = await this.partners.get(id);
      return envelope(
        await this.partners.update(
          id,
          await dto(UpdatePartnerDto, {
            ...existing,
            status,
            notes: reason ?? existing.notes,
          }),
        ),
      );
    }
    if (key === 'support-cases') {
      return envelope(
        await this.supportCases.update(user, id, {
          status: status as import('@prisma/client').SupportCaseStatus,
        }),
      );
    }
    throw new BadRequestException(
      'Status transition is not available for this module.',
    );
  }
  private async findGeneric(key: PlatformRuntimeModuleKey, id: string) {
    if (key === 'plans') {
      const item = await this.prisma.plan.findUnique({
        where: { id },
        include: {
          prices: {
            include: { _count: { select: { subscriptions: true } } },
            orderBy: { createdAt: 'desc' },
          },
          features: true,
          subscriptions: { include: { tenant: true } },
        },
      });
      if (!item) throw new NotFoundException('Record was not found.');
      return {
        ...item,
        monthlyBasePrice: Number(item.monthlyBasePrice),
        annualBasePrice: Number(item.annualBasePrice),
        prices: item.prices.map((price) => ({
          ...price,
          unitAmount: Number(price.unitAmount),
          subscriptionCount: price._count.subscriptions,
          canDelete: price._count.subscriptions === 0,
        })),
        /*
         * The same shape `SuperAdminService.mapPlan` returns, which is what the
         * PATCH on this very module answers with.
         *
         * This used to hand back raw `PlanFeature` rows, so one runtime module
         * described `features` two ways depending on the verb — and the record
         * page, which reads whichever the last response carried, emptied its
         * Entitlements tab the moment anything was saved. Since `updatePlan`
         * applies `featureKeys` as `deleteMany` + `create`, the next save from
         * that emptied state deleted entitlements from a live plan.
         *
         * `platform-runtime.domain.spec.ts` pins the two together.
         */
        features: item.features
          .filter((feature) => feature.isEnabled)
          .map((feature) => feature.featureKey),
      };
    }
    /*
     * A subscription's relations come from the same projection the list uses.
     *
     * This used to fall through to the bare `findUnique` below, which loads no
     * relations at all — so the record page showed Tenant, Plan and Price as
     * "Not set" for rows the list had just rendered correctly. The ids were in
     * the payload; nothing resolved them (BUG-1748).
     */
    if (key === 'subscriptions') {
      const subscription = await this.superAdmin.getSubscription(id);
      if (!subscription) throw new NotFoundException('Record was not found.');
      return subscription;
    }
    const model = key === 'payments' ? 'payment' : null;
    if (!model) throw new NotFoundException('Record is not available.');
    const item = await (
      this.prisma[model] as never as {
        findUnique(args: unknown): Promise<unknown>;
      }
    ).findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Record was not found.');
    return item;
  }
  private async listSignatureRequests(
    page: number,
    pageSize: number,
    search?: string,
    viewKey?: string,
    platformUserId?: string,
  ) {
    const where: import('@prisma/client').Prisma.SignatureRequestWhereInput = {
      /* Without this the Awaiting-signature and personal tabs showed everything. */
      ...runtimeViewWhere('signature-requests', viewKey, platformUserId),
      ...(search
        ? {
            OR: [
              { requestNumber: { contains: search, mode: 'insensitive' } },
              { subject: { contains: search, mode: 'insensitive' } },
              {
                contract: { title: { contains: search, mode: 'insensitive' } },
              },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.signatureRequest.findMany({
        where,
        include: { contract: true, recipients: true },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.signatureRequest.count({ where }),
    ]);
    return {
      items: items.map((item) => ({
        ...item,
        recipients: item.recipients.length,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }
  private key(value: string) {
    const keys: PlatformRuntimeModuleKey[] = [
      'leads',
      'partners',
      'partner-inquiries',
      'partner-onboarding',
      'customers',
      'customer-onboarding',
      'tenants',
      'subscriptions',
      'plans',
      'invoices',
      'payments',
      'commissions',
      'contracts',
      'contract-templates',
      'signature-requests',
      'support-cases',
      'monitoring-incidents',
    ];
    if (!keys.includes(value as PlatformRuntimeModuleKey))
      throw new NotFoundException('Platform runtime module was not found.');
    return value as PlatformRuntimeModuleKey;
  }
  private assertPlatform(user: AuthenticatedUser) {
    if (!user.platform?.id)
      throw new ForbiddenException('Platform access is required.');
  }
  private assertModuleRead(
    user: AuthenticatedUser,
    key: PlatformRuntimeModuleKey,
  ) {
    this.assertPlatform(user);
    const permission = runtimePermission(key, false);
    if (!userHasPlatformPermission(user, permission))
      throw new ForbiddenException(`Read access to ${key} is required.`);
  }
  private assertModuleWrite(
    user: AuthenticatedUser,
    key: PlatformRuntimeModuleKey,
  ) {
    this.assertPlatform(user);
    const permission = runtimePermission(key, true);
    if (!userHasPlatformPermission(user, permission))
      throw new ForbiddenException(`Management access to ${key} is required.`);
  }
  private assertAdmin(user: AuthenticatedUser) {
    this.assertPlatform(user);
    if (
      !['SUPER_ADMIN', 'PLATFORM_OWNER', 'PLATFORM_ADMIN'].includes(
        user.platform?.role ?? '',
      )
    )
      throw new ForbiddenException(
        'Platform administrator access is required.',
      );
  }
}

function runtimePermission(
  key: PlatformRuntimeModuleKey,
  write: boolean,
): PlatformPermission {
  if (key === 'leads') return write ? 'leads.update' : 'leads.read';
  if (
    [
      'partners',
      'partner-inquiries',
      'partner-onboarding',
      'commissions',
    ].includes(key)
  )
    return write ? 'partners.manage' : 'partners.read';
  if (key === 'customers') return write ? 'customers.update' : 'customers.read';
  if (key === 'customer-onboarding')
    return write ? 'onboarding.update' : 'onboarding.read';
  if (['contracts', 'contract-templates', 'signature-requests'].includes(key))
    return write ? 'contracts.manage' : 'contracts.read';
  if (key === 'support-cases') return write ? 'support.manage' : 'support.read';
  if (key === 'monitoring-incidents')
    return write ? 'monitoring.manage' : 'monitoring.read';
  if (key === 'tenants') return write ? 'tenants.update' : 'tenants.read';
  if (key === 'payments') return write ? 'billing.manage' : 'payments.read';
  if (key === 'subscriptions')
    return write ? 'billing.manage' : 'subscriptions.read';
  if (key === 'invoices') return write ? 'billing.manage' : 'invoices.read';
  if (key === 'plans') return write ? 'billing.manage' : 'plans.read';
  return write ? 'billing.manage' : 'billing.read';
}

async function dto<T extends object>(
  Class: new () => T,
  plain: Record<string, unknown>,
): Promise<T> {
  /*
   * Every branch above offers its module's optional filters by reading them
   * out of the query string, so a key whose filter was not supplied arrives
   * here as an explicit undefined. class-validator's forbidNonWhitelisted
   * rejects on the key alone, not the value — which turned a filter nobody
   * used into a 400 on every request for that module. Dropping empties makes
   * the offer optional in fact and not just in name.
   */
  const present = Object.fromEntries(
    Object.entries(plain).filter(([, value]) => value !== undefined),
  );
  const instance = plainToInstance(Class, present, {
    enableImplicitConversion: true,
  });
  const errors = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  if (errors.length)
    /*
     * `message` stays the flat array of constraint strings, because that is what
     * every existing caller and every existing test reads.
     *
     * `fieldErrors` is added beside it, keeping each message with the property
     * it came from. `HttpExceptionFilter.readFieldErrors` already looks for
     * exactly this shape, so every caller that lets the exception reach the
     * filter now answers with the standard contract instead of a bare message.
     * `validate()` below reads it directly, which is what lets a runtime form
     * put a reason under the field that earned it — before this, the property
     * was flattened away here and the reason was unrecoverable downstream.
     */
    throw new BadRequestException({
      message: errors.flatMap((error) =>
        Object.values(error.constraints ?? {}),
      ),
      fieldErrors: errors.map((error) => ({
        field: error.property,
        message:
          Object.values(error.constraints ?? {})[0] ?? 'This value is invalid.',
      })),
    });
  return instance;
}
/**
 * Turn a failed `dto()` validation into the answer the runtime form consumes.
 *
 * `dto()` throws a BadRequestException carrying the reasons on its *payload*.
 * A Nest exception built from a payload sets its own `.message` to the class's
 * name — the literal string "Bad Request Exception" — so reading
 * `error.message` returns that name and discards every field reason. The form
 * asks for `errors`, got nothing, cleared its field errors, and showed the
 * operator an exception class name as though it were advice. BUG-1422.
 *
 * `errors` is the shape `runtime-record-page.tsx` already reads. `message`
 * falls back to the joined constraint text so the toast says something a person
 * can act on, and only then to the raw error for anything that is not a
 * validation failure at all.
 */
export function readValidationFailure(error: unknown): {
  success: false;
  message: string;
  errors: Array<{ field: string; message: string }>;
} {
  const payload = error instanceof HttpException ? error.getResponse() : null;
  const detail =
    payload && typeof payload === 'object'
      ? (payload as {
          message?: unknown;
          fieldErrors?: Array<{ field: string; message: string }>;
        })
      : null;
  const errors = Array.isArray(detail?.fieldErrors) ? detail.fieldErrors : [];
  const messages = Array.isArray(detail?.message)
    ? detail.message.map(String)
    : typeof detail?.message === 'string'
      ? [detail.message]
      : [];
  return {
    success: false,
    message:
      messages.join(' ') ||
      (error instanceof Error ? error.message : 'Validation failed.'),
    errors,
  };
}
function positive(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}
export function readRuntimeFilters(value?: string) {
  if (!value)
    return [] as Array<{
      field: string;
      operator: string;
      value?: unknown;
      values?: unknown[];
    }>;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const operators = new Set([
      'eq',
      'ne',
      'contains',
      'startsWith',
      'in',
      'gt',
      'gte',
      'lt',
      'lte',
      'between',
      'isNull',
      'isNotNull',
    ]);
    return parsed
      .slice(0, 25)
      .filter(
        (item) =>
          item &&
          typeof item.field === 'string' &&
          /^[A-Za-z][A-Za-z0-9_.]{0,119}$/.test(item.field) &&
          typeof item.operator === 'string' &&
          operators.has(item.operator),
      );
  } catch {
    throw new BadRequestException('Invalid filters.');
  }
}
export function readRuntimeSort(value?: string) {
  if (!value) return [] as Array<{ field: string; direction: 'asc' | 'desc' }>;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed
          .slice(0, 3)
          .filter(
            (item) =>
              item &&
              typeof item.field === 'string' &&
              /^[A-Za-z][A-Za-z0-9_.]{0,119}$/.test(item.field) &&
              (item.direction === 'asc' || item.direction === 'desc'),
          )
      : [];
  } catch {
    throw new BadRequestException('Invalid sort.');
  }
}
function stringFilter(
  filters: Array<{ field: string; value?: unknown }>,
  field: string,
) {
  const value = filters.find((item) => item.field === field)?.value;
  return typeof value === 'string' ? value : undefined;
}
function comparisonFilter(
  filters: Array<{ field: string; operator: string; value?: unknown }>,
  field: string,
  operators: string[],
) {
  const value = filters.find(
    (item) => item.field === field && operators.includes(item.operator),
  )?.value;
  return typeof value === 'string' ? value : undefined;
}
function viewStatus(view: string | undefined, map: Record<string, string>) {
  return view ? map[view] : undefined;
}
export function paginateRuntimeRecords(
  items: unknown[],
  page: number,
  pageSize: number,
  search?: string,
  view?: string,
  sort: Array<{ field: string; direction: 'asc' | 'desc' }> = [],
  filters: Array<{
    field: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
  }> = [],
  /*
   * Only the list endpoint supplies this. Related-record sub-grids reuse this
   * helper for a child collection, where the parent module's view rules would
   * not apply, so they leave it out and no view filter is imposed.
   */
  context: { moduleKey?: string; platformUserId?: string } = {},
) {
  let filtered = items as Record<string, unknown>[];
  if (search) {
    const needle = search.toLowerCase();
    filtered = filtered.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(needle),
    );
  }
  /*
   * Previously this filtered `view === 'active'` against a fixed
   * ACTIVE/TRIALING/PAID list, which matches almost none of the modules routed
   * through here — an invoice is never "ACTIVE" — and ignored 'my-records'
   * entirely, so the tabs all returned the same rows. The rules now come from
   * the shared registry that both this service and the admin UI read.
   */
  const rule = context.moduleKey
    ? resolveRuntimeViewRule(context.moduleKey, view)
    : null;
  if (rule) {
    const expected = rule.values;
    filtered = expected
      ? filtered.filter((item) =>
          expected.some((value) => value === readPath(item, rule.field)),
        )
      : /*
         * A personal view with no signed-in platform identity must show
         * nothing, not everything.
         */
        filtered.filter(
          (item) =>
            Boolean(context.platformUserId) &&
            readPath(item, rule.field) === context.platformUserId,
        );
  }
  if (filters.length)
    filtered = filtered.filter((item) =>
      filters.every((filter) => matchesRuntimeFilter(item, filter)),
    );
  if (sort.length)
    filtered = [...filtered].sort((a, b) => {
      for (const { field, direction } of sort) {
        const compared = compareRuntimeValues(
          readPath(a, field),
          readPath(b, field),
        );
        if (compared) return compared * (direction === 'asc' ? 1 : -1);
      }
      return 0;
    });
  const total = filtered.length;
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    meta: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNextPage: page * pageSize < total,
      hasPreviousPage: page > 1,
    },
  };
}

function matchesRuntimeFilter(
  record: Record<string, unknown>,
  filter: {
    field: string;
    operator: string;
    value?: unknown;
    values?: unknown[];
  },
) {
  const actual = readPath(record, filter.field);
  const expected = filter.value;
  const left = toDisplayString(actual ?? '').toLocaleLowerCase();
  const right = toDisplayString(expected ?? '').toLocaleLowerCase();
  if (filter.operator === 'isNull') return actual == null || actual === '';
  if (filter.operator === 'isNotNull') return actual != null && actual !== '';
  if (filter.operator === 'contains') return left.includes(right);
  if (filter.operator === 'startsWith') return left.startsWith(right);
  if (filter.operator === 'in')
    return (filter.values ?? []).map(String).includes(String(actual));
  if (filter.operator === 'between') {
    const [minimum, maximum] = filter.values ?? [];
    return (
      minimum !== undefined &&
      maximum !== undefined &&
      compareRuntimeValues(actual, minimum) >= 0 &&
      compareRuntimeValues(actual, maximum) <= 0
    );
  }
  if (filter.operator === 'ne') return left !== right;
  const compared = compareRuntimeValues(actual, expected);
  if (filter.operator === 'gt') return compared > 0;
  if (filter.operator === 'gte') return compared >= 0;
  if (filter.operator === 'lt') return compared < 0;
  if (filter.operator === 'lte') return compared <= 0;
  return left === right;
}

function compareRuntimeValues(left: unknown, right: unknown) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber))
    return leftNumber - rightNumber;
  const leftDate = Date.parse(toDisplayString(left ?? ''));
  const rightDate = Date.parse(toDisplayString(right ?? ''));
  if (Number.isFinite(leftDate) && Number.isFinite(rightDate))
    return leftDate - rightDate;
  return toDisplayString(left ?? '').localeCompare(
    toDisplayString(right ?? ''),
    undefined,
    {
      numeric: true,
      sensitivity: 'base',
    },
  );
}
function readPath(record: Record<string, unknown>, path: string) {
  return path
    .split('.')
    .reduce<unknown>(
      (value, key) =>
        value && typeof value === 'object'
          ? (value as Record<string, unknown>)[key]
          : undefined,
      record,
    );
}
function envelope(item: unknown) {
  return {
    item,
    version:
      item && typeof item === 'object' && 'version' in item
        ? Number((item as Record<string, unknown>).version)
        : undefined,
  };
}
function result(data: unknown) {
  return { success: true, data };
}
function toIds(value: unknown) {
  if (!Array.isArray(value) || !value.every((id) => typeof id === 'string'))
    throw new BadRequestException('Record IDs are required.');
  return value;
}
function textOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function entityType(key: PlatformRuntimeModuleKey) {
  return key
    .split('-')
    .map((value) => value[0].toUpperCase() + value.slice(1))
    .join('');
}
function csv(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}
