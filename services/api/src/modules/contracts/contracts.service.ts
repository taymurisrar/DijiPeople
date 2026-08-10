import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContractStatus,
  ContractVersionStatus,
  PlatformApprovalStatus,
  PlatformApprovalStepStatus,
  Prisma,
  SignatureRecipientStatus,
  SignatureRequestStatus,
  PartnerStatus,
} from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import sanitizeHtml from 'sanitize-html';
import PDFDocument from 'pdfkit';
import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { DomUtils, parseDocument } from 'htmlparser2';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { userHasPlatformPermission } from '../platform-auth/platform-permissions';
import {
  emailPage,
  PlatformCommunicationsService,
} from '../platform-communications/platform-communications.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import {
  ApprovalDecisionDto,
  CompleteSignatureDto,
  CopyContractDto,
  CreateContractDto,
  CreateContractFromSourceDto,
  CreateUploadedContractDto,
  CreateContractTemplateDto,
  CreateContractTemplateVersionDto,
  DeclineSignatureDto,
  RequestSignatureChangesDto,
  SaveContractVersionDto,
  SendSignatureRequestDto,
  UpdateContractDto,
  ContractQueryDto,
  ContractPartyDto,
  ContractFieldPlacementDto,
  CreateDerivedContractDto,
} from './dto/contracts.dto';

const contractInclude = {
  template: true,
  partner: {
    select: { id: true, code: true, displayName: true, status: true },
  },
  customerAccount: { select: { id: true, companyName: true, status: true } },
  customerOnboarding: {
    select: { id: true, status: true, contractSigned: true, tenantId: true },
  },
  tenant: { select: { id: true, name: true, slug: true, status: true } },
  relatedLead: { select: { id: true, companyName: true, status: true } },
  ownerPlatformUser: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  internalLegalOwner: {
    select: { id: true, firstName: true, lastName: true, email: true },
  },
  parentContract: {
    select: { id: true, contractNumber: true, title: true, status: true },
  },
  amendments: {
    select: { id: true, contractNumber: true, title: true, status: true },
    orderBy: { amendmentNumber: 'asc' as const },
  },
  versions: { orderBy: { version: 'desc' as const }, take: 20 },
  documents: { orderBy: { createdAt: 'desc' as const } },
  placeholderValues: { orderBy: { key: 'asc' as const } },
  approvalRequests: {
    include: {
      steps: { orderBy: { stepOrder: 'asc' as const } },
      actions: { orderBy: { createdAt: 'desc' as const } },
    },
    orderBy: { createdAt: 'desc' as const },
  },
  signatureRequests: {
    include: { recipients: { orderBy: { signingOrder: 'asc' as const } } },
    orderBy: { createdAt: 'desc' as const },
  },
  parties: { orderBy: { signingOrder: 'asc' as const } },
  relatedRecords: { orderBy: { createdAt: 'asc' as const } },
  fieldPlacements: {
    orderBy: [{ pageNumber: 'asc' as const }, { createdAt: 'asc' as const }],
  },
  timeline: { orderBy: { createdAt: 'desc' as const }, take: 100 },
} satisfies Prisma.ContractInclude;

export type ContractUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type ContractPlaceholderDataType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'RICH_TEXT'
  | 'INTEGER'
  | 'DECIMAL'
  | 'CURRENCY'
  | 'PERCENTAGE'
  | 'BOOLEAN'
  | 'DATE'
  | 'DATE_TIME'
  | 'EMAIL'
  | 'PHONE'
  | 'URL'
  | 'ADDRESS'
  | 'LOOKUP'
  | 'USER'
  | 'PARTNER'
  | 'CUSTOMER'
  | 'TENANT'
  | 'SIGNATURE'
  | 'INITIALS'
  | 'IMAGE'
  | 'TABLE'
  | 'REPEATING_COLLECTION'
  | 'CONDITIONAL_CONTENT';

export type ContractPlaceholderDefinition = {
  key: string;
  label: string;
  description: string;
  dataType: ContractPlaceholderDataType;
  sourceEntity: string;
  sourceField: string;
  required: boolean;
  defaultValue: string | null;
  formattingRule: string | null;
  fallbackBehavior: 'ERROR' | 'LEAVE_TOKEN' | 'EMPTY';
  securityClassification: 'PUBLIC' | 'INTERNAL' | 'CONFIDENTIAL';
  allowedContractTypes: string[];
  exampleValue: string;
};

function placeholder(
  key: string,
  label: string,
  dataType: ContractPlaceholderDataType,
  exampleValue: string,
  options: Partial<ContractPlaceholderDefinition> = {},
): ContractPlaceholderDefinition {
  const [sourceEntity, ...field] = key.split('.');
  return {
    key,
    label,
    description: `${label} resolved from the ${sourceEntity} record.`,
    dataType,
    sourceEntity,
    sourceField: field.join('.'),
    required: !key.startsWith('signature.'),
    defaultValue: null,
    formattingRule: null,
    fallbackBehavior: key.startsWith('signature.') ? 'LEAVE_TOKEN' : 'ERROR',
    securityClassification: 'INTERNAL',
    allowedContractTypes: [],
    exampleValue,
    ...options,
  };
}

export const CONTRACT_PLACEHOLDER_REGISTRY: ContractPlaceholderDefinition[] = [
  placeholder('platform.name', 'Platform name', 'TEXT', 'DijiPeople'),
  placeholder(
    'platform.legalName',
    'Platform legal name',
    'TEXT',
    'DijiPeople Technologies Ltd.',
  ),
  placeholder(
    'platform.address',
    'Platform address',
    'ADDRESS',
    'Riyadh, Saudi Arabia',
  ),
  placeholder(
    'platform.authorizedSigner.name',
    'Platform authorized signer',
    'USER',
    'Taimur Israr',
  ),
  placeholder(
    'platform.authorizedSigner.title',
    'Platform signer title',
    'TEXT',
    'Authorized Signatory',
  ),
  placeholder(
    'platform.reportingCurrency',
    'Reporting currency',
    'CURRENCY',
    'SAR',
  ),
  placeholder('partner.name', 'Partner name', 'PARTNER', 'Northstar Advisory'),
  placeholder(
    'partner.legalName',
    'Partner legal name',
    'TEXT',
    'Northstar Advisory LLC',
  ),
  placeholder(
    'partner.registrationNumber',
    'Partner registration number',
    'TEXT',
    'CR-1045821',
  ),
  placeholder('partner.taxId', 'Partner tax ID', 'TEXT', '310123456700003', {
    securityClassification: 'CONFIDENTIAL',
  }),
  placeholder(
    'partner.address',
    'Partner address',
    'ADDRESS',
    'King Fahd Road, Riyadh',
  ),
  placeholder(
    'partner.contact.firstName',
    'Partner contact first name',
    'TEXT',
    'Noura',
  ),
  placeholder(
    'partner.contact.lastName',
    'Partner contact last name',
    'TEXT',
    'Al-Salem',
  ),
  placeholder(
    'partner.contact.email',
    'Partner contact email',
    'EMAIL',
    'noura@northstar.example',
  ),
  placeholder(
    'partner.commissionPercentage',
    'Partner commission',
    'PERCENTAGE',
    '12.5',
    { formattingRule: '0.##%' },
  ),
  placeholder(
    'customer.name',
    'Customer name',
    'CUSTOMER',
    'Gulf Horizon Logistics',
  ),
  placeholder(
    'customer.legalName',
    'Customer legal name',
    'TEXT',
    'Gulf Horizon Logistics Company',
  ),
  placeholder(
    'customer.registrationNumber',
    'Customer registration number',
    'TEXT',
    'CR-7002146',
  ),
  placeholder('customer.taxId', 'Customer tax ID', 'TEXT', '310987654300003', {
    securityClassification: 'CONFIDENTIAL',
  }),
  placeholder(
    'customer.address',
    'Customer address',
    'ADDRESS',
    'Dammam, Saudi Arabia',
  ),
  placeholder(
    'customer.contact.fullName',
    'Customer contact',
    'TEXT',
    'Amal Hassan',
  ),
  placeholder(
    'customer.contact.email',
    'Customer contact email',
    'EMAIL',
    'amal@gulfhorizon.example',
  ),
  placeholder('tenant.name', 'Tenant name', 'TENANT', 'Gulf Horizon'),
  placeholder(
    'contract.number',
    'Contract number',
    'LOOKUP',
    'CON-20260730-A13F',
  ),
  placeholder(
    'contract.title',
    'Contract title',
    'TEXT',
    'Partner Referral Agreement',
  ),
  placeholder(
    'contract.effectiveDate',
    'Effective date',
    'DATE',
    '2026-08-01',
    { formattingRule: 'locale-date' },
  ),
  placeholder('contract.expiryDate', 'Expiry date', 'DATE', '2027-07-31', {
    formattingRule: 'locale-date',
  }),
  placeholder('contract.currency', 'Contract currency', 'CURRENCY', 'SAR'),
  placeholder('contract.value', 'Contract value', 'DECIMAL', '150000.00', {
    formattingRule: 'currency',
  }),
  placeholder(
    'contract.commissionPercentage',
    'Contract commission',
    'PERCENTAGE',
    '12.5',
    { formattingRule: '0.##%' },
  ),
  placeholder(
    'contract.paymentTerms',
    'Payment terms',
    'LONG_TEXT',
    'Net 30 days',
  ),
  placeholder(
    'signature.platform.name',
    'Platform signature',
    'SIGNATURE',
    'Signed electronically',
    { required: false },
  ),
  placeholder(
    'signature.platform.date',
    'Platform signed date',
    'DATE_TIME',
    '2026-08-01T14:30:00+03:00',
    { required: false },
  ),
  placeholder(
    'signature.counterparty.name',
    'Counterparty signature',
    'SIGNATURE',
    'Signed electronically',
    { required: false },
  ),
  placeholder(
    'signature.counterparty.date',
    'Counterparty signed date',
    'DATE_TIME',
    '2026-08-01T14:35:00+03:00',
    { required: false },
  ),
  placeholder(
    'signature.counterparty.initials',
    'Counterparty initials',
    'INITIALS',
    'AH',
    { required: false },
  ),
];

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly communications: PlatformCommunicationsService,
    private readonly events: PlatformEventsService,
  ) {}

  listPlaceholderDefinitions(user: AuthenticatedUser) {
    this.assertPlatform(user);
    return { items: CONTRACT_PLACEHOLDER_REGISTRY };
  }

  async list(
    user: AuthenticatedUser,
    query: ContractQueryDto,
    runtime?: {
      filters?: Array<{ field: string; operator: string; value?: unknown }>;
      sort?: Array<{ field: string; direction: 'asc' | 'desc' }>;
    },
  ) {
    this.assertPlatform(user);
    const where: Prisma.ContractWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.contractType ? { contractType: query.contractType } : {}),
      ...(query.ownerPlatformUserId
        ? { ownerPlatformUserId: query.ownerPlatformUserId }
        : {}),
      ...(query.search
        ? {
            OR: [
              {
                contractNumber: { contains: query.search, mode: 'insensitive' },
              },
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                counterpartyName: {
                  contains: query.search,
                  mode: 'insensitive',
                },
              },
            ],
          }
        : {}),
      ...viewWhere(query.viewKey, user.userId),
      ...contractRuntimeWhere(runtime?.filters ?? []),
    };
    const orderBy = contractRuntimeOrder(runtime?.sort ?? []);
    const [items, total] = await Promise.all([
      this.prisma.contract.findMany({
        where,
        include: {
          partner: { select: { id: true, displayName: true } },
          customerAccount: { select: { id: true, companyName: true } },
          ownerPlatformUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          signatureRequests: {
            select: { status: true },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.contract.count({ where }),
    ]);
    return {
      items: items.map((item) =>
        normalizeContract({
          ...item,
          owner: item.ownerPlatformUser
            ? {
                ...item.ownerPlatformUser,
                fullName:
                  `${item.ownerPlatformUser.firstName} ${item.ownerPlatformUser.lastName}`.trim() ||
                  item.ownerPlatformUser.email,
              }
            : null,
          signatureStatus: item.signatureRequests[0]?.status ?? null,
        }),
      ),
      meta: {
        page: query.page,
        pageSize: query.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      },
    };
  }

  async get(user: AuthenticatedUser, id: string) {
    this.assertPlatform(user);
    const item = await this.prisma.contract.findUnique({
      where: { id },
      include: contractInclude,
    });
    if (!item) throw new NotFoundException('Contract was not found.');
    return normalizeContract(item);
  }

  async create(user: AuthenticatedUser, dto: CreateContractDto) {
    this.assertWrite(user);
    this.validateCounterparty(dto);
    const templateVersion = dto.templateId
      ? await this.prisma.contractTemplateVersion.findFirst({
          where: { templateId: dto.templateId, isPublished: true },
          orderBy: { version: 'desc' },
        })
      : null;
    if (dto.templateId && !templateVersion) {
      throw new BadRequestException(
        'The selected template has no published version.',
      );
    }
    const [reportingCurrency, companyProfile] = await Promise.all([
      this.reportingCurrency(),
      this.companyProfile(),
    ]);
    const contractNumber = reference('CON');
    const values = compactStringRecord({
      'platform.name': companyProfile.companyName,
      'platform.legalName': companyProfile.legalName,
      'platform.address': [
        companyProfile.streetAddress,
        companyProfile.city,
        companyProfile.country,
        companyProfile.postalCode,
      ]
        .filter(Boolean)
        .join(', '),
      'platform.reportingCurrency': reportingCurrency,
      'contract.number': contractNumber,
      'contract.title': dto.title.trim(),
      'contract.effectiveDate': dto.effectiveDate,
      'contract.expiryDate': dto.expiryDate,
      'contract.currency': dto.currencyCode?.toUpperCase() ?? reportingCurrency,
      'contract.value': dto.contractValue,
      'contract.commissionPercentage': dto.commissionPercentage,
      'contract.paymentTerms': dto.paymentTerms,
      'counterparty.name': dto.counterpartyName.trim(),
      'counterparty.email': dto.counterpartyEmail?.trim().toLowerCase(),
      ...(dto.placeholderValues ?? {}),
    });
    const rawHtml =
      dto.contentHtml ??
      templateVersion?.contentHtml ??
      `<h1>${escapeHtml(dto.title)}</h1>`;
    const contentHtml = cleanContractHtml(rawHtml);
    assertValidContractPlaceholderValues(
      extractContractPlaceholders(contentHtml),
      values,
    );
    const contentText = toPlainText(
      renderContractPlaceholders(contentHtml, values),
    );
    const created = await this.prisma.$transaction(async (tx) => {
      const contract = await tx.contract.create({
        data: {
          contractNumber,
          title: dto.title.trim(),
          contractType: dto.contractType,
          agreementCategory: dto.agreementCategory,
          lifecycleGatePurpose:
            dto.lifecycleGatePurpose ?? templateVersion?.lifecycleGatePurpose,
          isGoverningAgreement: dto.isGoverningAgreement ?? false,
          signingMode: dto.signingMode ?? 'MIXED',
          counterpartyType: dto.counterpartyType,
          processStage: 'INITIATION',
          templateId: dto.templateId,
          partnerId: dto.partnerId,
          customerAccountId: dto.customerAccountId,
          customerOnboardingId: dto.customerOnboardingId,
          tenantId: dto.tenantId,
          relatedLeadId: dto.relatedLeadId,
          ownerPlatformUserId: dto.ownerPlatformUserId ?? user.userId,
          internalLegalOwnerId: dto.internalLegalOwnerId,
          parentContractId: dto.parentContractId,
          amendsContractId: dto.amendsContractId,
          renewsContractId: dto.renewsContractId,
          supersedesContractId: dto.supersedesContractId,
          subscriptionId: dto.subscriptionId,
          amendmentNumber: dto.amendmentNumber,
          counterpartyName: dto.counterpartyName.trim(),
          counterpartyEmail: dto.counterpartyEmail?.trim().toLowerCase(),
          documentSource:
            dto.documentSource ?? (templateVersion ? 'TEMPLATE' : 'EDITOR'),
          currencyCode: dto.currencyCode?.toUpperCase() ?? reportingCurrency,
          contractValue: dto.contractValue,
          commissionPercentage: dto.commissionPercentage,
          commissionBasis: dto.commissionBasis,
          paymentTerms: dto.paymentTerms,
          governingLaw: dto.governingLaw,
          jurisdiction: dto.jurisdiction,
          confidentialityClass: dto.confidentialityClass,
          effectiveDate: dto.effectiveDate ? new Date(dto.effectiveDate) : null,
          expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
          effectiveFrom: dto.effectiveFrom
            ? new Date(dto.effectiveFrom)
            : dto.effectiveDate
              ? new Date(dto.effectiveDate)
              : null,
          effectiveUntil: dto.effectiveUntil
            ? new Date(dto.effectiveUntil)
            : dto.expiryDate
              ? new Date(dto.expiryDate)
              : null,
          autoRenewal: dto.autoRenewal ?? false,
          renewalNoticeDays: dto.renewalNoticeDays,
          terminationNoticeDays: dto.terminationNoticeDays,
          notes: dto.notes,
          currentVersionNumber: 1,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      await tx.contractVersion.create({
        data: {
          contractId: contract.id,
          templateVersionId: templateVersion?.id,
          version: 1,
          title: dto.title.trim(),
          contentHtml,
          contentText,
          contentSha256: sha256(contentHtml),
          createdById: user.userId,
        },
      });
      const suppliedParties = dto.parties ?? [];
      const parties: ContractPartyDto[] = suppliedParties.length
        ? suppliedParties
        : [
            {
              partyType: 'PLATFORM',
              role: 'PROVIDER',
              name: companyProfile.companyName,
              legalName: companyProfile.legalName,
              isPrimary: true,
              signingOrder: 1,
            },
            {
              partyType: dto.partnerId
                ? 'PARTNER'
                : dto.customerAccountId
                  ? 'CUSTOMER'
                  : dto.tenantId
                    ? 'TENANT'
                    : dto.relatedLeadId
                      ? 'LEAD'
                      : 'EXTERNAL_ORGANIZATION',
              role: dto.partnerId ? 'PARTNER' : 'CUSTOMER',
              name: dto.counterpartyName.trim(),
              email: dto.counterpartyEmail?.trim().toLowerCase(),
              organizationId:
                dto.partnerId ??
                dto.customerAccountId ??
                dto.tenantId ??
                dto.relatedLeadId,
              isPrimary: true,
              signingOrder: 2,
            },
          ];
      await tx.contractParty.createMany({
        data: parties.map((party) => ({
          contractId: contract.id,
          partyType: party.partyType,
          role: party.role,
          name: party.name.trim(),
          legalName: party.legalName?.trim(),
          email: party.email?.trim().toLowerCase(),
          phone: party.phone?.trim(),
          organizationId: party.organizationId,
          isPrimary: party.isPrimary ?? false,
          signingOrder: party.signingOrder ?? 1,
        })),
      });
      const relatedRecords = [
        ...(dto.relatedRecords ?? []),
        ...(dto.partnerId
          ? [
              {
                entityType: 'Partner',
                entityId: dto.partnerId,
                relationshipType: 'PARTNER',
              },
            ]
          : []),
        ...(dto.relatedLeadId
          ? [
              {
                entityType: 'Lead',
                entityId: dto.relatedLeadId,
                relationshipType: 'LEAD',
              },
            ]
          : []),
        ...(dto.customerAccountId
          ? [
              {
                entityType: 'CustomerAccount',
                entityId: dto.customerAccountId,
                relationshipType: 'CUSTOMER',
              },
            ]
          : []),
        ...(dto.customerOnboardingId
          ? [
              {
                entityType: 'CustomerOnboarding',
                entityId: dto.customerOnboardingId,
                relationshipType: 'ONBOARDING',
              },
            ]
          : []),
        ...(dto.tenantId
          ? [
              {
                entityType: 'Tenant',
                entityId: dto.tenantId,
                relationshipType: 'TENANT',
              },
            ]
          : []),
        ...(dto.subscriptionId
          ? [
              {
                entityType: 'Subscription',
                entityId: dto.subscriptionId,
                relationshipType: 'SUBSCRIPTION',
              },
            ]
          : []),
      ];
      const uniqueRelated = [
        ...new Map(
          relatedRecords.map((record) => [
            `${record.entityType}:${record.entityId}:${record.relationshipType ?? 'RELATED'}`,
            record,
          ]),
        ).values(),
      ];
      if (uniqueRelated.length)
        await tx.contractRelatedRecord.createMany({
          data: uniqueRelated.map((record) => ({
            contractId: contract.id,
            entityType: record.entityType,
            entityId: record.entityId,
            relationshipType: record.relationshipType ?? 'RELATED',
            createdById: user.userId,
          })),
          skipDuplicates: true,
        });
      if (Object.keys(values).length) {
        await tx.contractPlaceholderValue.createMany({
          data: Object.entries(values).map(([key, value]) => ({
            contractId: contract.id,
            key,
            value,
            source: 'create',
            updatedById: user.userId,
          })),
        });
      }
      await this.timelineTx(
        tx,
        contract.id,
        user,
        'CONTRACT_CREATED',
        `Contract ${contract.contractNumber} was created.`,
      );
      return contract;
    });
    await this.events.record({
      eventCode: 'AGREEMENT_CREATED',
      source: 'ADMIN',
      entityType: 'Contract',
      entityId: created.id,
      customerAccountId: dto.customerAccountId,
      tenantId: dto.tenantId,
      actorType: 'PLATFORM_USER',
      actorId: user.userId,
      route: '/contracts',
      metadata: {
        contractNumber: created.contractNumber,
        contractType: created.contractType,
        documentSource: created.documentSource,
        relatedLeadId: dto.relatedLeadId,
        partnerId: dto.partnerId,
      },
    });
    return this.get(user, created.id);
  }

  async createFromSource(
    user: AuthenticatedUser,
    dto: CreateContractFromSourceDto,
  ) {
    this.assertWrite(user);
    const source = await this.resolveSource(dto.sourceType, dto.sourceId);
    return this.create(user, {
      title: dto.title ?? `${source.counterpartyName} services agreement`,
      contractType: dto.contractType ?? 'CUSTOMER_AGREEMENT',
      counterpartyName: source.counterpartyName,
      counterpartyEmail: source.counterpartyEmail,
      templateId: dto.templateId,
      partnerId: source.partnerId,
      customerAccountId: source.customerAccountId,
      customerOnboardingId: source.customerOnboardingId,
      tenantId: source.tenantId,
      currencyCode: source.currencyCode,
      contractValue: source.contractValue,
      effectiveDate: dto.effectiveDate,
      expiryDate: dto.expiryDate,
      placeholderValues: source.placeholderValues,
    });
  }

  async copy(user: AuthenticatedUser, dto: CopyContractDto) {
    this.assertWrite(user);
    const source = await this.prisma.contract.findUnique({
      where: { id: dto.sourceContractId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!source || !source.versions[0])
      throw new NotFoundException('Source contract was not found.');
    return this.create(user, {
      title: dto.title,
      contractType: source.contractType,
      counterpartyName: dto.counterpartyName ?? source.counterpartyName,
      counterpartyEmail:
        dto.counterpartyEmail ?? source.counterpartyEmail ?? undefined,
      partnerId: source.partnerId ?? undefined,
      customerAccountId: source.customerAccountId ?? undefined,
      customerOnboardingId: source.customerOnboardingId ?? undefined,
      tenantId: source.tenantId ?? undefined,
      currencyCode: source.currencyCode ?? undefined,
      contractValue: source.contractValue
        ? Number(source.contractValue)
        : undefined,
      effectiveDate: source.effectiveDate?.toISOString(),
      expiryDate: source.expiryDate?.toISOString(),
      renewalNoticeDays: source.renewalNoticeDays ?? undefined,
      contentHtml: source.versions[0].contentHtml,
    });
  }

  async createFromUpload(
    user: AuthenticatedUser,
    dto: CreateUploadedContractDto,
    file?: ContractUploadFile,
  ) {
    this.assertWrite(user);
    if (!file)
      throw new BadRequestException('A contract document file is required.');
    const allowed = new Set([
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/pdf',
      'text/plain',
      'text/html',
    ]);
    if (!allowed.has(file.mimetype))
      throw new BadRequestException(
        'Upload a DOCX, PDF, TXT, or HTML document.',
      );
    const contentHtml = await documentToHtml(file);
    const created = await this.create(user, { ...dto, contentHtml });
    const version = created.versions[0];
    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalFileName: file.originalname,
      subdirectory: `contracts/${created.id}/source`,
    });
    await this.prisma.$transaction([
      this.prisma.contractVersion.update({
        where: { id: version.id },
        data: {
          sourceFileName: file.originalname,
          sourceMimeType: file.mimetype,
          sourceStorageKey: saved.storageKey,
        },
      }),
      this.prisma.contractDocument.create({
        data: {
          contractId: created.id,
          contractVersionId: version.id,
          kind: 'SOURCE_UPLOAD',
          source: 'UPLOAD',
          fileName: file.originalname,
          mimeType: file.mimetype,
          storageKey: saved.storageKey,
          sizeBytes: saved.size,
          sha256: sha256(file.buffer),
          uploadedById: user.userId,
        },
      }),
      this.prisma.contractTimeline.create({
        data: {
          contractId: created.id,
          eventType: 'SOURCE_DOCUMENT_UPLOADED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `${file.originalname} was imported as the source document.`,
        },
      }),
    ]);
    return this.get(user, created.id);
  }

  async compareVersions(
    user: AuthenticatedUser,
    contractId: string,
    from: number,
    to: number,
  ) {
    this.assertPlatform(user);
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < 1)
      throw new BadRequestException('Two valid version numbers are required.');
    const versions = await this.prisma.contractVersion.findMany({
      where: { contractId, version: { in: [from, to] } },
      orderBy: { version: 'asc' },
    });
    const left = versions.find((item) => item.version === from);
    const right = versions.find((item) => item.version === to);
    if (!left || !right)
      throw new NotFoundException(
        'One or both contract versions were not found.',
      );
    const before = new Set(
      left.contentText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
    const after = new Set(
      right.contentText
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
    return {
      from: {
        version: left.version,
        sha256: left.contentSha256,
        createdAt: left.createdAt,
      },
      to: {
        version: right.version,
        sha256: right.contentSha256,
        createdAt: right.createdAt,
      },
      additions: [...after].filter((line) => !before.has(line)),
      removals: [...before].filter((line) => !after.has(line)),
      unchanged: [...after].filter((line) => before.has(line)).length,
    };
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateContractDto) {
    this.assertWrite(user);
    const existing = await this.get(user, id);
    this.validateContractDates({
      effectiveDate: dto.effectiveDate ?? existing.effectiveDate,
      expiryDate: dto.expiryDate ?? existing.expiryDate,
      effectiveFrom: dto.effectiveFrom ?? existing.effectiveFrom,
      effectiveUntil: dto.effectiveUntil ?? existing.effectiveUntil,
    });
    if (
      [
        'SIGNATURE_IN_PROGRESS',
        'PARTIALLY_SIGNED',
        'FULLY_SIGNED',
        'ACTIVE',
        'ARCHIVED',
      ].includes(existing.status)
    ) {
      throw new BadRequestException(
        'Contract terms in signing or signed state must be changed through cancellation, a new version, or an amendment.',
      );
    }
    if (dto.status !== undefined && dto.status !== existing.status)
      throw new BadRequestException(
        'Contract status changes must use the governed process, approval, signature, activation, or termination action.',
      );
    await this.prisma.contract.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.contractType !== undefined
          ? { contractType: dto.contractType }
          : {}),
        ...(dto.templateId !== undefined ? { templateId: dto.templateId } : {}),
        ...(dto.partnerId !== undefined ? { partnerId: dto.partnerId } : {}),
        ...(dto.customerAccountId !== undefined
          ? { customerAccountId: dto.customerAccountId }
          : {}),
        ...(dto.customerOnboardingId !== undefined
          ? { customerOnboardingId: dto.customerOnboardingId }
          : {}),
        ...(dto.tenantId !== undefined ? { tenantId: dto.tenantId } : {}),
        ...(dto.relatedLeadId !== undefined
          ? { relatedLeadId: dto.relatedLeadId }
          : {}),
        ...(dto.counterpartyName !== undefined
          ? { counterpartyName: dto.counterpartyName.trim() }
          : {}),
        ...(dto.counterpartyEmail !== undefined
          ? { counterpartyEmail: dto.counterpartyEmail.toLowerCase() }
          : {}),
        ...(dto.ownerPlatformUserId !== undefined
          ? { ownerPlatformUserId: dto.ownerPlatformUserId }
          : {}),
        ...(dto.internalLegalOwnerId !== undefined
          ? { internalLegalOwnerId: dto.internalLegalOwnerId }
          : {}),
        ...(dto.parentContractId !== undefined
          ? { parentContractId: dto.parentContractId }
          : {}),
        ...(dto.amendmentNumber !== undefined
          ? { amendmentNumber: dto.amendmentNumber }
          : {}),
        ...(dto.agreementCategory !== undefined
          ? { agreementCategory: dto.agreementCategory }
          : {}),
        ...(dto.lifecycleGatePurpose !== undefined
          ? { lifecycleGatePurpose: dto.lifecycleGatePurpose }
          : {}),
        ...(dto.isGoverningAgreement !== undefined
          ? { isGoverningAgreement: dto.isGoverningAgreement }
          : {}),
        ...(dto.signingMode !== undefined
          ? { signingMode: dto.signingMode }
          : {}),
        ...(dto.counterpartyType !== undefined
          ? { counterpartyType: dto.counterpartyType }
          : {}),
        ...(dto.documentSource !== undefined
          ? { documentSource: dto.documentSource }
          : {}),
        ...(dto.currencyCode !== undefined
          ? { currencyCode: dto.currencyCode.toUpperCase() }
          : {}),
        ...(dto.contractValue !== undefined
          ? { contractValue: dto.contractValue }
          : {}),
        ...(dto.commissionPercentage !== undefined
          ? { commissionPercentage: dto.commissionPercentage }
          : {}),
        ...(dto.commissionBasis !== undefined
          ? { commissionBasis: dto.commissionBasis }
          : {}),
        ...(dto.paymentTerms !== undefined
          ? { paymentTerms: dto.paymentTerms }
          : {}),
        ...(dto.governingLaw !== undefined
          ? { governingLaw: dto.governingLaw }
          : {}),
        ...(dto.jurisdiction !== undefined
          ? { jurisdiction: dto.jurisdiction }
          : {}),
        ...(dto.confidentialityClass !== undefined
          ? { confidentialityClass: dto.confidentialityClass }
          : {}),
        ...(dto.effectiveDate !== undefined
          ? { effectiveDate: new Date(dto.effectiveDate) }
          : {}),
        ...(dto.expiryDate !== undefined
          ? { expiryDate: new Date(dto.expiryDate) }
          : {}),
        ...(dto.effectiveFrom !== undefined
          ? { effectiveFrom: new Date(dto.effectiveFrom) }
          : {}),
        ...(dto.effectiveUntil !== undefined
          ? { effectiveUntil: new Date(dto.effectiveUntil) }
          : {}),
        ...(dto.autoRenewal !== undefined
          ? { autoRenewal: dto.autoRenewal }
          : {}),
        ...(dto.renewalNoticeDays !== undefined
          ? { renewalNoticeDays: dto.renewalNoticeDays }
          : {}),
        ...(dto.terminationNoticeDays !== undefined
          ? { terminationNoticeDays: dto.terminationNoticeDays }
          : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.amendsContractId !== undefined
          ? { amendsContractId: dto.amendsContractId }
          : {}),
        ...(dto.renewsContractId !== undefined
          ? { renewsContractId: dto.renewsContractId }
          : {}),
        ...(dto.supersedesContractId !== undefined
          ? { supersedesContractId: dto.supersedesContractId }
          : {}),
        ...(dto.subscriptionId !== undefined
          ? { subscriptionId: dto.subscriptionId }
          : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        updatedById: user.userId,
        ...(dto.status === ContractStatus.ACTIVE
          ? { activatedAt: new Date() }
          : {}),
        ...(dto.status === ContractStatus.TERMINATED
          ? { terminatedAt: new Date() }
          : {}),
        ...(dto.status === ContractStatus.ARCHIVED
          ? { archivedAt: new Date() }
          : {}),
      },
    });
    await this.timeline(
      id,
      user,
      'CONTRACT_UPDATED',
      'Contract details were updated.',
      dto as unknown as Record<string, unknown>,
    );
    return this.get(user, id);
  }

  async saveVersion(
    user: AuthenticatedUser,
    id: string,
    dto: SaveContractVersionDto,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, id);
    if (
      ['SIGNATURE_IN_PROGRESS', 'PARTIALLY_SIGNED', 'SENT', 'VIEWED'].includes(
        contract.status,
      )
    ) {
      await this.invalidateSigningForNewVersion(id, user.userId);
    }
    if (
      ['FULLY_SIGNED', 'FULLY_EXECUTED', 'ACTIVE', 'ARCHIVED'].includes(
        contract.status,
      )
    )
      throw new BadRequestException(
        'A contract version in signing or signed state is immutable. Cancel signing or create an amendment for further changes.',
      );
    const contentHtml = cleanContractHtml(dto.contentHtml);
    const values = dto.placeholderValues ?? {};
    assertValidContractPlaceholderValues(
      extractContractPlaceholders(contentHtml),
      values,
    );
    const contentText =
      dto.contentText?.trim() ||
      toPlainText(renderContractPlaceholders(contentHtml, values));
    const currentVersion = contract.versions.find(
      (item) => item.version === contract.currentVersionNumber,
    );
    if (currentVersion?.contentSha256 === sha256(contentHtml)) {
      return contract;
    }
    const nextVersion = contract.currentVersionNumber + 1;
    await this.prisma.$transaction(async (tx) => {
      await tx.contractVersion.create({
        data: {
          contractId: id,
          version: nextVersion,
          title: contract.title,
          contentHtml,
          contentText,
          contentSha256: sha256(contentHtml),
          changeSummary: dto.changeSummary,
          createdById: user.userId,
        },
      });
      await tx.contract.update({
        where: { id },
        data: {
          currentVersionNumber: nextVersion,
          status: ContractStatus.DRAFT,
          updatedById: user.userId,
        },
      });
      if (dto.placeholderValues) {
        for (const [key, value] of Object.entries(dto.placeholderValues)) {
          await tx.contractPlaceholderValue.upsert({
            where: { contractId_key: { contractId: id, key } },
            create: {
              contractId: id,
              key,
              value,
              source: 'version',
              updatedById: user.userId,
            },
            update: { value, source: 'version', updatedById: user.userId },
          });
        }
      }
      await this.timelineTx(
        tx,
        id,
        user,
        'CONTRACT_VERSION_CREATED',
        `Version ${nextVersion} was created.`,
        { version: nextVersion, changeSummary: dto.changeSummary },
      );
    });
    return this.get(user, id);
  }

  async listTemplates(user: AuthenticatedUser) {
    this.assertPlatform(user);
    return {
      items: (
        await this.prisma.contractTemplate.findMany({
          include: { versions: { orderBy: { version: 'desc' }, take: 5 } },
          orderBy: { name: 'asc' },
        })
      ).map(normalizeContractTemplate),
    };
  }

  async getTemplate(user: AuthenticatedUser, id: string) {
    this.assertPlatform(user);
    const item = await this.prisma.contractTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!item) throw new NotFoundException('Contract template was not found.');
    return normalizeContractTemplate(item);
  }

  async createTemplate(
    user: AuthenticatedUser,
    dto: CreateContractTemplateDto,
  ) {
    this.assertWrite(user);
    const contentHtml = cleanContractHtml(dto.contentHtml);
    return this.prisma.contractTemplate.create({
      data: {
        key: dto.key.trim().toUpperCase(),
        name: dto.name.trim(),
        contractType: dto.contractType,
        description: dto.description,
        documentMode: dto.documentMode ?? 'EDITOR',
        signingMode: dto.signingMode ?? 'MIXED',
        lifecycleGatePurpose: dto.lifecycleGatePurpose,
        createdById: user.userId,
        updatedById: user.userId,
        versions: {
          create: {
            version: 1,
            title: dto.title,
            contentHtml,
            contentText: dto.contentText?.trim() || toPlainText(contentHtml),
            placeholders: (dto.placeholders ??
              extractContractPlaceholders(
                contentHtml,
              )) as Prisma.InputJsonValue,
            fieldDefinitions: dto.fieldDefinitions as Prisma.InputJsonValue,
            partyDefinitions: dto.partyDefinitions as Prisma.InputJsonValue,
            signingConfig: dto.signingConfig as Prisma.InputJsonValue,
            lifecycleGatePurpose: dto.lifecycleGatePurpose,
            isPublished: dto.publish ?? false,
            publishedAt: dto.publish ? new Date() : null,
            createdById: user.userId,
          },
        },
      },
      include: { versions: true },
    });
  }

  async createTemplateVersion(
    user: AuthenticatedUser,
    templateId: string,
    dto: CreateContractTemplateVersionDto,
  ) {
    this.assertWrite(user);
    const template = await this.prisma.contractTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!template)
      throw new NotFoundException('Contract template was not found.');
    const contentHtml = cleanContractHtml(dto.contentHtml);
    return this.prisma.contractTemplateVersion.create({
      data: {
        templateId,
        version: (template.versions[0]?.version ?? 0) + 1,
        title: dto.title,
        contentHtml,
        contentText: dto.contentText?.trim() || toPlainText(contentHtml),
        placeholders: (dto.placeholders ??
          extractContractPlaceholders(contentHtml)) as Prisma.InputJsonValue,
        fieldDefinitions: dto.fieldDefinitions as Prisma.InputJsonValue,
        partyDefinitions: dto.partyDefinitions as Prisma.InputJsonValue,
        signingConfig: dto.signingConfig as Prisma.InputJsonValue,
        lifecycleGatePurpose:
          dto.lifecycleGatePurpose ?? template.lifecycleGatePurpose,
        changeSummary: dto.changeSummary,
        isPublished: dto.publish ?? false,
        publishedAt: dto.publish ? new Date() : null,
        createdById: user.userId,
      },
    });
  }

  async cloneTemplate(user: AuthenticatedUser, templateId: string) {
    this.assertWrite(user);
    const source = await this.prisma.contractTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!source)
      throw new NotFoundException('Contract template was not found.');
    const latest = source.versions[0];
    if (!latest)
      throw new BadRequestException('The template has no version to clone.');
    return this.prisma.contractTemplate.create({
      data: {
        key: `${source.key}_COPY_${randomBytes(3).toString('hex').toUpperCase()}`,
        name: `${source.name} (Copy)`,
        contractType: source.contractType,
        description: source.description,
        isActive: false,
        createdById: user.userId,
        updatedById: user.userId,
        versions: {
          create: {
            version: 1,
            title: latest.title,
            contentHtml: latest.contentHtml,
            contentText: latest.contentText,
            placeholders: latest.placeholders ?? Prisma.JsonNull,
            changeSummary: `Cloned from ${source.name}`,
            isPublished: false,
            createdById: user.userId,
          },
        },
      },
      include: { versions: true },
    });
  }

  async updateTemplateState(
    user: AuthenticatedUser,
    templateId: string,
    state: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED',
  ) {
    this.assertWrite(user);
    const template = await this.prisma.contractTemplate.findUnique({
      where: { id: templateId },
      include: {
        versions: {
          where: { isPublished: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    if (!template)
      throw new NotFoundException('Contract template was not found.');
    if (state === 'ACTIVE' && !template.versions.length)
      throw new BadRequestException(
        'Publish a template version before activation.',
      );
    const updated = await this.prisma.contractTemplate.update({
      where: { id: templateId },
      data: {
        isActive: state === 'ACTIVE',
        archivedAt: state === 'ARCHIVED' ? new Date() : null,
        updatedById: user.userId,
      },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    return normalizeContractTemplate(updated);
  }

  async submitApproval(user: AuthenticatedUser, contractId: string) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    if (
      contract.signatureRequests.some(
        (request) => request.status === SignatureRequestStatus.COMPLETED,
      )
    )
      throw new BadRequestException(
        'A signed contract cannot be submitted for a new approval.',
      );
    const currentVersion = contract.versions.find(
      (version) => version.version === contract.currentVersionNumber,
    );
    if (!currentVersion)
      throw new BadRequestException(
        'Create a contract version before approval.',
      );
    const placeholderValues = Object.fromEntries(
      contract.placeholderValues.map((item) => [item.key, item.value]),
    );
    assertValidContractPlaceholderValues(
      extractContractPlaceholders(currentVersion.contentHtml),
      placeholderValues,
      true,
    );
    const settings = await this.contractSettings();
    const approvalSteps: Array<{
      stepOrder: number;
      name: string;
      approverType: string;
      approverId: string;
      status?: PlatformApprovalStepStatus;
      startedAt?: Date;
    }> = [];
    if (settings.requireCommercialApproval !== false)
      approvalSteps.push({
        stepOrder: approvalSteps.length + 1,
        name: 'Commercial approval',
        approverType: 'ROLE',
        approverId: 'FINANCE_MANAGER',
      });
    if (settings.requireLegalApproval !== false)
      approvalSteps.push({
        stepOrder: approvalSteps.length + 1,
        name: 'Legal approval',
        approverType: 'ROLE',
        approverId: 'LEGAL_REVIEWER',
      });
    if (!approvalSteps.length) {
      await this.prisma.$transaction([
        this.prisma.contract.update({
          where: { id: contractId },
          data: {
            status: ContractStatus.READY_FOR_SIGNATURE,
            updatedById: user.userId,
          },
        }),
        this.prisma.contractTimeline.create({
          data: {
            contractId,
            eventType: 'APPROVAL_NOT_REQUIRED',
            actorType: 'PLATFORM_USER',
            actorId: user.userId,
            message:
              'Contract moved to signature because approvals are disabled by policy.',
          },
        }),
      ]);
      return { success: true, status: ContractStatus.READY_FOR_SIGNATURE };
    }
    approvalSteps[0].status = PlatformApprovalStepStatus.PENDING;
    approvalSteps[0].startedAt = new Date();
    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.platformApprovalRequest.create({
        data: {
          requestNumber: reference('APR'),
          moduleKey: 'contracts',
          entityType: 'Contract',
          entityId: contractId,
          contractId,
          title: `Approve ${contract.contractNumber}: ${contract.title}`,
          status: PlatformApprovalStatus.PENDING,
          currentStepOrder: 1,
          submittedById: user.userId,
          submittedAt: new Date(),
          steps: {
            create: approvalSteps,
          },
        },
        include: { steps: true },
      });
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status:
            approvalSteps[0].approverId === 'FINANCE_MANAGER'
              ? ContractStatus.COMMERCIAL_APPROVAL
              : ContractStatus.LEGAL_APPROVAL,
          updatedById: user.userId,
        },
      });
      await this.timelineTx(
        tx,
        contractId,
        user,
        'APPROVAL_SUBMITTED',
        `Approval ${created.requestNumber} was submitted.`,
      );
      return created;
    });
    return request;
  }

  async transitionStage(
    user: AuthenticatedUser,
    contractId: string,
    direction: 'forward' | 'backward',
    reason?: string,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    const forward: Partial<Record<ContractStatus, ContractStatus>> = {
      DRAFT: ContractStatus.INTERNAL_REVIEW,
      COUNTERPARTY_REVIEW: ContractStatus.READY_FOR_SIGNATURE,
      FULLY_SIGNED: ContractStatus.ACTIVE,
      ACTIVE: ContractStatus.EXPIRING,
      EXPIRING: ContractStatus.EXPIRED,
    };
    const backward: Partial<Record<ContractStatus, ContractStatus>> = {
      INTERNAL_REVIEW: ContractStatus.DRAFT,
      COUNTERPARTY_REVIEW: ContractStatus.LEGAL_APPROVAL,
      READY_FOR_SIGNATURE: ContractStatus.COUNTERPARTY_REVIEW,
    };
    if (direction === 'backward' && !reason?.trim())
      throw new BadRequestException(
        'A reason is required when moving a contract backward.',
      );
    const next =
      direction === 'forward'
        ? forward[contract.status]
        : backward[contract.status];
    if (!next)
      throw new BadRequestException(
        `The ${contract.status.toLowerCase().replaceAll('_', ' ')} stage must use its governed approval, signature, activation, or termination action.`,
      );
    if (
      next === ContractStatus.ACTIVE &&
      contract.status !== ContractStatus.FULLY_SIGNED
    )
      throw new BadRequestException(
        'Only a fully signed contract can be activated.',
      );
    await this.prisma.$transaction([
      this.prisma.contract.update({
        where: { id: contractId },
        data: {
          status: next,
          updatedById: user.userId,
          ...(next === ContractStatus.ACTIVE
            ? { activatedAt: new Date() }
            : {}),
        },
      }),
      this.prisma.contractTimeline.create({
        data: {
          contractId,
          eventType: 'STAGE_CHANGED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Contract moved from ${contract.status} to ${next}.`,
          metadata: {
            previousStage: contract.status,
            nextStage: next,
            direction,
            reason: reason ?? null,
          },
        },
      }),
    ]);
    return this.get(user, contractId);
  }

  async decideApproval(
    user: AuthenticatedUser,
    requestId: string,
    decision: 'approve' | 'reject' | 'return',
    dto: ApprovalDecisionDto,
  ) {
    this.assertPlatform(user);
    const request = await this.prisma.platformApprovalRequest.findUnique({
      where: { id: requestId },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!request || !request.contractId)
      throw new NotFoundException('Approval request was not found.');
    if (request.status !== PlatformApprovalStatus.PENDING)
      throw new BadRequestException('This approval is no longer pending.');
    const step = request.steps.find(
      (item) => item.status === PlatformApprovalStepStatus.PENDING,
    );
    if (!step)
      throw new BadRequestException('No pending approval step was found.');
    this.assertApprovalStep(user, step.approverId ?? 'PLATFORM_ADMIN');
    await this.prisma.$transaction(async (tx) => {
      const stepStatus =
        decision === 'approve'
          ? PlatformApprovalStepStatus.APPROVED
          : decision === 'reject'
            ? PlatformApprovalStepStatus.REJECTED
            : PlatformApprovalStepStatus.RETURNED;
      await tx.platformApprovalStep.update({
        where: { id: step.id },
        data: { status: stepStatus, completedAt: new Date() },
      });
      await tx.platformApprovalAction.create({
        data: {
          approvalRequestId: request.id,
          approvalStepId: step.id,
          actorUserId: user.userId,
          action: decision.toUpperCase(),
          comment: dto.comment,
        },
      });
      if (decision === 'approve') {
        const next = request.steps.find(
          (item) => item.stepOrder > step.stepOrder,
        );
        if (next) {
          await tx.platformApprovalStep.update({
            where: { id: next.id },
            data: {
              status: PlatformApprovalStepStatus.PENDING,
              startedAt: new Date(),
            },
          });
          await tx.platformApprovalRequest.update({
            where: { id: request.id },
            data: { currentStepOrder: next.stepOrder },
          });
          await tx.contract.update({
            where: { id: request.contractId! },
            data: {
              status: ContractStatus.LEGAL_APPROVAL,
              updatedById: user.userId,
            },
          });
        } else {
          await tx.platformApprovalRequest.update({
            where: { id: request.id },
            data: {
              status: PlatformApprovalStatus.APPROVED,
              completedAt: new Date(),
              currentStepOrder: null,
            },
          });
          await tx.contract.update({
            where: { id: request.contractId! },
            data: {
              status: ContractStatus.READY_FOR_SIGNATURE,
              updatedById: user.userId,
            },
          });
        }
      } else {
        await tx.platformApprovalRequest.update({
          where: { id: request.id },
          data: {
            status:
              decision === 'reject'
                ? PlatformApprovalStatus.REJECTED
                : PlatformApprovalStatus.RETURNED,
            completedAt: new Date(),
          },
        });
        await tx.contract.update({
          where: { id: request.contractId! },
          data: { status: ContractStatus.DRAFT, updatedById: user.userId },
        });
      }
      await this.timelineTx(
        tx,
        request.contractId!,
        user,
        `APPROVAL_${decision.toUpperCase()}`,
        dto.comment || `${step.name} ${decision}d.`,
      );
    });
    return this.get(user, request.contractId);
  }

  async addParty(
    user: AuthenticatedUser,
    contractId: string,
    dto: ContractPartyDto,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    this.assertAgreementEditable(contract.status);
    await this.prisma.contractParty.create({
      data: {
        contractId,
        partyType: dto.partyType,
        role: dto.role,
        name: dto.name.trim(),
        legalName: dto.legalName?.trim(),
        email: dto.email?.trim().toLowerCase(),
        phone: dto.phone?.trim(),
        organizationId: dto.organizationId,
        isPrimary: dto.isPrimary ?? false,
        signingOrder: dto.signingOrder ?? 1,
      },
    });
    await this.timeline(
      contractId,
      user,
      'PARTY_ADDED',
      `${dto.name.trim()} was added as ${dto.role}.`,
    );
    return this.get(user, contractId);
  }

  async addFieldPlacement(
    user: AuthenticatedUser,
    contractId: string,
    dto: ContractFieldPlacementDto,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    this.assertAgreementEditable(contract.status);
    if (
      !contract.versions.some((version) => version.id === dto.contractVersionId)
    )
      throw new BadRequestException(
        'Field placement version must belong to this agreement.',
      );
    if (
      dto.partyId &&
      !contract.parties.some((party) => party.id === dto.partyId)
    )
      throw new BadRequestException(
        'Field placement party must belong to this agreement.',
      );
    await this.prisma.contractFieldPlacement.upsert({
      where: {
        contractVersionId_fieldKey: {
          contractVersionId: dto.contractVersionId,
          fieldKey: dto.fieldKey,
        },
      },
      create: {
        contractId,
        contractVersionId: dto.contractVersionId,
        partyId: dto.partyId,
        recipientId: dto.recipientId,
        fieldKey: dto.fieldKey,
        fieldType: dto.fieldType,
        pageNumber: dto.pageNumber,
        x: dto.x,
        y: dto.y,
        width: dto.width,
        height: dto.height,
        isRequired: dto.required ?? true,
        value: dto.defaultValue,
        createdById: user.userId,
      },
      update: {
        partyId: dto.partyId,
        recipientId: dto.recipientId,
        fieldType: dto.fieldType,
        pageNumber: dto.pageNumber,
        x: dto.x,
        y: dto.y,
        width: dto.width,
        height: dto.height,
        isRequired: dto.required ?? true,
        value: dto.defaultValue,
      },
    });
    await this.timeline(
      contractId,
      user,
      'FIELD_PLACED',
      `${dto.fieldKey} was placed on page ${dto.pageNumber}.`,
    );
    return this.get(user, contractId);
  }

  async voidContract(
    user: AuthenticatedUser,
    contractId: string,
    reason: string,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    if (
      ['FULLY_EXECUTED', 'ACTIVE', 'TERMINATED', 'SUPERSEDED'].includes(
        contract.status,
      )
    )
      throw new BadRequestException(
        'An executed agreement must be terminated or superseded, not voided.',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.signatureRequest.updateMany({
        where: {
          contractId,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'DECLINED'] },
        },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          voidReason: reason.trim(),
        },
      });
      await tx.signatureRecipient.updateMany({
        where: {
          signatureRequest: { contractId },
          status: { notIn: ['SIGNED', 'DECLINED'] },
        },
        data: {
          status: 'EXPIRED',
          tokenRevokedAt: new Date(),
          tokenExpiresAt: new Date(),
        },
      });
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: 'VOIDED',
          processStage: 'VOIDED',
          updatedById: user.userId,
        },
      });
      await this.timelineTx(
        tx,
        contractId,
        user,
        'CONTRACT_VOIDED',
        reason.trim(),
      );
    });
    return this.get(user, contractId);
  }

  async terminateContract(
    user: AuthenticatedUser,
    contractId: string,
    reason: string,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    if (
      !['FULLY_EXECUTED', 'FULLY_SIGNED', 'ACTIVE', 'EXPIRING'].includes(
        contract.status,
      )
    )
      throw new BadRequestException(
        'Only an executed or active agreement can be terminated.',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: 'TERMINATED',
          terminatedAt: new Date(),
          terminationReason: reason.trim(),
          updatedById: user.userId,
        },
      });
      await this.timelineTx(
        tx,
        contractId,
        user,
        'CONTRACT_TERMINATED',
        reason.trim(),
      );
    });
    return this.get(user, contractId);
  }

  async createDerivedContract(
    user: AuthenticatedUser,
    sourceId: string,
    kind: 'AMENDMENT' | 'RENEWAL',
    dto: CreateDerivedContractDto,
  ) {
    this.assertWrite(user);
    const source = await this.get(user, sourceId);
    if (
      ![
        'FULLY_EXECUTED',
        'FULLY_SIGNED',
        'ACTIVE',
        'EXPIRING',
        'EXPIRED',
      ].includes(source.status)
    )
      throw new BadRequestException(
        'Only an executed agreement can be amended or renewed.',
      );
    const currentVersion =
      source.versions.find(
        (version) => version.version === source.currentVersionNumber,
      ) ?? source.versions[0];
    const derived = await this.create(user, {
      title: dto.title,
      contractType: kind,
      counterpartyName: source.counterpartyName,
      counterpartyEmail: source.counterpartyEmail ?? undefined,
      templateId: dto.templateId,
      partnerId: source.partnerId ?? undefined,
      customerAccountId: source.customerAccountId ?? undefined,
      customerOnboardingId: source.customerOnboardingId ?? undefined,
      tenantId: source.tenantId ?? undefined,
      relatedLeadId: source.relatedLeadId ?? undefined,
      parentContractId: source.parentContractId ?? source.id,
      amendsContractId: kind === 'AMENDMENT' ? source.id : undefined,
      renewsContractId: kind === 'RENEWAL' ? source.id : undefined,
      agreementCategory: source.agreementCategory ?? undefined,
      lifecycleGatePurpose: source.lifecycleGatePurpose ?? undefined,
      signingMode: source.signingMode,
      isGoverningAgreement: source.isGoverningAgreement,
      effectiveFrom: dto.effectiveFrom,
      effectiveUntil: dto.effectiveUntil,
      contentHtml: dto.contentHtml ?? currentVersion?.contentHtml,
      parties: source.parties.map((party) => ({
        partyType: party.partyType,
        role: party.role,
        name: party.name,
        legalName: party.legalName ?? undefined,
        email: party.email ?? undefined,
        phone: party.phone ?? undefined,
        organizationId: party.organizationId ?? undefined,
        isPrimary: party.isPrimary,
        signingOrder: party.signingOrder,
      })),
      relatedRecords: source.relatedRecords.map((record) => ({
        entityType: record.entityType,
        entityId: record.entityId,
        relationshipType: record.relationshipType,
      })),
    });
    await this.timeline(
      sourceId,
      user,
      `${kind}_CREATED`,
      `${derived.contractNumber} was created from this agreement.`,
      { derivedContractId: derived.id },
    );
    return derived;
  }

  async sendForSignature(
    user: AuthenticatedUser,
    contractId: string,
    dto: SendSignatureRequestDto,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    if (
      contract.status !== ContractStatus.READY_FOR_SIGNATURE &&
      contract.status !== ContractStatus.APPROVED_FOR_SENDING
    )
      throw new BadRequestException(
        'Contract must complete internal approvals before signature.',
      );
    const version = contract.versions.find(
      (item) => item.version === contract.currentVersionNumber,
    );
    if (!version)
      throw new BadRequestException('Current contract version was not found.');
    const placeholderSnapshot = Object.fromEntries(
      contract.placeholderValues.map((item) => [item.key, item.value]),
    );
    const placeholderDefinitions = extractContractPlaceholders(
      version.contentHtml,
    );
    assertValidContractPlaceholderValues(
      placeholderDefinitions,
      placeholderSnapshot,
      true,
    );
    const resolvedHtml = renderContractPlaceholders(
      version.contentHtml,
      placeholderSnapshot,
    );
    const unresolvedNonSignature = extractContractPlaceholders(resolvedHtml)
      .filter(
        (item) => item.dataType !== 'SIGNATURE' && item.dataType !== 'INITIALS',
      )
      .map((item) => item.key);
    if (unresolvedNonSignature.length)
      throw new BadRequestException(
        `Resolve required document fields before signature: ${unresolvedNonSignature.join(', ')}.`,
      );
    const snapshotSha256 = sha256(
      JSON.stringify(
        Object.fromEntries(
          Object.entries(placeholderSnapshot).sort(([left], [right]) =>
            left.localeCompare(right),
          ),
        ),
      ),
    );
    const contractSettings = await this.contractSettings();
    const expiryDays = boundedNumber(
      contractSettings.signatureExpiryDays,
      14,
      1,
      90,
    );
    const tokens = dto.recipients.map((recipient) => ({
      recipient,
      token: randomBytes(32).toString('base64url'),
    }));
    const partyIds = [
      ...new Set(
        dto.recipients
          .map((item) => item.partyId)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    if (partyIds.length) {
      const count = await this.prisma.contractParty.count({
        where: { contractId, id: { in: partyIds } },
      });
      if (count !== partyIds.length)
        throw new BadRequestException(
          'Every signer party must belong to this agreement.',
        );
    }
    const request = await this.prisma.$transaction(async (tx) => {
      const signingVersion = await tx.contractVersion.create({
        data: {
          contractId,
          templateVersionId: version.templateVersionId,
          version: contract.currentVersionNumber + 1,
          status: ContractVersionStatus.SENT_FOR_SIGNATURE,
          title: version.title,
          contentHtml: resolvedHtml,
          contentText: toPlainText(resolvedHtml),
          contentSha256: sha256(resolvedHtml),
          placeholderSnapshot: placeholderSnapshot as Prisma.InputJsonValue,
          placeholderSnapshotSha256: snapshotSha256,
          changeSummary: 'Immutable signing version',
          createdById: user.userId,
        },
      });
      const created = await tx.signatureRequest.create({
        data: {
          requestNumber: reference('SIG'),
          contractId,
          contractVersionId: signingVersion.id,
          status: SignatureRequestStatus.SENT,
          subject: dto.subject,
          message: dto.message,
          signingMode: dto.signingMode ?? contract.signingMode,
          expiresAt: dto.expiresAt
            ? new Date(dto.expiresAt)
            : addDays(new Date(), expiryDays),
          sentAt: new Date(),
          createdById: user.userId,
          recipients: {
            create: tokens.map(({ recipient, token }) => ({
              name: recipient.name,
              email: recipient.email.toLowerCase(),
              role: recipient.role,
              partyId: recipient.partyId,
              isRequired: recipient.isRequired ?? true,
              signingOrder: recipient.signingOrder,
              status: SignatureRecipientStatus.SENT,
              accessTokenHash: sha256(token),
              tokenExpiresAt: dto.expiresAt
                ? new Date(dto.expiresAt)
                : addDays(new Date(), expiryDays),
            })),
          },
        },
        include: { recipients: { orderBy: { signingOrder: 'asc' } } },
      });
      for (const createdRecipient of created.recipients) {
        await this.signatureEventTx(tx, {
          signatureRequestId: created.id,
          recipientId: createdRecipient.id,
          eventType: 'SENT',
          authenticationMethod: 'SECURE_TOKEN',
          verificationStatus: 'TOKEN_ISSUED',
          metadata: {
            signingOrder: createdRecipient.signingOrder,
            expiresAt: createdRecipient.tokenExpiresAt.toISOString(),
          },
        });
      }
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: ContractStatus.SENT,
          processStage: 'SENT',
          currentVersionNumber: signingVersion.version,
          updatedById: user.userId,
        },
      });
      await this.timelineTx(
        tx,
        contractId,
        user,
        'SIGNATURE_REQUEST_SENT',
        `Signature request ${created.requestNumber} was sent.`,
        { recipients: dto.recipients.map((item) => item.email) },
      );
      if (
        contract.partnerId &&
        ['PARTNER_AGREEMENT', 'MASTER_PARTNER_AGREEMENT'].includes(
          contract.contractType,
        )
      ) {
        await tx.partner.update({
          where: { id: contract.partnerId },
          data: { status: PartnerStatus.AGREEMENT_IN_PROGRESS },
        });
        await tx.partnerTimeline.create({
          data: {
            partnerId: contract.partnerId,
            eventType: 'AGREEMENT_SENT_FOR_SIGNATURE',
            actorType: 'PLATFORM_USER',
            actorId: user.userId,
            message: `${contract.contractNumber} was sent for signature.`,
            metadata: { contractId },
          },
        });
      }
      return created;
    });
    const publicSite = process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000';
    await Promise.all(
      tokens.map(({ recipient, token }) => {
        const url = `${publicSite}/sign/${token}`;
        return this.communications.sendEmail({
          eventCode: ['PARTNER_AGREEMENT', 'MASTER_PARTNER_AGREEMENT'].includes(
            contract.contractType,
          )
            ? 'PARTNER_AGREEMENT_SIGNATURE_REQUEST'
            : 'CONTRACT_SIGNATURE_REQUEST',
          recipient: recipient.email,
          subject: dto.subject,
          html: emailPage(
            `Signature requested: ${contract.title}`,
            dto.message ||
              `Please review and sign agreement ${contract.contractNumber}. The secure link expires in ${expiryDays} days.`,
            { label: 'Review and sign agreement', url },
          ),
          text: `${dto.subject}\n${url}`,
          entityType: 'Contract',
          entityId: contractId,
          requestedById: user.userId,
          metadata: { requestId: request.id, recipientRole: recipient.role },
        });
      }),
    );
    await this.events.record({
      eventCode: 'SIGNATURE_REQUESTED',
      source: 'ADMIN',
      entityType: 'Contract',
      entityId: contractId,
      customerAccountId: contract.customerAccountId,
      tenantId: contract.tenantId,
      actorType: 'PLATFORM_USER',
      actorId: user.userId,
      route: `/contracts/${contractId}`,
      metadata: {
        signatureRequestId: request.id,
        requestNumber: request.requestNumber,
        signingMode: request.signingMode,
        recipientCount: request.recipients.length,
      },
    });
    return {
      ...request,
      signingLinks: tokens.map(({ recipient, token }) => ({
        email: recipient.email,
        token,
        path: `/sign/${token}`,
      })),
    };
  }

  async getSignatureRequest(user: AuthenticatedUser, id: string) {
    this.assertPlatform(user);
    const item = await this.prisma.signatureRequest.findUnique({
      where: { id },
      include: {
        contract: true,
        contractVersion: {
          select: {
            id: true,
            version: true,
            title: true,
            contentSha256: true,
            signedAt: true,
          },
        },
        recipients: {
          include: { evidence: true },
          orderBy: { signingOrder: 'asc' },
        },
        events: { orderBy: { eventSequence: 'asc' } },
      },
    });
    if (!item) throw new NotFoundException('Signature request was not found.');
    return item;
  }

  async cancelSignatureRequest(user: AuthenticatedUser, id: string) {
    this.assertWrite(user);
    const request = await this.getSignatureRequest(user, id);
    if (['COMPLETED', 'CANCELLED'].includes(request.status))
      throw new BadRequestException(
        'This signature request cannot be cancelled.',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.signatureRequest.update({
        where: { id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await tx.signatureRecipient.updateMany({
        where: {
          signatureRequestId: id,
          status: { in: ['PENDING', 'SENT', 'VIEWED'] },
        },
        data: {
          status: 'EXPIRED',
          tokenExpiresAt: new Date(),
          tokenRevokedAt: new Date(),
        },
      });
      await tx.contract.update({
        where: { id: request.contractId },
        data: { status: 'READY_FOR_SIGNATURE' },
      });
      await this.signatureEventTx(tx, {
        signatureRequestId: id,
        eventType: 'CANCELLED',
        authenticationMethod: 'PLATFORM_SESSION',
        verificationStatus: 'AUTHORIZED_PLATFORM_USER',
        metadata: { cancelledByUserId: user.userId },
      });
      await tx.contractTimeline.create({
        data: {
          contractId: request.contractId,
          eventType: 'SIGNATURE_REQUEST_CANCELLED',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Signature request ${request.requestNumber} was cancelled.`,
        },
      });
    });
    return { success: true };
  }

  async resendSignatureRequest(user: AuthenticatedUser, id: string) {
    this.assertWrite(user);
    const request = await this.getSignatureRequest(user, id);
    if (!['SENT', 'VIEWED', 'EXPIRED'].includes(request.status))
      throw new BadRequestException('This signature request cannot be resent.');
    const links: Array<{
      recipientId: string;
      name: string;
      email: string;
      url: string;
      deliveryKey: string;
    }> = [];
    await this.prisma.$transaction(async (tx) => {
      for (const recipient of request.recipients.filter(
        (item) => item.status !== 'SIGNED',
      )) {
        const token = randomBytes(40).toString('base64url');
        await tx.signatureRecipient.update({
          where: { id: recipient.id },
          data: {
            accessTokenHash: sha256(token),
            tokenExpiresAt: addDays(new Date(), 14),
            status: 'SENT',
            viewedAt: null,
          },
        });
        const deliveryEvent = await this.signatureEventTx(tx, {
          signatureRequestId: id,
          recipientId: recipient.id,
          eventType: 'RESENT',
          authenticationMethod: 'SECURE_TOKEN',
          verificationStatus: 'TOKEN_REISSUED',
          metadata: { expiresAt: addDays(new Date(), 14).toISOString() },
        });
        links.push({
          recipientId: recipient.id,
          name: recipient.name,
          email: recipient.email,
          url: `${process.env.PUBLIC_SITE_URL ?? 'http://localhost:3000'}/sign/${token}`,
          deliveryKey: `signature-event:${deliveryEvent.id}`,
        });
      }
      await tx.signatureRequest.update({
        where: { id },
        data: {
          status: 'SENT',
          sentAt: new Date(),
          expiresAt: addDays(new Date(), 14),
        },
      });
      await tx.contractTimeline.create({
        data: {
          contractId: request.contractId,
          eventType: 'SIGNATURE_REQUEST_RESENT',
          actorType: 'PLATFORM_USER',
          actorId: user.userId,
          message: `Signature request ${request.requestNumber} was resent.`,
        },
      });
    });
    await Promise.all(
      links.map((link) =>
        this.communications.sendEmail({
          eventCode: 'CONTRACT_SIGNATURE_REMINDER',
          recipient: link.email,
          subject: request.subject,
          html: emailPage(
            `Signature reminder: ${request.contract.title}`,
            `Your secure signing link for ${request.contract.contractNumber} has been refreshed.`,
            { label: 'Review and sign agreement', url: link.url },
          ),
          text: `${request.subject}\n${link.url}`,
          entityType: 'Contract',
          entityId: request.contractId,
          requestedById: user.userId,
          metadata: { requestId: id, recipientId: link.recipientId },
          idempotencyKey: link.deliveryKey,
        }),
      ),
    );
    return { success: true, links };
  }

  async getSigningSession(token: string) {
    const recipient = await this.findRecipient(token);
    this.assertTokenUsable(recipient);
    const settings = await this.contractSettings();
    if (recipient.status === SignatureRecipientStatus.SENT)
      await this.prisma.$transaction(async (tx) => {
        await tx.signatureRecipient.update({
          where: { id: recipient.id },
          data: {
            status: SignatureRecipientStatus.VIEWED,
            viewedAt: new Date(),
          },
        });
        await tx.signatureRequest.updateMany({
          where: {
            id: recipient.signatureRequestId,
            status: SignatureRequestStatus.SENT,
          },
          data: { status: SignatureRequestStatus.VIEWED },
        });
        await tx.contract.updateMany({
          where: {
            id: recipient.signatureRequest.contractId,
            status: ContractStatus.SENT,
          },
          data: { status: ContractStatus.VIEWED, processStage: 'VIEWED' },
        });
        await this.signatureEventTx(tx, {
          signatureRequestId: recipient.signatureRequestId,
          recipientId: recipient.id,
          eventType: 'VIEWED',
          authenticationMethod: 'SECURE_TOKEN',
          verificationStatus: 'TOKEN_VERIFIED',
        });
      });
    const earlierIncomplete = recipient.signatureRequest.recipients.some(
      (item) =>
        recipient.signatureRequest.signingMode !== 'PARALLEL' &&
        item.isRequired &&
        item.signingOrder < recipient.signingOrder &&
        item.status !== SignatureRecipientStatus.SIGNED,
    );
    return {
      requestNumber: recipient.signatureRequest.requestNumber,
      subject: recipient.signatureRequest.subject,
      message: recipient.signatureRequest.message,
      recipient: {
        name: recipient.name,
        email: recipient.email,
        role: recipient.role,
        status: recipient.status,
      },
      contract: {
        contractNumber: recipient.signatureRequest.contract.contractNumber,
        title: recipient.signatureRequest.contract.title,
        counterpartyName: recipient.signatureRequest.contract.counterpartyName,
      },
      document: {
        title: recipient.signatureRequest.contractVersion.title,
        contentHtml: recipient.signatureRequest.contractVersion.contentHtml,
        sha256: recipient.signatureRequest.contractVersion.contentSha256,
      },
      canSign: !earlierIncomplete,
      expiresAt: recipient.tokenExpiresAt,
      consentText:
        typeof settings.consentText === 'string'
          ? settings.consentText
          : 'I agree to sign this document electronically and understand that my electronic signature is legally binding.',
      allowedSignatureMethods: Array.isArray(settings.allowedSignatureMethods)
        ? settings.allowedSignatureMethods.filter(
            (value): value is string => typeof value === 'string',
          )
        : ['TYPED', 'DRAWN', 'UPLOADED'],
    };
  }

  async completeSignature(
    token: string,
    dto: CompleteSignatureDto,
    evidence: { ipAddress?: string; userAgent?: string; sessionId?: string },
  ) {
    if (!dto.consentAccepted)
      throw new BadRequestException('Signature consent is required.');
    const settings = await this.contractSettings();
    const allowedMethods = Array.isArray(settings.allowedSignatureMethods)
      ? settings.allowedSignatureMethods.map(String)
      : ['TYPED', 'DRAWN', 'UPLOADED'];
    if (!allowedMethods.includes(dto.method))
      throw new BadRequestException('This signature method is not enabled.');
    const consentText =
      typeof settings.consentText === 'string'
        ? settings.consentText
        : 'I agree to sign this document electronically and understand that my electronic signature is legally binding.';
    const recipient = await this.findRecipient(token);
    if (recipient.status === SignatureRecipientStatus.SIGNED) {
      return {
        success: true,
        completed:
          recipient.signatureRequest.status ===
          SignatureRequestStatus.COMPLETED,
        message: 'Signature was already recorded.',
      };
    }
    this.assertTokenUsable(recipient);
    const earlierIncomplete = recipient.signatureRequest.recipients.some(
      (item) =>
        recipient.signatureRequest.signingMode !== 'PARALLEL' &&
        item.isRequired &&
        item.signingOrder < recipient.signingOrder &&
        item.status !== SignatureRecipientStatus.SIGNED,
    );
    if (earlierIncomplete)
      throw new BadRequestException(
        'An earlier signer must complete their signature first.',
      );
    if (dto.method === 'TYPED' && (dto.typedName?.trim().length ?? 0) < 2)
      throw new BadRequestException('Enter the signer legal name.');
    if (dto.method !== 'TYPED' && !dto.signatureDataUrl)
      throw new BadRequestException(
        'A drawn or uploaded signature image is required.',
      );
    let signatureStorageKey: string | undefined;
    let signatureBytes = Buffer.from(dto.typedName?.trim() ?? recipient.name);
    if (dto.signatureDataUrl) {
      signatureBytes = decodeSignatureDataUrl(dto.signatureDataUrl);
      signatureStorageKey = (
        await this.storage.saveFile({
          buffer: signatureBytes,
          originalFileName: `signature-${recipient.id}.png`,
          subdirectory: `contracts/${recipient.signatureRequest.contractId}/signatures`,
        })
      ).storageKey;
    }
    const previousEvidence = await this.prisma.signatureEvidence.findFirst({
      where: {
        recipient: {
          signatureRequestId: recipient.signatureRequestId,
          signingOrder: { lt: recipient.signingOrder },
        },
      },
      orderBy: { eventSequence: 'desc' },
    });
    const signedAt = new Date();
    const signatureHash = sha256(signatureBytes);
    const eventSequence = (previousEvidence?.eventSequence ?? 0) + 1;
    const eventHash = sha256(
      JSON.stringify({
        documentSha256:
          recipient.signatureRequest.contractVersion.contentSha256,
        recipientId: recipient.id,
        signatureHash,
        consentText,
        signedAt: signedAt.toISOString(),
        eventSequence,
        previousEventHash: previousEvidence?.eventHash ?? null,
      }),
    );
    const isFinal = recipient.signatureRequest.recipients
      .filter((item) => item.id !== recipient.id && item.isRequired)
      .every((item) => item.status === SignatureRecipientStatus.SIGNED);
    await this.prisma.$transaction(async (tx) => {
      await tx.signatureEvidence.create({
        data: {
          recipientId: recipient.id,
          method: dto.method,
          typedName: dto.typedName?.trim(),
          signatureStorageKey,
          signatureSha256: signatureHash,
          consentText,
          consentVersion:
            typeof settings.consentVersion === 'string'
              ? settings.consentVersion
              : '1',
          consentAcceptedAt: new Date(),
          ipAddress: evidence.ipAddress,
          userAgent: evidence.userAgent,
          sessionId: evidence.sessionId,
          timezone: dto.timezone,
          signerEmail: recipient.email,
          signerRole: recipient.role,
          partyId: recipient.partyId,
          agreementVersion: recipient.signatureRequest.contractVersion.version,
          localSignedAt: `${signedAt.toISOString()} (${dto.timezone || 'UTC'})`,
          authenticationMethod: 'SECURE_TOKEN',
          verificationStatus: 'TOKEN_VERIFIED',
          requestTokenId: sha256(token).slice(0, 24),
          requestExpiresAt: recipient.tokenExpiresAt,
          eventSequence,
          previousEventHash: previousEvidence?.eventHash,
          eventHash,
          completionStatus: 'COMPLETED',
          auditMetadata: {
            signerRole: recipient.role,
            signingOrder: recipient.signingOrder,
            requestNumber: recipient.signatureRequest.requestNumber,
          },
          documentSha256:
            recipient.signatureRequest.contractVersion.contentSha256,
          signedAt,
        },
      });
      await tx.signatureRecipient.update({
        where: { id: recipient.id },
        data: {
          status: SignatureRecipientStatus.SIGNED,
          signedAt,
          tokenUsedAt: signedAt,
          identityVerifiedAt: signedAt,
          verificationMethod: 'SECURE_TOKEN',
        },
      });
      await this.signatureEventTx(tx, {
        signatureRequestId: recipient.signatureRequestId,
        recipientId: recipient.id,
        eventType: 'SIGNED',
        ipAddress: evidence.ipAddress,
        userAgent: evidence.userAgent,
        authenticationMethod: 'SECURE_TOKEN',
        verificationStatus: 'TOKEN_VERIFIED',
        metadata: {
          method: dto.method,
          documentSha256:
            recipient.signatureRequest.contractVersion.contentSha256,
          signatureSha256: signatureHash,
          consentAccepted: true,
        },
      });
      if (isFinal) {
        await tx.signatureRequest.update({
          where: { id: recipient.signatureRequestId },
          data: {
            status: SignatureRequestStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
        await tx.contractVersion.update({
          where: { id: recipient.signatureRequest.contractVersionId },
          data: {
            status: ContractVersionStatus.SIGNED,
            signedAt: new Date(),
            lockedAt: new Date(),
          },
        });
        await tx.contract.update({
          where: { id: recipient.signatureRequest.contractId },
          data: {
            status: ContractStatus.FULLY_EXECUTED,
            processStage: 'FULLY_EXECUTED',
            signedAt,
          },
        });
        if (recipient.signatureRequest.contract.customerOnboardingId) {
          await tx.customerOnboarding.update({
            where: {
              id: recipient.signatureRequest.contract.customerOnboardingId,
            },
            data: { contractSigned: true, subStatus: 'Fully signed agreement' },
          });
        }
        if (
          recipient.signatureRequest.contract.partnerId &&
          ['PARTNER_AGREEMENT', 'MASTER_PARTNER_AGREEMENT'].includes(
            recipient.signatureRequest.contract.contractType,
          )
        ) {
          await tx.partner.update({
            where: { id: recipient.signatureRequest.contract.partnerId },
            data: { status: PartnerStatus.AGREEMENT_EXECUTED },
          });
          await tx.partnerTimeline.create({
            data: {
              partnerId: recipient.signatureRequest.contract.partnerId,
              eventType: 'AGREEMENT_EXECUTED',
              actorType: 'SYSTEM',
              message: `${recipient.signatureRequest.contract.contractNumber} was fully executed.`,
              metadata: { contractId: recipient.signatureRequest.contractId },
            },
          });
          const defaultLink = await tx.partnerReferralLink.findFirst({
            where: {
              partnerId: recipient.signatureRequest.contract.partnerId,
              isDefault: true,
            },
          });
          if (!defaultLink) {
            await tx.partnerReferralLink.create({
              data: {
                partnerId: recipient.signatureRequest.contract.partnerId,
                name: 'Default referral link',
                code: referralCode(),
                targetPath: '/request-demo',
                isDefault: true,
              },
            });
          }
        }
      } else {
        await tx.signatureRequest.update({
          where: { id: recipient.signatureRequestId },
          data: { status: SignatureRequestStatus.PARTIALLY_SIGNED },
        });
        await tx.contract.update({
          where: { id: recipient.signatureRequest.contractId },
          data: {
            status: ContractStatus.PARTIALLY_SIGNED,
            processStage: 'SIGNATURE_IN_PROGRESS',
          },
        });
      }
      await tx.contractTimeline.create({
        data: {
          contractId: recipient.signatureRequest.contractId,
          eventType: 'DOCUMENT_SIGNED',
          actorType: 'SIGNER',
          actorId: recipient.id,
          message: `${recipient.name} signed as ${recipient.role}.`,
          metadata: { method: dto.method, finalSignature: isFinal },
        },
      });
    });
    if (isFinal) {
      const signed = await this.generateDocument(
        undefined,
        recipient.signatureRequest.contractId,
        'pdf',
        true,
      );
      const evidenceRows = await this.prisma.signatureEvidence.findMany({
        where: {
          recipient: { signatureRequestId: recipient.signatureRequestId },
        },
        include: {
          recipient: {
            select: { name: true, email: true, role: true, signingOrder: true },
          },
        },
        orderBy: { eventSequence: 'asc' },
      });
      const signatureEvents = await this.prisma.signatureEvent.findMany({
        where: { signatureRequestId: recipient.signatureRequestId },
        orderBy: { eventSequence: 'asc' },
      });
      const evidenceBuffer = Buffer.from(
        JSON.stringify(
          {
            requestNumber: recipient.signatureRequest.requestNumber,
            contractId: recipient.signatureRequest.contractId,
            contractVersionId: recipient.signatureRequest.contractVersionId,
            documentSha256:
              recipient.signatureRequest.contractVersion.contentSha256,
            completedAt: signedAt.toISOString(),
            events: evidenceRows.map((item) => ({
              signer: item.recipient,
              method: item.method,
              consentText: item.consentText,
              consentAcceptedAt: item.consentAcceptedAt,
              signedAt: item.signedAt,
              timezone: item.timezone,
              authenticationMethod: item.authenticationMethod,
              verificationStatus: item.verificationStatus,
              eventSequence: item.eventSequence,
              previousEventHash: item.previousEventHash,
              eventHash: item.eventHash,
              signatureSha256: item.signatureSha256,
              ipAddress: item.ipAddress,
              userAgent: item.userAgent,
            })),
            auditTrail: signatureEvents.map((item) => ({
              eventType: item.eventType,
              recipientId: item.recipientId,
              eventSequence: item.eventSequence,
              previousEventHash: item.previousEventHash,
              eventHash: item.eventHash,
              authenticationMethod: item.authenticationMethod,
              verificationStatus: item.verificationStatus,
              ipAddress: item.ipAddress,
              userAgent: item.userAgent,
              metadata: item.metadata,
              createdAt: item.createdAt,
            })),
          },
          null,
          2,
        ),
      );
      const evidenceSaved = await this.storage.saveFile({
        buffer: evidenceBuffer,
        originalFileName: `${recipient.signatureRequest.requestNumber}-evidence.json`,
        subdirectory: `contracts/${recipient.signatureRequest.contractId}/evidence`,
      });
      const evidenceDocument = await this.prisma.contractDocument.create({
        data: {
          contractId: recipient.signatureRequest.contractId,
          contractVersionId: recipient.signatureRequest.contractVersionId,
          kind: 'EVIDENCE_BUNDLE',
          source: 'SIGNATURE',
          fileName: `${recipient.signatureRequest.requestNumber}-evidence.json`,
          mimeType: 'application/json',
          storageKey: evidenceSaved.storageKey,
          sizeBytes: evidenceSaved.size,
          sha256: sha256(evidenceBuffer),
          isImmutable: true,
        },
      });
      await this.prisma.signatureRequest.update({
        where: { id: recipient.signatureRequestId },
        data: {
          signedDocumentId: signed.document.id,
          evidenceDocumentId: evidenceDocument.id,
        },
      });
      await Promise.all(
        recipient.signatureRequest.recipients.map((signer) =>
          this.communications.sendEmail({
            eventCode: 'CONTRACT_FULLY_SIGNED',
            recipient: signer.email,
            subject: `${recipient.signatureRequest.contract.contractNumber} is fully signed`,
            html: emailPage(
              'Agreement completed',
              `${recipient.signatureRequest.contract.title} has been signed by all required parties. The signed record and evidence have been locked.`,
            ),
            entityType: 'Contract',
            entityId: recipient.signatureRequest.contractId,
            metadata: { requestId: recipient.signatureRequestId },
          }),
        ),
      );
    }
    await this.events.record({
      eventCode: isFinal ? 'AGREEMENT_FULLY_SIGNED' : 'AGREEMENT_SIGNED',
      source: 'LANDING',
      entityType: 'Contract',
      entityId: recipient.signatureRequest.contractId,
      customerAccountId: recipient.signatureRequest.contract.customerAccountId,
      tenantId: recipient.signatureRequest.contract.tenantId,
      actorType: 'EXTERNAL_SIGNER',
      actorId: recipient.id,
      route: '/public/signatures/:token/sign',
      metadata: {
        signatureRequestId: recipient.signatureRequestId,
        method: dto.method,
        role: recipient.role,
        completed: isFinal,
      },
    });
    return {
      success: true,
      completed: isFinal,
      message: isFinal ? 'All signatures are complete.' : 'Signature recorded.',
    };
  }

  async declineSignature(
    token: string,
    dto: DeclineSignatureDto,
    evidence: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const recipient = await this.findRecipient(token);
    this.assertTokenUsable(recipient);
    await this.prisma.$transaction(async (tx) => {
      await tx.signatureRecipient.update({
        where: { id: recipient.id },
        data: {
          status: SignatureRecipientStatus.DECLINED,
          declinedAt: new Date(),
          declineReason: dto.reason,
          tokenUsedAt: new Date(),
        },
      });
      await tx.signatureRequest.update({
        where: { id: recipient.signatureRequestId },
        data: { status: SignatureRequestStatus.DECLINED },
      });
      await tx.contract.update({
        where: { id: recipient.signatureRequest.contractId },
        data: { status: ContractStatus.DECLINED, processStage: 'DECLINED' },
      });
      await this.signatureEventTx(tx, {
        signatureRequestId: recipient.signatureRequestId,
        recipientId: recipient.id,
        eventType: 'DECLINED',
        ipAddress: evidence.ipAddress,
        userAgent: evidence.userAgent,
        authenticationMethod: 'SECURE_TOKEN',
        verificationStatus: 'TOKEN_VERIFIED',
        metadata: { reason: dto.reason },
      });
      await tx.contractTimeline.create({
        data: {
          contractId: recipient.signatureRequest.contractId,
          eventType: 'SIGNATURE_DECLINED',
          actorType: 'SIGNER',
          actorId: recipient.id,
          message: `${recipient.name} declined to sign.`,
          metadata: { reason: dto.reason },
        },
      });
    });
    await this.notifyContractOwner(
      recipient.signatureRequest.contract.ownerPlatformUserId,
      'CONTRACT_SIGNATURE_DECLINED',
      recipient.signatureRequest.contract,
      `${recipient.name} declined the signature request. Reason: ${dto.reason}`,
      recipient.signatureRequestId,
    );
    return { success: true, message: 'Signature request declined.' };
  }

  async requestSignatureChanges(
    token: string,
    dto: RequestSignatureChangesDto,
    evidence: { ipAddress?: string; userAgent?: string } = {},
  ) {
    const recipient = await this.findRecipient(token);
    this.assertTokenUsable(recipient);
    await this.prisma.$transaction(async (tx) => {
      await tx.signatureRecipient.update({
        where: { id: recipient.id },
        data: {
          status: SignatureRecipientStatus.CHANGES_REQUESTED,
          declineReason: dto.reason,
          tokenUsedAt: new Date(),
        },
      });
      await tx.signatureRequest.update({
        where: { id: recipient.signatureRequestId },
        data: { status: SignatureRequestStatus.CHANGES_REQUESTED },
      });
      await tx.contract.update({
        where: { id: recipient.signatureRequest.contractId },
        data: {
          status: ContractStatus.DRAFT,
          processStage: 'CHANGES_REQUESTED',
        },
      });
      await this.signatureEventTx(tx, {
        signatureRequestId: recipient.signatureRequestId,
        recipientId: recipient.id,
        eventType: 'CHANGES_REQUESTED',
        ipAddress: evidence.ipAddress,
        userAgent: evidence.userAgent,
        authenticationMethod: 'SECURE_TOKEN',
        verificationStatus: 'TOKEN_VERIFIED',
        metadata: { reason: dto.reason },
      });
      await tx.contractTimeline.create({
        data: {
          contractId: recipient.signatureRequest.contractId,
          eventType: 'SIGNATURE_CHANGES_REQUESTED',
          actorType: 'SIGNER',
          actorId: recipient.id,
          message: `${recipient.name} requested document changes.`,
          metadata: { reason: dto.reason },
        },
      });
    });
    await this.notifyContractOwner(
      recipient.signatureRequest.contract.ownerPlatformUserId,
      'CONTRACT_SIGNATURE_CHANGES_REQUESTED',
      recipient.signatureRequest.contract,
      `${recipient.name} requested changes before signing. Reason: ${dto.reason}`,
      recipient.signatureRequestId,
    );
    return {
      success: true,
      message: 'Change request sent to the contract owner.',
    };
  }

  async generateDocument(
    user: AuthenticatedUser | undefined,
    contractId: string,
    format: 'pdf' | 'docx',
    immutable = false,
  ) {
    if (user) this.assertPlatform(user);
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!contract || !contract.versions[0])
      throw new NotFoundException('Contract document was not found.');
    const version = contract.versions[0];
    const documentHtml = version.contentHtml.replace(
      /\{\{\s*signature\.[a-zA-Z0-9_.-]+\s*\}\}/g,
      '[Electronic signature recorded in the signature appendix]',
    );
    let documentText = '';
    if (immutable) {
      const evidenceRows = await this.prisma.signatureEvidence.findMany({
        where: {
          recipient: {
            signatureRequest: {
              contractVersionId: version.id,
              status: SignatureRequestStatus.COMPLETED,
            },
          },
        },
        include: {
          recipient: {
            select: { name: true, email: true, role: true, signingOrder: true },
          },
        },
        orderBy: { eventSequence: 'asc' },
      });
      if (!evidenceRows.length)
        throw new BadRequestException(
          'A final signed document requires completed signature evidence.',
        );
      documentText += `\n\nELECTRONIC SIGNATURE APPENDIX\nDocument SHA-256: ${version.contentSha256}\n`;
      for (const evidence of evidenceRows) {
        documentText += [
          '',
          `Signer ${evidence.eventSequence}: ${evidence.typedName || evidence.recipient.name}`,
          `Role: ${evidence.recipient.role}`,
          `Email: ${evidence.recipient.email}`,
          `Method: ${evidence.method}`,
          `Signed: ${evidence.signedAt.toISOString()}${evidence.timezone ? ` (${evidence.timezone})` : ''}`,
          `Verification: ${evidence.verificationStatus ?? 'TOKEN_VERIFIED'}`,
          `Signature SHA-256: ${evidence.signatureSha256}`,
          `Evidence event hash: ${evidence.eventHash ?? ''}`,
        ].join('\n');
      }
      const completedRequest = await this.prisma.signatureRequest.findFirst({
        where: {
          contractVersionId: version.id,
          status: SignatureRequestStatus.COMPLETED,
        },
        select: { id: true, requestNumber: true },
      });
      const [signatureEvents, timeline] = await Promise.all([
        completedRequest
          ? this.prisma.signatureEvent.findMany({
              where: { signatureRequestId: completedRequest.id },
              orderBy: { eventSequence: 'asc' },
            })
          : [],
        this.prisma.contractTimeline.findMany({
          where: { contractId },
          orderBy: { createdAt: 'asc' },
        }),
      ]);
      documentText += `\n\nAUDIT CERTIFICATE\nAgreement: ${contract.contractNumber}\nVersion: ${version.version}\nSignature request: ${completedRequest?.requestNumber ?? ''}\n`;
      for (const event of signatureEvents) {
        documentText += `\n${event.eventSequence}. ${event.eventType} — ${event.createdAt.toISOString()} — Hash ${event.eventHash}`;
      }
      documentText += '\n\nAGREEMENT TIMELINE';
      for (const event of timeline) {
        documentText += `\n${event.createdAt.toISOString()} — ${event.eventType}: ${event.message}`;
      }
    }
    const buffer =
      format === 'pdf'
        ? await createPdf(contract.title, documentHtml, documentText)
        : await createDocx(contract.title, documentHtml, documentText);
    const mimeType =
      format === 'pdf'
        ? 'application/pdf'
        : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const fileName = `${contract.contractNumber}-v${version.version}.${format}`;
    const saved = await this.storage.saveFile({
      buffer,
      originalFileName: fileName,
      subdirectory: `contracts/${contract.id}/documents`,
    });
    const document = await this.prisma.contractDocument.create({
      data: {
        contractId,
        contractVersionId: version.id,
        kind: immutable
          ? 'SIGNED_COPY'
          : format === 'pdf'
            ? 'GENERATED_PDF'
            : 'GENERATED_PREVIEW',
        source: immutable ? 'SIGNATURE' : 'EDITOR',
        fileName,
        mimeType,
        storageKey: saved.storageKey,
        sizeBytes: saved.size,
        sha256: sha256(buffer),
        isImmutable: immutable,
        uploadedById: user?.userId,
      },
    });
    await this.events.record({
      eventCode: immutable
        ? 'SIGNED_AGREEMENT_GENERATED'
        : 'AGREEMENT_GENERATED',
      source: 'API',
      entityType: 'Contract',
      entityId: contractId,
      actorType: user ? 'PLATFORM_USER' : 'SYSTEM',
      actorId: user?.userId,
      route: `/contracts/${contractId}/generate/${format}`,
      metadata: {
        documentId: document.id,
        format,
        version: version.version,
        immutable,
        sizeBytes: saved.size,
      },
    });
    return { document, buffer };
  }

  async openDocument(user: AuthenticatedUser, documentId: string) {
    this.assertPlatform(user);
    const document = await this.prisma.contractDocument.findUnique({
      where: { id: documentId },
    });
    if (!document)
      throw new NotFoundException('Contract document was not found.');
    await this.timeline(
      document.contractId,
      user,
      'DOCUMENT_DOWNLOADED',
      `${document.fileName} was downloaded.`,
      { documentId },
    );
    return { document, file: await this.storage.openFile(document.storageKey) };
  }

  private async resolveSource(
    type: CreateContractFromSourceDto['sourceType'],
    id: string,
  ) {
    const defaults = await this.prisma.platformSetting.findUnique({
      where: { key: 'platform-defaults' },
    });
    const setting =
      defaults?.value &&
      typeof defaults.value === 'object' &&
      !Array.isArray(defaults.value)
        ? (defaults.value as Record<string, unknown>)
        : {};
    const reportingCurrency =
      typeof setting.reportingCurrency === 'string'
        ? setting.reportingCurrency
        : typeof setting.currency === 'string'
          ? setting.currency
          : 'USD';
    if (type === 'lead') {
      const lead = await this.prisma.lead.findUnique({ where: { id } });
      if (!lead) throw new NotFoundException('Lead source was not found.');
      return {
        counterpartyName: lead.companyName,
        counterpartyEmail: lead.workEmail,
        currencyCode: reportingCurrency,
        placeholderValues: {
          'customer.companyName': lead.companyName,
          'customer.contactName': lead.fullName,
          'customer.email': lead.workEmail,
          'customer.industry': lead.industry,
        },
        contractValue: undefined,
        partnerId: undefined,
        customerAccountId: undefined,
        customerOnboardingId: undefined,
        tenantId: undefined,
      };
    }
    if (type === 'customer') {
      const customer = await this.prisma.customerAccount.findUnique({
        where: { id },
      });
      if (!customer)
        throw new NotFoundException('Customer source was not found.');
      return customerSource(customer, reportingCurrency);
    }
    if (type === 'onboarding') {
      const onboarding = await this.prisma.customerOnboarding.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (!onboarding)
        throw new NotFoundException(
          'Customer onboarding source was not found.',
        );
      return {
        ...customerSource(onboarding.customer, reportingCurrency),
        customerOnboardingId: onboarding.id,
        tenantId: onboarding.tenantId ?? undefined,
        contractValue: onboarding.agreedPrice
          ? Number(onboarding.agreedPrice)
          : undefined,
        placeholderValues: {
          ...customerSource(onboarding.customer, reportingCurrency)
            .placeholderValues,
          'customer.primarySigner':
            `${onboarding.primaryOwnerFirstName} ${onboarding.primaryOwnerLastName}`.trim(),
          'customer.primarySignerEmail': onboarding.primaryOwnerWorkEmail,
          'commercial.billingCycle': onboarding.billingCycle ?? '',
          'commercial.agreedPrice': onboarding.agreedPrice?.toString() ?? '',
        },
      };
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: { customerAccount: true, subscription: true },
    });
    if (!tenant) throw new NotFoundException('Tenant source was not found.');
    const base = tenant.customerAccount
      ? customerSource(
          tenant.customerAccount,
          tenant.subscription?.currency ?? reportingCurrency,
        )
      : {
          counterpartyName: tenant.name,
          counterpartyEmail: undefined,
          currencyCode: tenant.subscription?.currency ?? reportingCurrency,
          customerAccountId: undefined,
          customerOnboardingId: undefined,
          tenantId: undefined,
          partnerId: undefined,
          contractValue: undefined,
          placeholderValues: {},
        };
    return {
      ...base,
      tenantId: tenant.id,
      contractValue: tenant.subscription
        ? Number(tenant.subscription.finalPrice)
        : undefined,
      placeholderValues: {
        ...base.placeholderValues,
        'tenant.name': tenant.name,
        'tenant.slug': tenant.slug,
        'commercial.planPrice':
          tenant.subscription?.finalPrice.toString() ?? '',
      },
    };
  }

  private async contractSettings() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'contract-settings' },
    });
    return row?.value &&
      typeof row.value === 'object' &&
      !Array.isArray(row.value)
      ? (row.value as Record<string, unknown>)
      : {};
  }

  private async reportingCurrency() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'platform-defaults' },
    });
    const value =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    return typeof value.reportingCurrency === 'string'
      ? value.reportingCurrency.toUpperCase()
      : typeof value.currency === 'string'
        ? value.currency.toUpperCase()
        : 'USD';
  }

  private async companyProfile() {
    const row = await this.prisma.platformSetting.findUnique({
      where: { key: 'company-profile' },
    });
    const value =
      row?.value && typeof row.value === 'object' && !Array.isArray(row.value)
        ? (row.value as Record<string, unknown>)
        : {};
    const text = (key: string, fallback = '') =>
      typeof value[key] === 'string' ? String(value[key]).trim() : fallback;
    return {
      companyName: text('companyName', 'DijiPeople'),
      legalName: text('legalName', 'DijiPeople Technologies'),
      streetAddress: text('streetAddress'),
      city: text('city'),
      country: text('country'),
      postalCode: text('postalCode'),
    };
  }

  private async notifyContractOwner(
    ownerPlatformUserId: string | null,
    eventCode: string,
    contract: { id: string; title: string; contractNumber: string },
    message: string,
    signatureRequestId: string,
  ) {
    if (!ownerPlatformUserId) return;
    const owner = await this.prisma.platformUser.findUnique({
      where: { id: ownerPlatformUserId },
      select: { email: true },
    });
    if (!owner?.email) return;
    await this.communications.sendEmail({
      eventCode,
      recipient: owner.email,
      subject: `${contract.contractNumber}: signature response received`,
      html: emailPage('Signature response received', message),
      entityType: 'Contract',
      entityId: contract.id,
      metadata: { signatureRequestId },
    });
  }

  private async findRecipient(token: string) {
    const recipient = await this.prisma.signatureRecipient.findUnique({
      where: { accessTokenHash: sha256(token) },
      include: {
        signatureRequest: {
          include: { contract: true, contractVersion: true, recipients: true },
        },
      },
    });
    if (!recipient)
      throw new NotFoundException('Signature link was not found.');
    return recipient;
  }

  private assertTokenUsable(
    recipient: Awaited<ReturnType<ContractsService['findRecipient']>>,
  ) {
    if (
      recipient.tokenRevokedAt ||
      recipient.tokenExpiresAt < new Date() ||
      recipient.signatureRequest.status === SignatureRequestStatus.EXPIRED
    )
      throw new BadRequestException('Signature link has expired.');
    if (
      new Set<SignatureRecipientStatus>([
        SignatureRecipientStatus.SIGNED,
        SignatureRecipientStatus.DECLINED,
        SignatureRecipientStatus.CHANGES_REQUESTED,
        SignatureRecipientStatus.EXPIRED,
      ]).has(recipient.status)
    )
      throw new BadRequestException(
        'This signature link has already been completed.',
      );
    if (
      new Set<SignatureRequestStatus>([
        SignatureRequestStatus.CANCELLED,
        SignatureRequestStatus.DECLINED,
        SignatureRequestStatus.CHANGES_REQUESTED,
        SignatureRequestStatus.COMPLETED,
      ]).has(recipient.signatureRequest.status)
    )
      throw new BadRequestException(
        'This signature request is no longer active.',
      );
  }

  private validateCounterparty(dto: CreateContractDto) {
    if (
      ['PARTNER_AGREEMENT', 'MASTER_PARTNER_AGREEMENT'].includes(
        dto.contractType,
      ) &&
      !dto.partnerId
    )
      throw new BadRequestException('Partner agreement requires a partner.');
    if (dto.contractType === 'CUSTOMER_AGREEMENT' && !dto.customerAccountId)
      throw new BadRequestException(
        'Customer agreement requires a customer account.',
      );
    this.validateContractDates(dto);
  }

  private validateContractDates(input: {
    effectiveDate?: string | Date | null;
    expiryDate?: string | Date | null;
    effectiveFrom?: string | Date | null;
    effectiveUntil?: string | Date | null;
  }) {
    if (
      input.effectiveDate &&
      input.expiryDate &&
      new Date(input.expiryDate) <= new Date(input.effectiveDate)
    )
      throw new BadRequestException(
        'Expiry date must be after the effective date.',
      );
    if (
      input.effectiveFrom &&
      input.effectiveUntil &&
      new Date(input.effectiveUntil) < new Date(input.effectiveFrom)
    )
      throw new BadRequestException(
        'Terms effective until must be on or after terms effective from.',
      );
  }

  private assertAgreementEditable(status: string) {
    if (
      [
        'SENT',
        'VIEWED',
        'SIGNATURE_IN_PROGRESS',
        'PARTIALLY_SIGNED',
        'FULLY_SIGNED',
        'FULLY_EXECUTED',
        'ACTIVE',
        'SUPERSEDED',
        'TERMINATED',
        'ARCHIVED',
      ].includes(status)
    ) {
      throw new BadRequestException(
        'Agreement content, parties, and fields are immutable after signing begins.',
      );
    }
  }

  private async invalidateSigningForNewVersion(
    contractId: string,
    userId: string,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const requests = await tx.signatureRequest.findMany({
        where: {
          contractId,
          status: { notIn: ['COMPLETED', 'CANCELLED', 'DECLINED'] },
        },
        select: { id: true },
      });
      const requestIds = requests.map((request) => request.id);
      if (requestIds.length) {
        await tx.signatureRecipient.updateMany({
          where: {
            signatureRequestId: { in: requestIds },
            status: { notIn: ['SIGNED', 'DECLINED'] },
          },
          data: {
            status: 'EXPIRED',
            tokenRevokedAt: new Date(),
            tokenExpiresAt: new Date(),
          },
        });
        await tx.signatureRequest.updateMany({
          where: { id: { in: requestIds } },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            voidReason: 'Invalidated by a new agreement version.',
          },
        });
      }
      await tx.contract.update({
        where: { id: contractId },
        data: {
          status: 'DRAFT',
          processStage: 'NEW_VERSION',
          updatedById: userId,
        },
      });
      await tx.contractTimeline.create({
        data: {
          contractId,
          eventType: 'SIGNING_INVALIDATED_FOR_NEW_VERSION',
          actorType: 'PLATFORM_USER',
          actorId: userId,
          message:
            'Active signing tokens were revoked before a new version was created.',
        },
      });
    });
  }

  private async signatureEventTx(
    tx: Prisma.TransactionClient,
    input: {
      signatureRequestId: string;
      recipientId?: string;
      eventType: string;
      ipAddress?: string;
      userAgent?: string;
      authenticationMethod?: string;
      verificationStatus?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    const previous = await tx.signatureEvent.findFirst({
      where: { signatureRequestId: input.signatureRequestId },
      orderBy: { eventSequence: 'desc' },
      select: { eventSequence: true, eventHash: true },
    });
    const eventSequence = (previous?.eventSequence ?? 0) + 1;
    const createdAt = new Date();
    const eventHash = sha256(
      JSON.stringify({
        signatureRequestId: input.signatureRequestId,
        recipientId: input.recipientId ?? null,
        eventType: input.eventType,
        eventSequence,
        previousEventHash: previous?.eventHash ?? null,
        createdAt: createdAt.toISOString(),
        metadata: input.metadata ?? null,
      }),
    );
    return tx.signatureEvent.create({
      data: {
        ...input,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
        eventSequence,
        previousEventHash: previous?.eventHash,
        eventHash,
        createdAt,
      },
    });
  }

  private timeline(
    contractId: string,
    user: AuthenticatedUser,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.contractTimeline.create({
      data: {
        contractId,
        eventType,
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private timelineTx(
    tx: Prisma.TransactionClient,
    contractId: string,
    user: AuthenticatedUser,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    return tx.contractTimeline.create({
      data: {
        contractId,
        eventType,
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private assertPlatform(user: AuthenticatedUser) {
    if (!user.platform?.id)
      throw new ForbiddenException('Platform access is required.');
    if (!userHasPlatformPermission(user, 'contracts.read'))
      throw new ForbiddenException('Contract access is required.');
  }

  private assertWrite(user: AuthenticatedUser) {
    this.assertPlatform(user);
    if (!userHasPlatformPermission(user, 'contracts.manage'))
      throw new ForbiddenException('Contract management access is required.');
  }

  private assertApprovalStep(user: AuthenticatedUser, approverRole: string) {
    const overrideRoles = new Set([
      'SUPER_ADMIN',
      'PLATFORM_OWNER',
      'PLATFORM_ADMIN',
    ]);
    if (
      overrideRoles.has(user.platform!.role) ||
      user.platform!.role === approverRole
    )
      return;
    throw new ForbiddenException(
      `The pending step requires the ${approverRole.toLowerCase().replaceAll('_', ' ')} role.`,
    );
  }
}

function contractRuntimeWhere(
  filters: Array<{ field: string; operator: string; value?: unknown }>,
): Prisma.ContractWhereInput {
  const clauses: Prisma.ContractWhereInput[] = [];
  for (const filter of filters) {
    const value = String(filter.value ?? '').trim();
    if (!value && !['isNull', 'isNotNull'].includes(filter.operator)) continue;
    if (['contractNumber', 'title', 'counterpartyName'].includes(filter.field))
      clauses.push({
        [filter.field]: contractStringCondition(filter.operator, value),
      });
    else if (filter.field === 'contractType')
      clauses.push({ contractType: value as never });
    else if (filter.field === 'status')
      clauses.push({ status: value as never });
    else if (filter.field === 'signatureStatus')
      clauses.push({ signatureRequests: { some: { status: value as never } } });
    else if (filter.field === 'partnerId')
      clauses.push({
        partnerId: nullableContractScalar(filter.operator, value),
      });
    else if (filter.field === 'customerAccountId')
      clauses.push({
        customerAccountId: nullableContractScalar(filter.operator, value),
      });
    else if (filter.field === 'tenantId')
      clauses.push({
        tenantId: nullableContractScalar(filter.operator, value),
      });
    else if (filter.field === 'templateId')
      clauses.push({
        templateId: nullableContractScalar(filter.operator, value),
      });
    else if (filter.field === 'ownerPlatformUserId')
      clauses.push({
        ownerPlatformUserId: nullableContractScalar(filter.operator, value),
      });
    else if (filter.field === 'currencyCode')
      clauses.push({
        currencyCode: nullableContractScalar(
          filter.operator,
          value.toUpperCase(),
        ),
      });
    else if (filter.field === 'contractValue')
      clauses.push({
        contractValue: contractNumberCondition(filter.operator, Number(value)),
      });
    else if (filter.field === 'effectiveDate' || filter.field === 'expiryDate')
      clauses.push({
        [filter.field]: contractDateCondition(filter.operator, value),
      });
  }
  return clauses.length ? { AND: clauses } : {};
}

function contractRuntimeOrder(
  sort: Array<{ field: string; direction: 'asc' | 'desc' }>,
): Prisma.ContractOrderByWithRelationInput[] {
  const supported = new Set([
    'contractNumber',
    'title',
    'counterpartyName',
    'contractType',
    'status',
    'contractValue',
    'effectiveDate',
    'expiryDate',
    'createdAt',
    'updatedAt',
  ]);
  const result = sort
    .filter((item) => supported.has(item.field))
    .map((item) => ({
      [item.field]: item.direction,
    })) as Prisma.ContractOrderByWithRelationInput[];
  return result.length ? result : [{ createdAt: 'desc' }];
}

function contractStringCondition(operator: string, value: string) {
  if (operator === 'ne') return { not: value };
  if (operator === 'startsWith')
    return { startsWith: value, mode: 'insensitive' as const };
  if (operator === 'contains')
    return { contains: value, mode: 'insensitive' as const };
  return { equals: value, mode: 'insensitive' as const };
}
function nullableContractScalar(operator: string, value: string) {
  if (operator === 'isNull') return null;
  if (operator === 'isNotNull') return { not: null };
  if (operator === 'ne') return { not: value };
  return value;
}
function contractNumberCondition(operator: string, value: number) {
  if (operator === 'gt') return { gt: value };
  if (operator === 'gte') return { gte: value };
  if (operator === 'lt') return { lt: value };
  if (operator === 'lte') return { lte: value };
  if (operator === 'ne') return { not: value };
  return value;
}
function contractDateCondition(operator: string, value: string) {
  const date = new Date(value);
  if (operator === 'gt') return { gt: date };
  if (operator === 'gte') return { gte: date };
  if (operator === 'lt') return { lt: date };
  if (operator === 'lte') return { lte: date };
  if (operator === 'ne') return { not: date };
  return date;
}

function viewWhere(
  view: string | undefined,
  userId: string,
): Prisma.ContractWhereInput {
  if (!view || view === 'all') return {};
  const statusMap: Record<string, ContractStatus> = {
    drafts: 'DRAFT',
    'internal-review': 'INTERNAL_REVIEW',
    'ready-to-send': 'APPROVED_FOR_SENDING',
    'partially-signed': 'PARTIALLY_SIGNED',
    'fully-executed': 'FULLY_EXECUTED',
    declined: 'DECLINED',
    expired: 'EXPIRED',
    voided: 'VOIDED',
  };
  if (statusMap[view]) return { status: statusMap[view] };
  if (view === 'awaiting-our-signature')
    return {
      status: {
        in: ['SENT', 'VIEWED', 'SIGNATURE_IN_PROGRESS', 'PARTIALLY_SIGNED'],
      },
      signatureRequests: {
        some: {
          recipients: {
            some: {
              role: { contains: 'DijiPeople', mode: 'insensitive' },
              status: { not: 'SIGNED' },
              isRequired: true,
            },
          },
        },
      },
    };
  if (view === 'awaiting-external-signature')
    return {
      status: {
        in: ['SENT', 'VIEWED', 'SIGNATURE_IN_PROGRESS', 'PARTIALLY_SIGNED'],
      },
      signatureRequests: {
        some: {
          recipients: {
            some: {
              NOT: { role: { contains: 'DijiPeople', mode: 'insensitive' } },
              status: { not: 'SIGNED' },
              isRequired: true,
            },
          },
        },
      },
    };
  if (view === 'partner-agreements')
    return { contractType: 'PARTNER_AGREEMENT' };
  if (view === 'customer-agreements')
    return { contractType: 'CUSTOMER_AGREEMENT' };
  if (view === 'my-contracts') return { ownerPlatformUserId: userId };
  if (view === 'expiring-soon')
    return {
      status: { in: ['ACTIVE', 'EXPIRING'] },
      expiryDate: { lte: addDays(new Date(), 90), gte: new Date() },
    };
  return {};
}

function normalizeContract<T extends Record<string, unknown>>(item: T) {
  return {
    ...item,
    contractValue:
      item.contractValue == null ? null : Number(item.contractValue),
  };
}

function normalizeContractTemplate<
  T extends { isActive: boolean; archivedAt: Date | null },
>(item: T) {
  return {
    ...item,
    status: item.archivedAt
      ? 'ARCHIVED'
      : item.isActive
        ? 'ACTIVE'
        : 'INACTIVE',
  };
}

export function cleanContractHtml(value: string) {
  return sanitizeHtml(value, {
    allowedTags: [
      'p',
      'br',
      'h1',
      'h2',
      'h3',
      'h4',
      'strong',
      'em',
      'u',
      's',
      'blockquote',
      'ul',
      'ol',
      'li',
      'a',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
      'hr',
      'span',
      'input',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      p: ['style'],
      h1: ['style'],
      h2: ['style'],
      h3: ['style'],
      h4: ['style'],
      th: ['colspan', 'rowspan', 'style'],
      td: ['colspan', 'rowspan', 'style'],
      span: ['data-placeholder', 'style'],
      hr: ['data-page-break', 'class'],
      input: ['type', 'checked', 'disabled'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
        'font-size': [/^\d{1,2}(px|pt)$/],
        'line-height': [/^\d(?:\.\d{1,2})?$/],
        'margin-left': [/^\d{1,3}px$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}

export function renderContractPlaceholders(
  html: string,
  values: Record<string, string>,
) {
  return html.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (match, key: string) =>
      key in values ? escapeHtml(String(values[key])) : match,
  );
}

export function extractContractPlaceholders(html: string) {
  return [
    ...new Set(
      [...html.matchAll(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g)].map(
        (match) => match[1],
      ),
    ),
  ].map(
    (key) =>
      CONTRACT_PLACEHOLDER_REGISTRY.find((item) => item.key === key) ??
      placeholder(
        key,
        key
          .split('.')
          .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
          .join(' '),
        inferPlaceholderType(key),
        `Example ${key}`,
      ),
  );
}

export function validateContractPlaceholderValues(
  definitions: ContractPlaceholderDefinition[],
  values: Record<string, string>,
  requireRequired = false,
) {
  const errors: string[] = [];
  for (const definition of definitions) {
    const raw = values[definition.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      if (requireRequired && definition.required)
        errors.push(`${definition.label} is required.`);
      continue;
    }
    if (
      ['INTEGER', 'DECIMAL', 'CURRENCY', 'PERCENTAGE'].includes(
        definition.dataType,
      ) &&
      !Number.isFinite(Number(value))
    )
      errors.push(`${definition.label} must be a number.`);
    if (definition.dataType === 'INTEGER' && !Number.isInteger(Number(value)))
      errors.push(`${definition.label} must be a whole number.`);
    if (
      definition.dataType === 'PERCENTAGE' &&
      (Number(value) < 0 || Number(value) > 100)
    )
      errors.push(`${definition.label} must be between 0 and 100.`);
    if (
      definition.dataType === 'EMAIL' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    )
      errors.push(`${definition.label} must be a valid email address.`);
    if (definition.dataType === 'URL') {
      try {
        const url = new URL(value);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
      } catch {
        errors.push(`${definition.label} must be a valid HTTP or HTTPS URL.`);
      }
    }
    if (
      ['DATE', 'DATE_TIME'].includes(definition.dataType) &&
      Number.isNaN(Date.parse(value))
    )
      errors.push(`${definition.label} must be a valid date.`);
    if (
      definition.dataType === 'BOOLEAN' &&
      !['true', 'false', 'yes', 'no', '1', '0'].includes(value.toLowerCase())
    )
      errors.push(`${definition.label} must be a yes/no value.`);
  }
  return errors;
}

function assertValidContractPlaceholderValues(
  definitions: ContractPlaceholderDefinition[],
  values: Record<string, string>,
  requireRequired = false,
) {
  const errors = validateContractPlaceholderValues(
    definitions,
    values,
    requireRequired,
  );
  if (errors.length) throw new BadRequestException(errors);
}

function inferPlaceholderType(key: string): ContractPlaceholderDataType {
  const normalized = key.toLowerCase();
  if (normalized.includes('email')) return 'EMAIL';
  if (normalized.includes('phone')) return 'PHONE';
  if (normalized.includes('url') || normalized.includes('website'))
    return 'URL';
  if (normalized.includes('address')) return 'ADDRESS';
  if (normalized.includes('percentage') || normalized.includes('rate'))
    return 'PERCENTAGE';
  if (normalized.endsWith('date')) return 'DATE';
  if (normalized.includes('datetime') || normalized.endsWith('at'))
    return 'DATE_TIME';
  if (normalized.startsWith('signature.')) return 'SIGNATURE';
  if (normalized.includes('currency') || normalized.includes('amount'))
    return 'CURRENCY';
  return 'TEXT';
}

function toPlainText(html: string) {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} })
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
      })[character]!,
  );
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex');
}

function referralCode() {
  return `DP-P-${randomBytes(8)
    .toString('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12)}`;
}

function reference(prefix: string) {
  return `${prefix}-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000);
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
) {
  const number = Number(value);
  return Number.isFinite(number)
    ? Math.min(max, Math.max(min, number))
    : fallback;
}

function compactStringRecord(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)]),
  );
}

export function decodeSignatureDataUrl(value: string) {
  const match = value.match(
    /^data:image\/(?:png|jpeg);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match)
    throw new BadRequestException(
      'Signature image must be a PNG or JPEG data URL.',
    );
  const buffer = Buffer.from(match[1], 'base64');
  if (!buffer.length || buffer.length > 2_000_000)
    throw new BadRequestException('Signature image is empty or exceeds 2 MB.');
  const isPng =
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg =
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff;
  if (!isPng && !isJpeg)
    throw new BadRequestException(
      'Signature content must be a valid PNG or JPEG image.',
    );
  return buffer;
}

function customerSource(
  customer: {
    id: string;
    companyName: string;
    legalCompanyName: string | null;
    primaryContactFirstName: string | null;
    primaryContactLastName: string | null;
    primaryContactEmail: string | null;
    contactEmail: string;
    country: string;
    industry: string | null;
  },
  currencyCode: string,
) {
  const contactName =
    `${customer.primaryContactFirstName ?? ''} ${customer.primaryContactLastName ?? ''}`.trim();
  return {
    counterpartyName: customer.legalCompanyName ?? customer.companyName,
    counterpartyEmail: customer.primaryContactEmail ?? customer.contactEmail,
    currencyCode,
    customerAccountId: customer.id,
    customerOnboardingId: undefined,
    tenantId: undefined,
    partnerId: undefined,
    contractValue: undefined,
    placeholderValues: {
      'customer.companyName': customer.companyName,
      'customer.legalName': customer.legalCompanyName ?? customer.companyName,
      'customer.contactName': contactName,
      'customer.email': customer.primaryContactEmail ?? customer.contactEmail,
      'customer.country': customer.country,
      'customer.industry': customer.industry ?? '',
    },
  };
}

async function documentToHtml(file: ContractUploadFile) {
  if (
    file.mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const converted = await mammoth.convertToHtml({ buffer: file.buffer });
    return cleanContractHtml(converted.value);
  }
  if (file.mimetype === 'application/pdf') {
    const converted = await pdfParse(file.buffer);
    return converted.text
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
      .join('');
  }
  if (file.mimetype === 'text/html')
    return cleanContractHtml(file.buffer.toString('utf8'));
  return file.buffer
    .toString('utf8')
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join('');
}

type AgreementHtmlNode = {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: AgreementHtmlNode[];
};

type AgreementBlock =
  | { kind: 'paragraph'; text: string; level?: number; quote?: boolean }
  | {
      kind: 'list';
      text: string;
      depth: number;
      ordered: boolean;
      index: number;
    }
  | { kind: 'table'; rows: string[][] };

export function extractAgreementDocumentStructure(html: string) {
  const root = parseDocument(cleanContractHtml(html)) as unknown as {
    children: AgreementHtmlNode[];
  };
  const blocks: AgreementBlock[] = [];
  const walk = (nodes: AgreementHtmlNode[], listDepth = 0) => {
    for (const node of nodes) {
      const name = node.name?.toLowerCase();
      if (name && /^h[1-4]$/.test(name))
        blocks.push({
          kind: 'paragraph',
          text: nodeText(node),
          level: Number(name.slice(1)),
        });
      else if (name === 'p')
        blocks.push({ kind: 'paragraph', text: nodeText(node) });
      else if (name === 'blockquote')
        blocks.push({ kind: 'paragraph', text: nodeText(node), quote: true });
      else if (name === 'ul' || name === 'ol') {
        const items = (node.children ?? []).filter(
          (child) => child.name?.toLowerCase() === 'li',
        );
        items.forEach((item, index) => {
          const inline = (item.children ?? []).filter(
            (child) => !['ul', 'ol'].includes(child.name?.toLowerCase() ?? ''),
          );
          blocks.push({
            kind: 'list',
            text: nodesText(inline),
            depth: listDepth,
            ordered: name === 'ol',
            index: index + 1,
          });
          walk(
            (item.children ?? []).filter((child) =>
              ['ul', 'ol'].includes(child.name?.toLowerCase() ?? ''),
            ),
            listDepth + 1,
          );
        });
      } else if (name === 'table') {
        const rows = findDescendants(node, 'tr').map((row) =>
          (row.children ?? [])
            .filter((cell) => ['td', 'th'].includes(cell.name ?? ''))
            .map(nodeText),
        );
        if (rows.length) blocks.push({ kind: 'table', rows });
      } else if (name === 'hr')
        blocks.push({ kind: 'paragraph', text: '────────────────────' });
      else if (node.children) walk(node.children, listDepth);
    }
  };
  walk(root.children);
  return blocks.filter(
    (block) => block.kind === 'table' || block.text.trim().length > 0,
  );
}

async function createPdf(title: string, html: string, appendix = '') {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({
      size: 'A4',
      margins: { top: 54, bottom: 54, left: 54, right: 54 },
      info: { Title: title },
    });
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    document.fontSize(18).text(title, { align: 'center' }).moveDown(2);
    for (const block of extractAgreementDocumentStructure(html)) {
      if (block.kind === 'table') {
        for (const [rowIndex, row] of block.rows.entries()) {
          document
            .font(rowIndex === 0 ? 'Helvetica-Bold' : 'Helvetica')
            .fontSize(9)
            .text(row.join('  |  '), { lineGap: 3 });
          document.moveDown(0.35);
        }
        document.moveDown(0.75);
        continue;
      }
      if (block.kind === 'list') {
        const prefix = block.ordered ? `${block.index}.` : '•';
        document
          .font('Helvetica')
          .fontSize(10)
          .text(`${'   '.repeat(block.depth)}${prefix} ${block.text}`, {
            indent: block.depth * 14,
            lineGap: 3,
          })
          .moveDown(0.45);
        continue;
      }
      document
        .font(block.level ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(block.level ? Math.max(11, 19 - block.level * 2) : 10)
        .text(block.text, {
          align: block.level ? 'left' : 'justify',
          indent: block.quote ? 18 : 0,
          lineGap: 4,
        })
        .moveDown(block.level ? 0.8 : 0.6);
    }
    if (appendix.trim()) {
      document.addPage();
      document.font('Helvetica').fontSize(9).text(appendix, { lineGap: 3 });
    }
    document.end();
  });
}

async function createDocx(title: string, html: string, appendix = '') {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32 })],
      spacing: { after: 400 },
    }),
  ];
  for (const block of extractAgreementDocumentStructure(html)) {
    if (block.kind === 'table') {
      children.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: block.rows.map(
            (row, rowIndex) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new TextRun({ text: cell, bold: rowIndex === 0 }),
                          ],
                        }),
                      ],
                    }),
                ),
              }),
          ),
        }),
      );
      continue;
    }
    if (block.kind === 'list') {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: block.ordered
                ? `${block.index}. ${block.text}`
                : block.text,
            }),
          ],
          ...(block.ordered
            ? {}
            : { bullet: { level: Math.min(8, block.depth) } }),
          indent: block.ordered ? { left: 360 * (block.depth + 1) } : undefined,
          spacing: { after: 100 },
        }),
      );
      continue;
    }
    children.push(
      new Paragraph({
        children: [new TextRun({ text: block.text, italics: block.quote })],
        heading:
          block.level === 1
            ? HeadingLevel.HEADING_1
            : block.level === 2
              ? HeadingLevel.HEADING_2
              : block.level === 3
                ? HeadingLevel.HEADING_3
                : block.level === 4
                  ? HeadingLevel.HEADING_4
                  : undefined,
        indent: block.quote ? { left: 360 } : undefined,
        spacing: { after: block.level ? 220 : 160 },
      }),
    );
  }
  if (appendix.trim())
    children.push(
      ...appendix
        .split(/\n+/)
        .filter(Boolean)
        .map((text) => new Paragraph({ text, spacing: { after: 120 } })),
    );
  const document = new Document({
    sections: [{ children }],
  });
  return Packer.toBuffer(document);
}

function nodeText(node: AgreementHtmlNode) {
  return DomUtils.getText(node as never)
    .replace(/\s+/g, ' ')
    .trim();
}

function nodesText(nodes: AgreementHtmlNode[]) {
  return nodes.map(nodeText).join(' ').replace(/\s+/g, ' ').trim();
}

function findDescendants(node: AgreementHtmlNode, name: string) {
  const matches: AgreementHtmlNode[] = [];
  for (const child of node.children ?? []) {
    if (child.name?.toLowerCase() === name) matches.push(child);
    else matches.push(...findDescendants(child, name));
  }
  return matches;
}
