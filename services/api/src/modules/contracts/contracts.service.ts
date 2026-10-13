import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ContractSigningMode,
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
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  PageBreak,
  PageNumber,
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
  offeredPlaceholderEntities,
  outOfContextPlaceholders,
  unresolvableRequiredPlaceholders,
  type LinkableContract,
} from './placeholder-context';
import { normalizeSignatureTokens } from './signature-tokens';
import {
  assignSignatureSlots,
  insertAdditionalSignatureBlocks,
  SIGNER_SLOT_PREFIX,
  signerOrganization,
  type SignatoryForBlock,
} from './signature-blocks';
import { unwrapPlaceholderMarkup } from './placeholder-markup';
import {
  agreementTermProblems,
  assertAgreementTerms,
  assertTemplateTermRules,
  COLUMN_BACKED_TERMS,
  readTemplateTermRules,
  type TemplateTermRule,
} from './agreement-terms';
import {
  assertDocumentContent,
  assessDocumentContent,
  buildTemplateSigningDefinitions,
  CONTRACT_LIFECYCLE_GATES,
  readTemplateSignerPlan,
  resolveTemplateLifecycleGate,
  TEMPLATE_SIGNER_ROLES,
} from './template-lifecycle';
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
  UpdateContractTemplateDraftDto,
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
import { PARTNER_POST_ACTIVATION_STATUSES } from '@repo/config';
import { agreementCommercialDefaults } from './agreement-commercial-defaults';

/*
 * Partners who have been live (ADR-0026). Agreement activity never moves one of
 * these back into the agreement funnel; the shared list is the one the partner
 * lifecycle uses everywhere else.
 */
const PARTNER_LIVE_STATUSES =
  PARTNER_POST_ACTIVATION_STATUSES as readonly PartnerStatus[];

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
  /*
   * Optional: `Partner.phone` and `Partner.country` are nullable, and a
   * partner agreement must not be blocked on a phone number.
   */
  placeholder(
    'partner.contact.phone',
    'Partner contact phone',
    'PHONE',
    '+966 55 000 0000',
    optional,
  ),
  placeholder(
    'partner.country',
    'Partner country',
    'TEXT',
    'Saudi Arabia',
    optional,
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
  /*
   * The lead's own legal identity, address, signer and billing contact.
   *
   * A lead-sourced agreement already resolved these into `customer.*` (see
   * `resolveSource`), which is the only reason a lead's signer could appear in
   * a document at all — and it meant authoring a document for a prospect
   * required picking "Customer" fields. The Fields panel now offers a lead
   * `lead.*` only (`offeredPlaceholderEntities`), so the lead namespace has to
   * carry what a prospect agreement actually prints. Optional like the rest
   * of `lead.*`: every one of these columns is nullable on `Lead`.
   */
  placeholder(
    'lead.legalName',
    'Lead legal name',
    'TEXT',
    'Gulf Horizon Logistics Company',
    optional,
  ),
  placeholder(
    'lead.registrationNumber',
    'Lead registration number',
    'TEXT',
    'CR-7002146',
    optional,
  ),
  placeholder('lead.taxId', 'Lead tax ID', 'TEXT', '310987654300003', {
    ...optional,
    securityClassification: 'CONFIDENTIAL',
  }),
  placeholder(
    'lead.address',
    'Lead address',
    'ADDRESS',
    'King Fahd Road, Dammam, Eastern Province',
    optional,
  ),
  placeholder(
    'lead.signer.name',
    'Lead authorized signer',
    'TEXT',
    'Amal Hassan',
    optional,
  ),
  placeholder(
    'lead.signer.title',
    'Lead signer title',
    'TEXT',
    'Chief Executive Officer',
    optional,
  ),
  placeholder(
    'lead.signer.email',
    'Lead signer email',
    'EMAIL',
    'amal@gulfhorizon.example',
    optional,
  ),
  placeholder(
    'lead.billingContact.name',
    'Lead billing contact',
    'TEXT',
    'Faisal Rahman',
    optional,
  ),
  placeholder(
    'lead.billingContact.email',
    'Lead billing contact email',
    'EMAIL',
    'billing@gulfhorizon.example',
    optional,
  ),
  placeholder(
    'contract.number',
    'Contract number',
    'LOOKUP',
    'CON-20260730-A13F',
  ),
  /*
   * The agreement's own revision, distinct from the template version it was
   * drafted from: 1 for the first issue for signature, 2 when it is re-issued
   * after a change request, and so on. Never typed in — it is derived from the
   * agreement's signature requests and frozen into each signing version.
   */
  placeholder('contract.version', 'Agreement version', 'INTEGER', '1', {
    description:
      'Revision of this agreement as issued for signature. Derived; increases each time the agreement is re-issued.',
  }),
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
  /*
   * Pilot terms. No record holds them, so they are agreement terms entered on
   * the agreement and frozen into its signing version. The pilot period
   * defaults to the agreement's own effective and expiry dates at creation;
   * a discount defaults to "None" so one appears only where approved.
   */
  placeholder(
    'commercial.pilotType',
    'Pilot arrangement',
    'TEXT',
    'Paid pilot at standard pricing',
    optional,
  ),
  placeholder(
    'commercial.pilotStartDate',
    'Pilot start date',
    'DATE',
    '2026-08-01',
    { ...optional, formattingRule: 'locale-date' },
  ),
  placeholder(
    'commercial.pilotEndDate',
    'Pilot end date',
    'DATE',
    '2026-10-31',
    { ...optional, formattingRule: 'locale-date' },
  ),
  placeholder('commercial.pilotDiscount', 'Pilot discount', 'TEXT', 'None', {
    ...optional,
    defaultValue: 'None',
  }),
  placeholder(
    'commercial.planFeatures',
    'Plan features',
    'REPEATING_COLLECTION',
    '["Employees","Attendance","Leave","Payroll"]',
    {
      ...optional,
      description:
        "Features enabled on the agreed plan, read from the plan's configuration.",
    },
  ),
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
   * ADR-0020. What the Fields panel offers, by agreement subject: a template
   * (`contractType` only) is offered the subject its type declares; an
   * agreement (`contractId`) the subject it is actually with — a lead is
   * offered `lead.*`, a customer `customer.*`, a tenant `tenant.*` plus
   * `customer.*` only where that customer exists (`offeredPlaceholderEntities`).
   * The offer is always a subset of what resolves, so a field the panel lists
   * is a field generation can fill. Neither parameter is required — omitting
   * both returns the full registry, which the template editor's sample
   * preview uses to render examples for whatever an old template contains.
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
            contractType: true,
            counterpartyType: true,
            partnerId: true,
            relatedLeadId: true,
            customerAccountId: true,
            customerOnboardingId: true,
            tenantId: true,
          },
        })
      : null;
    const effectiveType = linked?.contractType ?? contractType;
    const context = effectiveType
      ? offeredPlaceholderEntities(effectiveType, linked)
      : null;
    const allowedEntities = context?.entities ?? null;
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
    return {
      items,
      groups: PLACEHOLDER_GROUP_ORDER,
      // Lets the panel say whose fields it is showing rather than leaving the
      // author to infer it from which groups happen to be missing.
      context: context
        ? {
            contractType: effectiveType,
            subjectType: context.subjectType,
            sourceEntities: [...context.entities],
          }
        : null,
    };
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
    // ADR-0026 D3: the agreement keeps its own commission and currency.
    const commercial = agreementCommercialDefaults(
      dto,
      linkedPartner.commercial,
      reportingCurrency,
    );
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
      'contract.currency': commercial.currencyCode,
      'contract.value': dto.contractValue,
      'contract.commissionPercentage': commercial.commissionPercentage,
      'contract.paymentTerms': dto.paymentTerms,
      'contract.governingLaw': dto.governingLaw,
      'contract.jurisdiction': dto.jurisdiction,
      'contract.renewalNoticeDays': dto.renewalNoticeDays,
      'contract.terminationNoticeDays': dto.terminationNoticeDays,
      'counterparty.name': dto.counterpartyName.trim(),
      'counterparty.email': dto.counterpartyEmail?.trim().toLowerCase(),
      // The pilot runs for the agreement's own term unless agreed otherwise.
      ...(/commercial\.pilot(?:Start|End)Date/.test(
        dto.contentHtml ?? templateVersion?.contentHtml ?? '',
      )
        ? {
            'commercial.pilotStartDate': dto.effectiveDate,
            'commercial.pilotEndDate': dto.expiryDate,
          }
        : {}),
      // Explicit values (a source, or the caller) still win over the record.
      ...partnerValues,
      ...(dto.placeholderValues ?? {}),
    });
    const rawHtml =
      dto.contentHtml ??
      templateVersion?.contentHtml ??
      `<h1>${escapeHtml(dto.title)}</h1>`;
    const contentHtml = cleanContractHtml(rawHtml);
    /*
     * The template's proposed defaults (`agreement-terms.ts`) fill only what no
     * record and no caller supplied, and only for terms the document uses.
     * They are proposals: stored with their own source, editable before send.
     */
    const documentKeys = new Set(
      extractContractPlaceholders(contentHtml).map((item) => item.key),
    );
    /*
     * Precedence: a value a record or the caller supplied wins; then the
     * template's default; then the platform-wide contract setting. A template
     * is more specific than the global setting — the Pakistan pilot agreement
     * states a PKR liability floor whatever the platform default says — but
     * never more specific than what was agreed for this counterparty.
     */
    const suppliedExplicitly = (key: string) =>
      key in (dto.placeholderValues ?? {}) || key in partnerValues;
    const onlyPlatformDefault = (key: string) =>
      !values[key]?.trim() ||
      (!suppliedExplicitly(key) &&
        (agreementTerms as Record<string, unknown>)[key] !== undefined &&
        values[key] ===
          String((agreementTerms as Record<string, unknown>)[key]));
    const templateDefaults: Record<string, string> = Object.fromEntries(
      readTemplateTermRules(
        templateVersion?.fieldDefinitions,
        isRegisteredPlaceholder,
      )
        .filter(
          (rule) =>
            rule.defaultValue &&
            documentKeys.has(rule.key) &&
            onlyPlatformDefault(rule.key),
        )
        .map((rule) => [rule.key, rule.defaultValue!]),
    );
    Object.assign(values, templateDefaults);
    const defaultedDays = (key: string, explicit: number | undefined) =>
      explicit ??
      (templateDefaults[key] ? Number(templateDefaults[key]) : undefined);
    assertValidContractPlaceholderValues(
      extractContractPlaceholders(contentHtml),
      values,
    );
    const contentText = toPlainText(
      renderContractPlaceholders(contentHtml, values),
    );
    /*
     * The template decides who signs and in what order. Only a structured
     * plan is applied (`readTemplateSignerPlan`); a template saved before
     * roles were structured keeps the long-standing defaults below.
     */
    const signerPlan = readTemplateSignerPlan(templateVersion?.signingConfig);
    const signerOrder = (key: string) => {
      if (!signerPlan) return undefined;
      const index = signerPlan.roles.indexOf(
        key as (typeof signerPlan.roles)[number],
      );
      if (index < 0) return undefined;
      return signerPlan.mode === 'PARALLEL' ? 1 : index + 1;
    };
    const platformSignerOrder = signerOrder('PLATFORM_SIGNATORY');
    const counterpartySignerOrder = signerOrder('COUNTERPARTY_SIGNATORY');
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
          // A template's configured order is enforced: the create form always
          // sends a default mode, so it cannot be allowed to override one.
          signingMode: signerPlan?.mode ?? dto.signingMode ?? 'MIXED',
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
          currencyCode: commercial.currencyCode,
          contractValue: dto.contractValue,
          commissionPercentage: commercial.commissionPercentage,
          commissionBasis: dto.commissionBasis,
          paymentTerms: dto.paymentTerms,
          // The agreement's own columns carry a template default too, so the
          // record form and the document state the same term.
          governingLaw:
            dto.governingLaw?.trim() ||
            templateDefaults['contract.governingLaw'] ||
            dto.governingLaw,
          jurisdiction:
            dto.jurisdiction?.trim() ||
            templateDefaults['contract.jurisdiction'] ||
            dto.jurisdiction,
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
          renewalNoticeDays: defaultedDays(
            'contract.renewalNoticeDays',
            dto.renewalNoticeDays,
          ),
          terminationNoticeDays: defaultedDays(
            'contract.terminationNoticeDays',
            dto.terminationNoticeDays,
          ),
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
              isSignatory: platformSignerOrder !== undefined,
              signatureRequired: platformSignerOrder !== undefined,
              signingOrder: platformSignerOrder ?? 1,
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
              isSignatory: !signerPlan || counterpartySignerOrder !== undefined,
              signatureRequired:
                !signerPlan || counterpartySignerOrder !== undefined,
              signingOrder: counterpartySignerOrder ?? 2,
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
            source: key in templateDefaults ? 'template-default' : 'create',
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
        // Repeated in metadata so the notification formatter can name the
        // customer without reading the event's own columns.
        ...(dto.customerAccountId
          ? { customerAccountId: dto.customerAccountId }
          : {}),
      },
    });
    return this.get(user, created.id);
  }

  async createFromSource(
    user: AuthenticatedUser,
    dto: CreateContractFromSourceDto,
  ) {
    this.assertWrite(user);
    let source = await this.resolveSource(dto.sourceType, dto.sourceId);
    const contractType = dto.contractType ?? source.defaultContractType;
    const masterAgreement = await this.assertTenantServiceOrderEligible(
      contractType,
      dto.lifecycleGatePurpose,
      source,
    );
    const signer = normalizeSourceSigner(dto.signer);
    if (signer) {
      /*
       * Owner decision D3. The signer an operator types into the Create
       * Agreement dialog is the customer's authorized signatory — a fact about
       * the customer, not about this one document — so it is written to the
       * CustomerAccount and the agreement then resolves it the ordinary way,
       * through `customerSource()`. It is never passed as a placeholder
       * override: an override path would let any field be typed over, and the
       * next agreement for the same customer would ask again.
       *
       * The pairing is checked with the signer applied *before* anything is
       * written, so a template that is also missing, say, every `tenant.*`
       * field is refused without first altering the customer record.
       */
      if (!source.customerAccountId) {
        throw new BadRequestException({
          code: 'CONTRACT_SIGNER_REQUIRES_CUSTOMER',
          message:
            'A signer can only be recorded for a source linked to a customer ' +
            'account. Add the signer to the lead, or convert it to a customer first.',
        });
      }
      await this.assertSourceCanFillTemplate(
        dto.templateId,
        withSignerValues(source, signer),
      );
      await this.recordCustomerSigner(user, source.customerAccountId, signer);
      source = await this.resolveSource(dto.sourceType, dto.sourceId);
    }
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

    const assessment = assessSourceTemplateFill(
      templateVersion.contentHtml,
      source,
    );
    if (!assessment.unfillable.length) return;

    const { unfillable, namespaces, missingFields, unsupportedFields } =
      assessment;
    const onlySignerMissing =
      !unsupportedFields.length &&
      missingFields.every((field) => field.collectable);

    throw new BadRequestException({
      code: 'CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE',
      /*
       * Two different problems, two different instructions. A customer that
       * simply has no authorized signer on file is fixed by entering one — the
       * Create Agreement dialog collects it (owner decision D3). A source that
       * can never carry a namespace (a customer asked for `tenant.*`) is fixed
       * only by choosing another source or template, and saying "enter the
       * missing fields" there would send the operator looking for inputs that
       * do not exist.
       */
      message: onlySignerMissing
        ? `This customer has no authorized signer on record ` +
          `(${missingFields.map((field) => field.label).join(', ')}). ` +
          `Enter the signer to create this agreement, or add them to the ` +
          `customer record first.`
        : `This template needs details a ${source.counterpartyType.toLowerCase()} ` +
          `does not carry (${namespaces.join(', ')}), so the document would be ` +
          `generated with those fields blank. Create it from a source that has ` +
          `them — a provisioned tenant or an onboarding — or choose a template ` +
          `written for this source.`,
      details: {
        unfillable,
        namespaces,
        missingFields,
        unsupportedFields,
        // Read by the standard error contract into `fieldErrors`, so a client
        // can show each missing field without parsing the message.
        fieldErrors: [
          ...missingFields.map((field) => ({
            field: field.key,
            message: `${field.label} is required.`,
          })),
          ...unsupportedFields.map((key) => ({
            field: key,
            message: `${key} cannot be supplied by a ${source.counterpartyType.toLowerCase()}.`,
          })),
        ],
      },
    });
  }

  /**
   * Which published templates the chosen source can actually fill, and why
   * not where it cannot — so the Create Agreement dialog can disable a
   * template before the operator submits, instead of reporting the refusal
   * afterwards. Same rule, same function (`assessSourceTemplateFill`) as the
   * check `createFromSource` enforces, so the two can never disagree about a
   * template: the dialog is a preview of the guard, not a second guard.
   *
   * Guarded like `from-source` itself (contracts.manage) because its only use
   * is choosing what to create, and it reads the source record to answer.
   */
  async templateEligibility(
    user: AuthenticatedUser,
    sourceType: CreateContractFromSourceDto['sourceType'],
    sourceId: string,
  ) {
    this.assertWrite(user);
    const source = await this.resolveSource(sourceType, sourceId);
    const templates = await this.prisma.contractTemplate.findMany({
      where: { isActive: true, archivedAt: null },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        contractType: true,
        versions: {
          where: { isPublished: true },
          orderBy: { version: 'desc' },
          take: 1,
          select: { contentHtml: true },
        },
      },
    });
    return {
      sourceType,
      sourceId,
      counterpartyType: source.counterpartyType,
      // Whether a missing signer can be entered inline at all: it is written
      // to a CustomerAccount, so a source without one cannot take it.
      canCollectSigner: Boolean(source.customerAccountId),
      signer: {
        name: stringValue(
          source.placeholderValues['customer.primarySigner.name'],
        ),
        title: stringValue(
          source.placeholderValues['customer.primarySigner.title'],
        ),
        email: stringValue(
          source.placeholderValues['customer.primarySigner.email'],
        ),
      },
      items: templates
        .filter((template) => template.versions[0]?.contentHtml)
        .map((template) => {
          const assessment = assessSourceTemplateFill(
            template.versions[0].contentHtml,
            source,
          );
          const eligible = assessment.unfillable.length === 0;
          return {
            templateId: template.id,
            name: template.name,
            contractType: template.contractType,
            eligible,
            /*
             * ELIGIBLE        create as is
             * NEEDS_SIGNER    create once the operator enters the signer
             * INELIGIBLE      this source can never fill it, or the record is
             *                 missing data only the record's own page can fix
             */
            status: eligible
              ? 'ELIGIBLE'
              : !assessment.unsupportedFields.length &&
                  assessment.missingFields.every((field) => field.collectable)
                ? 'NEEDS_SIGNER'
                : 'INELIGIBLE',
            missingFields: assessment.missingFields,
            unsupportedFields: assessment.unsupportedFields,
          };
        }),
    };
  }

  /*
   * Writes the signer typed into the Create Agreement dialog onto the
   * customer account, audited with a before/after snapshot of the three
   * fields. Only the fields actually provided are written; one left out keeps
   * whatever the record already holds, so entering a missing title cannot
   * blank an existing name.
   */
  private async recordCustomerSigner(
    user: AuthenticatedUser,
    customerAccountId: string,
    signer: ContractSourceSigner,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const before = await tx.customerAccount.findUnique({
        where: { id: customerAccountId },
        select: {
          authorizedSignerName: true,
          authorizedSignerTitle: true,
          authorizedSignerEmail: true,
        },
      });
      if (!before)
        throw new NotFoundException('Customer source was not found.');
      const data = {
        ...(signer.name ? { authorizedSignerName: signer.name } : {}),
        ...(signer.title ? { authorizedSignerTitle: signer.title } : {}),
        ...(signer.email ? { authorizedSignerEmail: signer.email } : {}),
      };
      const after = await tx.customerAccount.update({
        where: { id: customerAccountId },
        data,
        select: {
          authorizedSignerName: true,
          authorizedSignerTitle: true,
          authorizedSignerEmail: true,
        },
      });
      await this.auditService.log(
        {
          tenantId: 'platform',
          actorUserId: user.userId,
          action: 'CUSTOMER_AUTHORIZED_SIGNER_RECORDED',
          entityType: 'CustomerAccount',
          entityId: customerAccountId,
          sourceModule: 'contracts',
          beforeSnapshot: before,
          afterSnapshot: after,
        },
        tx,
      );
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
        // A copy keeps the source's own commission, not today's partner default.
        commissionPercentage:
          source.commissionPercentage == null
            ? undefined
            : Number(source.commissionPercentage),
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
    const revisionRow = agreementRevisionRow(contract.signatureRequests.length);
    const storedValues = [
      ...contract.placeholderValues.filter(
        (item) =>
          (!isSignaturePlaceholderKey(item.key) ||
            item.source === 'signature') &&
          !DERIVED_PLACEHOLDER_KEYS.has(item.key),
      ),
      revisionRow,
    ];
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
    // The template's mandatory terms, and what is wrong with each right now —
    // the same check the send applies, so the operator sees it before sending.
    const termRules = await this.agreementTermRules(contract);
    const requiredTerms = new Set(
      termRules.filter((rule) => rule.required).map((rule) => rule.key),
    );
    const termProblems = new Map(
      agreementTermProblems(
        termRules,
        new Set(definitions.map((definition) => definition.key)),
        resolved,
        placeholderLabel,
      ).map((problem) => [problem.field, problem.message]),
    );
    return {
      items: definitions.map((definition) => ({
        key: definition.key,
        label: definition.label,
        description: definition.description,
        dataType: definition.dataType,
        required: definition.required || requiredTerms.has(definition.key),
        problem: termProblems.get(definition.key) ?? null,
        group: placeholderGroup(definition.key),
        exampleValue: definition.exampleValue,
        source: sources.get(definition.key) ?? null,
        /*
         * The signature namespace — marks, names and dates — is produced by
         * signing, never typed in here, and a derived value is owned by the
         * contract field it mirrors. Column-backed terms are edited on the
         * agreement record, whose next save would overwrite a value typed here.
         */
        editable:
          !isSignaturePlaceholderKey(definition.key) &&
          sources.get(definition.key) !== 'derived' &&
          !(
            COLUMN_BACKED_TERMS.has(definition.key) &&
            termRules.some((rule) => rule.key === definition.key)
          ),
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
            undefined,
            partySignatories(contract.parties),
          )
        : '',
      resolvedHtml: version
        ? renderContractVersionHtml(
            omitPlatformSignatureLines(
              version.contentHtml,
              platformSignsContract(contract.parties),
            ),
            [...contract.placeholderValues, revisionRow],
            'display',
            requiredTerms,
            partySignatories(contract.parties),
          )
        : '',
      termProblems: [...termProblems.entries()].map(([field, message]) => ({
        field,
        message,
      })),
      contentIssues: version
        ? assessDocumentContent(version.contentHtml, isRegisteredPlaceholder)
        : [],
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
    /*
     * BUG-3668. Field values are agreement content like every other edit, so
     * the shared immutability rule applies here too. Without it an executed
     * agreement was refused only incidentally — its frozen version has no
     * editable placeholder left — which a template with one would not be.
     */
    this.assertAgreementEditable(contract.status);
    const version = contract.versions.find(
      (item) => item.version === contract.currentVersionNumber,
    );
    if (!version)
      throw new BadRequestException('Create a contract version first.');
    const definitions = extractContractPlaceholders(version.contentHtml);
    const allowed = new Map(
      definitions
        .filter(
          (definition) =>
            !isSignaturePlaceholderKey(definition.key) &&
            !DERIVED_PLACEHOLDER_KEYS.has(definition.key),
        )
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
    const usage = await this.prisma.contractVersion.groupBy({
      by: ['templateVersionId'],
      where: { templateVersionId: { in: item.versions.map((row) => row.id) } },
      _count: { _all: true },
    });
    const agreementsByVersion = new Map(
      usage.map((row) => [row.templateVersionId, row._count._all]),
    );
    return {
      ...normalizeContractTemplate(item),
      contextIssues: this.templateContextIssues(item),
      versions: item.versions.map((version, index) => {
        const agreementCount = agreementsByVersion.get(version.id) ?? 0;
        return {
          ...version,
          agreementCount,
          // Mirrors `assertTemplateVersionEditable`; the API still decides.
          editable:
            index === 0 &&
            !version.isPublished &&
            !version.publishedAt &&
            agreementCount === 0,
          contentIssues: assessDocumentContent(
            version.contentHtml,
            isRegisteredPlaceholder,
          ),
        };
      }),
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
    if (dto.publish) this.assertTemplatePublishable(contentHtml);
    assertTemplateTermRules(
      readTemplateTermRules(dto.fieldDefinitions, isRegisteredPlaceholder),
      placeholderLabel,
    );
    const lifecycleGatePurpose =
      resolveTemplateLifecycleGate(
        dto.lifecycleGatePurpose,
        dto.contractType,
      ) ?? null;
    const signing = this.templateSigningFields(dto, dto.signingMode ?? 'MIXED');
    const created = await this.prisma.contractTemplate.create({
      data: {
        key: dto.key.trim().toUpperCase(),
        name: dto.name.trim(),
        contractType: dto.contractType,
        description: dto.description,
        documentMode: dto.documentMode ?? 'EDITOR',
        signingMode: dto.signingMode ?? 'MIXED',
        lifecycleGatePurpose,
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
            ...signing,
            lifecycleGatePurpose,
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
    if (dto.publish) this.assertTemplatePublishable(contentHtml);
    assertTemplateTermRules(
      readTemplateTermRules(dto.fieldDefinitions, isRegisteredPlaceholder),
      placeholderLabel,
    );
    const requestedGate = resolveTemplateLifecycleGate(
      dto.lifecycleGatePurpose,
      template.contractType,
    );
    const lifecycleGatePurpose =
      requestedGate === undefined
        ? template.lifecycleGatePurpose
        : requestedGate;
    const signing = this.templateSigningFields(dto, template.signingMode);
    const version = await this.prisma.$transaction(async (tx) => {
      if (dto.publish) {
        // Superseded, not erased: `publishedAt` stays as the record that this
        // version was once the one agreements were drafted from.
        await tx.contractTemplateVersion.updateMany({
          where: { templateId, isPublished: true },
          data: { isPublished: false },
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
          /*
           * The editor does not send term rules, so a new version saved from
           * it inherits the latest version's rather than silently dropping
           * the template's mandatory terms and defaults.
           */
          fieldDefinitions: (dto.fieldDefinitions ??
            template.versions[0]?.fieldDefinitions ??
            Prisma.JsonNull) as Prisma.InputJsonValue,
          ...signing,
          lifecycleGatePurpose,
          changeSummary: dto.changeSummary?.trim() || null,
          isPublished: dto.publish ?? false,
          publishedAt: dto.publish ? new Date() : null,
          createdById: user.userId,
        },
      });
      await tx.contractTemplate.update({
        where: { id: templateId },
        data: { lifecycleGatePurpose, updatedById: user.userId },
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
        documentMode: source.documentMode,
        signingMode: source.signingMode,
        lifecycleGatePurpose: source.lifecycleGatePurpose,
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
            fieldDefinitions: latest.fieldDefinitions ?? Prisma.JsonNull,
            partyDefinitions: latest.partyDefinitions ?? Prisma.JsonNull,
            signingConfig: latest.signingConfig ?? Prisma.JsonNull,
            lifecycleGatePurpose: latest.lifecycleGatePurpose,
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

  /** The supported gates and signer roles, for the template editor. */
  templateOptions(user: AuthenticatedUser) {
    this.assertPlatform(user);
    return {
      lifecycleGates: CONTRACT_LIFECYCLE_GATES.map((gate) => ({
        key: gate.key,
        label: gate.label,
        contractTypes: gate.contractTypes,
      })),
      signerRoles: TEMPLATE_SIGNER_ROLES.map((role) => ({
        key: role.key,
        label: role.label,
        side: role.side,
      })),
    };
  }

  /**
   * Save the template's current draft in place.
   *
   * Every save used to create a new version, so a template could not be
   * worked on without leaving a trail of versions nobody meant to keep. Only
   * the latest version may be edited, and only while it is unpublished and no
   * agreement has been drafted from it — a published version, or one an
   * agreement points at, is changed by creating a new draft instead.
   */
  async updateTemplateDraft(
    user: AuthenticatedUser,
    templateId: string,
    versionId: string,
    dto: UpdateContractTemplateDraftDto,
  ) {
    this.assertWrite(user);
    const { template, version } = await this.loadTemplateVersion(
      templateId,
      versionId,
    );
    await this.assertTemplateVersionEditable(template, version);
    const contentHtml =
      dto.contentHtml === undefined
        ? undefined
        : cleanContractHtml(dto.contentHtml);
    if (contentHtml !== undefined)
      this.assertTemplatePlaceholdersInContext(
        template.contractType,
        contentHtml,
      );
    const requestedGate = resolveTemplateLifecycleGate(
      dto.lifecycleGatePurpose,
      template.contractType,
    );
    const signing =
      dto.requiredSignerRoles === undefined
        ? {}
        : this.templateSigningFields(dto, template.signingMode);
    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.contractTemplateVersion.update({
        where: { id: version.id },
        data: {
          ...(dto.title !== undefined ? { title: dto.title } : {}),
          ...(contentHtml !== undefined
            ? {
                contentHtml,
                contentText: toPlainText(contentHtml),
                placeholders: extractContractPlaceholders(
                  contentHtml,
                ) as Prisma.InputJsonValue,
              }
            : {}),
          ...(dto.changeSummary !== undefined
            ? { changeSummary: dto.changeSummary.trim() || null }
            : {}),
          ...(requestedGate !== undefined
            ? { lifecycleGatePurpose: requestedGate }
            : {}),
          ...signing,
        },
      });
      await tx.contractTemplate.update({
        where: { id: templateId },
        data: {
          ...(requestedGate !== undefined
            ? { lifecycleGatePurpose: requestedGate }
            : {}),
          updatedById: user.userId,
        },
      });
      return saved;
    });
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'CONTRACT_TEMPLATE_DRAFT_UPDATED',
      entityType: 'ContractTemplate',
      entityId: templateId,
      beforeSnapshot: {
        version: version.version,
        title: version.title,
        contentSha256: sha256(version.contentHtml),
        lifecycleGatePurpose: version.lifecycleGatePurpose,
      },
      afterSnapshot: {
        version: updated.version,
        title: updated.title,
        contentSha256: sha256(updated.contentHtml),
        lifecycleGatePurpose: updated.lifecycleGatePurpose,
      },
    });
    return updated;
  }

  /**
   * Make one version the template's published version. The previous one is
   * superseded, never altered; agreements already drafted keep pointing at
   * the version they were drafted from. Publishing an older version is how a
   * template is rolled back.
   */
  async publishTemplateVersion(
    user: AuthenticatedUser,
    templateId: string,
    versionId: string,
  ) {
    this.assertWrite(user);
    const { template, version } = await this.loadTemplateVersion(
      templateId,
      versionId,
    );
    if (version.isPublished)
      throw new BadRequestException('This version is already published.');
    this.assertTemplatePlaceholdersInContext(
      template.contractType,
      version.contentHtml,
    );
    this.assertTemplatePublishable(version.contentHtml);
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.contractTemplateVersion.updateMany({
        where: { templateId, isPublished: true },
        data: { isPublished: false },
      }),
      this.prisma.contractTemplateVersion.update({
        where: { id: version.id },
        data: { isPublished: true, publishedAt: now },
      }),
      this.prisma.contractTemplate.update({
        where: { id: templateId },
        data: { updatedById: user.userId },
      }),
    ]);
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'CONTRACT_TEMPLATE_VERSION_PUBLISHED',
      entityType: 'ContractTemplate',
      entityId: templateId,
      beforeSnapshot: {
        publishedVersion:
          template.versions.find((item) => item.isPublished)?.version ?? null,
      },
      afterSnapshot: { publishedVersion: version.version },
    });
    return this.getTemplate(user, templateId);
  }

  /**
   * Withdraw the published version so no new agreement is drafted from it.
   * Agreements already drafted are unaffected. A template left with nothing
   * published cannot be active, so it is deactivated in the same step rather
   * than left offering a template every create would refuse.
   */
  async unpublishTemplateVersion(
    user: AuthenticatedUser,
    templateId: string,
    versionId: string,
  ) {
    this.assertWrite(user);
    const { template, version } = await this.loadTemplateVersion(
      templateId,
      versionId,
    );
    if (!version.isPublished)
      throw new BadRequestException('This version is not published.');
    await this.prisma.$transaction([
      this.prisma.contractTemplateVersion.update({
        where: { id: version.id },
        data: { isPublished: false },
      }),
      this.prisma.contractTemplate.update({
        where: { id: templateId },
        data: { isActive: false, updatedById: user.userId },
      }),
    ]);
    await this.auditService.log({
      tenantId: 'platform',
      actorUserId: user.userId,
      action: 'CONTRACT_TEMPLATE_VERSION_UNPUBLISHED',
      entityType: 'ContractTemplate',
      entityId: templateId,
      beforeSnapshot: {
        publishedVersion: version.version,
        isActive: template.isActive,
      },
      afterSnapshot: { publishedVersion: null, isActive: false },
    });
    return this.getTemplate(user, templateId);
  }

  private async loadTemplateVersion(templateId: string, versionId: string) {
    const template = await this.prisma.contractTemplate.findUnique({
      where: { id: templateId },
      include: { versions: { orderBy: { version: 'desc' } } },
    });
    if (!template)
      throw new NotFoundException('Contract template was not found.');
    const version = template.versions.find((item) => item.id === versionId);
    if (!version)
      throw new NotFoundException('Template version was not found.');
    return { template, version };
  }

  private async assertTemplateVersionEditable(
    template: { versions: Array<{ id: string }> },
    version: { id: string; isPublished: boolean; publishedAt: Date | null },
  ) {
    const reason = version.isPublished
      ? 'it is published'
      : version.publishedAt
        ? 'it has been published before'
        : template.versions[0]?.id !== version.id
          ? 'a newer version exists'
          : (await this.prisma.contractVersion.count({
                where: { templateVersionId: version.id },
              })) > 0
            ? 'agreements have been drafted from it'
            : null;
    if (reason)
      throw new ConflictException({
        code: 'CONTRACT_TEMPLATE_VERSION_LOCKED',
        message: `This version cannot be edited because ${reason}. Save your changes as a new draft version instead.`,
      });
  }

  /**
   * The term rules of the template version an agreement was drafted from.
   * Read from its first template-linked version: later revisions saved from
   * the agreement editor do not carry `templateVersionId`, and losing the
   * rules on the first edit would let a mandatory term go out blank.
   */
  private async agreementTermRules(contract: {
    id: string;
    templateId: string | null;
  }): Promise<TemplateTermRule[]> {
    if (!contract.templateId) return [];
    const origin = await this.prisma.contractVersion.findFirst({
      where: { contractId: contract.id, templateVersionId: { not: null } },
      orderBy: { version: 'asc' },
      select: { templateVersion: { select: { fieldDefinitions: true } } },
    });
    return readTemplateTermRules(
      origin?.templateVersion?.fieldDefinitions,
      isRegisteredPlaceholder,
    );
  }

  private assertTemplatePublishable(contentHtml: string) {
    assertDocumentContent(
      assessDocumentContent(contentHtml, isRegisteredPlaceholder),
      ['error'],
      'publishing it',
    );
  }

  private templateSigningFields(
    dto: {
      requiredSignerRoles?: string[];
      signingMode?: ContractSigningMode;
      partyDefinitions?: Array<Record<string, unknown>>;
      signingConfig?: Record<string, unknown>;
    },
    fallbackMode: ContractSigningMode,
  ) {
    if (dto.requiredSignerRoles !== undefined) {
      const built = buildTemplateSigningDefinitions(
        dto.requiredSignerRoles,
        dto.signingMode ?? fallbackMode,
      );
      return {
        partyDefinitions: built.partyDefinitions as Prisma.InputJsonValue,
        signingConfig: built.signingConfig as Prisma.InputJsonValue,
      };
    }
    return {
      partyDefinitions: dto.partyDefinitions as Prisma.InputJsonValue,
      signingConfig: dto.signingConfig as Prisma.InputJsonValue,
    };
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
    /*
     * `{{contract.version}}` is derived, never stored, and the document-fields
     * view rightly offers no way to type it. Validating only stored values
     * reported it as "Agreement version is required." with nowhere to enter
     * it; it is computed here exactly as the send freeze computes it.
     */
    const placeholderValues = Object.fromEntries(
      [
        ...contract.placeholderValues.filter(
          (item) => !DERIVED_PLACEHOLDER_KEYS.has(item.key),
        ),
        agreementRevisionRow(contract.signatureRequests.length),
      ].map((item) => [item.key, item.value]),
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
      /*
       * ADR-0026 D3. An amendment or renewal carries the agreed terms of the
       * agreement it derives from — not whatever the partner's default has
       * become since, which `create` would otherwise snapshot.
       */
      currencyCode: source.currencyCode ?? undefined,
      commissionPercentage:
        source.commissionPercentage == null
          ? undefined
          : Number(source.commissionPercentage),
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
    const revisionRow = agreementRevisionRow(contract.signatureRequests.length);
    const placeholderRows = [
      ...contract.placeholderValues.filter(
        (item) => !DERIVED_PLACEHOLDER_KEYS.has(item.key),
      ),
      revisionRow,
    ];
    const placeholderSnapshot = Object.fromEntries(
      placeholderRows
        .filter((item) => !isSignaturePlaceholderKey(item.key))
        .map((item) => [item.key, item.value]),
    );
    const placeholderDefinitions = extractContractPlaceholders(
      version.contentHtml,
    );
    this.assertPlaceholdersInContext(contract, placeholderDefinitions);
    /*
     * The template's mandatory terms first, with what to enter: a governing
     * law, a liability floor or a notice period that is missing or malformed
     * must stop the send, not print as a broken sentence in a signed copy.
     */
    assertAgreementTerms(
      agreementTermProblems(
        await this.agreementTermRules(contract),
        new Set(placeholderDefinitions.map((item) => item.key)),
        placeholderSnapshot,
        placeholderLabel,
      ),
    );
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
      placeholderRows,
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
    /*
     * What is frozen here is what the counterparty signs. A fill-in note
     * ("[REQUIRED — CONFIRM]"), a "Status: Draft" line or a broken placeholder
     * must never reach it; the operator completes them on this agreement's
     * draft. Nothing is rewritten for them — these may be negotiated terms.
     */
    assertDocumentContent(
      assessDocumentContent(resolvedHtml, isRegisteredPlaceholder),
      ['error', 'issue'],
      'sending it for signature',
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
        // ADR-0026 — a renewal sent to a live partner must not demote it.
        await tx.partner.updateMany({
          where: {
            id: contract.partnerId,
            status: { notIn: [...PARTNER_LIVE_STATUSES] },
          },
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
      /*
       * Identifiers only — the notification formatter names the agreement and
       * its customer from these. Recipient e-mails and the document body stay
       * out: platform-event metadata is broadly readable and long-lived.
       */
      metadata: {
        signatureRequestId: request.id,
        requestNumber: request.requestNumber,
        signingMode: request.signingMode,
        recipientCount: request.recipients.length,
        contractNumber: contract.contractNumber,
        ...(contract.customerAccountId
          ? { customerAccountId: contract.customerAccountId }
          : {}),
        // Lets the platform's own signer be told the request is waiting on them.
        ...(platformSigns ? { awaitingPlatformSignature: true } : {}),
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
        /*
         * The frozen version plus a block for every signer its template has
         * no slot for. `sha256` remains the hash of the frozen version: the
         * generated blocks hold only signature tokens, filled at signing.
         */
        contentHtml: insertAdditionalSignatureBlocks(
          recipient.signatureRequest.contractVersion.contentHtml,
          recipientSignatories(recipient.signatureRequest.recipients),
        ),
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
          signerPreviewSlot(recipient, recipient.signatureRequest.recipients),
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
          /*
           * ADR-0026. Signing set AGREEMENT_EXECUTED unconditionally, so a
           * re-signed or renewed master agreement took an ACTIVE partner back
           * to the onboarding funnel. Only a partner still before activation
           * moves; the timeline entry below records the signing either way.
           */
          await tx.partner.updateMany({
            where: {
              id: recipient.signatureRequest.contract.partnerId,
              status: { notIn: [...PARTNER_LIVE_STATUSES] },
            },
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
            // One completion notice per signer per request, however many
            // times the final step is retried.
            idempotencyKey: `signature-completed:${recipient.signatureRequestId}:${signer.email.toLowerCase()}`,
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
        // Identifiers for the notification formatter; no signer e-mail.
        contractNumber: recipient.signatureRequest.contract.contractNumber,
        ...(recipient.signatureRequest.contract.customerAccountId
          ? {
              customerAccountId:
                recipient.signatureRequest.contract.customerAccountId,
            }
          : {}),
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
        // Whether DijiPeople signs decides whether its signature line appears;
        // the required signatories decide how many signature blocks a draft shows.
        parties: {
          select: {
            id: true,
            partyType: true,
            name: true,
            legalName: true,
            email: true,
            isPrimary: true,
            isSignatory: true,
            signatureRequired: true,
            signingOrder: true,
          },
        },
        _count: { select: { signatureRequests: true } },
      },
    });
    if (!contract || !contract.versions[0])
      throw new NotFoundException('Contract document was not found.');
    const version = contract.versions[0];
    const scope = this.contractStorageScope(contract.tenantId);
    let documentHtml = version.contentHtml;
    let appendixHtml = '';
    /*
     * The agreement version the document itself prints. A frozen version
     * carries the `{{contract.version}}` it was issued with; a draft shows the
     * revision its next issue will carry. The executed copy's appendix used to
     * print `ContractVersion.version` — the internal record counter, which the
     * signing freeze advances — so the cover of CON-20261012-E7421CC1 said
     * Version 1 and its audit certificate Version 2.
     */
    const frozenSnapshot =
      version.placeholderSnapshot &&
      typeof version.placeholderSnapshot === 'object' &&
      !Array.isArray(version.placeholderSnapshot)
        ? (version.placeholderSnapshot as Record<string, unknown>)
        : null;
    const agreementVersion =
      typeof frozenSnapshot?.['contract.version'] === 'string'
        ? frozenSnapshot['contract.version']
        : agreementRevisionRow(contract._count.signatureRequests).value;
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
                select: {
                  partyType: true,
                  name: true,
                  legalName: true,
                  isPrimary: true,
                },
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
      appendixHtml = signatureEvidenceAppendixHtml({
        contractNumber: contract.contractNumber,
        agreementVersion,
        signingRecordVersion: version.version,
        documentSha256: version.contentSha256,
        requestNumber: completedRequest?.requestNumber ?? '',
        evidence: evidenceRows,
        signatureEvents,
        timeline,
      });
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
        [
          ...contract.placeholderValues.filter(
            (item) => !DERIVED_PLACEHOLDER_KEYS.has(item.key),
          ),
          agreementRevisionRow(contract._count.signatureRequests),
        ],
        'display',
        new Set(
          (await this.agreementTermRules(contract))
            .filter((rule) => rule.required)
            .map((rule) => rule.key),
        ),
        partySignatories(contract.parties),
      );
    const coverValues: Record<string, unknown> =
      frozenSnapshot ??
      Object.fromEntries(
        contract.placeholderValues.map((item) => [item.key, item.value]),
      );
    const cover = agreementCoverDetails({
      contractNumber: contract.contractNumber,
      agreementVersion,
      counterpartyName: contract.counterpartyName,
      values: coverValues,
      status: fromEvidence
        ? 'Executed'
        : version.status === ContractVersionStatus.SENT_FOR_SIGNATURE
          ? 'Issued for signature'
          : 'Draft — not for signature',
      executedAt: fromEvidence ? (contract.signedAt ?? null) : null,
    });
    const buffer =
      format === 'pdf'
        ? await createPdf(contract.title, documentHtml, '', {
            cover,
            appendixHtml,
          })
        : await createDocx(contract.title, documentHtml, '', {
            cover,
            appendixHtml,
          });
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
      const planFeatures = await this.planFeatureList(lead.agreedPlanId);
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
            'lead.legalName': lead.legalCompanyName,
            'lead.registrationNumber': lead.registrationNumber,
            'lead.taxId': lead.taxId,
            'lead.address': address,
            'lead.signer.name': lead.authorizedSignerName,
            'lead.signer.title': lead.authorizedSignerTitle,
            'lead.signer.email': lead.authorizedSignerEmail,
            'lead.billingContact.name': lead.billingContactName,
            'lead.billingContact.email': lead.billingContactEmail,
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
            'commercial.planFeatures': planFeatures,
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
      const planFeatures = await this.planFeatureList(
        onboarding.selectedPlanId,
      );
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
          /*
           * The legacy signer keys historically carried the workspace's first
           * administrator, which a legacy template still renders. Once the
           * customer account records an actual authorized signer that wins —
           * the canonical `customer.primarySigner.*` keys come from it through
           * `customerSource()` and the aliases backfill the legacy ones — so
           * the two generations of template name the same person. The
           * administrator is never promoted into the canonical keys: running
           * the workspace and signing for the company are different authority.
           */
          ...(onboarding.customer.authorizedSignerName
            ? {}
            : {
                'customer.primarySigner': adminName,
                'customer.primarySignerEmail': onboarding.primaryOwnerWorkEmail,
              }),
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
            'commercial.planName': onboarding.selectedPlan?.name,
            'commercial.planFeatures': planFeatures,
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
    const planFeatures = await this.planFeatureList(subscription?.planId);
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
          'commercial.planFeatures': planFeatures,
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

  /**
   * `commercial.planFeatures`: the features enabled on a plan, read from the
   * plan's own configuration so an agreement lists what the plan actually
   * grants rather than a hand-typed copy of it.
   */
  private async planFeatureList(planId: string | null | undefined) {
    if (!planId) return undefined;
    const features = await this.prisma.planFeature.findMany({
      where: { planId, isEnabled: true },
      select: { featureKey: true },
      orderBy: { featureKey: 'asc' },
    });
    return features.length
      ? JSON.stringify(features.map((feature) => labelize(feature.featureKey)))
      : undefined;
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
      // A decline or change request closes the request, so one per event.
      idempotencyKey: `${eventCode}:${signatureRequestId}`,
    });
  }

  private async findRecipient(token: string) {
    const recipient = await this.prisma.signatureRecipient.findUnique({
      where: { accessTokenHash: sha256(token) },
      include: {
        // The party decides which signature slot the mark fills.
        party: { select: { partyType: true } },
        signatureRequest: {
          include: {
            contract: true,
            contractVersion: true,
            // Every signer's party, so the signing page shows a block for each.
            recipients: {
              include: {
                party: {
                  select: {
                    partyType: true,
                    isPrimary: true,
                    name: true,
                    legalName: true,
                  },
                },
              },
            },
          },
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
        commercial: null,
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
        phone: true,
        country: true,
        taxId: true,
        defaultCommissionRate: true,
        currencyCode: true,
      },
    });
    return {
      values: partner
        ? partnerPlaceholderValues(partner, contractCommissionPercentage)
        : ({} as Record<string, string>),
      contractPartyType: contractPartyTypeForPartner(partner?.type),
      /* What `create` snapshots into a new agreement (ADR-0026 D3). */
      commercial: partner
        ? {
            defaultCommissionRate: partner.defaultCommissionRate,
            currencyCode: partner.currencyCode,
          }
        : null,
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

/**
 * Every write of document HTML — template versions, agreement drafts,
 * imports — passes through here, so this is also where a signature token is
 * stored in its one canonical spelling (`signature-tokens.ts`). Stored rows
 * written before that are normalised on read by the renderers instead.
 */
export function cleanContractHtml(value: string) {
  return normalizeSignatureTokens(sanitizeContractHtml(value));
}

function sanitizeContractHtml(value: string) {
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
  /** Display only: which missing values to show as a marked gap. */
  markMissing?: (
    key: string,
    definition: ContractPlaceholderDefinition | undefined,
  ) => boolean,
) {
  const values = applyDeprecatedPlaceholderAliases(rawValues);
  const currencyCode = /^[A-Za-z]{3}$/.test(
    (values['contract.currency'] ?? '').trim(),
  )
    ? values['contract.currency'].trim().toUpperCase()
    : undefined;
  return unwrapPlaceholderMarkup(html).replace(
    /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
    (match, key: string) => {
      // A generated signer block's token formats like the counterparty slot's.
      const registryKey = key.startsWith(`signature.${SIGNER_SLOT_PREFIX}`)
        ? `signature.counterparty.${key.split('.').pop()}`
        : key;
      const definition = CONTRACT_PLACEHOLDER_REGISTRY.find(
        (item) => item.key === registryKey,
      );
      const stored = key in values ? String(values[key]) : '';
      /*
       * `defaultValue` is declared on the definition type and was never read.
       * It is now the value a term takes when nothing explicit was agreed —
       * `commercial.pilotDiscount` reads "None" rather than a blank line, so
       * a discount appears only where one was actually recorded.
       */
      const value =
        stored.trim() && !PLACEHOLDER_ARTIFACT_LITERALS.has(stored.trim())
          ? stored
          : (definition?.defaultValue ?? stored);
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
        if (markMissing?.(key, definition)) return missingValueMarker(key);
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

/** Values the platform derives and an operator can never type over. */
export const DERIVED_PLACEHOLDER_KEYS = new Set(['contract.version']);

/**
 * `{{contract.version}}` for an agreement that has been issued for signature
 * `issuedCount` times so far: the revision the next issue (or the current
 * draft's preview) carries. Computed the same way for the preview, the
 * signing freeze and the PDF, so the three cannot print different numbers.
 */
export function agreementRevisionRow(
  issuedCount: number,
): StoredContractPlaceholderValue {
  return {
    key: 'contract.version',
    value: String(issuedCount + 1),
    source: 'derived',
  };
}

export function isRegisteredPlaceholder(key: string) {
  return CONTRACT_PLACEHOLDER_REGISTRY.some((item) => item.key === key);
}

export function placeholderLabel(key: string) {
  return (
    CONTRACT_PLACEHOLDER_REGISTRY.find((item) => item.key === key)?.label ?? key
  );
}

/*
 * What a preview shows where a mandatory value is still missing. Never a
 * blank (which reads as a finished sentence), `undefined` or a raw token: a
 * marked gap the operator can see and fill. Only previews use it — the send
 * gate refuses the document before such a value could be frozen.
 */
function missingValueMarker(key: string) {
  return `<mark data-missing-field="${escapeHtml(key)}">[Missing: ${escapeHtml(placeholderLabel(key))}]</mark>`;
}

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
  return normalizeSignatureTokens(html).replace(
    /<p\b[^>]*>[\s\S]*?<\/p>/gi,
    (paragraph) =>
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

/**
 * An agreement's required signers as configured on its parties — what a
 * preview shows signature blocks for before any request exists. A party that
 * is not a required signatory (a billing contact, an optional signer) gets no
 * block.
 */
export function partySignatories(
  parties:
    | ReadonlyArray<{
        id: string;
        partyType: string;
        name: string;
        legalName?: string | null;
        email?: string | null;
        isPrimary?: boolean | null;
        isSignatory?: boolean | null;
        signatureRequired?: boolean | null;
        signingOrder?: number | null;
      }>
    | null
    | undefined,
): SignatoryForBlock[] {
  const all = parties ?? [];
  return all
    .filter((party) => party.isSignatory && party.signatureRequired)
    .map((party) => ({
      key: party.id,
      partyType: party.partyType,
      isPrimary: party.isPrimary,
      signingOrder: party.signingOrder,
      name: party.name,
      organization: signerOrganization(party, all),
      email: party.email,
    }));
}

/** The required signers of one signature request. */
export function recipientSignatories(
  recipients: ReadonlyArray<{
    id: string;
    name: string;
    email?: string | null;
    isRequired?: boolean | null;
    signingOrder?: number | null;
    party?: {
      partyType: string;
      isPrimary?: boolean | null;
      name?: string | null;
      legalName?: string | null;
    } | null;
  }>,
): SignatoryForBlock[] {
  const parties = recipients
    .map((recipient) => recipient.party)
    .filter((party): party is NonNullable<typeof party> => Boolean(party));
  return recipients
    .filter((recipient) => recipient.isRequired !== false)
    .map((recipient) => ({
      key: recipient.id,
      partyType: recipient.party?.partyType,
      isPrimary: recipient.party?.isPrimary,
      signingOrder: recipient.signingOrder,
      name: recipient.name,
      organization: signerOrganization(recipient.party, parties),
      email: recipient.email,
    }));
}

export function renderContractVersionHtml(
  html: string,
  rows: StoredContractPlaceholderValue[],
  mode: 'freeze' | 'display',
  /** Terms the agreement's template makes mandatory (`agreement-terms.ts`). */
  requiredKeys: ReadonlySet<string> = new Set(),
  /*
   * The agreement's required signers. A preview shows a pending block for
   * each one no template slot covers; freezing never adds them, so the
   * signing version stays the template as resolved (signature-blocks.ts).
   */
  signers: SignatoryForBlock[] = [],
) {
  const source =
    mode === 'display' && signers.length
      ? insertAdditionalSignatureBlocks(html, signers)
      : html;
  const values = Object.fromEntries(
    rows
      .filter(
        (row) =>
          !isSignaturePlaceholderKey(row.key) ||
          (mode === 'display' && row.source === 'signature'),
      )
      .map((row) => [row.key, row.value]),
  );
  // A legacy spelling (`{{ signature.partner.name }}`) is canonicalised first,
  // so it is held back at freeze and filled at signing like any other.
  const rendered = renderContractPlaceholders(
    normalizeSignatureTokens(source),
    values,
    /*
     * A preview never shows a missing mandatory value as a blank or a raw
     * `{{token}}`: registry-required keys and the template's required terms
     * read "[Missing: …]". Freeze keeps tokens so the send gate refuses them.
     */
    mode === 'display'
      ? (key, definition) =>
          !isSignaturePlaceholderKey(key) &&
          (requiredKeys.has(key) || (definition?.required ?? true))
      : undefined,
  );
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
    email?: string | null;
    signingOrder?: number | null;
    party?: {
      partyType: string;
      isPrimary?: boolean | null;
      name?: string | null;
      legalName?: string | null;
    } | null;
  };
};

const SIGNATURE_METHOD_LABELS: Record<string, string> = {
  TYPED: 'Typed signature',
  DRAWN: 'Drawn signature',
  UPLOADED: 'Uploaded signature',
};

/** The signers of an executed version, in the shape signature blocks take. */
function evidenceSignatories(evidenceRows: SignatureEvidenceForRender[]) {
  const parties = evidenceRows
    .map((evidence) => evidence.recipient.party)
    .filter((party): party is NonNullable<typeof party> => Boolean(party));
  return evidenceRows.map(
    (evidence): SignatoryForBlock => ({
      key: evidence.id,
      partyType: evidence.recipient.party?.partyType,
      isPrimary: evidence.recipient.party?.isPrimary,
      signingOrder: evidence.recipient.signingOrder,
      name: evidence.recipient.name,
      organization: signerOrganization(evidence.recipient.party, parties),
      email: evidence.recipient.email,
    }),
  );
}

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
  const signatories = evidenceSignatories(evidenceRows);
  const evidenceByKey = new Map(
    evidenceRows.map((evidence) => [evidence.id, evidence]),
  );
  // One rule for which signer fills which template slot (signature-blocks.ts).
  const { slots } = assignSignatureSlots(signatories);
  const evidenceFor = (slot: string) => {
    if (bySlot.has(slot)) return bySlot.get(slot);
    let evidence: SignatureEvidenceForRender | undefined;
    if (slot.startsWith(SIGNER_SLOT_PREFIX))
      evidence = evidenceByKey.get(slot.slice(SIGNER_SLOT_PREFIX.length));
    else if (slot in slots)
      evidence = slots[slot] ? evidenceByKey.get(slots[slot].key) : undefined;
    else if (evidenceRows.length)
      evidence = evidenceRows[fallbackIndex++ % evidenceRows.length];
    bySlot.set(slot, evidence);
    return evidence;
  };
  const dateDefinition = CONTRACT_PLACEHOLDER_REGISTRY.find(
    (item) => item.key === 'signature.counterparty.date',
  );
  /*
   * Every signer gets a signature block: the template's slots take the
   * signers they resolve to, and a block is generated for each one left over
   * (CON-20261012-E7421CC1 — three signers, two blocks).
   */
  return insertAdditionalSignatureBlocks(html, signatories).replace(
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
      /*
       * The mark (image, or the typed name in its chosen style) on its own
       * line, then one short evidence line. The full evidence — hashes, time
       * zone, verification — belongs to the appendix, not the legal block;
       * this line used to run the method, raw ISO timestamp and hash together
       * into one wrapped sentence beside the signer's name.
       */
      const evidenceLine = [
        'Electronically signed',
        SIGNATURE_METHOD_LABELS[evidence.method] ?? evidence.method,
        formatPlaceholderValue(evidence.signedAt.toISOString(), dateDefinition),
        `Ref. ${evidence.signatureSha256.slice(0, 12)}`,
      ].join(' · ');
      return `${signatureImage ? `<img src="${signatureImage}" alt="${escapeHtml(evidence.recipient.name)} signature" width="240" height="80">` : ''}<span data-signature-metadata="true"${typedStyleAttr}><strong>${escapeHtml(evidence.typedName || evidence.recipient.name)}</strong></span><br><span data-signature-metadata="true">${escapeHtml(evidenceLine)}</span>`;
    },
  );
}

export function extractContractPlaceholders(html: string) {
  return [
    ...new Set(
      [
        ...normalizeSignatureTokens(html).matchAll(
          /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g,
        ),
      ].map((match) => match[1]),
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
 *
 * Since ADR-0026 D3 a new agreement snapshots that default into its own
 * `commissionPercentage` at create (`agreementCommercialDefaults`), so the
 * fallback here matters only for agreements created before the snapshot —
 * which, unsigned, still follow the partner's current default when
 * re-rendered.
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
    phone?: string | null;
    country?: string | null;
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
    'partner.contact.phone': partner.phone,
    'partner.country': partner.country,
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
    authorizedSignerName?: string | null;
    authorizedSignerTitle?: string | null;
    authorizedSignerEmail?: string | null;
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
        /*
         * The catalog declares all three signer placeholders required, and
         * until the CustomerAccount carried them this resolver had nothing to
         * put there — so every customer agreement whose template named its
         * signatory was refused at creation (CONTRACT_SOURCE_CANNOT_FILL_TEMPLATE).
         *
         * Deliberately *not* defaulted from `primaryContact*`. The person who
         * answers the e-mail is not necessarily the person entitled to bind
         * the company, and a contract that names the wrong signatory is worse
         * than one that refuses to be created. A blank signer stays blank and
         * the Create Agreement dialog asks for it (owner decision D3).
         */
        'customer.primarySigner.name': customer.authorizedSignerName,
        'customer.primarySigner.title': customer.authorizedSignerTitle,
        'customer.primarySigner.email':
          customer.authorizedSignerEmail?.toLowerCase(),
      }),
    },
  };
}

/** A signer entered for a source at agreement creation. */
export type ContractSourceSigner = {
  name?: string;
  title?: string;
  email?: string;
};

/*
 * The only placeholders an operator may supply at creation time, and the
 * signer field each one is written to. Everything else a template needs comes
 * from a record; these three are the exception because they are the one gap a
 * customer account commonly has that the operator creating the agreement is
 * also the right person to close (owner decision D3).
 */
export const COLLECTABLE_SIGNER_PLACEHOLDERS: Record<
  string,
  keyof ContractSourceSigner
> = {
  'customer.primarySigner.name': 'name',
  'customer.primarySigner.title': 'title',
  'customer.primarySigner.email': 'email',
};

export type SourceTemplateFillAssessment = {
  /** Every required key the source leaves empty — the original BUG-1541 list. */
  unfillable: string[];
  namespaces: string[];
  /** Keys this kind of source does carry, but this record has no value for. */
  missingFields: Array<{ key: string; label: string; collectable: boolean }>;
  /** Keys in a namespace this source carries nothing for at all. */
  unsupportedFields: string[];
};

/**
 * Whether a source can fill a template, as a pure function so the creation
 * guard and the eligibility preview are the same rule.
 *
 * A missing required field is one of two things, and the difference decides
 * what the operator can do about it:
 *
 *   missing      the source carries this namespace but this record has no
 *                value — fixable on the record (or, for the customer's
 *                signer, inline: `collectable`)
 *   unsupported  the source carries nothing in that namespace — a customer
 *                asked for `tenant.*`. No amount of editing this record helps;
 *                another source or another template does.
 *
 * "Carries the namespace" is read from what the resolver actually produced
 * rather than from a second hand-kept table of which source emits what, which
 * would drift from `resolveSource` the first time either changed.
 */
export function assessSourceTemplateFill(
  contentHtml: string,
  source: Pick<
    ResolvedContractSource,
    'placeholderValues' | 'customerAccountId'
  >,
): SourceTemplateFillAssessment {
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
  const filledAfterSource: readonly string[] = ALWAYS_AVAILABLE_SOURCE_ENTITIES;

  const unfillableDefinitions = extractContractPlaceholders(contentHtml)
    .filter((definition) => definition.required)
    .filter(
      (definition) => !filledAfterSource.includes(definition.sourceEntity),
    )
    .filter((definition) => !values[definition.key]?.trim());

  const carriedNamespaces = new Set(
    Object.entries(values)
      .filter(([, value]) => value.trim())
      .map(([key]) => key.split('.')[0]),
  );
  const missingFields: SourceTemplateFillAssessment['missingFields'] = [];
  const unsupportedFields: string[] = [];
  for (const definition of unfillableDefinitions) {
    const collectable =
      Boolean(source.customerAccountId) &&
      definition.key in COLLECTABLE_SIGNER_PLACEHOLDERS;
    if (collectable || carriedNamespaces.has(definition.sourceEntity)) {
      missingFields.push({
        key: definition.key,
        label: definition.label,
        collectable,
      });
    } else {
      unsupportedFields.push(definition.key);
    }
  }

  const unfillable = unfillableDefinitions.map((definition) => definition.key);
  return {
    unfillable,
    namespaces: [...new Set(unfillable.map((key) => key.split('.')[0]))].sort(),
    missingFields,
    unsupportedFields,
  };
}

/*
 * Trimmed, lower-cased where it is an address, and `undefined` when nothing
 * survives — so `{ name: '  ' }` is treated as no signer rather than as an
 * instruction to write a blank.
 */
function normalizeSourceSigner(
  signer: ContractSourceSigner | undefined,
): ContractSourceSigner | undefined {
  if (!signer) return undefined;
  const normalized = {
    ...(signer.name?.trim() ? { name: signer.name.trim() } : {}),
    ...(signer.title?.trim() ? { title: signer.title.trim() } : {}),
    ...(signer.email?.trim()
      ? { email: signer.email.trim().toLowerCase() }
      : {}),
  };
  return Object.keys(normalized).length ? normalized : undefined;
}

/* The source as it will resolve once the signer has been recorded. */
function withSignerValues(
  source: ResolvedContractSource,
  signer: ContractSourceSigner,
): ResolvedContractSource {
  return {
    ...source,
    placeholderValues: {
      ...source.placeholderValues,
      ...Object.fromEntries(
        Object.entries(COLLECTABLE_SIGNER_PLACEHOLDERS)
          .filter(([, field]) => signer[field])
          .map(([key, field]) => [key, signer[field]]),
      ),
    },
  };
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export const TENANT_PROVISIONING_GATE = 'TENANT_PROVISIONING';

/*
 * Whichever way a signer chose to sign, the result lands in the same two
 * placeholders: the mark itself and the moment it was made. A drawn or uploaded
 * signature keeps its image; a typed one keeps the legal name it was typed as.
 */
/**
 * The preview slot a signer's mark is recorded under. Every counterparty
 * signer used to write `signature.counterparty.*`, so on an agreement with two
 * customer signers the second one's mark replaced the first one's in the
 * primary customer block. A signer no template slot resolves to is recorded
 * under its party's generated block (`partySignatories` keys it by party id).
 */
export function signerPreviewSlot(
  recipient: { id: string; partyId?: string | null },
  recipients: ReadonlyArray<{
    id: string;
    signingOrder?: number | null;
    party?: { partyType: string; isPrimary?: boolean | null } | null;
  }>,
) {
  const { slots } = assignSignatureSlots(
    recipients.map((item) => ({
      key: item.id,
      partyType: item.party?.partyType,
      isPrimary: item.party?.isPrimary,
      signingOrder: item.signingOrder,
    })),
  );
  if (slots.platform?.key === recipient.id) return 'platform';
  if (slots.counterparty?.key === recipient.id) return 'counterparty';
  return `${SIGNER_SLOT_PREFIX}${recipient.partyId ?? recipient.id}`;
}

export function signaturePlaceholderValues(
  partyType: string | null,
  signerName: string,
  signatureDataUrl: string | undefined,
  signedAt: Date,
  /** From `signerPreviewSlot`; the party type decides when it is not known. */
  slotOverride?: string,
) {
  const slot =
    slotOverride ?? (partyType === 'PLATFORM' ? 'platform' : 'counterparty');
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

/*
 * One formatted run of text. PDF and DOCX used to receive each paragraph as
 * a single flattened string, which is why the signed PDF of
 * CON-20261012-E7421CC1 printed "Legal Contracting Party: … Business /
 * Platform: … Authorized Signatory: …" as one run-on sentence: the template's
 * line breaks and bold labels never reached the renderer.
 */
type AgreementRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  /** Evidence text under a signature: smaller and muted. */
  muted?: boolean;
  signatureStyle?: SignatureRenderStyle;
};

/** A paragraph's lines, split at each `<br>`. */
type AgreementLine = AgreementRun[];

type AgreementBlock =
  | {
      kind: 'paragraph';
      text: string;
      lines: AgreementLine[];
      level?: number;
      quote?: boolean;
      signatureStyle?: SignatureRenderStyle;
    }
  | { kind: 'pageBreak' }
  | { kind: 'rule' }
  | { kind: 'image'; data: Buffer; imageType: 'png' | 'jpg'; alt: string }
  | {
      kind: 'list';
      text: string;
      lines: AgreementLine[];
      depth: number;
      ordered: boolean;
      index: number;
    }
  | { kind: 'table'; rows: string[][]; header: boolean };

function inlineLines(nodes: AgreementHtmlNode[]): AgreementLine[] {
  const lines: AgreementLine[] = [[]];
  const visit = (
    list: AgreementHtmlNode[],
    format: Omit<AgreementRun, 'text'>,
  ) => {
    for (const node of list) {
      if (node.type === 'text') {
        const text = (node.data ?? '').replace(/\s+/g, ' ');
        if (text) lines[lines.length - 1].push({ text, ...format });
        continue;
      }
      const name = node.name?.toLowerCase();
      if (name === 'br') {
        lines.push([]);
        continue;
      }
      if (!name || name === 'img' || name === 'script' || name === 'style')
        continue;
      const next = { ...format };
      if (name === 'strong' || name === 'b') next.bold = true;
      if (name === 'em' || name === 'i') next.italic = true;
      const style = node.attribs?.['data-signature-style'];
      if (style && SIGNATURE_RENDER_STYLES.has(style))
        next.signatureStyle = style as SignatureRenderStyle;
      if (node.attribs?.['data-signature-metadata'] === 'true')
        next.muted = true;
      visit(node.children ?? [], next);
    }
  };
  visit(nodes, {});
  return lines
    .map((line) => {
      const merged: AgreementRun[] = [];
      for (const run of line) {
        const last = merged[merged.length - 1];
        if (
          last &&
          last.bold === run.bold &&
          last.italic === run.italic &&
          last.muted === run.muted &&
          last.signatureStyle === run.signatureStyle
        )
          last.text = `${last.text}${run.text}`.replace(/\s+/g, ' ');
        else merged.push({ ...run });
      }
      if (merged.length) {
        merged[0].text = merged[0].text.trimStart();
        merged[merged.length - 1].text =
          merged[merged.length - 1].text.trimEnd();
      }
      return merged.filter((run) => run.text.length > 0);
    })
    .filter((line) => line.length > 0);
}

function linesText(lines: AgreementLine[]) {
  return lines
    .map((line) => line.map((run) => run.text).join(''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractAgreementDocumentStructure(html: string) {
  const root = parseDocument(cleanContractHtml(html)) as unknown as {
    children: AgreementHtmlNode[];
  };
  const blocks: AgreementBlock[] = [];
  const walk = (nodes: AgreementHtmlNode[], listDepth = 0) => {
    for (const node of nodes) {
      const name = node.name?.toLowerCase();
      if (name && /^h[1-6]$/.test(name))
        blocks.push({
          kind: 'paragraph',
          text: nodeText(node),
          lines: [[{ text: nodeText(node), bold: true }]],
          level: Math.min(4, Number(name.slice(1))),
        });
      else if (name === 'p') {
        if (findDescendants(node, 'img').length)
          blocks.push(...splitParagraphAroundImages(node));
        else
          blocks.push({
            kind: 'paragraph',
            text: nodeText(node),
            lines: inlineLines(node.children ?? []),
            signatureStyle: signatureStyleOf(node),
          });
      } else if (name === 'blockquote')
        blocks.push({
          kind: 'paragraph',
          text: nodeText(node),
          lines: inlineLines(node.children ?? []),
          quote: true,
        });
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
            lines: inlineLines(inline),
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
        const rowNodes = findDescendants(node, 'tr');
        const rows = rowNodes.map((row) =>
          (row.children ?? [])
            .filter((cell) => ['td', 'th'].includes(cell.name ?? ''))
            .map(nodeText),
        );
        // A header row is one the author marked as such, not simply the first.
        const header = (rowNodes[0]?.children ?? []).some(
          (cell) => cell.name === 'th',
        );
        if (rows.length) blocks.push({ kind: 'table', rows, header });
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
        // A drawn rule, not a line of twenty hyphens.
        else blocks.push({ kind: 'rule' });
      } else if (node.children) walk(node.children, listDepth);
    }
  };
  walk(root.children);
  return blocks.filter(
    (block) =>
      block.kind === 'table' ||
      block.kind === 'image' ||
      block.kind === 'pageBreak' ||
      block.kind === 'rule' ||
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
    const lines = inlineLines(pending);
    blocks.push({
      kind: 'paragraph',
      text: linesText(lines),
      lines,
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

/**
 * What the title page and running header/footer of a generated agreement
 * show. Built by `agreementCoverDetails` from the same values the document
 * itself was rendered from, so the cover cannot disagree with the body.
 */
export type AgreementCover = {
  brand: string;
  status: string;
  rows: Array<[string, string]>;
  /** Running header/footer reference, e.g. "CON-… · Version 1". */
  reference: string;
};

export type AgreementRenderOptions = {
  cover?: AgreementCover;
  /** Evidence and audit records, rendered after the agreement on new pages. */
  appendixHtml?: string;
};

export function agreementCoverDetails(input: {
  contractNumber: string;
  agreementVersion: string;
  counterpartyName?: string | null;
  values: Record<string, unknown>;
  status: string;
  executedAt: Date | null;
}): AgreementCover {
  const text = (key: string) => {
    const raw = input.values[key];
    if (typeof raw !== 'string' || !raw.trim()) return '';
    const definition = CONTRACT_PLACEHOLDER_REGISTRY.find(
      (item) => item.key === key,
    );
    return formatPlaceholderValue(raw, definition);
  };
  const counterpartyRow = (
    [
      ['Customer', 'customer.legalName'],
      ['Partner', 'partner.legalName'],
      ['Counterparty', 'counterparty.legalName'],
    ] as const
  )
    .map(([label, key]) => [label, text(key)] as [string, string])
    .find(([, value]) => value) ?? [
    'Counterparty',
    input.counterpartyName ?? '',
  ];
  const dateDefinition = CONTRACT_PLACEHOLDER_REGISTRY.find(
    (item) => item.key === 'signature.counterparty.date',
  );
  const rows: Array<[string, string]> = [
    ['Agreement reference', input.contractNumber],
    ['Agreement version', input.agreementVersion],
    ['Service provider', text('platform.legalName')],
    counterpartyRow,
    ['Effective date', text('contract.effectiveDate')],
    ['Expiry date', text('contract.expiryDate')],
    [
      'Document status',
      input.executedAt
        ? `${input.status} · ${formatPlaceholderValue(input.executedAt.toISOString(), dateDefinition)}`
        : input.status,
    ],
  ];
  return {
    brand: text('platform.name') || 'DijiPeople',
    status: input.status,
    rows: rows.filter(([, value]) => value.trim()),
    reference: `${input.contractNumber} · Version ${input.agreementVersion}`,
  };
}

/** Evidence timestamps keep their precision; UTC is stated, not implied. */
function evidenceTimestamp(value: Date) {
  return `${value.toISOString().replace('T', ' ').replace('Z', '')} UTC`;
}

/**
 * The signature evidence and audit records of an executed agreement, as a
 * separate appendix after the agreement's own signature blocks. Built as HTML
 * so PDF and DOCX lay it out with the same tables as the agreement, instead
 * of the single preformatted text dump they printed before.
 */
export function signatureEvidenceAppendixHtml(input: {
  contractNumber: string;
  agreementVersion: string;
  signingRecordVersion: number;
  documentSha256: string;
  requestNumber: string;
  evidence: Array<
    SignatureEvidenceForRender & {
      timezone?: string | null;
      verificationStatus?: string | null;
      eventHash?: string | null;
      recipient: SignatureEvidenceForRender['recipient'] & { role?: string };
    }
  >;
  signatureEvents: Array<{
    eventSequence: number;
    eventType: string;
    createdAt: Date;
    eventHash: string | null;
  }>;
  timeline: Array<{ createdAt: Date; eventType: string; message: string }>;
}) {
  const cell = (value: string | number | null | undefined) =>
    `<td>${escapeHtml(String(value ?? ''))}</td>`;
  const keyValue = (
    rows: Array<[string, string | number | null | undefined]>,
  ) =>
    `<table>${rows
      .filter(
        ([, value]) => value !== null && value !== undefined && value !== '',
      )
      .map(([label, value]) => `<tr>${cell(label)}${cell(value)}</tr>`)
      .join('')}</table>`;
  const signatories = evidenceSignatories(input.evidence);
  const parts = [
    '<h1>ELECTRONIC SIGNATURE APPENDIX</h1>',
    keyValue([
      ['Agreement reference', input.contractNumber],
      ['Agreement version', input.agreementVersion],
      [
        'Signing record',
        `Immutable signing snapshot ${input.signingRecordVersion}`,
      ],
      ['Signature request', input.requestNumber],
      ['Document SHA-256', input.documentSha256],
      ['Signers', input.evidence.length],
    ]),
  ];
  input.evidence.forEach((evidence, index) => {
    parts.push(
      `<h3>Signer ${index + 1} of ${input.evidence.length} — ${escapeHtml(evidence.recipient.name)}</h3>`,
      keyValue([
        ['Signing for', signatories[index]?.organization ?? ''],
        ['Role', evidence.recipient.role ?? ''],
        ['Email', evidence.recipient.email ?? ''],
        ['Signing order', evidence.recipient.signingOrder ?? ''],
        ['Method', SIGNATURE_METHOD_LABELS[evidence.method] ?? evidence.method],
        [
          'Typed signature',
          evidence.method === 'TYPED' ? evidence.typedName : '',
        ],
        ['Signed at', evidenceTimestamp(evidence.signedAt)],
        ['Signer time zone', evidence.timezone ?? ''],
        ['Verification', evidence.verificationStatus ?? 'TOKEN_VERIFIED'],
        ['Signature SHA-256', evidence.signatureSha256],
        ['Evidence event hash', evidence.eventHash ?? ''],
      ]),
    );
  });
  parts.push(
    '<h2>AUDIT CERTIFICATE</h2>',
    `<table><tr><th>#</th><th>Event</th><th>Time</th><th>Event hash</th></tr>${input.signatureEvents
      .map(
        (event) =>
          `<tr>${cell(event.eventSequence)}${cell(event.eventType)}${cell(evidenceTimestamp(event.createdAt))}${cell(event.eventHash)}</tr>`,
      )
      .join('')}</table>`,
    '<h2>AGREEMENT TIMELINE</h2>',
    `<table><tr><th>Time</th><th>Event</th><th>Detail</th></tr>${input.timeline
      .map(
        (event) =>
          `<tr>${cell(evidenceTimestamp(event.createdAt))}${cell(event.eventType)}${cell(event.message)}</tr>`,
      )
      .join('')}</table>`,
  );
  return parts.join('');
}

/*
 * The generated agreement's look. Restrained: one accent colour for the brand
 * and headings, near-black body text, and hairline rules and table borders.
 */
const PDF_THEME = {
  ink: '#1f2933',
  heading: '#12263f',
  accent: '#0f5c8c',
  muted: '#5f6b7a',
  rule: '#c9d2dc',
  tableHeader: '#eef2f6',
} as const;

const PDF_MARGINS = { top: 72, bottom: 72, left: 64, right: 64 };

const PDF_HEADING_SIZE: Record<number, number> = {
  1: 15,
  2: 13,
  3: 11.5,
  4: 10.5,
};

function pdfFont(
  run: Pick<AgreementRun, 'bold' | 'italic'>,
  family = 'Helvetica',
) {
  if (run.bold && run.italic) return `${family}-BoldOblique`;
  if (run.bold) return `${family}-Bold`;
  if (run.italic) return `${family}-Oblique`;
  return family;
}

/*
 * A short paragraph that is bold throughout ("FOR THE CUSTOMER", "Service
 * Provider") captions what follows it, so it is kept with it like a heading.
 */
function isCaptionParagraph(block: AgreementBlock) {
  return (
    block.kind === 'paragraph' &&
    !block.level &&
    block.text.length <= 90 &&
    block.lines.length > 0 &&
    block.lines.every((line) => line.every((run) => run.bold))
  );
}

/*
 * The title a cover page shows: the headings the document opens with, less a
 * heading that only repeats the brand already printed above it.
 */
function documentTitleLines(blocks: AgreementBlock[], brand: string) {
  const lines: string[] = [];
  for (const block of blocks) {
    if (block.kind !== 'paragraph' || !block.level || block.level > 2) break;
    if (block.text.trim().toLowerCase() !== brand.trim().toLowerCase())
      lines.push(block.text);
    if (lines.length === 2) break;
  }
  return lines;
}

// Exported for contracts.domain.spec.ts to assert directly against the
// rendered PDF/DOCX bytes (BUG-3554's drawn-image and typed-style checks) —
// not otherwise part of this module's public service surface.
export async function createPdf(
  title: string,
  html: string,
  appendix = '',
  options: AgreementRenderOptions = {},
) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const document = new PDFDocument({
      size: 'A4',
      margins: PDF_MARGINS,
      bufferPages: true,
      info: { Title: title },
    });
    document.on('data', (chunk: Buffer) => chunks.push(chunk));
    document.on('error', reject);
    document.on('end', () => resolve(Buffer.concat(chunks)));
    const left = PDF_MARGINS.left;
    const width = document.page.width - PDF_MARGINS.left - PDF_MARGINS.right;
    const bottom = () => document.page.height - PDF_MARGINS.bottom;
    const atPageTop = () => document.y <= PDF_MARGINS.top + 1;
    const ensureSpace = (height: number) => {
      if (document.y + height > bottom() && !atPageTop()) document.addPage();
    };
    const writeLines = (
      lines: AgreementLine[],
      layout: {
        x: number;
        width: number;
        size: number;
        color?: string;
        lineGap?: number;
      },
    ) => {
      for (const line of lines) {
        line.forEach((run, index) => {
          const font = run.signatureStyle
            ? PDF_SIGNATURE_STYLE_FONT[run.signatureStyle]
            : pdfFont(run);
          const size = run.signatureStyle
            ? 15
            : run.muted
              ? layout.size - 1.5
              : layout.size;
          document
            .font(font)
            .fontSize(size)
            .fillColor(
              run.muted ? PDF_THEME.muted : (layout.color ?? PDF_THEME.ink),
            );
          const textOptions = {
            continued: index < line.length - 1,
            lineGap: layout.lineGap ?? 2.5,
          };
          if (index === 0)
            document.text(run.text, layout.x, document.y, {
              ...textOptions,
              width: layout.width,
            });
          else document.text(run.text, textOptions);
        });
      }
    };
    const writeTable = (rows: string[][], header: boolean) => {
      const columns = Math.max(...rows.map((row) => row.length));
      if (!columns) return;
      // Column widths follow content, capped so one long hash cannot starve
      // the others; a two-column table without a header is a label/value list.
      // A column is never narrower than its longest word ("SIGNED" must not
      // break as "SIGNE / D"); hashes, which have no spaces, are the cap.
      const weights = Array.from({ length: columns }, (_, column) => {
        const cells = rows.map((row) => row[column] ?? '');
        const longestWord = Math.max(
          0,
          ...cells.flatMap((cell) =>
            cell.split(/\s+/).map((word) => word.length),
          ),
        );
        return Math.min(
          42,
          Math.max(6, longestWord + 4, ...cells.map((cell) => cell.length)),
        );
      });
      if (columns === 2 && !header) weights.splice(0, 2, 32, 68);
      const total = weights.reduce((sum, value) => sum + value, 0);
      const widths = weights.map((value) => (value / total) * width);
      const padding = 4;
      const size = 8.5;
      const drawRow = (row: string[], isHeader: boolean) => {
        document.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
        const height =
          Math.max(
            ...widths.map((columnWidth, column) =>
              document.heightOfString(row[column] ?? '', {
                width: columnWidth - padding * 2,
                lineGap: 1.5,
              }),
            ),
          ) +
          padding * 2;
        if (document.y + height > bottom()) {
          document.addPage();
          if (header && !isHeader) drawRow(rows[0], true);
        }
        const top = document.y;
        let x = left;
        widths.forEach((columnWidth, column) => {
          if (isHeader)
            document
              .rect(x, top, columnWidth, height)
              .fill(PDF_THEME.tableHeader);
          document
            .rect(x, top, columnWidth, height)
            .lineWidth(0.5)
            .strokeColor(PDF_THEME.rule)
            .stroke();
          document
            .font(
              isHeader || (!header && column === 0)
                ? 'Helvetica-Bold'
                : 'Helvetica',
            )
            .fontSize(size)
            .fillColor(PDF_THEME.ink)
            .text(row[column] ?? '', x + padding, top + padding, {
              width: columnWidth - padding * 2,
              lineGap: 1.5,
            });
          x += columnWidth;
        });
        document.x = left;
        document.y = top + height;
      };
      rows.forEach((row, index) => drawRow(row, header && index === 0));
      document.moveDown(0.8);
    };
    const writeBlocks = (blocks: AgreementBlock[]) => {
      blocks.forEach((block, index) => {
        const next = blocks[index + 1];
        if (block.kind === 'pageBreak') {
          if (!atPageTop()) document.addPage();
          return;
        }
        if (block.kind === 'rule') {
          // A rule before a top-level heading (a new Part or Schedule) starts
          // a new page instead of stranding the heading at a page foot.
          if (next?.kind === 'paragraph' && next.level === 1) {
            if (!atPageTop()) document.addPage();
            return;
          }
          ensureSpace(16);
          const y = document.y + 4;
          document
            .moveTo(left, y)
            .lineTo(left + width, y)
            .lineWidth(0.6)
            .strokeColor(PDF_THEME.rule)
            .stroke();
          document.x = left;
          document.y = y + 10;
          return;
        }
        if (block.kind === 'table') {
          writeTable(block.rows, block.header);
          return;
        }
        if (block.kind === 'image') {
          ensureSpace(72);
          document.x = left;
          document.image(block.data, { fit: [190, 64] });
          document.moveDown(0.3);
          return;
        }
        if (block.kind === 'list') {
          const indent = left + block.depth * 16;
          const prefix = block.ordered ? `${block.index}.` : '•';
          ensureSpace(28);
          const top = document.y;
          document
            .font('Helvetica')
            .fontSize(10)
            .fillColor(PDF_THEME.ink)
            .text(prefix, indent, top, { width: 16 });
          document.y = top;
          writeLines(block.lines, {
            x: indent + 16,
            width: width - (indent - left) - 16,
            size: 10,
          });
          document.moveDown(0.3);
          return;
        }
        if (block.level) {
          const size = PDF_HEADING_SIZE[block.level] ?? 10.5;
          // Keep a heading with at least the first lines of what it heads.
          ensureSpace(size * 2 + 48);
          if (!atPageTop()) document.moveDown(block.level <= 2 ? 0.6 : 0.3);
          document
            .font('Helvetica-Bold')
            .fontSize(size)
            .fillColor(block.level <= 2 ? PDF_THEME.heading : PDF_THEME.ink)
            .text(block.text, left, document.y, { width, lineGap: 2 });
          document.moveDown(block.level <= 2 ? 0.5 : 0.35);
          return;
        }
        ensureSpace(isCaptionParagraph(block) ? 96 : 24);
        writeLines(block.lines, {
          x: left + (block.quote ? 18 : 0),
          width: width - (block.quote ? 18 : 0),
          size: 10,
        });
        document.moveDown(next && isCaptionParagraph(block) ? 0.35 : 0.55);
      });
    };
    const body = extractAgreementDocumentStructure(html);
    const cover = options.cover;
    if (cover) {
      document
        .font('Helvetica-Bold')
        .fontSize(10)
        .fillColor(PDF_THEME.accent)
        .text(cover.brand.toUpperCase(), left, PDF_MARGINS.top + 40, {
          width,
          characterSpacing: 2,
        });
      const ruleY = document.y + 8;
      document
        .moveTo(left, ruleY)
        .lineTo(left + 72, ruleY)
        .lineWidth(1.5)
        .strokeColor(PDF_THEME.accent)
        .stroke();
      document.y = ruleY + 28;
      const titleLines = documentTitleLines(body, cover.brand);
      document
        .font('Helvetica-Bold')
        .fontSize(22)
        .fillColor(PDF_THEME.heading)
        .text(
          (titleLines.length ? titleLines : [title]).join('\n'),
          left,
          document.y,
          {
            width,
            lineGap: 4,
          },
        );
      document.moveDown(0.6);
      document
        .font('Helvetica')
        .fontSize(11)
        .fillColor(PDF_THEME.muted)
        .text(cover.status, left, document.y, { width });
      document.moveDown(2.2);
      writeTable(cover.rows, false);
      document.addPage();
    } else {
      document
        .font('Helvetica-Bold')
        .fontSize(16)
        .fillColor(PDF_THEME.heading)
        .text(title, left, document.y, { width });
      document.moveDown(1.2);
    }
    writeBlocks(body);
    const appendixBlocks = options.appendixHtml
      ? extractAgreementDocumentStructure(options.appendixHtml)
      : [];
    if (appendixBlocks.length) {
      document.addPage();
      writeBlocks(appendixBlocks);
    }
    if (appendix.trim()) {
      document.addPage();
      document
        .font('Helvetica')
        .fontSize(9)
        .fillColor(PDF_THEME.ink)
        .text(appendix, left, document.y, { width, lineGap: 3 });
    }
    // Running header and footer, drawn once every page exists so the footer
    // can say "Page n of N". The cover carries neither.
    const range = document.bufferedPageRange();
    const reference = cover?.reference ?? title;
    for (let page = range.start; page < range.start + range.count; page += 1) {
      document.switchToPage(page);
      const pageBottom = document.page.margins.bottom;
      document.page.margins.bottom = 0;
      const footerY = document.page.height - 46;
      if (!(cover && page === range.start)) {
        document
          .font('Helvetica-Bold')
          .fontSize(7.5)
          .fillColor(PDF_THEME.accent)
          .text((cover?.brand ?? 'DijiPeople').toUpperCase(), left, 40, {
            width: width / 2,
            characterSpacing: 1.2,
            lineBreak: false,
          });
        document
          .font('Helvetica')
          .fontSize(7.5)
          .fillColor(PDF_THEME.muted)
          .text(reference, left + width / 2, 40, {
            width: width / 2,
            align: 'right',
            lineBreak: false,
          });
        document
          .moveTo(left, 54)
          .lineTo(left + width, 54)
          .lineWidth(0.5)
          .strokeColor(PDF_THEME.rule)
          .stroke();
      }
      document
        .moveTo(left, footerY - 8)
        .lineTo(left + width, footerY - 8)
        .lineWidth(0.5)
        .strokeColor(PDF_THEME.rule)
        .stroke();
      document
        .font('Helvetica')
        .fontSize(7.5)
        .fillColor(PDF_THEME.muted)
        .text(cover ? 'Confidential' : reference, left, footerY, {
          width: width / 2,
          lineBreak: false,
        });
      document.text(
        `Page ${page - range.start + 1} of ${range.count}`,
        left + width / 2,
        footerY,
        { width: width / 2, align: 'right', lineBreak: false },
      );
      document.page.margins.bottom = pageBottom;
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

function docxRuns(lines: AgreementLine[], quote = false) {
  return lines.flatMap((line, lineIndex) =>
    line.map(
      (run, runIndex) =>
        new TextRun({
          text: run.text,
          bold: run.bold,
          italics: quote || run.italic || run.signatureStyle === 'SCRIPT',
          font: run.signatureStyle
            ? DOCX_SIGNATURE_STYLE_FONT[run.signatureStyle]
            : undefined,
          size: run.signatureStyle ? 26 : run.muted ? 18 : undefined,
          color: run.muted ? '5F6B7A' : undefined,
          break: lineIndex > 0 && runIndex === 0 ? 1 : undefined,
        }),
    ),
  );
}

function docxTable(rows: string[][], header: boolean) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map(
      (row, rowIndex) =>
        new TableRow({
          tableHeader: header && rowIndex === 0,
          children: row.map(
            (cell, column) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cell,
                        bold:
                          (header && rowIndex === 0) ||
                          (!header && column === 0),
                        size: 18,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function docxBlocks(blocks: AgreementBlock[]) {
  const children: Array<Paragraph | Table> = [];
  for (const block of blocks) {
    if (block.kind === 'pageBreak') {
      children.push(new Paragraph({ children: [new PageBreak()] }));
      continue;
    }
    if (block.kind === 'rule') {
      children.push(
        new Paragraph({
          children: [],
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 4,
              color: 'C9D2DC',
              space: 1,
            },
          },
          spacing: { after: 160 },
        }),
      );
      continue;
    }
    if (block.kind === 'table') {
      children.push(docxTable(block.rows, block.header));
      children.push(new Paragraph({ children: [], spacing: { after: 120 } }));
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
          children: block.ordered
            ? [
                new TextRun({ text: `${block.index}. ` }),
                ...docxRuns(block.lines),
              ]
            : docxRuns(block.lines),
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
        children: block.level
          ? [new TextRun({ text: block.text, bold: true })]
          : docxRuns(block.lines, block.quote),
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
        keepNext: Boolean(block.level) || isCaptionParagraph(block),
        spacing: { after: block.level ? 220 : 160 },
      }),
    );
  }
  return children;
}

export async function createDocx(
  title: string,
  html: string,
  appendix = '',
  options: AgreementRenderOptions = {},
) {
  const children: Array<Paragraph | Table> = [];
  const cover = options.cover;
  const body = extractAgreementDocumentStructure(html);
  if (cover) {
    const titleLines = documentTitleLines(body, cover.brand);
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: cover.brand.toUpperCase(),
            bold: true,
            color: '0F5C8C',
            characterSpacing: 40,
          }),
        ],
        spacing: { after: 480 },
      }),
      new Paragraph({
        children: [
          new TextRun({
            text: (titleLines.length ? titleLines : [title]).join(' '),
            bold: true,
            size: 44,
            color: '12263F',
          }),
        ],
        spacing: { after: 240 },
      }),
      new Paragraph({
        children: [new TextRun({ text: cover.status, color: '5F6B7A' })],
        spacing: { after: 360 },
      }),
      docxTable(cover.rows, false),
      new Paragraph({ children: [new PageBreak()] }),
    );
  } else
    children.push(
      new Paragraph({
        children: [new TextRun({ text: title, bold: true, size: 32 })],
        spacing: { after: 400 },
      }),
    );
  children.push(...docxBlocks(body));
  if (options.appendixHtml)
    children.push(
      new Paragraph({ children: [new PageBreak()] }),
      ...docxBlocks(extractAgreementDocumentStructure(options.appendixHtml)),
    );
  if (appendix.trim())
    children.push(
      ...appendix
        .split(/\n+/)
        .filter(Boolean)
        .map((text) => new Paragraph({ text, spacing: { after: 120 } })),
    );
  const document = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    children: [
                      `${cover?.reference ?? title} · Page `,
                      PageNumber.CURRENT,
                      ' of ',
                      PageNumber.TOTAL_PAGES,
                    ],
                    size: 16,
                    color: '5F6B7A',
                  }),
                ],
              }),
            ],
          }),
        },
        children,
      },
    ],
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
