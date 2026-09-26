import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContractStatus,
  ContractType,
  ContractVersionStatus,
  DiscountType,
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
  ImageRun,
  Packer,
  PageBreak,
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
import { buildPublicSiteUrl } from '../../common/config/public-site-url.config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  customerAgreementScope,
  executedGoverningAgreementWhere,
  TENANT_ORDER_AGREEMENT_REQUIRED_MESSAGE,
} from './governing-agreement';
import { StorageService } from '../../common/storage/storage.service';
import type { StorageScope } from '../../common/storage/object-storage.types';
import {
  isPlatformAdminTier,
  userHasPlatformPermission,
} from '../platform-auth/platform-permissions';
import {
  emailPage,
  PlatformCommunicationsService,
} from '../platform-communications/platform-communications.service';
import { PlatformEventsService } from '../platform-events/platform-events.service';
import { AuditService } from '../audit/audit.service';
import { contractPartyTypeForPartner } from '../partners/partner-type-policy';
import { toDisplayString } from '../../common/utils/display-string';
import {
  ALWAYS_AVAILABLE_SOURCE_ENTITIES,
  contractAllowedSourceEntities,
  contractInstanceContextEntities,
  outOfContextPlaceholders,
  unresolvableRequiredPlaceholders,
  type LinkableContract,
} from './placeholder-context';
import {
  assertCustomerUsable,
  assertLeadAttributedToPartner,
  assertLeadUsable,
  assertPartnerUsable,
  duplicateAgreementError,
  findDuplicateAgreement,
} from './agreement-source-guards';
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
  UpdateContractPartyDto,
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

const signatureRequestInclude = {
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
    orderBy: { signingOrder: 'asc' as const },
  },
  events: { orderBy: { eventSequence: 'asc' as const } },
} satisfies Prisma.SignatureRequestInclude;

/*
 * What a lead, customer, onboarding or tenant contributes to a new agreement:
 * the counterparty, the relationships to carry onto the contract, and the
 * placeholder values that record already knows.
 */
export type ResolvedContractSource = {
  counterpartyName: string;
  counterpartyEmail?: string;
  currencyCode: string;
  contractValue?: number;
  effectiveDate?: string;
  paymentTerms?: string;
  defaultContractType: ContractType;
  counterpartyType: string;
  partnerId?: string;
  customerAccountId?: string;
  customerOnboardingId?: string;
  tenantId?: string;
  relatedLeadId?: string;
  placeholderValues: Record<string, unknown>;
};

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
  // CURRENCY is a monetary amount. CURRENCY_CODE is the ISO 4217 code itself,
  // which must never be validated as a number.
  | 'CURRENCY'
  | 'CURRENCY_CODE'
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
  /*
   * Set on a superseded key. The placeholder still resolves so agreements
   * authored against the old namespace keep rendering, but it is not offered
   * as a choice when authoring new templates.
   */
  deprecatedFor?: string;
};

/*
 * Legacy key -> canonical key. Resolvers only ever produce canonical values;
 * the legacy keys are backfilled from them at render time so no caller has to
 * remember to emit both.
 */
export const DEPRECATED_PLACEHOLDER_ALIASES: Record<string, string> = {
  'customer.name': 'customer.companyName',
  'customer.contactName': 'customer.contact.fullName',
  'customer.email': 'customer.contact.email',
  'customer.primarySigner': 'customer.primarySigner.name',
  'customer.primarySignerEmail': 'customer.primarySigner.email',
  'commercial.planPrice': 'commercial.agreedPrice',
};

export function applyDeprecatedPlaceholderAliases(
  values: Record<string, string>,
) {
  const result = { ...values };
  for (const [legacy, canonical] of Object.entries(
    DEPRECATED_PLACEHOLDER_ALIASES,
  )) {
    if (result[legacy] === undefined && result[canonical] !== undefined)
      result[legacy] = result[canonical];
  }
  return result;
}

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

/*
 * Placeholders that describe optional commercial, provisioning, or service
 * terms. They resolve when the source record carries the data and render as
 * empty text when it does not, so an agreement that references them never
 * blocks approval or signature on data the platform does not hold yet.
 */
const optional = {
  required: false,
  fallbackBehavior: 'EMPTY',
} satisfies Partial<ContractPlaceholderDefinition>;

/*
 * A superseded key kept registered so agreements written against the old
 * namespace still validate and render. Its value is backfilled from the
 * canonical key, so it is never required and never offered when authoring.
 */
function deprecated(
  key: string,
  label: string,
  dataType: ContractPlaceholderDataType,
): ContractPlaceholderDefinition {
  const canonical = DEPRECATED_PLACEHOLDER_ALIASES[key];
  return placeholder(key, label, dataType, `Same as ${canonical}`, {
    ...optional,
    deprecatedFor: canonical,
    description: `Superseded by ${canonical}. Resolved from it for existing templates.`,
  });
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
    'CURRENCY_CODE',
    'SAR',
  ),
  placeholder(
    'platform.registrationNumber',
    'Platform registration number',
    'TEXT',
    'CR-1010203040',
    optional,
  ),
  placeholder('platform.taxId', 'Platform tax ID', 'TEXT', '310000000000003', {
    ...optional,
    securityClassification: 'CONFIDENTIAL',
  }),
  placeholder(
    'platform.contact.email',
    'Platform contact email',
    'EMAIL',
    'contracts@dijipeople.com',
    optional,
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
    'customer.companyName',
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
    // The whole postal address, country included — that is what the resolver
    // builds, and an example that omits half of it teaches template authors to
    // append the parts it appears to be missing.
    'King Fahd Road, Dammam, Eastern Province, Saudi Arabia',
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
  placeholder(
    'customer.contact.phone',
    'Customer contact phone',
    'PHONE',
    '+966 50 000 0000',
    optional,
  ),
  placeholder(
    'customer.billingContact.name',
    'Customer billing contact',
    'TEXT',
    'Finance Department',
    optional,
  ),
  placeholder(
    'customer.billingContact.email',
    'Customer billing email',
    'EMAIL',
    'billing@gulfhorizon.example',
    optional,
  ),
  placeholder('customer.country', 'Customer country', 'TEXT', 'Saudi Arabia'),
  placeholder(
    'customer.industry',
    'Customer industry',
    'TEXT',
    'Logistics',
    optional,
  ),
  placeholder(
    'customer.primarySigner.name',
    'Customer authorized signatory',
    'TEXT',
    'Amal Hassan',
  ),
  placeholder(
    'customer.primarySigner.title',
    'Customer signatory title',
    'TEXT',
    'Chief Operating Officer',
  ),
  placeholder(
    'customer.primarySigner.email',
    'Customer signatory email',
    'EMAIL',
    'amal@gulfhorizon.example',
  ),
  deprecated('customer.name', 'Customer name (legacy)', 'CUSTOMER'),
  deprecated('customer.contactName', 'Customer contact (legacy)', 'TEXT'),
  deprecated('customer.email', 'Customer email (legacy)', 'EMAIL'),
  deprecated('customer.primarySigner', 'Primary signer (legacy)', 'TEXT'),
  deprecated(
    'customer.primarySignerEmail',
    'Primary signer email (legacy)',
    'EMAIL',
  ),
  placeholder('commercial.planName', 'Agreed plan', 'TEXT', 'Growth', optional),
  placeholder(
    'commercial.planId',
    'Agreed plan ID',
    'LOOKUP',
    'a3f1c7e2-0000-4000-8000-000000000000',
    optional,
  ),
  placeholder('commercial.agreedPrice', 'Agreed price', 'CURRENCY', '2500.00', {
    ...optional,
    formattingRule: 'currency',
  }),
  placeholder(
    'commercial.billingCycle',
    'Billing cycle',
    'TEXT',
    'MONTHLY',
    optional,
  ),
  placeholder(
    'commercial.subscriptionTerm',
    'Subscription term',
    'TEXT',
    '12 months',
    optional,
  ),
  deprecated('commercial.planPrice', 'Plan price (legacy)', 'CURRENCY'),
  placeholder(
    'counterparty.name',
    'Counterparty name',
    'TEXT',
    'Gulf Horizon Logistics Company',
  ),
  placeholder(
    'counterparty.email',
    'Counterparty email',
    'EMAIL',
    'amal@gulfhorizon.example',
    optional,
  ),
  placeholder('tenant.name', 'Tenant name', 'TENANT', 'Gulf Horizon'),
  placeholder('tenant.slug', 'Tenant slug', 'TEXT', 'gulf-horizon', optional),
  placeholder('lead.companyName', 'Lead company', 'TEXT', 'Gulf Horizon', {
    required: false,
    fallbackBehavior: 'EMPTY',
  }),
  placeholder('lead.contactName', 'Lead contact', 'TEXT', 'Amal Hassan', {
    required: false,
    fallbackBehavior: 'EMPTY',
  }),
  placeholder(
    'lead.workEmail',
    'Lead work email',
    'EMAIL',
    'amal@example.com',
    {
      required: false,
      fallbackBehavior: 'EMPTY',
    },
  ),
  placeholder('lead.phone', 'Lead phone', 'PHONE', '+966 50 000 0000', {
    required: false,
    fallbackBehavior: 'EMPTY',
  }),
  placeholder(
    'lead.website',
    'Lead company website',
    'URL',
    'https://example.com',
    {
      required: false,
      fallbackBehavior: 'EMPTY',
    },
  ),
  placeholder('lead.industry', 'Lead industry', 'TEXT', 'Technology', {
    required: false,
    fallbackBehavior: 'EMPTY',
  }),
  placeholder('lead.companySize', 'Lead company size', 'TEXT', '51-200', {
    required: false,
    fallbackBehavior: 'EMPTY',
  }),
  placeholder('lead.country', 'Lead country', 'TEXT', 'Saudi Arabia', {
    required: false,
    fallbackBehavior: 'EMPTY',
  }),
  placeholder(
    'lead.requirements',
    'Lead requirements',
    'LONG_TEXT',
    'HR rollout requirements',
    {
      required: false,
      fallbackBehavior: 'EMPTY',
    },
  ),
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
  placeholder('contract.currency', 'Contract currency', 'CURRENCY_CODE', 'SAR'),
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
    'contract.governingLaw',
    'Governing law',
    'TEXT',
    'Laws of Saudi Arabia',
    {
      required: false,
      fallbackBehavior: 'EMPTY',
    },
  ),
  placeholder('contract.jurisdiction', 'Jurisdiction', 'TEXT', 'Riyadh', {
    required: false,
    fallbackBehavior: 'EMPTY',
  }),
  placeholder(
    'contract.renewalNoticeDays',
    'Renewal notice days',
    'INTEGER',
    '30',
    {
      required: false,
      fallbackBehavior: 'EMPTY',
    },
  ),
  placeholder(
    'contract.terminationNoticeDays',
    'Termination notice days',
    'INTEGER',
    '30',
    {
      required: false,
      fallbackBehavior: 'EMPTY',
    },
  ),
  placeholder(
    'contract.autoRenewal',
    'Auto renewal',
    'BOOLEAN',
    'Yes',
    optional,
  ),
  placeholder(
    'contract.initialTerm',
    'Initial term',
    'TEXT',
    '12 months',
    optional,
  ),
  placeholder(
    'contract.renewalTerm',
    'Renewal term',
    'TEXT',
    '12 months',
    optional,
  ),
  placeholder(
    'contract.liabilityCap',
    'Limitation of liability',
    'TEXT',
    'Fees paid in the preceding 12 months',
    optional,
  ),
  placeholder(
    'contract.curePeriodDays',
    'Cure period days',
    'INTEGER',
    '30',
    optional,
  ),
  placeholder(
    'contract.dataRetentionDays',
    'Data retention days',
    'INTEGER',
    '90',
    optional,
  ),
  placeholder(
    'contract.dataExportPeriodDays',
    'Data export period days',
    'INTEGER',
    '30',
    optional,
  ),
  placeholder(
    'commercial.pricingModel',
    'Pricing model',
    'TEXT',
    'Per licensed user, per month',
    optional,
  ),
  placeholder(
    'commercial.basePlatformFee',
    'Base platform fee',
    'CURRENCY',
    '2500.00',
    { ...optional, formattingRule: 'currency' },
  ),
  placeholder(
    'commercial.pricePerUser',
    'Price per user',
    'CURRENCY',
    '18.00',
    {
      ...optional,
      formattingRule: 'currency',
    },
  ),
  placeholder(
    'commercial.licensedUsers',
    'Licensed users',
    'INTEGER',
    '150',
    optional,
  ),
  placeholder(
    'commercial.minimumUsers',
    'Minimum users',
    'INTEGER',
    '100',
    optional,
  ),
  placeholder('commercial.discount', 'Discount', 'TEXT', '10%', optional),
  placeholder(
    'commercial.implementationFee',
    'Implementation fee',
    'CURRENCY',
    '12000.00',
    { ...optional, formattingRule: 'currency' },
  ),
  placeholder(
    'commercial.dataMigrationFee',
    'Data migration fee',
    'CURRENCY',
    '4500.00',
    { ...optional, formattingRule: 'currency' },
  ),
  placeholder(
    'commercial.integrationFee',
    'Integration fee',
    'CURRENCY',
    '6000.00',
    { ...optional, formattingRule: 'currency' },
  ),
  placeholder(
    'commercial.totalRecurringAmount',
    'Total recurring amount',
    'CURRENCY',
    '5200.00',
    { ...optional, formattingRule: 'currency' },
  ),
  placeholder(
    'commercial.totalOneTimeAmount',
    'Total one-time amount',
    'CURRENCY',
    '22500.00',
    { ...optional, formattingRule: 'currency' },
  ),
  placeholder('commercial.taxAmount', 'Tax amount', 'CURRENCY', '780.00', {
    ...optional,
    formattingRule: 'currency',
  }),
  placeholder(
    'commercial.billingStartDate',
    'Billing start date',
    'DATE',
    '2026-09-01',
    { ...optional, formattingRule: 'locale-date' },
  ),
  placeholder(
    'commercial.billingStartTrigger',
    'Billing start trigger',
    'TEXT',
    'Tenant provisioning',
    optional,
  ),
  placeholder(
    'tenant.id',
    'Tenant ID',
    'LOOKUP',
    'a3f1c7e2-0000-4000-8000-000000000000',
    optional,
  ),
  placeholder(
    'tenant.url',
    'Tenant URL',
    'URL',
    'https://gulf-horizon.dijipeople.com',
    optional,
  ),
  placeholder('tenant.status', 'Tenant status', 'TEXT', 'ACTIVE', optional),
  placeholder(
    'tenant.environment',
    'Tenant environment',
    'TEXT',
    'Production',
    optional,
  ),
  placeholder(
    'tenant.country',
    'Tenant country',
    'TEXT',
    'Saudi Arabia',
    optional,
  ),
  placeholder(
    'tenant.timeZone',
    'Tenant time zone',
    'TEXT',
    'Asia/Riyadh',
    optional,
  ),
  placeholder('tenant.language', 'Tenant language', 'TEXT', 'en', optional),
  placeholder(
    'tenant.currency',
    'Tenant currency',
    'CURRENCY_CODE',
    'SAR',
    optional,
  ),
  placeholder('tenant.planName', 'Tenant plan', 'TEXT', 'Growth', optional),
  placeholder(
    'tenant.admin.name',
    'Tenant administrator',
    'TEXT',
    'Amal Hassan',
    optional,
  ),
  placeholder(
    'tenant.admin.email',
    'Tenant administrator email',
    'EMAIL',
    'amal@gulfhorizon.example',
    optional,
  ),
  placeholder(
    'tenant.admin.phone',
    'Tenant administrator phone',
    'PHONE',
    '+966 50 000 0000',
    optional,
  ),
  placeholder(
    'tenant.modules',
    'Enabled modules',
    'REPEATING_COLLECTION',
    '["Employees","Attendance","Payroll"]',
    optional,
  ),
  placeholder(
    'tenant.storageLimit',
    'Storage limit',
    'TEXT',
    '250 GB',
    optional,
  ),
  placeholder(
    'tenant.apiLimit',
    'API limit',
    'TEXT',
    '100000 calls / month',
    optional,
  ),
  placeholder(
    'tenant.provisionedAt',
    'Tenant provisioned at',
    'DATE_TIME',
    '2026-08-01T10:00:00+03:00',
    optional,
  ),
  placeholder(
    'tenant.activatedAt',
    'Tenant activated at',
    'DATE_TIME',
    '2026-08-05T10:00:00+03:00',
    optional,
  ),
  placeholder(
    'implementation.dataMigrationRequired',
    'Data migration required',
    'BOOLEAN',
    'Yes',
    optional,
  ),
  placeholder(
    'implementation.sourceSystem',
    'Migration source system',
    'TEXT',
    'Legacy HR system',
    optional,
  ),
  placeholder(
    'implementation.estimatedRecords',
    'Estimated migration records',
    'INTEGER',
    '5000',
    optional,
  ),
  placeholder(
    'implementation.migrationMethod',
    'Migration method',
    'TEXT',
    'Template-based import',
    optional,
  ),
  placeholder(
    'implementation.scope',
    'Implementation scope',
    'LONG_TEXT',
    'Configuration, data migration, and administrator training.',
    optional,
  ),
  placeholder(
    'implementation.targetGoLiveDate',
    'Target go-live date',
    'DATE',
    '2026-10-01',
    { ...optional, formattingRule: 'locale-date' },
  ),
  placeholder(
    'integration.items',
    'Integrations',
    'REPEATING_COLLECTION',
    '[{"name":"Payroll bank file","type":"Export","status":"In scope"}]',
    optional,
  ),
  placeholder('sla.supportTier', 'Support tier', 'TEXT', 'Standard', optional),
  placeholder(
    'sla.supportHours',
    'Support hours',
    'TEXT',
    'Sunday to Thursday, 09:00-18:00 AST',
    optional,
  ),
  placeholder(
    'sla.supportChannels',
    'Support channels',
    'TEXT',
    'Email and in-app support portal',
    optional,
  ),
  placeholder('sla.uptimeTarget', 'Uptime target', 'PERCENTAGE', '99.5', {
    ...optional,
    formattingRule: '0.##%',
  }),
  placeholder(
    'sla.backupFrequency',
    'Backup frequency',
    'TEXT',
    'Daily',
    optional,
  ),
  placeholder(
    'sla.backupRetention',
    'Backup retention',
    'TEXT',
    '30 days',
    optional,
  ),
  placeholder(
    'sla.rpo',
    'Recovery point objective',
    'TEXT',
    '24 hours',
    optional,
  ),
  placeholder(
    'sla.rto',
    'Recovery time objective',
    'TEXT',
    '8 hours',
    optional,
  ),
  placeholder(
    'hosting.applicationProvider',
    'Application hosting provider',
    'TEXT',
    'Render',
    optional,
  ),
  placeholder(
    'hosting.databaseProvider',
    'Database hosting provider',
    'TEXT',
    'Render PostgreSQL',
    optional,
  ),
  placeholder(
    'hosting.emailProvider',
    'Email provider',
    'TEXT',
    'SMTP relay',
    optional,
  ),
  placeholder(
    'hosting.applicationRegion',
    'Application region',
    'TEXT',
    'Frankfurt, Germany',
    optional,
  ),
  placeholder(
    'hosting.databaseRegion',
    'Database region',
    'TEXT',
    'Frankfurt, Germany',
    optional,
  ),
  placeholder(
    'serviceOrder.masterAgreementNumber',
    'Master agreement number',
    'LOOKUP',
    'CON-20260730-A13F',
    optional,
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
  placeholder(
    'signature.party.primary.name',
    'Primary party signature',
    'SIGNATURE',
    'Signed electronically',
    { required: false },
  ),
  placeholder(
    'signature.party.primary.date',
    'Primary party signed date',
    'DATE_TIME',
    '2026-08-01T14:35:00+03:00',
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
    private readonly auditService: AuditService,
  ) {}

  /**
   * ADR-0020. `contractType` narrows the registry to what that type's
   * context can ever hold; `contractId` narrows it further to what this
   * specific agreement actually links. Neither is required — an omitted
   * `contractType` returns the full registry, unchanged from before this
   * ADR, for any caller that still wants to browse every placeholder.
   */
  async listPlaceholderDefinitions(
    user: AuthenticatedUser,
    contractType?: ContractType,
    contractId?: string,
  ) {
    this.assertPlatform(user);
    const linked = contractId
      ? await this.prisma.contract.findUnique({
          where: { id: contractId },
          select: {
            partnerId: true,
            relatedLeadId: true,
            customerAccountId: true,
            customerOnboardingId: true,
            tenantId: true,
          },
        })
      : null;
    const allowedEntities = !contractType
      ? null
      : linked
        ? contractInstanceContextEntities(contractType, linked)
        : contractAllowedSourceEntities(contractType);
    const items = (
      allowedEntities
        ? CONTRACT_PLACEHOLDER_REGISTRY.filter((item) =>
            allowedEntities.has(item.sourceEntity),
          )
        : CONTRACT_PLACEHOLDER_REGISTRY
    ).map((item) => ({
      ...item,
      group: placeholderGroup(item.key),
      /*
       * The example **as the document will render it**, produced by the same
       * function that renders the real thing.
       *
       * The template editor previously previewed sample data by substituting
       * `exampleValue` as a raw string, which is why its preview showed
       * `["Employees","Attendance","Payroll"]` and `99.5` where the signed
       * document shows a bulleted list and `99.5%`. A preview that disagrees
       * with the document is worse than no preview: it is checked, believed,
       * and wrong.
       *
       * HTML, not text — collections render as a list or a table.
       */
      exampleHtml: renderContractPlaceholders(`{{${item.key}}}`, {
        [item.key]: item.exampleValue,
        'contract.currency': 'SAR',
      }),
    }));
    return { items, groups: PLACEHOLDER_GROUP_ORDER };
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
            select: { status: true, expiresAt: true },
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
          /*
           * Discovery D3 scenario 16 / `applyPassiveSignatureExpiry`. The list
           * is a read that must not itself write (25-100 rows per page), so
           * it only *displays* the truth here — a computed projection, not a
           * transition. Opening the record (`getSignatureRequest`) performs
           * and persists the actual transition.
           */
          signatureStatus: displaySignatureStatus(item.signatureRequests[0]),
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

  async create(
    user: AuthenticatedUser,
    dto: CreateContractDto,
    options: { skipDuplicateGuard?: boolean } = {},
  ) {
    this.assertWrite(user);
    this.validateCounterparty(dto);
    await this.assertLinkedEntitiesUsable({
      partnerId: dto.partnerId,
      relatedLeadId: dto.relatedLeadId,
      customerAccountId: dto.customerAccountId,
    });
    if (!options.skipDuplicateGuard) {
      const duplicate = await findDuplicateAgreement(this.prisma, {
        contractType: dto.contractType,
        partnerId: dto.partnerId,
        customerAccountId: dto.customerAccountId,
        relatedLeadId: dto.relatedLeadId,
        customerOnboardingId: dto.customerOnboardingId,
        tenantId: dto.tenantId,
      });
      if (duplicate) throw duplicateAgreementError(duplicate);
    }
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
    const [reportingCurrency, companyProfile, agreementTerms, linkedPartner] =
      await Promise.all([
        this.reportingCurrency(),
        this.companyProfile(),
        this.agreementTermValues(),
        this.linkedPartner(dto.partnerId, dto.commissionPercentage),
      ]);
    const partnerValues = linkedPartner.values;
    const contractNumber = reference('CON');
    const values = compactStringRecord({
      ...agreementTerms,
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
      ...definedValues({
        'platform.registrationNumber': companyProfile.registrationNumber,
        'platform.taxId': companyProfile.taxNumber,
        'platform.contact.email': companyProfile.supportEmail,
        'contract.autoRenewal':
          dto.autoRenewal === undefined
            ? undefined
            : dto.autoRenewal
              ? 'Yes'
              : 'No',
      }),
      'contract.number': contractNumber,
      'contract.title': dto.title.trim(),
      'contract.effectiveDate': dto.effectiveDate,
      'contract.expiryDate': dto.expiryDate,
      'contract.currency': dto.currencyCode?.toUpperCase() ?? reportingCurrency,
      'contract.value': dto.contractValue,
      'contract.commissionPercentage': dto.commissionPercentage,
      'contract.paymentTerms': dto.paymentTerms,
      'contract.governingLaw': dto.governingLaw,
      'contract.jurisdiction': dto.jurisdiction,
      'contract.renewalNoticeDays': dto.renewalNoticeDays,
      'contract.terminationNoticeDays': dto.terminationNoticeDays,
      'counterparty.name': dto.counterpartyName.trim(),
      'counterparty.email': dto.counterpartyEmail?.trim().toLowerCase(),
      // Explicit values (a source, or the caller) still win over the record.
      ...partnerValues,
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
          allowChangeRequests: dto.allowChangeRequests ?? true,
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
              isSignatory: false,
              signatureRequired: false,
              signingOrder: 1,
            },
            {
              partyType: dto.partnerId
                ? linkedPartner.contractPartyType
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
              isSignatory: true,
              signatureRequired: true,
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
          isSignatory:
            party.signatureRequired === true || (party.isSignatory ?? false),
          signatureRequired:
            party.signatureRequired ?? party.isSignatory ?? false,
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
    const contractType = dto.contractType ?? source.defaultContractType;
    const masterAgreement = await this.assertTenantServiceOrderEligible(
      contractType,
      dto.lifecycleGatePurpose,
      source,
    );
    await this.assertSourceCanFillTemplate(dto.templateId, source);
    return this.create(user, {
      title: dto.title ?? `${source.counterpartyName} services agreement`,
      contractType,
      counterpartyName: source.counterpartyName,
      counterpartyEmail: source.counterpartyEmail,
      templateId: dto.templateId,
      partnerId: source.partnerId,
      customerAccountId: source.customerAccountId,
      customerOnboardingId: source.customerOnboardingId,
      tenantId: source.tenantId,
      relatedLeadId: source.relatedLeadId,
      counterpartyType: source.counterpartyType,
      currencyCode: source.currencyCode,
      contractValue: source.contractValue,
      // An explicit request wins; otherwise the source's own agreed terms do.
      effectiveDate: dto.effectiveDate ?? source.effectiveDate,
      expiryDate: dto.expiryDate,
      paymentTerms: source.paymentTerms,
      lifecycleGatePurpose: dto.lifecycleGatePurpose,
      placeholderValues: compactStringRecord({
        ...source.placeholderValues,
        ...(masterAgreement
          ? {
              'serviceOrder.masterAgreementNumber':
                masterAgreement.contractNumber,
            }
          : {}),
      }),
    });
  }

  /**
   * Refuse a template the chosen source cannot fill.
   *
   * BUG-1541. A "Tenant Provisioning & Service Order" was created from a
   * **customer**. `customerSource()` emits the `customer.*` namespace and
   * nothing else — it sets `tenantId: undefined` explicitly — so of the
   * template's 39 placeholders, 8 resolved and 31 did not: every `tenant.*`,
   * every `implementation.*`, every `hosting.*`, both `commercial.*`. The
   * document rendered raw `{{handlebars}}` where a counterparty would read
   * their own workspace address, and nothing said why.
   *
   * The renderer was never at fault. It keeps an unresolved token so the
   * signature gate can refuse the document, which is correct. What was missing
   * is anyone refusing the *pairing* — a source that cannot populate a
   * template's required fields is the wrong source for it, and that is knowable
   * before a single byte is generated.
   *
   * Only `required` placeholders are considered. Optional terms a platform does
   * not hold are meant to be filled in later or resolve to nothing; failing on
   * those would break the progressive completion the document-fields editor
   * exists for.
   */
  private async assertSourceCanFillTemplate(
    templateId: string | undefined,
    source: ResolvedContractSource,
  ) {
    if (!templateId) return;

    const templateVersion = await this.prisma.contractTemplateVersion.findFirst(
      {
        where: { templateId, isPublished: true },
        orderBy: { version: 'desc' },
        select: { contentHtml: true },
      },
    );

    // An unpublished template is already refused by `create`, with its own
    // message. Saying it twice differently would be worse than saying it once.
    if (!templateVersion?.contentHtml) return;

    const values = applyDeprecatedPlaceholderAliases(
      compactStringRecord(source.placeholderValues),
    );

    /*
     * Namespaces the source is not responsible for, and which are therefore not
     * evidence of a wrong pairing:
     *
     *   contract.*      the create step fills from the DTO — number, title, dates
     *   platform.*      the platform's own company profile
     *   counterparty.*  derived from the source's counterparty name and e-mail
     *   sla.*           platform service defaults, identical for every source
     *   signature.*     filled at signing, necessarily empty before it
     *
     * Checking against them refuses every creation, valid or not — which the
     * first version of this did, and which the accompanying spec caught before
     * it reached anyone.
     *
     * This is `ALWAYS_AVAILABLE_SOURCE_ENTITIES` (`placeholder-context.ts`,
     * ADR-0020) — the same five namespaces, imported rather than kept as a
     * second literal copy of this list.
     */
    const filledAfterSource: readonly string[] =
      ALWAYS_AVAILABLE_SOURCE_ENTITIES;

    const unfillable = extractContractPlaceholders(templateVersion.contentHtml)
      .filter((definition) => definition.required)
      .filter(
        (definition) => !filledAfterSource.includes(definition.sourceEntity),
      )
      .filter((definition) => !values[definition.key]?.trim())
      .map((definition) => definition.key);

    if (!unfillable.length) return;

    const namespaces = [
      ...new Set(unfillable.map((key) => key.split('.')[0])),
    ].sort();

    throw new BadRequestException({
      code: 'CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE',
      message:
        `This template needs details a ${source.counterpartyType.toLowerCase()} ` +
        `does not carry (${namespaces.join(', ')}), so the document would be ` +
        `generated with those fields blank. Create it from a source that has ` +
        `them — a provisioned tenant or an onboarding — or choose a template ` +
        `written for this source.`,
      details: { unfillable, namespaces },
    });
  }

  /*
   * A tenant provisioning service order is issued against a customer that has
   * already signed the agreement governing it. A raw lead has no customer to
   * provision for, and an unsigned customer has nothing to provision under, so
   * both are refused here rather than at the point the document is sent.
   * Returns the governing agreement so its number can fill the service order.
   */
  private async assertTenantServiceOrderEligible(
    contractType: ContractType,
    lifecycleGatePurpose: string | undefined,
    source: ResolvedContractSource,
  ) {
    const isServiceOrder =
      lifecycleGatePurpose === TENANT_PROVISIONING_GATE ||
      (contractType === ContractType.SERVICE_AGREEMENT &&
        Boolean(source.tenantId ?? source.customerOnboardingId));
    if (!isServiceOrder) return null;

    if (!source.customerAccountId)
      throw new BadRequestException(
        'A tenant provisioning service order requires a converted customer. Convert the lead first.',
      );

    const governing = await this.prisma.contract.findFirst({
      where: executedGoverningAgreementWhere(
        customerAgreementScope(source.customerAccountId),
      ),
      select: { id: true, contractNumber: true },
      orderBy: { signedAt: 'desc' },
    });
    if (!governing)
      throw new BadRequestException(TENANT_ORDER_AGREEMENT_REQUIRED_MESSAGE);
    return governing;
  }

  async copy(user: AuthenticatedUser, dto: CopyContractDto) {
    this.assertWrite(user);
    const source = await this.prisma.contract.findUnique({
      where: { id: dto.sourceContractId },
      include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
    });
    if (!source || !source.versions[0])
      throw new NotFoundException('Source contract was not found.');
    return this.create(
      user,
      {
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
        // An explicit, deliberate duplication path (discovery D3 scenario 27)
        // — it is expected to share every link with its source.
      },
      { skipDuplicateGuard: true },
    );
  }

  async createFromUpload(
    user: AuthenticatedUser,
    dto: CreateUploadedContractDto,
    file?: ContractUploadFile,
  ) {
    this.assertWrite(user);
    if (!file)
      throw new BadRequestException('A contract document file is required.');
    assertSupportedContractDocument(file);
    const { html: contentHtml } = await convertContractDocumentToHtml(file);
    const created = await this.create(user, { ...dto, contentHtml });
    const version = created.versions[0];
    const saved = await this.storage.saveFile({
      buffer: file.buffer,
      originalFileName: file.originalname,
      contentType: file.mimetype,
      scope: this.contractStorageScope(created.tenantId),
      domain: 'contracts',
      segments: [created.id],
    });
    await this.prisma.$transaction([
      this.prisma.contractVersion.update({
        where: { id: version.id },
        data: {
          sourceFileName: file.originalname,
          sourceMimeType: file.mimetype,
          sourceStorageKey: saved.storageKey,
          sourceStorageProvider: saved.storageProvider,
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
          storageProvider: saved.storageProvider,
          // User-uploaded content; no scanner is wired yet (see storage
          // migration contract) so this records that honestly rather than
          // implying a scan that never ran.
          scanStatus: 'SCAN_NOT_CONFIGURED',
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
    await this.auditContract(
      created.id,
      'SOURCE_DOCUMENT_UPLOADED',
      user.userId,
      { fileName: file.originalname, mimeType: file.mimetype },
    );
    return this.get(user, created.id);
  }

  async importDocument(user: AuthenticatedUser, file?: ContractUploadFile) {
    this.assertWrite(user);
    if (!file) throw new BadRequestException('A document file is required.');
    assertSupportedContractDocument(file);
    const converted = await convertContractDocumentToHtml(file);
    return {
      fileName: file.originalname,
      mimeType: file.mimetype,
      html: converted.html,
      warnings: converted.warnings,
    };
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
    /*
     * Immutability is decided by assertAgreementEditable and nowhere else.
     *
     * This used to carry its own inline copy of the blocked-status list, and it
     * had drifted: SENT, VIEWED, FULLY_EXECUTED, SUPERSEDED and TERMINATED were
     * missing. That left a fully executed agreement freely editable through
     * PATCH — including relatedLeadId and customerAccountId. Because the lead
     * conversion gate (assertGoverningAgreementExecuted) matches contracts by
     * those very columns, one PATCH could re-point a signed agreement at a
     * different lead and convert it to a customer that never had an agreement.
     * Two lists expressing one invariant is what allowed that, so there is now
     * one list.
     */
    this.assertAgreementEditable(existing.status);
    if (dto.status !== undefined && dto.status !== existing.status)
      throw new BadRequestException(
        'Contract status changes must use the governed process, approval, signature, activation, or termination action.',
      );
    /*
     * BUG-3553. Only re-validated when a link is actually changing — an
     * unrelated field edit (payment terms, notes) on a long-running
     * agreement must not start failing because its partner was terminated
     * afterwards. Re-validation uses the *resulting* set (new value where
     * given, existing value otherwise) so a change to one link is still
     * checked for consistency against the other.
     */
    if (
      dto.partnerId !== undefined ||
      dto.relatedLeadId !== undefined ||
      dto.customerAccountId !== undefined
    )
      await this.assertLinkedEntitiesUsable({
        partnerId:
          dto.partnerId !== undefined ? dto.partnerId : existing.partnerId,
        relatedLeadId:
          dto.relatedLeadId !== undefined
            ? dto.relatedLeadId
            : existing.relatedLeadId,
        customerAccountId:
          dto.customerAccountId !== undefined
            ? dto.customerAccountId
            : existing.customerAccountId,
      });
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
        ...(dto.allowChangeRequests !== undefined
          ? { allowChangeRequests: dto.allowChangeRequests }
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
    await this.syncDerivedPlaceholderValues(id, user.userId);
    await this.timeline(
      id,
      user,
      'CONTRACT_UPDATED',
      'Contract details were updated.',
      dto as unknown as Record<string, unknown>,
    );
    return this.get(user, id);
  }

  /*
   * Placeholder values were only written when the contract was created, so
   * editing a term afterwards left the document snapshot stale: the field said
   * "Net 30" while {{contract.paymentTerms}} was still empty and the approval
   * gate kept reporting it as missing. The columns are the source of truth for
   * contract.* and are always re-derived here. Platform values only fill a gap,
   * so a per-contract override entered by hand survives.
   */
  private async syncDerivedPlaceholderValues(
    contractId: string,
    actorId: string,
  ) {
    const contract = await this.prisma.contract.findUnique({
      where: { id: contractId },
      select: {
        contractNumber: true,
        title: true,
        effectiveDate: true,
        expiryDate: true,
        currencyCode: true,
        contractValue: true,
        commissionPercentage: true,
        paymentTerms: true,
        governingLaw: true,
        jurisdiction: true,
        renewalNoticeDays: true,
        terminationNoticeDays: true,
        autoRenewal: true,
        counterpartyName: true,
        counterpartyEmail: true,
        partnerId: true,
      },
    });
    if (!contract) return;

    const [
      reportingCurrency,
      companyProfile,
      agreementTerms,
      existing,
      partnerValues,
    ] = await Promise.all([
      this.reportingCurrency(),
      this.companyProfile(),
      this.agreementTermValues(),
      this.prisma.contractPlaceholderValue.findMany({
        where: { contractId },
        select: { key: true, value: true, source: true },
      }),
      this.linkedPartnerValues(
        contract.partnerId,
        contract.commissionPercentage,
      ),
    ]);
    const current = new Map(existing.map((row) => [row.key, row.value]));
    const currentSource = new Map(existing.map((row) => [row.key, row.source]));

    const authoritative = definedValues({
      'contract.number': contract.contractNumber,
      'contract.title': contract.title,
      'contract.effectiveDate': contract.effectiveDate
        ?.toISOString()
        .slice(0, 10),
      'contract.expiryDate': contract.expiryDate?.toISOString().slice(0, 10),
      'contract.currency': contract.currencyCode,
      'contract.value': contract.contractValue?.toString(),
      'contract.commissionPercentage':
        contract.commissionPercentage?.toString(),
      'contract.paymentTerms': contract.paymentTerms,
      'contract.governingLaw': contract.governingLaw,
      'contract.jurisdiction': contract.jurisdiction,
      'contract.renewalNoticeDays': contract.renewalNoticeDays,
      'contract.terminationNoticeDays': contract.terminationNoticeDays,
      'contract.autoRenewal': contract.autoRenewal ? 'Yes' : 'No',
      'counterparty.name': contract.counterpartyName,
      'counterparty.email': contract.counterpartyEmail,
    });
    const gapFilling = definedValues({
      ...agreementTerms,
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
      'platform.registrationNumber': companyProfile.registrationNumber,
      'platform.taxId': companyProfile.taxNumber,
      'platform.contact.email': companyProfile.supportEmail,
    });

    /*
     * The linked partner is the source of `partner.*` the way the columns are
     * of `contract.*`, so a partner renamed while the agreement is a draft is
     * picked up on the next edit — except where an operator typed a value in
     * the document fields, which survives.
     */
    const linkedEntity = Object.fromEntries(
      Object.entries(partnerValues).filter(
        ([key]) => currentSource.get(key) !== 'manual',
      ),
    );
    const next = {
      ...Object.fromEntries(
        Object.entries(gapFilling).filter(([key]) => !current.get(key)?.trim()),
      ),
      ...linkedEntity,
      ...authoritative,
    };
    const changed = Object.entries(next).filter(
      ([key, value]) => current.get(key) !== value,
    );
    if (!changed.length) return;

    await this.prisma.$transaction(
      changed.map(([key, value]) =>
        this.prisma.contractPlaceholderValue.upsert({
          where: { contractId_key: { contractId, key } },
          create: {
            contractId,
            key,
            value,
            source: 'derived',
            updatedById: actorId,
          },
          update: { value, source: 'derived', updatedById: actorId },
        }),
      ),
    );
  }

  /*
   * Everything the current document references, with the value it currently
   * resolves to and where that value came from. This is what lets an operator
   * see that {{platform.authorizedSigner.title}} is empty and fill it, instead
   * of only being told at approval that it is required.
   */
  async documentFields(user: AuthenticatedUser, contractId: string) {
    this.assertPlatform(user);
    const contract = await this.get(user, contractId);
    const version = contract.versions.find(
      (item) => item.version === contract.currentVersionNumber,
    );
    /*
     * A stored `signature.*` value counts only when signing wrote it (QA
     * agreements DEFECT-2): one typed in before that fix is not a signature.
     */
    const storedValues = contract.placeholderValues.filter(
      (item) =>
        !isSignaturePlaceholderKey(item.key) || item.source === 'signature',
    );
    const values = Object.fromEntries(
      storedValues.map((item) => [item.key, item.value]),
    );
    const sources = new Map(
      storedValues.map((item) => [item.key, item.source]),
    );
    const definitions = version
      ? extractContractPlaceholders(version.contentHtml)
      : [];
    const resolved = applyDeprecatedPlaceholderAliases(values);
    return {
      items: definitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        dataType: definition.dataType,
        required: definition.required,
        group: placeholderGroup(definition.key),
        exampleValue: definition.exampleValue,
        source: sources.get(definition.key) ?? null,
        /*
         * The signature namespace — marks, names and dates — is produced by
         * signing, never typed in here, and a derived value is owned by the
         * contract field it mirrors.
         */
        editable:
          !isSignaturePlaceholderKey(definition.key) &&
          sources.get(definition.key) !== 'derived',
        value: resolved[definition.key] ?? '',
      })),
      previewHtml: version
        ? renderContractVersionHtml(
            omitPlatformSignatureLines(
              version.contentHtml,
              platformSignsContract(contract.parties),
            ),
            [
              ...definitions
                .filter((definition) => !(definition.key in resolved))
                .map((definition) => ({
                  key: definition.key,
                  value: definition.exampleValue,
                  source: 'example',
                })),
              ...storedValues,
            ],
            'display',
          )
        : '',
      resolvedHtml: version
        ? renderContractVersionHtml(
            omitPlatformSignatureLines(
              version.contentHtml,
              platformSignsContract(contract.parties),
            ),
            contract.placeholderValues,
            'display',
          )
        : '',
    };
  }

  async saveDocumentFields(
    user: AuthenticatedUser,
    contractId: string,
    values: Record<string, string>,
  ) {
    this.assertWrite(user);
    /*
     * QA agreements DEFECT-2. A signature date typed in here was frozen into
     * the executed version beside the real signing timestamp. The whole
     * `signature.*` namespace comes from signing; refuse it loudly rather
     * than dropping it silently, so a client learns why its value vanished.
     */
    const signatureKeys = Object.keys(values).filter(isSignaturePlaceholderKey);
    if (signatureKeys.length)
      throw new BadRequestException({
        code: 'CONTRACT_SIGNATURE_FIELD_NOT_EDITABLE',
        message: `Signature fields are filled when each party signs and cannot be entered by hand: ${signatureKeys.join(', ')}.`,
        details: { keys: signatureKeys },
      });
    const contract = await this.get(user, contractId);
    const version = contract.versions.find(
      (item) => item.version === contract.currentVersionNumber,
    );
    if (!version)
      throw new BadRequestException('Create a contract version first.');
    const definitions = extractContractPlaceholders(version.contentHtml);
    const allowed = new Map(
      definitions
        .filter((definition) => !isSignaturePlaceholderKey(definition.key))
        .map((definition) => [definition.key, definition]),
    );
    const entries = Object.entries(values).filter(([key]) => allowed.has(key));
    if (!entries.length)
      throw new BadRequestException(
        'No editable document fields were supplied.',
      );
    assertValidContractPlaceholderValues(
      entries.map(([key]) => allowed.get(key)!),
      Object.fromEntries(entries),
    );
    await this.prisma.$transaction(
      entries.map(([key, value]) =>
        this.prisma.contractPlaceholderValue.upsert({
          where: { contractId_key: { contractId, key } },
          create: {
            contractId,
            key,
            value,
            source: 'manual',
            updatedById: user.userId,
          },
          update: { value, source: 'manual', updatedById: user.userId },
        }),
      ),
    );
    await this.timeline(
      contractId,
      user,
      'DOCUMENT_FIELDS_UPDATED',
      `${entries.length} document field(s) were updated.`,
      { keys: entries.map(([key]) => key) },
    );
    return this.documentFields(user, contractId);
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
      ).map((item) => ({
        ...normalizeContractTemplate(item),
        contextIssues: this.templateContextIssues(item),
      })),
    };
  }

  async getTemplate(user: AuthenticatedUser, id: string) {
    this.assertPlatform(user);
    const item = await this.prisma.contractTemplate.findUnique({
      where: { id },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!item) throw new NotFoundException('Contract template was not found.');
    return {
      ...normalizeContractTemplate(item),
      contextIssues: this.templateContextIssues(item),
    };
  }

  /**
   * ADR-0020 consequence: "existing templates that reference out-of-context
   * placeholders are reported by a validation pass rather than silently
   * broken". Read-only — it never mutates a template, only surfaces what a
   * future save of it will now refuse. Checked against the current
   * *published* version, since that is the one a live agreement can still be
   * created from; an unpublished draft is caught at its own publish instead.
   */
  private templateContextIssues(template: {
    contractType: ContractType;
    versions: { isPublished: boolean; contentHtml: string }[];
  }) {
    const published = template.versions.find((version) => version.isPublished);
    if (!published) return [];
    return outOfContextPlaceholders(
      extractContractPlaceholders(published.contentHtml),
      template.contractType,
    ).map((definition) => definition.key);
  }

  /**
   * ADR-0020 point 3. Refuses saving a template version that references a
   * placeholder its contract type's context can never hold — naming each
   * offending token and why, rather than letting the document ship with a
   * field that can never resolve for any agreement of this type.
   */
  private assertTemplatePlaceholdersInContext(
    contractType: ContractType,
    contentHtml: string,
  ) {
    const outOfContext = outOfContextPlaceholders(
      extractContractPlaceholders(contentHtml),
      contractType,
    );
    if (!outOfContext.length) return;
    throw new BadRequestException({
      code: 'CONTRACT_TEMPLATE_PLACEHOLDER_OUT_OF_CONTEXT',
      message:
        `This ${contractType.replaceAll('_', ' ').toLowerCase()} template references ` +
        `placeholders outside its context: ${outOfContext
          .map((definition) => `${definition.label} (${definition.key})`)
          .join(', ')}.`,
      details: { keys: outOfContext.map((definition) => definition.key) },
    });
  }

  async createTemplate(
    user: AuthenticatedUser,
    dto: CreateContractTemplateDto,
  ) {
    this.assertWrite(user);
    const contentHtml = cleanContractHtml(dto.contentHtml);
    this.assertTemplatePlaceholdersInContext(dto.contractType, contentHtml);
    const created = await this.prisma.contractTemplate.create({
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
            changeSummary: dto.changeSummary?.trim() || 'Initial version',
            isPublished: dto.publish ?? false,
            publishedAt: dto.publish ? new Date() : null,
            createdById: user.userId,
          },
        },
      },
      include: { versions: true },
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'CONTRACT_TEMPLATE_CREATED',
      entityType: 'ContractTemplate',
      entityId: created.id,
      afterSnapshot: { key: created.key, contractType: created.contractType },
    });
    return created;
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
    this.assertTemplatePlaceholdersInContext(
      template.contractType,
      contentHtml,
    );
    const version = await this.prisma.$transaction(async (tx) => {
      if (dto.publish) {
        await tx.contractTemplateVersion.updateMany({
          where: { templateId, isPublished: true },
          data: { isPublished: false, publishedAt: null },
        });
      }
      const created = await tx.contractTemplateVersion.create({
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
          changeSummary: dto.changeSummary?.trim() || null,
          isPublished: dto.publish ?? false,
          publishedAt: dto.publish ? new Date() : null,
          createdById: user.userId,
        },
      });
      await tx.contractTemplate.update({
        where: { id: templateId },
        data: {
          lifecycleGatePurpose:
            dto.lifecycleGatePurpose ?? template.lifecycleGatePurpose,
          updatedById: user.userId,
        },
      });
      return created;
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'CONTRACT_TEMPLATE_VERSION_CREATED',
      entityType: 'ContractTemplate',
      entityId: templateId,
      afterSnapshot: {
        version: version.version,
        isPublished: version.isPublished,
      },
    });
    return version;
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
    const cloned = await this.prisma.contractTemplate.create({
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
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'CONTRACT_TEMPLATE_CLONED',
      entityType: 'ContractTemplate',
      entityId: cloned.id,
      afterSnapshot: { sourceTemplateId: templateId, key: cloned.key },
    });
    return cloned;
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
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'CONTRACT_TEMPLATE_STATE_CHANGED',
      entityType: 'ContractTemplate',
      entityId: templateId,
      afterSnapshot: { state },
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
    const approvalDefinitions = extractContractPlaceholders(
      currentVersion.contentHtml,
    );
    this.assertPlaceholdersInContext(contract, approvalDefinitions);
    assertValidContractPlaceholderValues(
      approvalDefinitions,
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
      await this.auditContract(
        contractId,
        'APPROVAL_NOT_REQUIRED',
        user.userId,
        undefined,
      );
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
    await this.auditContract(contractId, 'STAGE_CHANGED', user.userId, {
      previousStage: contract.status,
      nextStage: next,
      direction,
      reason: reason ?? null,
    });
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
        isSignatory:
          dto.signatureRequired === true || (dto.isSignatory ?? false),
        signatureRequired: dto.signatureRequired ?? dto.isSignatory ?? false,
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

  async updateParty(
    user: AuthenticatedUser,
    contractId: string,
    partyId: string,
    dto: UpdateContractPartyDto,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    this.assertAgreementEditable(contract.status);
    if (!contract.parties.some((party) => party.id === partyId))
      throw new NotFoundException('Agreement party was not found.');
    await this.prisma.contractParty.update({
      where: { id: partyId },
      data: {
        ...(dto.partyType !== undefined ? { partyType: dto.partyType } : {}),
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.legalName !== undefined
          ? { legalName: dto.legalName.trim() || null }
          : {}),
        ...(dto.email !== undefined
          ? { email: dto.email.trim().toLowerCase() || null }
          : {}),
        ...(dto.phone !== undefined ? { phone: dto.phone.trim() || null } : {}),
        ...(dto.organizationId !== undefined
          ? { organizationId: dto.organizationId || null }
          : {}),
        ...(dto.isPrimary !== undefined ? { isPrimary: dto.isPrimary } : {}),
        ...(dto.isSignatory !== undefined
          ? {
              isSignatory: dto.isSignatory,
              ...(!dto.isSignatory ? { signatureRequired: false } : {}),
            }
          : {}),
        ...(dto.signatureRequired !== undefined
          ? {
              signatureRequired: dto.signatureRequired,
              ...(dto.signatureRequired ? { isSignatory: true } : {}),
            }
          : {}),
        ...(dto.signingOrder !== undefined
          ? { signingOrder: dto.signingOrder }
          : {}),
      },
    });
    await this.timeline(
      contractId,
      user,
      'PARTY_UPDATED',
      `${dto.name?.trim() || 'Agreement party'} was updated.`,
      { partyId },
    );
    return this.get(user, contractId);
  }

  async removeParty(
    user: AuthenticatedUser,
    contractId: string,
    partyId: string,
  ) {
    this.assertWrite(user);
    const contract = await this.get(user, contractId);
    this.assertAgreementEditable(contract.status);
    const party = contract.parties.find((item) => item.id === partyId);
    if (!party) throw new NotFoundException('Agreement party was not found.');
    await this.prisma.contractParty.delete({ where: { id: partyId } });
    await this.timeline(
      contractId,
      user,
      'PARTY_REMOVED',
      `${party.name} was removed from the agreement.`,
      { partyId },
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
    /*
     * QA agreements DEFECT-2. The signing snapshot never carries a
     * `signature.*` value: whatever is stored for one (a date typed in to get
     * past the old gate) would otherwise be frozen into the executed version
     * beside the real signing timestamp.
     */
    const placeholderSnapshot = Object.fromEntries(
      contract.placeholderValues
        .filter((item) => !isSignaturePlaceholderKey(item.key))
        .map((item) => [item.key, item.value]),
    );
    const placeholderDefinitions = extractContractPlaceholders(
      version.contentHtml,
    );
    this.assertPlaceholdersInContext(contract, placeholderDefinitions);
    assertValidContractPlaceholderValues(
      placeholderDefinitions,
      placeholderSnapshot,
      true,
    );
    /*
     * Owner decision (TASK-0032): a platform signature line appears only when a
     * DijiPeople signer is on the request being sent. Recipients are fixed at
     * send, so the frozen — and hashed — content never carries a line nobody
     * will sign.
     */
    const platformSigns = dto.recipients.some(
      (recipient) =>
        contract.parties.find((party) => party.id === recipient.partyId)
          ?.partyType === 'PLATFORM',
    );
    const resolvedHtml = renderContractVersionHtml(
      omitPlatformSignatureLines(version.contentHtml, platformSigns),
      contract.placeholderValues,
      'freeze',
    );
    /*
     * Exempt by namespace, not by data type: `signature.*.date` is DATE_TIME
     * and is filled from the signer's evidence like the mark itself.
     */
    const unresolvedNonSignature = extractContractPlaceholders(resolvedHtml)
      .filter((item) => !isSignaturePlaceholderKey(item.key))
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
    const configuredParties = new Map(
      contract.parties.map((party) => [party.id, party]),
    );
    const requiredPartyIds = contract.parties
      .filter((party) => party.isSignatory && party.signatureRequired)
      .map((party) => party.id);
    const submittedPartyIds = new Set(
      dto.recipients.map((item) => item.partyId).filter(Boolean),
    );
    const missingRequiredParties = requiredPartyIds.filter(
      (partyId) => !submittedPartyIds.has(partyId),
    );
    if (missingRequiredParties.length)
      throw new BadRequestException(
        'Every party marked as a required signatory must receive the signature request.',
      );
    for (const recipient of dto.recipients) {
      const party = recipient.partyId
        ? configuredParties.get(recipient.partyId)
        : undefined;
      if (recipient.partyId && !party)
        throw new BadRequestException(
          'Every signer party must belong to this agreement.',
        );
      if (party && !party.isSignatory)
        throw new BadRequestException(
          `${party.name} is not configured as a signatory for this agreement.`,
        );
    }
    const tokens = dto.recipients.map((recipient) => ({
      recipient: {
        ...recipient,
        isRequired: recipient.partyId
          ? (configuredParties.get(recipient.partyId)?.signatureRequired ??
            recipient.isRequired)
          : recipient.isRequired,
      },
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
          allowChangeRequests:
            dto.allowChangeRequests ?? contract.allowChangeRequests,
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
    const deliveries = await Promise.all(
      tokens.map(({ recipient, token }, recipientIndex) => {
        const url = buildPublicSiteUrl(`/sign/${token}`);
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
          templateVariables: {
            recipientName: recipient.name,
            contractTitle: contract.title,
            contractNumber: contract.contractNumber,
            message:
              dto.message ||
              `Please review and sign this agreement. The secure link expires in ${expiryDays} days.`,
            signingUrl: url,
            expiresAt: request.expiresAt?.toISOString() ?? '',
          },
          entityType: 'Contract',
          entityId: contractId,
          requestedById: user.userId,
          metadata: {
            requestId: request.id,
            recipientRole: recipient.role,
            recipientIndex,
            partyId: recipient.partyId ?? null,
          },
          idempotencyKey: `signature-request:${request.id}:recipient:${recipientIndex}`,
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
      emailDelivery: {
        total: deliveries.length,
        sent: deliveries.filter((delivery) => delivery.status === 'SENT')
          .length,
        failed: deliveries.filter((delivery) =>
          ['FAILED', 'REJECTED'].includes(delivery.status),
        ).length,
        recipients: deliveries.map((delivery) => ({
          recipient: delivery.recipient,
          status: delivery.status,
          errorMessage: delivery.errorMessage,
        })),
      },
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
      include: signatureRequestInclude,
    });
    if (!item) throw new NotFoundException('Signature request was not found.');
    return this.applyPassiveSignatureExpiry(item);
  }

  /**
   * Discovery D3, scenario 16. There is no scheduler anywhere in this
   * repository (`@Cron`/`@Interval` — grepped, no matches) to sweep elapsed
   * signature requests, and the *reactive* check that already exists
   * (`assertTokenUsable`) only fires when a signer opens their own link — an
   * admin who never revisits the record keeps seeing `SENT`/`VIEWED`
   * forever, past `expiresAt`. Rather than add a scheduler this repository
   * has no pattern for, the transition happens the first time anyone reads
   * the request after it has elapsed: durable and visible on the next read
   * by anyone, not merely projected for this one caller.
   */
  private async applyPassiveSignatureExpiry(
    item: Prisma.SignatureRequestGetPayload<{
      include: typeof signatureRequestInclude;
    }>,
  ) {
    const isOpenStatus = (
      ['SENT', 'VIEWED', 'PARTIALLY_SIGNED'] as SignatureRequestStatus[]
    ).includes(item.status);
    if (!isOpenStatus || !item.expiresAt || item.expiresAt >= new Date())
      return item;
    return this.prisma.$transaction(async (tx) => {
      await tx.signatureRecipient.updateMany({
        where: {
          signatureRequestId: item.id,
          status: {
            in: [
              SignatureRecipientStatus.PENDING,
              SignatureRecipientStatus.SENT,
              SignatureRecipientStatus.VIEWED,
            ],
          },
        },
        data: {
          status: SignatureRecipientStatus.EXPIRED,
          tokenExpiresAt: new Date(),
          tokenRevokedAt: new Date(),
        },
      });
      const updated = await tx.signatureRequest.update({
        where: { id: item.id },
        data: { status: SignatureRequestStatus.EXPIRED },
        include: signatureRequestInclude,
      });
      await tx.contractTimeline.create({
        data: {
          contractId: item.contractId,
          eventType: 'SIGNATURE_REQUEST_EXPIRED',
          actorType: 'SYSTEM',
          message: `Signature request ${item.requestNumber} expired without completion.`,
        },
      });
      await this.auditContract(
        item.contractId,
        'SIGNATURE_REQUEST_EXPIRED',
        null,
        { requestNumber: item.requestNumber },
        tx,
      );
      return updated;
    });
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
      await this.auditContract(
        request.contractId,
        'SIGNATURE_REQUEST_CANCELLED',
        user.userId,
        { requestNumber: request.requestNumber },
        tx,
      );
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
          url: buildPublicSiteUrl(`/sign/${token}`),
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
      await this.auditContract(
        request.contractId,
        'SIGNATURE_REQUEST_RESENT',
        user.userId,
        { requestNumber: request.requestNumber, recipientCount: links.length },
        tx,
      );
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
      allowRequestChanges: recipient.signatureRequest.allowChangeRequests,
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
    // The signer has no session of their own — this scope comes from the
    // contract the signature request belongs to, not from any caller-side
    // identity, which is what `findRecipient`'s `contract: true` include
    // exists to make possible.
    const scope = this.contractStorageScope(
      recipient.signatureRequest.contract.tenantId,
    );
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
    let signatureStorageProvider: string | undefined;
    let signatureBytes = Buffer.from(dto.typedName?.trim() ?? recipient.name);
    if (dto.signatureDataUrl) {
      signatureBytes = decodeSignatureDataUrl(dto.signatureDataUrl);
      const signatureContentType =
        signatureBytes[0] === 0x89 ? 'image/png' : 'image/jpeg';
      const savedSignature = await this.storage.saveFile({
        buffer: signatureBytes,
        originalFileName: `signature-${recipient.id}.${signatureContentType === 'image/png' ? 'png' : 'jpg'}`,
        contentType: signatureContentType,
        scope,
        domain: 'contracts',
        segments: [recipient.signatureRequest.contractId],
      });
      signatureStorageKey = savedSignature.storageKey;
      signatureStorageProvider = savedSignature.storageProvider;
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
          // BUG-3554. Only meaningful for a typed signature; a drawn or
          // uploaded one has no rendering style of its own. `dto.typedStyle`
          // is already restricted to `TYPED_SIGNATURE_STYLES` by the DTO.
          typedStyle: dto.method === 'TYPED' ? dto.typedStyle : undefined,
          signatureStorageKey,
          signatureStorageProvider,
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
      /*
       * The signature is recorded as a placeholder value so the agreement reads
       * as signed everywhere it is rendered, not only in the generated PDF.
       * The stored version HTML is never rewritten: evidence hashes anchor to
       * its content, so the signature is applied at render time instead.
       */
      for (const [key, value] of Object.entries(
        signaturePlaceholderValues(
          recipient.party?.partyType ?? null,
          dto.typedName?.trim() || recipient.name,
          dto.signatureDataUrl,
          signedAt,
        ),
      )) {
        await tx.contractPlaceholderValue.upsert({
          where: {
            contractId_key: {
              contractId: recipient.signatureRequest.contractId,
              key,
            },
          },
          create: {
            contractId: recipient.signatureRequest.contractId,
            key,
            value,
            source: 'signature',
          },
          update: { value, source: 'signature' },
        });
      }
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
      // BUG-3231 / public signing has no platform user — the actor is the
      // recipient who signed. `AuditService.log` accepts a null
      // `actorUserId` (it always has for the platform sentinel; see
      // `platformActorUserId: input.actorUserId ?? null`), so the row is
      // written with the signer's identity in the snapshot instead.
      await this.auditContract(
        recipient.signatureRequest.contractId,
        'DOCUMENT_SIGNED',
        null,
        {
          recipientId: recipient.id,
          signerName: recipient.name,
          signerEmail: recipient.email,
          signerRole: recipient.role,
          method: dto.method,
          finalSignature: isFinal,
        },
        tx,
      );
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
        contentType: 'application/json',
        scope,
        domain: 'contracts',
        segments: [recipient.signatureRequest.contractId],
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
          storageProvider: evidenceSaved.storageProvider,
          // Server-generated bundle, not user-uploaded content — leave
          // scanStatus null rather than claiming a scan that never applied.
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
      const requiredRecipients = [
        ...new Map(
          recipient.signatureRequest.recipients
            .filter((signer) => signer.isRequired)
            .map((signer) => [signer.email.toLowerCase(), signer]),
        ).values(),
      ];
      await Promise.all(
        requiredRecipients.map((signer) =>
          this.communications.sendEmail({
            eventCode: 'CONTRACT_FULLY_SIGNED',
            recipient: signer.email,
            subject: `${recipient.signatureRequest.contract.contractNumber} is fully signed`,
            html: emailPage(
              'Agreement completed',
              `${recipient.signatureRequest.contract.title} has been signed by all required parties. The signed record and evidence have been locked.`,
            ),
            text: `${recipient.signatureRequest.contract.contractNumber} is fully signed. The signed PDF is attached.`,
            attachments: [
              {
                filename: signed.document.fileName,
                content: signed.buffer,
                contentType: signed.document.mimeType,
              },
            ],
            templateVariables: {
              recipientName: signer.name,
              contractTitle: recipient.signatureRequest.contract.title,
              contractNumber:
                recipient.signatureRequest.contract.contractNumber,
              completedAt: signedAt.toISOString(),
            },
            entityType: 'Contract',
            entityId: recipient.signatureRequest.contractId,
            metadata: {
              requestId: recipient.signatureRequestId,
              attachmentDocumentId: signed.document.id,
            },
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
      await this.auditContract(
        recipient.signatureRequest.contractId,
        'SIGNATURE_DECLINED',
        null,
        {
          recipientId: recipient.id,
          signerName: recipient.name,
          signerEmail: recipient.email,
          reason: dto.reason,
        },
        tx,
      );
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
    if (!recipient.signatureRequest.allowChangeRequests)
      throw new BadRequestException(
        'Change requests are disabled for this agreement.',
      );
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
          message: `${recipient.name} requested document changes: ${dto.reason}`,
          metadata: { reason: dto.reason },
        },
      });
      await this.auditContract(
        recipient.signatureRequest.contractId,
        'SIGNATURE_CHANGES_REQUESTED',
        null,
        {
          recipientId: recipient.id,
          signerName: recipient.name,
          signerEmail: recipient.email,
          reason: dto.reason,
        },
        tx,
      );
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
      include: {
        versions: { orderBy: { version: 'desc' }, take: 1 },
        placeholderValues: { select: { key: true, value: true, source: true } },
        // Whether DijiPeople signs decides whether its signature line appears.
        parties: {
          select: {
            partyType: true,
            isSignatory: true,
            signatureRequired: true,
          },
        },
      },
    });
    if (!contract || !contract.versions[0])
      throw new NotFoundException('Contract document was not found.');
    const version = contract.versions[0];
    const scope = this.contractStorageScope(contract.tenantId);
    let documentHtml = version.contentHtml;
    let documentText = '';
    /*
     * An executed agreement renders from its frozen version and signature
     * evidence whether the copy is the one stored at completion or one an
     * operator generates again later. Rendering the later copy from the
     * agreement's placeholder values printed a typed signer's name, left a
     * drawn signer's blank and dropped every signature image. Only the copy
     * stored at completion is the immutable SIGNED_COPY.
     */
    const fromEvidence =
      immutable ||
      (await this.prisma.signatureRequest.findFirst({
        where: {
          contractVersionId: version.id,
          status: SignatureRequestStatus.COMPLETED,
        },
        select: { id: true },
      })) !== null;
    if (fromEvidence) {
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
            select: {
              name: true,
              email: true,
              role: true,
              signingOrder: true,
              party: {
                select: { partyType: true, name: true, isPrimary: true },
              },
            },
          },
        },
        orderBy: { eventSequence: 'asc' },
      });
      if (!evidenceRows.length)
        throw new BadRequestException(
          'A final signed document requires completed signature evidence.',
        );
      const signatureImages = new Map<string, string>();
      await Promise.all(
        evidenceRows.map(async (evidence) => {
          if (!evidence.signatureStorageKey) return;
          const bytes = await this.storage.readFileBuffer(
            evidence.signatureStorageKey,
            scope,
          );
          const mimeType = bytes[0] === 0x89 ? 'image/png' : 'image/jpeg';
          signatureImages.set(
            evidence.id,
            `data:${mimeType};base64,${bytes.toString('base64')}`,
          );
        }),
      );
      /*
       * The executed copy renders only from the frozen version and the
       * evidence of the completed request — never from the agreement's
       * current placeholder values, which may have changed since signing.
       */
      documentHtml = renderSignatureEvidenceTokens(
        omitPlatformSignatureLines(
          documentHtml,
          evidenceRows.some(
            (evidence) => evidence.recipient.party?.partyType === 'PLATFORM',
          ),
        ),
        evidenceRows,
        signatureImages,
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
    if (!fromEvidence)
      /*
       * QA agreements DEFECT-1. The preview used to print `version.contentHtml`
       * as stored, so every pre-send PDF/DOCX showed literal
       * `{{platform.legalName}}`. It now resolves through the same function
       * as the document-fields view and the signing freeze. A version already
       * frozen for signing has nothing left to resolve but `signature.*`.
       */
      documentHtml = renderContractVersionHtml(
        omitPlatformSignatureLines(
          documentHtml,
          platformSignsContract(contract.parties),
        ),
        contract.placeholderValues,
        'display',
      );
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
      contentType: mimeType,
      scope,
      domain: 'contracts',
      segments: [contract.id],
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
        storageProvider: saved.storageProvider,
        // Server-generated (rendered from the version, or an assembled
        // signed copy) — never user-uploaded — so scanStatus stays null.
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
    // The immutable case is a legal artifact (the signed document); the
    // draft case still produces a new stored `ContractDocument` row every
    // click (§4 of the discovery note), so both are worth an attributable
    // record. `user` is undefined when this runs system-initiated, right
    // after the final signature completes.
    await this.auditContract(
      contractId,
      immutable ? 'SIGNED_DOCUMENT_GENERATED' : 'DOCUMENT_GENERATED',
      user?.userId ?? null,
      { documentId: document.id, format, version: version.version },
    );
    return { document, buffer };
  }

  async openDocument(user: AuthenticatedUser, documentId: string) {
    this.assertPlatform(user);
    // ContractDocument has no tenantId of its own (FILE-15): the owning
    // tenant is only reachable by walking to the parent contract, so it is
    // resolved here rather than via a bare `findUnique` on the id. This
    // route is reachable only by platform staff via `assertPlatform` above,
    // so there is no tenant-crossing bug today — but resolving the scope
    // this way means a future non-platform caller does not inherit one.
    const document = await this.prisma.contractDocument.findUnique({
      where: { id: documentId },
      include: { contract: { select: { tenantId: true } } },
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
    return {
      document,
      file: await this.storage.openFile(
        document.storageKey,
        this.contractStorageScope(document.contract.tenantId),
      ),
    };
  }

  private async resolveSource(
    type: CreateContractFromSourceDto['sourceType'],
    id: string,
  ): Promise<ResolvedContractSource> {
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
      const lead = await this.prisma.lead.findUnique({
        where: { id },
        include: { agreedPlan: true },
      });
      if (!lead) throw new NotFoundException('Lead source was not found.');
      const address = [lead.registeredAddress, lead.city, lead.stateProvince]
        .filter(Boolean)
        .join(', ');
      return {
        counterpartyName: lead.legalCompanyName ?? lead.companyName,
        counterpartyEmail: lead.authorizedSignerEmail ?? lead.workEmail,
        currencyCode: lead.agreedPlan?.currency ?? reportingCurrency,
        placeholderValues: {
          /*
           * A lead is the counterparty of the customer agreement before any
           * customer record exists, so it resolves the canonical customer.*
           * and commercial.* namespaces directly. The lead.* tags stay for
           * lead-specific documents.
           */
          'lead.companyName': lead.companyName,
          'lead.contactName': lead.fullName,
          'lead.workEmail': lead.workEmail,
          'lead.phone': lead.phoneNumber ?? '',
          'lead.website': lead.companyWebsite ?? '',
          'lead.industry': lead.industry,
          'lead.companySize': lead.companySize,
          'lead.country': lead.country ?? '',
          'lead.requirements': lead.requirementsSummary ?? '',
          'customer.companyName': lead.companyName,
          'customer.legalName': lead.legalCompanyName ?? lead.companyName,
          'customer.contact.fullName': lead.fullName,
          'customer.contact.email': lead.workEmail,
          'customer.industry': lead.industry,
          'customer.country': lead.countryOfRegistration ?? lead.country ?? '',
          ...definedValues({
            'customer.registrationNumber': lead.registrationNumber,
            'customer.taxId': lead.taxId,
            'customer.address': address,
            'customer.contact.phone': lead.phoneNumber,
            'customer.primarySigner.name': lead.authorizedSignerName,
            'customer.primarySigner.title': lead.authorizedSignerTitle,
            'customer.primarySigner.email': lead.authorizedSignerEmail,
            'customer.billingContact.name': lead.billingContactName,
            'customer.billingContact.email': lead.billingContactEmail,
            'commercial.planName': lead.agreedPlan?.name,
            'commercial.planId': lead.agreedPlanId,
            'commercial.licensedUsers': lead.agreedSeats,
            'commercial.agreedPrice': lead.agreedPrice?.toString(),
            'commercial.billingCycle': lead.billingCycle,
            'commercial.subscriptionTerm': lead.subscriptionTerm,
            'contract.paymentTerms': lead.paymentTerms,
          }),
        },
        contractValue: lead.agreedPrice ? Number(lead.agreedPrice) : undefined,
        effectiveDate: lead.proposedEffectiveDate?.toISOString(),
        paymentTerms: lead.paymentTerms ?? undefined,
        defaultContractType: ContractType.SUBSCRIPTION_AGREEMENT,
        counterpartyType: 'LEAD',
        partnerId: lead.partnerId ?? undefined,
        customerAccountId: undefined,
        customerOnboardingId: undefined,
        tenantId: undefined,
        relatedLeadId: lead.id,
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
        include: { customer: true, selectedPlan: true },
      });
      if (!onboarding)
        throw new NotFoundException(
          'Customer onboarding source was not found.',
        );
      const base = customerSource(onboarding.customer, reportingCurrency);
      const adminName =
        `${onboarding.primaryOwnerFirstName} ${onboarding.primaryOwnerLastName}`.trim();
      return {
        ...base,
        customerOnboardingId: onboarding.id,
        tenantId: onboarding.tenantId ?? undefined,
        contractValue: onboarding.agreedPrice
          ? Number(onboarding.agreedPrice)
          : undefined,
        placeholderValues: {
          ...base.placeholderValues,
          'customer.primarySigner': adminName,
          'customer.primarySignerEmail': onboarding.primaryOwnerWorkEmail,
          'commercial.billingCycle': onboarding.billingCycle ?? '',
          'commercial.agreedPrice': onboarding.agreedPrice?.toString() ?? '',
          ...definedValues({
            'commercial.totalRecurringAmount': onboarding.agreedPrice,
            'commercial.discount': formatDiscount(
              onboarding.discountType,
              onboarding.discountValue,
              reportingCurrency,
            ),
            'tenant.planName': onboarding.selectedPlan?.name,
            'tenant.admin.name': adminName,
            'tenant.admin.email': onboarding.primaryOwnerWorkEmail,
            'tenant.admin.phone': onboarding.primaryOwnerPhone,
          }),
        },
      };
    }
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        customerAccount: true,
        subscription: { include: { plan: true } },
        ownerUser: {
          select: { firstName: true, lastName: true, email: true },
        },
        tenantDomains: {
          orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
          take: 1,
        },
        tenantSettings: {
          where: { category: { in: ['organization', 'system'] } },
          select: { category: true, key: true, value: true },
        },
        tenantFeatures: {
          where: { isEnabled: true },
          select: { key: true },
          orderBy: { key: 'asc' },
        },
      },
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
          defaultContractType: ContractType.SERVICE_AGREEMENT,
          counterpartyType: 'TENANT',
          relatedLeadId: undefined,
          placeholderValues: {},
        };
    const tenantSetting = (category: string, key: string) => {
      const row = tenant.tenantSettings.find(
        (item) => item.category === category && item.key === key,
      );
      return row?.value === undefined ||
        row.value === null ||
        typeof row.value === 'object'
        ? undefined
        : String(row.value);
    };
    const subscription = tenant.subscription;
    const tenantCurrency =
      subscription?.currency ??
      tenantSetting('organization', 'currency') ??
      reportingCurrency;
    return {
      ...base,
      tenantId: tenant.id,
      counterpartyType: 'TENANT',
      contractValue: subscription ? Number(subscription.finalPrice) : undefined,
      placeholderValues: {
        ...base.placeholderValues,
        'tenant.name': tenant.name,
        'tenant.slug': tenant.slug,
        'commercial.planPrice': subscription?.finalPrice.toString() ?? '',
        ...definedValues({
          'tenant.id': tenant.id,
          'tenant.url': tenantUrl(tenant.tenantDomains[0]?.domain),
          'tenant.status': tenant.status,
          'tenant.environment': tenant.isDemoData ? 'Sandbox' : 'Production',
          'tenant.country':
            tenantSetting('organization', 'country') ??
            tenant.customerAccount?.country,
          'tenant.timeZone':
            tenantSetting('organization', 'timezone') ??
            tenantSetting('system', 'defaultTimezone'),
          'tenant.language':
            tenantSetting('system', 'defaultLanguage') ??
            tenantSetting('system', 'locale'),
          'tenant.currency': tenantCurrency,
          'tenant.planName': subscription?.plan?.name,
          'tenant.admin.name': tenant.ownerUser
            ? `${tenant.ownerUser.firstName} ${tenant.ownerUser.lastName}`.trim()
            : undefined,
          'tenant.admin.email': tenant.ownerUser?.email,
          'tenant.admin.phone':
            tenant.customerAccount?.primaryContactPhone ??
            tenant.customerAccount?.contactPhone,
          'tenant.modules': tenant.tenantFeatures.length
            ? JSON.stringify(
                tenant.tenantFeatures.map((feature) => labelize(feature.key)),
              )
            : undefined,
          'tenant.provisionedAt': tenant.createdAt.toISOString(),
          'tenant.activatedAt':
            tenant.status === 'ACTIVE'
              ? subscription?.startDate?.toISOString()
              : undefined,
          'commercial.licensedUsers': subscription?.purchasedSeats,
          'commercial.basePlatformFee': subscription?.basePrice?.toString(),
          'commercial.totalRecurringAmount':
            subscription?.finalPrice?.toString(),
          'commercial.discount': subscription
            ? formatDiscount(
                subscription.discountType,
                subscription.discountValue,
                tenantCurrency,
              )
            : undefined,
          'commercial.billingStartDate': subscription?.startDate
            ?.toISOString()
            .slice(0, 10),
          'contract.autoRenewal': subscription
            ? subscription.autoRenew
              ? 'Yes'
              : 'No'
            : undefined,
        }),
      },
    };
  }

  /*
   * Legal, service-level, and hosting terms are platform policy rather than
   * per-record data, so they are maintained once in contract settings and
   * resolved into every agreement that references them.
   */
  private async agreementTermValues() {
    const settings = await this.contractSettings();
    return definedValues({
      'contract.initialTerm': settings.defaultInitialTerm,
      'contract.renewalTerm': settings.defaultRenewalTerm,
      'contract.liabilityCap': settings.defaultLiabilityCap,
      'contract.curePeriodDays': settings.defaultCurePeriodDays,
      'contract.dataRetentionDays': settings.defaultDataRetentionDays,
      'contract.dataExportPeriodDays': settings.defaultDataExportPeriodDays,
      'sla.supportTier': settings.defaultSupportTier,
      'sla.supportHours': settings.defaultSupportHours,
      'sla.supportChannels': settings.defaultSupportChannels,
      'sla.uptimeTarget': settings.defaultUptimeTarget,
      'sla.backupFrequency': settings.defaultBackupFrequency,
      'sla.backupRetention': settings.defaultBackupRetention,
      'sla.rpo': settings.defaultRecoveryPointObjective,
      'sla.rto': settings.defaultRecoveryTimeObjective,
      'hosting.applicationProvider': settings.hostingApplicationProvider,
      'hosting.databaseProvider': settings.hostingDatabaseProvider,
      'hosting.emailProvider': settings.hostingEmailProvider,
      'hosting.applicationRegion': settings.hostingApplicationRegion,
      'hosting.databaseRegion': settings.hostingDatabaseRegion,
      'platform.authorizedSigner.name': settings.authorizedSignerName,
      'platform.authorizedSigner.title': settings.authorizedSignerTitle,
    });
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
      registrationNumber: text('registrationNumber'),
      taxNumber: text('taxNumber'),
      supportEmail: text('supportEmail'),
      website: text('website'),
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
        // The party decides which signature slot the mark fills.
        party: { select: { partyType: true } },
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
    if (
      dto.contractType === 'CUSTOMER_AGREEMENT' &&
      !dto.customerAccountId &&
      !dto.relatedLeadId
    )
      throw new BadRequestException(
        'Customer agreement requires a customer account or source lead.',
      );
    this.validateContractDates(dto);
  }

  /** `partner.*` values from the linked partner (see `partnerPlaceholderValues`). */
  private async linkedPartnerValues(
    partnerId: string | null | undefined,
    contractCommissionPercentage?: { toString(): string } | number | null,
  ): Promise<Record<string, string>> {
    return (await this.linkedPartner(partnerId, contractCommissionPercentage))
      .values;
  }

  /**
   * The linked partner's placeholder values and the party type its agreement
   * records (ITEM-0203: an individual partner is an INDIVIDUAL party), from
   * one read.
   */
  private async linkedPartner(
    partnerId: string | null | undefined,
    contractCommissionPercentage?: { toString(): string } | number | null,
  ) {
    if (!partnerId)
      return {
        values: {} as Record<string, string>,
        contractPartyType: contractPartyTypeForPartner(null),
      };
    const partner = await this.prisma.partner.findUnique({
      where: { id: partnerId },
      select: {
        type: true,
        displayName: true,
        legalName: true,
        companyName: true,
        contactFirstName: true,
        contactLastName: true,
        email: true,
        taxId: true,
        defaultCommissionRate: true,
      },
    });
    return {
      values: partner
        ? partnerPlaceholderValues(partner, contractCommissionPercentage)
        : ({} as Record<string, string>),
      contractPartyType: contractPartyTypeForPartner(partner?.type),
    };
  }

  /**
   * BUG-3553. An agreement's counterparty must be usable and internally
   * consistent — this is called with the *resulting* link set, at create and
   * whenever an existing agreement's links are changed (see `update`).
   */
  private async assertLinkedEntitiesUsable(input: {
    partnerId?: string | null;
    relatedLeadId?: string | null;
    customerAccountId?: string | null;
  }) {
    const [partner, lead, customer] = await Promise.all([
      input.partnerId
        ? this.prisma.partner.findUnique({
            where: { id: input.partnerId },
            select: { id: true, status: true, displayName: true },
          })
        : null,
      input.relatedLeadId
        ? this.prisma.lead.findUnique({
            where: { id: input.relatedLeadId },
            select: {
              id: true,
              status: true,
              companyName: true,
              partnerId: true,
            },
          })
        : null,
      input.customerAccountId
        ? this.prisma.customerAccount.findUnique({
            where: { id: input.customerAccountId },
            select: { id: true, status: true, companyName: true },
          })
        : null,
    ]);
    if (input.partnerId && !partner)
      throw new NotFoundException('Linked partner was not found.');
    if (input.relatedLeadId && !lead)
      throw new NotFoundException('Linked lead was not found.');
    if (input.customerAccountId && !customer)
      throw new NotFoundException('Linked customer was not found.');
    if (partner) assertPartnerUsable(partner);
    if (lead) assertLeadUsable(lead);
    if (customer) assertCustomerUsable(customer);
    if (partner && lead) assertLeadAttributedToPartner(lead, partner.id);
  }

  /**
   * ADR-0020 point 4. Blocks with the specific "not associated with a
   * customer" style message *before* the generic required-value check gets a
   * chance to report the same gap as an anonymous missing field — the value
   * is missing precisely because the entity was never resolvable, and the
   * operator needs to know which relationship to add, not just which token
   * is blank.
   */
  private assertPlaceholdersInContext(
    contract: LinkableContract & { contractType: ContractType },
    definitions: ContractPlaceholderDefinition[],
  ) {
    const issues = unresolvableRequiredPlaceholders(
      definitions,
      contract.contractType,
      contract,
    );
    if (!issues.length) return;
    throw new BadRequestException({
      code: 'CONTRACT_PLACEHOLDER_UNRESOLVABLE_CONTEXT',
      message: issues.map((issue) => issue.message).join(' '),
      details: { issues },
    });
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
      await this.auditContract(
        contractId,
        'SIGNING_INVALIDATED_FOR_NEW_VERSION',
        userId,
        undefined,
        tx,
      );
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

  /**
   * BUG-3231. `ContractTimeline` is the module's human-readable trail; it has
   * never been the platform's queryable audit surface
   * (`AuditService`/`/api/audit-logs`), and nothing in this module called
   * `AuditService.log()` at all — 31 mutating endpoints with no attributable
   * record. Every call site that writes a timeline row through this pair of
   * helpers now writes the matching audit row in the same breath, so the two
   * trails cannot drift the way `assertAgreementEditable`'s copy did
   * (BUG-0011): one call, both records, always together.
   *
   * `tenantId: 'platform'` is the documented sentinel for a platform-owned
   * record — contracts are a platform-staff surface (`assertPlatform`), never
   * tenant-owned, so this is the only routing this module ever needs.
   */
  private async auditContract(
    contractId: string,
    action: string,
    actorUserId: string | null,
    snapshot: Record<string, unknown> | undefined,
    db?: Prisma.TransactionClient,
  ) {
    await this.auditService.log(
      {
        tenantId: 'platform',
        actorUserId,
        action,
        entityType: 'Contract',
        entityId: contractId,
        afterSnapshot: snapshot ?? null,
      },
      db,
    );
  }

  private async timeline(
    contractId: string,
    user: AuthenticatedUser,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    const row = await this.prisma.contractTimeline.create({
      data: {
        contractId,
        eventType,
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    await this.auditContract(contractId, eventType, user.userId, metadata);
    return row;
  }

  private async timelineTx(
    tx: Prisma.TransactionClient,
    contractId: string,
    user: AuthenticatedUser,
    eventType: string,
    message: string,
    metadata?: Record<string, unknown>,
  ) {
    // Sequential, not `Promise.all` — both statements share the interactive
    // transaction's single connection, and issuing them concurrently on it
    // is unsafe.
    const row = await tx.contractTimeline.create({
      data: {
        contractId,
        eventType,
        actorType: 'PLATFORM_USER',
        actorId: user.userId,
        message,
        metadata: metadata as Prisma.InputJsonValue,
      },
    });
    await this.auditContract(contractId, eventType, user.userId, metadata, tx);
    return row;
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

  /**
   * A contract's storage scope follows the tenant the agreement is *with*,
   * not the platform staff member handling it. Most contracts govern a
   * specific tenant (a service agreement, a signed amendment), and their
   * documents belong in that tenant's storage partition even though
   * `ContractDocument` / `ContractVersion` / `SignatureEvidence` carry no
   * `tenantId` column of their own — the owning tenant is only reachable by
   * walking to `Contract.tenantId` (FILE-15). A contract with no tenant — a
   * partner agreement, or a lead that was never provisioned into a tenant —
   * genuinely has none to scope to, so platform scope is correct there; it
   * is not a fallback taken because the lookup was inconvenient.
   */
  private contractStorageScope(
    tenantId: string | null | undefined,
  ): StorageScope {
    return tenantId ? { kind: 'tenant', tenantId } : { kind: 'platform' };
  }

  private assertApprovalStep(user: AuthenticatedUser, approverRole: string) {
    // The administrator tier may act on any approval step (ITEM-0204).
    if (isPlatformAdminTier(user) || user.platform!.role === approverRole)
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
    const value = toDisplayString(filter.value ?? '').trim();
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

const OPEN_SIGNATURE_REQUEST_STATUSES: SignatureRequestStatus[] = [
  SignatureRequestStatus.SENT,
  SignatureRequestStatus.VIEWED,
  SignatureRequestStatus.PARTIALLY_SIGNED,
];

function displaySignatureStatus(
  request:
    | { status: SignatureRequestStatus; expiresAt: Date | null }
    | undefined,
) {
  if (!request) return null;
  if (
    OPEN_SIGNATURE_REQUEST_STATUSES.includes(request.status) &&
    request.expiresAt &&
    request.expiresAt < new Date()
  )
    return SignatureRequestStatus.EXPIRED;
  return request.status;
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
      'mark',
      'img',
      'input',
    ],
    allowedAttributes: {
      a: ['href', 'target', 'rel'],
      p: ['style', 'data-document-role'],
      h1: ['style', 'data-document-role'],
      h2: ['style', 'data-document-role'],
      h3: ['style', 'data-document-role'],
      h4: ['style', 'data-document-role'],
      ol: ['start'],
      li: ['value'],
      table: ['style', 'data-document-role'],
      th: ['colspan', 'rowspan', 'style'],
      td: ['colspan', 'rowspan', 'style'],
      // `data-signature-style` (BUG-3554) carries which PDFKit/DOCX font a
      // typed signature's paragraph should use — see `createPdf`.
      span: ['data-placeholder', 'style', 'data-signature-style'],
      mark: ['style'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      hr: ['data-page-break', 'class'],
      input: ['type', 'checked', 'disabled'],
    },
    allowedStyles: {
      '*': {
        'text-align': [/^(left|right|center|justify)$/],
        'font-size': [/^\d{1,2}(px|pt)$/],
        'font-family': [/^[a-z0-9 ,.'"-]{1,100}$/i],
        'font-weight': [/^(normal|bold|[1-9]00)$/],
        color: [/^(#[0-9a-f]{3,8}|rgba?\([\d ,.]+\)|[a-z]{3,20})$/i],
        'background-color': [
          /^(#[0-9a-f]{3,8}|rgba?\([\d ,.]+\)|[a-z]{3,20})$/i,
        ],
        'line-height': [/^(normal|\d(?:\.\d{1,2})?)$/],
        'margin-left': [/^\d{1,3}px$/],
      },
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['data', 'http', 'https'],
    },
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }),
    },
  });
}

/**
 * A placeholder value as a reader should see it.
 *
 * WHY THIS EXISTS. `formattingRule` has been declared on nineteen placeholders
 * since the registry was written — `'currency'`, `'locale-date'`, `'0.##%'` —
 * and **nothing read it**. `renderContractPlaceholders` escaped every scalar
 * verbatim, so an executed service order printed "Uptime target 99.5." where it
 * meant 99.5%, printed "2026-08-01T10:00:00+03:00" where it meant 1 August
 * 2026, and printed a bare "1200" for a price. A declared rule that nothing
 * applies is worse than no rule: it reads, in review, as a solved problem.
 *
 * The rule wins where it is set; the data type decides otherwise. Both are
 * best-effort by design — a value that cannot be interpreted is returned
 * unchanged rather than replaced by "Invalid Date" or "NaN%", because a
 * contract that prints the raw string is recoverable and one that prints
 * nonsense is not.
 */
export function formatPlaceholderValue(
  value: string,
  definition: ContractPlaceholderDefinition | undefined,
  currencyCode?: string,
): string {
  const raw = value.trim();
  if (!raw || !definition) return value;

  const rule = definition.formattingRule;
  const type = definition.dataType;

  if (rule === '0.##%' || type === 'PERCENTAGE') {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return value;
    /*
     * Stored as a percentage already (99.5 means 99.5%), not as a fraction.
     * `validateContractPlaceholderValues` bounds PERCENTAGE to 0–100, which is
     * what fixes that reading in place.
     */
    return `${trimNumber(numeric)}%`;
  }

  if (rule === 'currency' || type === 'CURRENCY') {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return value;
    const amount = numeric.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    /*
     * The code is prefixed rather than the symbol. A contract that says
     * "SAR 1,200.00" is unambiguous in every jurisdiction; one that says
     * "$1,200.00" is not, and this platform bills in several currencies.
     */
    return currencyCode ? `${currencyCode} ${amount}` : amount;
  }

  if (rule === 'locale-date' || type === 'DATE' || type === 'DATE_TIME') {
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return value;
    /*
     * "1 October 2026", never "10/01/2026". A numeric date is read as October
     * the first in one country and the tenth of January in another, and a
     * go-live date that means two things is the kind of ambiguity a contract
     * exists to remove. The time is kept only where the type asks for it.
     */
    const date = parsed.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    });
    if (type !== 'DATE_TIME') return date;
    const time = parsed.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    });
    return `${date}, ${time} UTC`;
  }

  if (type === 'BOOLEAN') {
    const normalized = raw.toLowerCase();
    if (['true', 'yes', '1'].includes(normalized)) return 'Yes';
    if (['false', 'no', '0'].includes(normalized)) return 'No';
    return value;
  }

  if (type === 'INTEGER' || type === 'DECIMAL') {
    const numeric = Number(raw);
    if (!Number.isFinite(numeric)) return value;
    // Thousands separators: "5,000 records" is read at a glance; "5000" is counted.
    return numeric.toLocaleString('en-US', { maximumFractionDigits: 6 });
  }

  return value;
}

/** `99.50` renders as `99.5`, `100.00` as `100`, `99.55` unchanged. */
function trimNumber(value: number) {
  return String(Number(value.toFixed(2)));
}

/** BUG-3552. Stringified values that mean "this was never a real value" —
 * never rendered into an agreement in a placeholder position. */
const PLACEHOLDER_ARTIFACT_LITERALS = new Set([
  'undefined',
  'null',
  '[object Object]',
]);

export function renderContractPlaceholders(
  html: string,
  rawValues: Record<string, string>,
) {
  const values = applyDeprecatedPlaceholderAliases(rawValues);
  const currencyCode = /^[A-Za-z]{3}$/.test(
    (values['contract.currency'] ?? '').trim(),
  )
    ? values['contract.currency'].trim().toUpperCase()
    : undefined;
  return html.replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (match, key: string) => {
      const definition = CONTRACT_PLACEHOLDER_REGISTRY.find(
        (item) => item.key === key,
      );
      const value = key in values ? String(values[key]) : '';
      /*
       * ADR-0020 point 4. A value that stringifies to one of these literals
       * is not a value — it is `undefined`, `null`, or a bare object that
       * reached `String()` upstream — and treating it as empty rather than
       * printing it is the final guard against it ever reaching a rendered
       * agreement, however it got here.
       */
      if (!value.trim() || PLACEHOLDER_ARTIFACT_LITERALS.has(value.trim())) {
        /*
         * An optional term the platform does not hold resolves to nothing rather
         * than leaving a raw token in the document. Anything declared ERROR or
         * LEAVE_TOKEN keeps its token so the signature gate can refuse it.
         */
        return definition?.fallbackBehavior === 'EMPTY' ? '' : match;
      }
      if (
        definition &&
        ['TABLE', 'REPEATING_COLLECTION'].includes(definition.dataType)
      )
        return renderCollectionValue(value);
      if (definition && ['SIGNATURE', 'INITIALS'].includes(definition.dataType))
        return renderSignatureValue(value);
      /*
       * Currency values are prefixed with the agreement's own currency where
       * the document carries one, so "SAR 1,200.00" rather than a bare number
       * whose unit the reader has to infer from a different paragraph.
       */
      return escapeHtml(
        formatPlaceholderValue(value, definition, currencyCode),
      );
    },
  );
}

/**
 * The whole `signature.*` namespace — marks, names, dates, initials — belongs
 * to the signing ceremony. It is never typed in, never frozen at send, and is
 * filled at render time from `SignatureEvidence` (ADR-0020 point 6).
 *
 * QA agreements DEFECT-2. The pre-send "everything must be resolved" check
 * used to exempt only the SIGNATURE and INITIALS *data types*, so the
 * `signature.*.date` placeholders (DATE_TIME) blocked every template with a
 * dated signature line from being sent — and the only workaround, typing a
 * date into the document fields, froze a fabricated date into the executed
 * version beside the real signing timestamp. Deciding by namespace rather
 * than data type is what makes a new `signature.*` companion (a title, a
 * place) safe by default.
 */
export function isSignaturePlaceholderKey(key: string) {
  return key.startsWith('signature.');
}

export type StoredContractPlaceholderValue = {
  key: string;
  value: string;
  source?: string | null;
};

/*
 * What a draft preview prints where a signature is still to come. Dates read
 * "Pending" so a dated signature line never shows a date nobody signed on.
 */
const PENDING_SIGNATURE_HTML =
  '<span data-signature-metadata="true">Electronic signature pending</span>';
const PENDING_SIGNATURE_DATE = 'Pending';

function renderPendingSignatureTokens(html: string) {
  return html.replace(
    /\{\{\s*(signature\.[a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_token, key: string) =>
      key.endsWith('.date') ? PENDING_SIGNATURE_DATE : PENDING_SIGNATURE_HTML,
  );
}

/**
 * Render one contract version for anything other than the executed copy.
 *
 * QA agreements DEFECT-1. There were three renderers of the same version:
 * `documentFields()` and `sendForSignature()` substituted the agreement's
 * placeholder values, while `generateDocument()`'s preview path did not — so
 * every pre-send PDF/DOCX printed literal `{{platform.legalName}}`. This is
 * now the one function all three call, so they cannot drift again.
 *
 * - `freeze` (sending for signature): every non-signature value is resolved
 *   into the HTML that becomes the immutable signing version. `signature.*`
 *   tokens are left in place whatever is stored for them, because the
 *   evidence that fills them does not exist yet.
 * - `display` (previews, the document-fields view, generated drafts): the same
 *   substitution, then `signature.*` from signing itself (rows whose source
 *   is `signature`, written by `completeSignature`) and "pending" for the
 *   rest. A stored `signature.*` value from any other source — a hand-typed
 *   date from before DEFECT-2 was fixed — is ignored.
 *
 * Decision on unresolved values in a preview: an optional placeholder follows
 * its declared fallback (empty); a required one keeps its visible `{{token}}`,
 * because it is precisely what the operator still has to fill, and the send
 * gate refuses it. `renderContractPlaceholders` guarantees that neither path
 * prints `undefined`, `null` or `[object Object]`.
 */
/**
 * Owner decision (TASK-0032, 2026-09-25): the DijiPeople signature line is shown
 * only when DijiPeople actually signs. Otherwise an executed partner or
 * customer agreement printed "Not signed" beside the platform's name.
 *
 * Removes every paragraph that is a platform signature line — marked
 * `data-document-role="platform-signature"` (system templates) or carrying a
 * `{{signature.platform.*}}` token (operator-authored templates). Nothing else
 * in the document is touched.
 */
export function omitPlatformSignatureLines(
  html: string,
  platformSigns: boolean,
) {
  if (platformSigns) return html;
  return html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (paragraph) =>
    /data-document-role\s*=\s*["']platform-signature["']/i.test(paragraph) ||
    /\{\{\s*signature\.platform\./i.test(paragraph)
      ? ''
      : paragraph,
  );
}

/** Whether any DijiPeople (PLATFORM) party on the agreement signs it. */
export function platformSignsContract(
  parties:
    | ReadonlyArray<{
        partyType: string;
        isSignatory?: boolean | null;
        signatureRequired?: boolean | null;
      }>
    | null
    | undefined,
) {
  return (parties ?? []).some(
    (party) =>
      party.partyType === 'PLATFORM' &&
      Boolean(party.isSignatory || party.signatureRequired),
  );
}

export function renderContractVersionHtml(
  html: string,
  rows: StoredContractPlaceholderValue[],
  mode: 'freeze' | 'display',
) {
  const values = Object.fromEntries(
    rows
      .filter(
        (row) =>
          !isSignaturePlaceholderKey(row.key) ||
          (mode === 'display' && row.source === 'signature'),
      )
      .map((row) => [row.key, row.value]),
  );
  const rendered = renderContractPlaceholders(html, values);
  return mode === 'display' ? renderPendingSignatureTokens(rendered) : rendered;
}

/*
 * The subset of `SignatureEvidence` (and its recipient) the executed copy is
 * rendered from.
 */
export type SignatureEvidenceForRender = {
  id: string;
  method: string;
  typedName: string | null;
  typedStyle?: string | null;
  signedAt: Date;
  signatureSha256: string;
  recipient: {
    name: string;
    party?: { partyType: string; isPrimary?: boolean | null } | null;
  };
};

/**
 * Fill every `signature.*` token of an executed version from the evidence of
 * the completed request — the only source a signed document may take them
 * from. The version HTML itself is frozen; nothing stored as a placeholder
 * value is consulted.
 *
 * A token names a slot (`signature.<slot>.<field>`) and every field of one
 * slot — the mark, the name, the date — resolves to the *same* signer. The
 * previous inline version picked a signer per token round-robin for
 * `signature.party.primary.*`, so the name and the date of one line could
 * belong to two different people.
 *
 * `signature.<slot>.date` is the signer's real `signedAt`, formatted the way
 * every other DATE_TIME in the agreement is (QA agreements DEFECT-2 — the
 * executed copy used to print a date typed in before sending). A named slot
 * with no matching signer reads "Not signed" rather than borrowing someone
 * else's signature.
 */
export function renderSignatureEvidenceTokens(
  html: string,
  evidenceRows: SignatureEvidenceForRender[],
  signatureImages: Map<string, string> = new Map(),
) {
  const bySlot = new Map<string, SignatureEvidenceForRender | undefined>();
  let fallbackIndex = 0;
  const counterparties = evidenceRows.filter(
    (item) => item.recipient.party?.partyType !== 'PLATFORM',
  );
  const evidenceFor = (slot: string) => {
    if (bySlot.has(slot)) return bySlot.get(slot);
    let evidence: SignatureEvidenceForRender | undefined;
    if (slot === 'platform')
      evidence = evidenceRows.find(
        (item) => item.recipient.party?.partyType === 'PLATFORM',
      );
    else if (slot === 'counterparty') evidence = counterparties[0];
    else if (slot === 'party.primary')
      evidence =
        counterparties.find((item) => item.recipient.party?.isPrimary) ??
        counterparties[0];
    else if (evidenceRows.length)
      evidence = evidenceRows[fallbackIndex++ % evidenceRows.length];
    bySlot.set(slot, evidence);
    return evidence;
  };
  const dateDefinition = CONTRACT_PLACEHOLDER_REGISTRY.find(
    (item) => item.key === 'signature.counterparty.date',
  );
  return html.replace(
    /\{\{\s*(signature\.[a-zA-Z0-9_.-]+)\s*\}\}/g,
    (_token, key: string) => {
      const parts = key.split('.');
      const field = parts[parts.length - 1];
      const slot = parts.slice(1, -1).join('.');
      const evidence = evidenceFor(slot);
      if (!evidence)
        return field === 'date'
          ? ''
          : '<span data-signature-metadata="true">Not signed</span>';
      if (field === 'date')
        return escapeHtml(
          formatPlaceholderValue(
            evidence.signedAt.toISOString(),
            dateDefinition,
          ),
        );
      if (field === 'initials')
        return escapeHtml(
          (evidence.typedName || evidence.recipient.name)
            .split(/\s+/)
            .filter(Boolean)
            .map((part) => part[0]?.toUpperCase() ?? '')
            .join('')
            .slice(0, 4),
        );
      const signatureImage = signatureImages.get(evidence.id);
      /*
       * BUG-3554. The chosen style used to be sent nowhere and rendered
       * nowhere — every typed signature printed as plain bold text regardless
       * of the picker. `data-signature-style` survives `cleanContractHtml`
       * (span's allowlist) and is what `extractAgreementDocumentStructure`
       * reads to choose a PDFKit standard font for this paragraph in
       * `createPdf`/`createDocx`.
       */
      const typedStyleAttr =
        evidence.method === 'TYPED' && evidence.typedStyle
          ? ` data-signature-style="${escapeHtml(evidence.typedStyle)}"`
          : '';
      return `${signatureImage ? `<img src="${signatureImage}" alt="${escapeHtml(evidence.recipient.name)} signature" width="240" height="80">` : ''}<span data-signature-metadata="true"${typedStyleAttr}><strong>${escapeHtml(evidence.typedName || evidence.recipient.name)}</strong><br>${escapeHtml(evidence.method)} signature · ${escapeHtml(evidence.signedAt.toISOString())}<br>Verified · SHA-256 ${escapeHtml(evidence.signatureSha256.slice(0, 20))}…</span>`;
    },
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
  rawValues: Record<string, string>,
  requireRequired = false,
) {
  const values = applyDeprecatedPlaceholderAliases(rawValues);
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
    if (definition.dataType === 'CURRENCY_CODE' && !/^[A-Za-z]{3}$/.test(value))
      errors.push(
        `${definition.label} must be a three-letter currency code such as USD.`,
      );
    if (
      ['TABLE', 'REPEATING_COLLECTION'].includes(definition.dataType) &&
      !parseCollectionValue(value)
    )
      errors.push(
        `${definition.label} must be a list of values or a JSON array.`,
      );
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
  if (normalized.startsWith('signature.')) return 'SIGNATURE';
  if (normalized.includes('email')) return 'EMAIL';
  if (normalized.includes('phone')) return 'PHONE';
  if (normalized.includes('url') || normalized.includes('website'))
    return 'URL';
  if (normalized.includes('address')) return 'ADDRESS';
  if (normalized.includes('percentage')) return 'PERCENTAGE';
  if (normalized.endsWith('date')) return 'DATE';
  // `provisionedAt` is a timestamp; `format` and `seat` only end in the same
  // two letters, so the camel-case boundary is what makes the guess reliable.
  if (normalized.includes('datetime') || /[a-z]At$/.test(key))
    return 'DATE_TIME';
  // A currency *code* names the unit, an amount carries a number. Treating the
  // code as numeric rejects every valid ISO 4217 value.
  if (/currency(code)?$/.test(normalized)) return 'CURRENCY_CODE';
  if (
    normalized.includes('amount') ||
    normalized.endsWith('fee') ||
    normalized.endsWith('price')
  )
    return 'CURRENCY';
  return 'TEXT';
}

/*
 * Collection placeholders accept either a JSON array (objects render as a
 * table, strings as a list) or a newline/semicolon separated list, so an
 * operator can fill one in by hand without writing JSON. Returns null when the
 * value is neither.
 */
function parseCollectionValue(value: string) {
  const trimmed = value.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  const items = trimmed
    .split(/[\n;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length ? items : null;
}

/*
 * A drawn or uploaded signature is stored as an image data URL and shown as the
 * mark itself; a typed one is shown in a signature face so it reads as a
 * signature rather than as ordinary body text.
 */
function renderSignatureValue(value: string) {
  const trimmed = value.trim();
  if (/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(trimmed))
    return `<img src="${trimmed}" alt="Signature" width="240" height="80">`;
  return `<span data-document-role="signature" style="font-family: 'Segoe Script', 'Brush Script MT', cursive; font-size: 18px">${escapeHtml(trimmed)}</span>`;
}

function renderCollectionValue(value: string) {
  const items = parseCollectionValue(value);
  if (!items) return escapeHtml(value);

  const columns = [
    ...new Set(
      items.flatMap((item) =>
        item && typeof item === 'object' && !Array.isArray(item)
          ? Object.keys(item as Record<string, unknown>)
          : [],
      ),
    ),
  ];
  if (!columns.length)
    return `<ul>${items.map((item) => `<li>${escapeHtml(String(item))}</li>`).join('')}</ul>`;

  const cell = (item: unknown, column: string) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return '';
    const raw = (item as Record<string, unknown>)[column];
    return raw === undefined || raw === null
      ? ''
      : escapeHtml(toDisplayString(raw));
  };
  return [
    '<table><thead><tr>',
    columns
      .map((column) => `<th>${escapeHtml(labelize(column))}</th>`)
      .join(''),
    '</tr></thead><tbody>',
    items
      .map(
        (item) =>
          `<tr>${columns.map((column) => `<td>${cell(item, column)}</td>`).join('')}</tr>`,
      )
      .join(''),
    '</tbody></table>',
  ].join('');
}

function tenantUrl(domain: string | undefined) {
  if (!domain) return undefined;
  return /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
}

function formatDiscount(
  discountType: DiscountType,
  discountValue: Prisma.Decimal | null,
  currencyCode: string,
) {
  const value = discountValue ? Number(discountValue) : 0;
  if (discountType === 'NONE' || !value) return undefined;
  return discountType === 'PERCENTAGE'
    ? `${value}%`
    : `${currencyCode} ${value.toFixed(2)}`;
}

function labelize(value: string) {
  const spaced = value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
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

/*
 * Like compactStringRecord, but also drops blanks. Optional placeholders are
 * better left unrecorded than stored as empty rows: they render as nothing
 * either way, and the contract keeps only the values it actually resolved.
 */
function definedValues(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values)
      .map(
        ([key, value]) =>
          [
            key,
            value === undefined || value === null
              ? ''
              : toDisplayString(value).trim(),
          ] as const,
      )
      .filter(([, value]) => value !== ''),
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

/**
 * The `partner.*` namespace as the linked partner record resolves it.
 *
 * ADR-0020 promises that a linked entity feeds its own namespace, and
 * lead/customer/onboarding/tenant do through `resolveSource`. A partner never
 * did: `createFromSource` has no partner source, and `create()` with a
 * `partnerId` stored the link but not one `partner.*` value — so every
 * partner agreement needed its partner's own name typed in by hand before it
 * could be sent (found while verifying QA agreements DEFECT-1).
 *
 * Only what the record actually holds is emitted. `Partner` has no address or
 * registration number column, so `partner.address`/`partner.registrationNumber`
 * stay for the operator to fill. A legal name is the recorded one, else — for
 * an individual, whose name is their legal name — the display name, else the
 * company name; never invented. The commission is the agreement's own, else
 * the partner's configured default when one was actually set (the column
 * defaults to 0, which means "not configured", not "0%").
 */
export function partnerPlaceholderValues(
  partner: {
    type?: string | null;
    displayName: string;
    legalName?: string | null;
    companyName?: string | null;
    contactFirstName?: string | null;
    contactLastName?: string | null;
    email?: string | null;
    taxId?: string | null;
    defaultCommissionRate?: { toString(): string } | number | null;
  },
  contractCommissionPercentage?: { toString(): string } | number | null,
): Record<string, string> {
  const defaultRate =
    partner.defaultCommissionRate !== undefined &&
    partner.defaultCommissionRate !== null &&
    Number(partner.defaultCommissionRate.toString()) > 0
      ? partner.defaultCommissionRate.toString()
      : undefined;
  return definedValues({
    'partner.name': partner.displayName,
    'partner.legalName':
      partner.legalName ??
      (partner.type === 'INDIVIDUAL'
        ? partner.displayName
        : partner.companyName),
    'partner.taxId': partner.taxId,
    'partner.contact.firstName': partner.contactFirstName,
    'partner.contact.lastName': partner.contactLastName,
    'partner.contact.email': partner.email?.toLowerCase(),
    'partner.commissionPercentage':
      contractCommissionPercentage?.toString() ?? defaultRate,
  });
}

function customerSource(
  customer: {
    id: string;
    companyName: string;
    legalCompanyName: string | null;
    registrationNumber?: string | null;
    taxId?: string | null;
    primaryContactFirstName: string | null;
    primaryContactLastName: string | null;
    primaryContactEmail: string | null;
    primaryContactPhone?: string | null;
    billingContactEmail?: string | null;
    financeContactName?: string | null;
    financeContactEmail?: string | null;
    contactEmail: string;
    contactPhone?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    stateProvince?: string | null;
    country: string;
    industry: string | null;
    originatingPartnerId?: string | null;
  },
  currencyCode: string,
) {
  const contactName =
    `${customer.primaryContactFirstName ?? ''} ${customer.primaryContactLastName ?? ''}`.trim();
  const contactEmail = customer.primaryContactEmail ?? customer.contactEmail;
  const address = [
    customer.addressLine1,
    customer.addressLine2,
    customer.city,
    customer.stateProvince,
    customer.country,
  ]
    .filter(Boolean)
    .join(', ');
  return {
    counterpartyName: customer.legalCompanyName ?? customer.companyName,
    counterpartyEmail: contactEmail,
    currencyCode,
    customerAccountId: customer.id,
    customerOnboardingId: undefined,
    tenantId: undefined,
    partnerId: customer.originatingPartnerId ?? undefined,
    counterpartyType: 'CUSTOMER',
    relatedLeadId: undefined,
    contractValue: undefined,
    defaultContractType: ContractType.CUSTOMER_AGREEMENT,
    placeholderValues: {
      'customer.companyName': customer.companyName,
      'customer.legalName': customer.legalCompanyName ?? customer.companyName,
      'customer.contact.fullName': contactName,
      'customer.contact.email': contactEmail,
      'customer.address': address,
      'customer.country': customer.country,
      'customer.industry': customer.industry ?? '',
      ...definedValues({
        'customer.registrationNumber': customer.registrationNumber,
        'customer.taxId': customer.taxId,
        'customer.contact.phone':
          customer.primaryContactPhone ?? customer.contactPhone,
        'customer.billingContact.name': customer.financeContactName,
        'customer.billingContact.email':
          customer.billingContactEmail ?? customer.financeContactEmail,
      }),
    },
  };
}

export const TENANT_PROVISIONING_GATE = 'TENANT_PROVISIONING';

/*
 * Whichever way a signer chose to sign, the result lands in the same two
 * placeholders: the mark itself and the moment it was made. A drawn or uploaded
 * signature keeps its image; a typed one keeps the legal name it was typed as.
 */
export function signaturePlaceholderValues(
  partyType: string | null,
  signerName: string,
  signatureDataUrl: string | undefined,
  signedAt: Date,
) {
  const slot = partyType === 'PLATFORM' ? 'platform' : 'counterparty';
  const initials = signerName
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 4);
  return {
    [`signature.${slot}.name`]: signatureDataUrl ?? signerName,
    [`signature.${slot}.date`]: signedAt.toISOString(),
    ...(slot === 'counterparty'
      ? { 'signature.counterparty.initials': initials }
      : {}),
  };
}

/*
 * The order the Fields & Signatures picker lists placeholder groups in. Driven
 * from the key's own namespace so a newly registered placeholder lands in the
 * right group without a second registration step.
 *
 * The two parties come first. `counterparty.*` is whoever signs opposite the
 * platform — a partner, a lead, a customer — so it has its own group rather
 * than living under "Customer", which showed a Customer group on every
 * partner agreement template (QA agreements DEFECT-4).
 */
export const PLACEHOLDER_GROUP_ORDER = [
  'Platform',
  'Counterparty',
  'Partner',
  'Lead',
  'Customer',
  'Commercial',
  'Contract',
  'Service order',
  'Tenant',
  'Implementation',
  'Integration',
  'Hosting',
  'SLA',
  'Signatures',
  'Other',
] as const;

const PLACEHOLDER_GROUP_BY_NAMESPACE: Record<string, string> = {
  platform: 'Platform',
  partner: 'Partner',
  lead: 'Lead',
  customer: 'Customer',
  counterparty: 'Counterparty',
  commercial: 'Commercial',
  contract: 'Contract',
  serviceOrder: 'Service order',
  tenant: 'Tenant',
  implementation: 'Implementation',
  integration: 'Integration',
  hosting: 'Hosting',
  sla: 'SLA',
  signature: 'Signatures',
};

export function placeholderGroup(key: string) {
  return PLACEHOLDER_GROUP_BY_NAMESPACE[key.split('.')[0]] ?? 'Other';
}

const CONTRACT_PAGE_BREAK_TOKEN = 'DIJIPEOPLE_DOCUMENT_PAGE_BREAK';

function assertSupportedContractDocument(file: ContractUploadFile) {
  const allowed = new Set([
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/pdf',
    'text/plain',
    'text/html',
  ]);
  if (!allowed.has(file.mimetype))
    throw new BadRequestException('Upload a DOCX, PDF, TXT, or HTML document.');
}

function preserveMammothPageBreaks(element: unknown): unknown {
  if (!element || typeof element !== 'object') return element;
  const record = element as Record<string, unknown>;
  if (record.type === 'break' && record.breakType === 'page')
    return { type: 'text', value: CONTRACT_PAGE_BREAK_TOKEN };
  if (!Array.isArray(record.children)) return element;
  return {
    ...record,
    children: record.children.map(preserveMammothPageBreaks),
  };
}

function hasDescendant(node: AgreementHtmlNode, name: string) {
  return (node.children ?? []).some(
    (child) => child.name?.toLowerCase() === name || hasDescendant(child, name),
  );
}

function setDocumentRole(node: AgreementHtmlNode, role: string) {
  node.attribs = {
    ...(node.attribs ?? {}),
    'data-document-role': role,
  };
}

function stripManualListPrefix(node: AgreementHtmlNode) {
  if (node.type === 'text' && node.data) {
    const next = node.data.replace(/^\s*\d+[.)]\s+/, '');
    if (next !== node.data) {
      node.data = next;
      return true;
    }
  }
  for (const child of node.children ?? [])
    if (stripManualListPrefix(child)) return true;
  return false;
}

function normalizeManualNumberedLists(nodes: AgreementHtmlNode[]) {
  let index = 0;
  while (index < nodes.length) {
    const first = nodes[index];
    const match =
      first.name?.toLowerCase() === 'p'
        ? nodeText(first).match(/^(\d+)[.)]\s+/)
        : null;
    if (!match) {
      if (first.children) normalizeManualNumberedLists(first.children);
      index += 1;
      continue;
    }
    const start = Number(match[1]);
    const paragraphs: AgreementHtmlNode[] = [];
    let cursor = index;
    while (cursor < nodes.length) {
      const candidate = nodes[cursor];
      const candidateMatch =
        candidate.name?.toLowerCase() === 'p'
          ? nodeText(candidate).match(/^(\d+)[.)]\s+/)
          : null;
      if (
        !candidateMatch ||
        Number(candidateMatch[1]) !== start + paragraphs.length
      )
        break;
      paragraphs.push(candidate);
      cursor += 1;
    }
    if (paragraphs.length < 2) {
      index += 1;
      continue;
    }
    const items = paragraphs.map((paragraph) => {
      stripManualListPrefix(paragraph);
      return {
        type: 'tag',
        name: 'li',
        attribs: {},
        children: paragraph.children ?? [],
      } satisfies AgreementHtmlNode;
    });
    nodes.splice(index, paragraphs.length, {
      type: 'tag',
      name: 'ol',
      attribs: start === 1 ? {} : { start: String(start) },
      children: items,
    });
    index += 1;
  }
}

export function normalizeImportedContractHtml(value: string) {
  const pageBreakHtml =
    '<hr data-page-break="true" class="contract-page-break">';
  const withPageBreaks = value
    .replaceAll(CONTRACT_PAGE_BREAK_TOKEN, pageBreakHtml)
    .replace(/<p>\s*<\/p>/gi, '');
  const root = parseDocument(withPageBreaks) as unknown as {
    children: AgreementHtmlNode[];
  };
  const elements = root.children.filter((node) => node.name);
  let brandTable: AgreementHtmlNode | undefined;

  for (const table of elements.filter(
    (node) => node.name?.toLowerCase() === 'table',
  )) {
    const rows = findDescendants(table, 'tr');
    const rowCells = rows.map((row) =>
      (row.children ?? []).filter((cell) =>
        ['td', 'th'].includes(cell.name?.toLowerCase() ?? ''),
      ),
    );
    const firstCells = rowCells[0] ?? [];
    const isFirstMeaningfulElement =
      elements.find((node) => nodeText(node)) === table;
    const isBrand =
      isFirstMeaningfulElement &&
      rows.length === 1 &&
      firstCells.length === 1 &&
      /dijipeople/i.test(nodeText(table));
    const isMetadata =
      rows.length >= 2 &&
      rowCells.every(
        (cells) => cells.length === 2 && hasDescendant(cells[0], 'strong'),
      );
    const isMapRow =
      rows.length === 1 &&
      firstCells.length === 2 &&
      /^\d+$/.test(nodeText(firstCells[0]));

    if (isBrand) {
      setDocumentRole(table, 'brand');
      brandTable = table;
    } else if (isMetadata) setDocumentRole(table, 'metadata');
    else if (isMapRow) setDocumentRole(table, 'map-row');
    else if (rows.length === 1 && firstCells.length >= 3)
      setDocumentRole(table, 'metrics');
    else if (rows.length === 1 && firstCells.length === 1)
      setDocumentRole(table, 'callout');
    else setDocumentRole(table, 'data');

    const firstRowLooksLikeHeader =
      !isMetadata &&
      rows.length > 1 &&
      firstCells.length > 1 &&
      firstCells.every((cell) => hasDescendant(cell, 'strong'));
    if (firstRowLooksLikeHeader)
      firstCells.forEach((cell) => {
        cell.name = 'th';
      });
  }

  if (brandTable) {
    const brandIndex = elements.indexOf(brandTable);
    const following = elements
      .slice(brandIndex + 1)
      .filter((node) => nodeText(node));
    const title = following.find(
      (node) =>
        node.name?.toLowerCase() === 'p' && hasDescendant(node, 'strong'),
    );
    if (title) {
      title.name = 'h1';
      setDocumentRole(title, 'cover-title');
      const titleIndex = following.indexOf(title);
      const subtitle = following
        .slice(titleIndex + 1)
        .find((node) => node.name?.toLowerCase() === 'p');
      if (subtitle) setDocumentRole(subtitle, 'cover-subtitle');
    }
  }

  const walk = (nodes: AgreementHtmlNode[]) => {
    for (const node of nodes) {
      if (
        node.name?.toLowerCase() === 'p' &&
        node.attribs?.class?.split(/\s+/).includes('small-note')
      )
        setDocumentRole(node, 'small-note');
      if (node.children) walk(node.children);
    }
  };
  walk(root.children);
  normalizeManualNumberedLists(root.children);
  return cleanContractHtml(DomUtils.getOuterHTML(root as never));
}

export async function convertContractDocumentToHtml(file: ContractUploadFile) {
  assertSupportedContractDocument(file);
  if (
    file.mimetype ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const converted = await mammoth.convertToHtml(
      { buffer: file.buffer },
      {
        ignoreEmptyParagraphs: false,
        styleMap: [
          'u => u',
          "p[style-name='Table Text'] => p:fresh",
          "p[style-name='Small Note'] => p.small-note:fresh",
        ],
        transformDocument: preserveMammothPageBreaks,
      },
    );
    return {
      html: normalizeImportedContractHtml(converted.value),
      warnings: converted.messages.map((message) => message.message),
    };
  }
  if (file.mimetype === 'application/pdf') {
    const converted = await pdfParse(file.buffer);
    return {
      html: converted.text
        .split(/\n{2,}/)
        .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
        .join(''),
      warnings: [
        'PDF text was imported without editable source layout. Use DOCX for the best formatting fidelity.',
      ],
    };
  }
  if (file.mimetype === 'text/html')
    return {
      html: cleanContractHtml(file.buffer.toString('utf8')),
      warnings: [],
    };
  return {
    html: file.buffer
      .toString('utf8')
      .split(/\n{2,}/)
      .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
      .join(''),
    warnings: [],
  };
}

type AgreementHtmlNode = {
  type: string;
  name?: string;
  data?: string;
  attribs?: Record<string, string>;
  children?: AgreementHtmlNode[];
};

/** BUG-3554. `CLASSIC` / `SCRIPT` / `FORMAL`, from `TYPED_SIGNATURE_STYLES`
 * (`dto/contracts.dto.ts`) via `SignatureEvidence.typedStyle`. */
type SignatureRenderStyle = 'CLASSIC' | 'SCRIPT' | 'FORMAL';

type AgreementBlock =
  | {
      kind: 'paragraph';
      text: string;
      level?: number;
      quote?: boolean;
      signatureStyle?: SignatureRenderStyle;
    }
  | { kind: 'pageBreak' }
  | { kind: 'image'; data: Buffer; imageType: 'png' | 'jpg'; alt: string }
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
      else if (name === 'p') {
        if (findDescendants(node, 'img').length)
          blocks.push(...splitParagraphAroundImages(node));
        else
          blocks.push({
            kind: 'paragraph',
            text: nodeText(node),
            signatureStyle: signatureStyleOf(node),
          });
      } else if (name === 'blockquote')
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
      } else if (name === 'img') {
        const image = decodeEmbeddedDocumentImage(node.attribs?.src);
        if (image)
          blocks.push({
            kind: 'image',
            data: image.data,
            imageType: image.imageType,
            alt: node.attribs?.alt ?? 'Electronic signature',
          });
      } else if (name === 'hr') {
        if (node.attribs?.['data-page-break'] === 'true')
          blocks.push({ kind: 'pageBreak' });
        else blocks.push({ kind: 'paragraph', text: '--------------------' });
      } else if (node.children) walk(node.children, listDepth);
    }
  };
  walk(root.children);
  return blocks.filter(
    (block) =>
      block.kind === 'table' ||
      block.kind === 'image' ||
      block.kind === 'pageBreak' ||
      block.text.trim().length > 0,
  );
}

/*
 * An executed agreement's signature line is one paragraph —
 * `<p>For X: <img …><span>Signer …</span> &mdash; date</p>` — because the
 * system templates carry their signature tokens inline. Flattening that
 * paragraph to text, as every other paragraph is, silently dropped the drawn
 * or uploaded signature from the signed PDF and DOCX. The paragraph is split
 * at each image instead: the text before it, the image, the text after it.
 */
function splitParagraphAroundImages(paragraph: AgreementHtmlNode) {
  const blocks: AgreementBlock[] = [];
  let pending: AgreementHtmlNode[] = [];
  const flush = () => {
    if (!pending.length) return;
    const segment = { children: pending } as AgreementHtmlNode;
    blocks.push({
      kind: 'paragraph',
      text: DomUtils.getText(pending as never)
        .replace(/\s+/g, ' ')
        .trim(),
      signatureStyle: signatureStyleOf(segment),
    });
    pending = [];
  };
  const visit = (nodes: AgreementHtmlNode[]) => {
    for (const node of nodes) {
      if (node.name?.toLowerCase() === 'img') {
        flush();
        const image = decodeEmbeddedDocumentImage(node.attribs?.src);
        if (image)
          blocks.push({
            kind: 'image',
            data: image.data,
            imageType: image.imageType,
            alt: node.attribs?.alt ?? 'Electronic signature',
          });
      } else if (findDescendants(node, 'img').length)
        visit(node.children ?? []);
      else pending.push(node);
    }
  };
  visit(paragraph.children ?? []);
  flush();
  return blocks;
}

function decodeEmbeddedDocumentImage(value: string | undefined) {
  const match = value?.match(
    /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/,
  );
  if (!match) return null;
  return {
    imageType: match[1] === 'png' ? ('png' as const) : ('jpg' as const),
    data: Buffer.from(match[2], 'base64'),
  };
}

/**
 * BUG-3554. PDFKit ships only the fourteen standard PDF fonts — no script
 * face among them — so "distinct standard fonts" per style, rather than an
 * embedded font file this repository does not otherwise carry, is the fix:
 * Times-Italic reads as the closest standard-font approximation of a script
 * signature, Helvetica as a plain classic mark, Times-Roman as a formal one.
 */
const PDF_SIGNATURE_STYLE_FONT: Record<SignatureRenderStyle, string> = {
  CLASSIC: 'Helvetica',
  SCRIPT: 'Times-Italic',
  FORMAL: 'Times-Roman',
};

// Exported for contracts.domain.spec.ts to assert directly against the
// rendered PDF/DOCX bytes (BUG-3554's drawn-image and typed-style checks) —
// not otherwise part of this module's public service surface.
export async function createPdf(title: string, html: string, appendix = '') {
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
      if (block.kind === 'pageBreak') {
        document.addPage();
        continue;
      }
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
      if (block.kind === 'image') {
        document.image(block.data, { fit: [240, 80] });
        document.moveDown(0.5);
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
        .font(
          block.signatureStyle
            ? PDF_SIGNATURE_STYLE_FONT[block.signatureStyle]
            : block.level
              ? 'Helvetica-Bold'
              : 'Helvetica',
        )
        .fontSize(
          block.signatureStyle
            ? 13
            : block.level
              ? Math.max(11, 19 - block.level * 2)
              : 10,
        )
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

/** BUG-3554. DOCX has real font embedding (unlike PDFKit), so this can name
 * an actual serif face for FORMAL/SCRIPT rather than PDFKit's standard-font
 * substitute; CLASSIC keeps the document's own default (Calibri via Word). */
const DOCX_SIGNATURE_STYLE_FONT: Partial<Record<SignatureRenderStyle, string>> =
  {
    SCRIPT: 'Times New Roman',
    FORMAL: 'Times New Roman',
  };

export async function createDocx(title: string, html: string, appendix = '') {
  const children: Array<Paragraph | Table> = [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, size: 32 })],
      spacing: { after: 400 },
    }),
  ];
  for (const block of extractAgreementDocumentStructure(html)) {
    if (block.kind === 'pageBreak') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }
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
    if (block.kind === 'image') {
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: block.data,
              type: block.imageType,
              transformation: { width: 240, height: 80 },
              altText: {
                title: block.alt,
                description: block.alt,
                name: block.alt,
              },
            }),
          ],
          spacing: { after: 120 },
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
        children: [
          new TextRun({
            text: block.text,
            italics: block.quote || block.signatureStyle === 'SCRIPT',
            font: block.signatureStyle
              ? DOCX_SIGNATURE_STYLE_FONT[block.signatureStyle]
              : undefined,
            size: block.signatureStyle ? 26 : undefined,
          }),
        ],
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

const SIGNATURE_RENDER_STYLES = new Set(['CLASSIC', 'SCRIPT', 'FORMAL']);

/**
 * BUG-3554. The signature line generated by `generateDocument` sits inline
 * inside an ordinary `<p>` (every seeded signature block is
 * `<p>{{signature.x.name}} &mdash; {{signature.x.date}}</p>`), so the whole
 * paragraph is flattened to one line of text by `nodeText` regardless — there
 * is no per-run styling in this renderer. Picking one font for that whole
 * paragraph, from the typed signer's chosen style, is the fix at the altitude
 * this renderer actually works at.
 */
function signatureStyleOf(
  node: AgreementHtmlNode,
): SignatureRenderStyle | undefined {
  const style = findDescendants(node, 'span')
    .map((span) => span.attribs?.['data-signature-style'])
    .find((value): value is string => Boolean(value));
  return style && SIGNATURE_RENDER_STYLES.has(style)
    ? (style as SignatureRenderStyle)
    : undefined;
}
