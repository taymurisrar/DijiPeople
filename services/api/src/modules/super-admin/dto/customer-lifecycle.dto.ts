import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  BillingCycle,
  CustomerAccountStatus,
  CustomerOnboardingStatus,
  DiscountType,
} from '@prisma/client';

const phoneRegex = /^[+()\-.\s0-9]{7,40}$/;

function trimString({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEmail({ value }: { value: unknown }) {
  if (typeof value !== 'string') {
    return value;
  }
  return value.trim().toLowerCase();
}

export class CustomerQueryDto {
  @IsOptional()
  @IsEnum(CustomerAccountStatus)
  status?: CustomerAccountStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @IsUUID()
  accountManagerUserId?: string;

  @IsOptional()
  @IsUUID()
  selectedPlanId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class CreateCustomerDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  companyName!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  legalCompanyName?: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryContactFirstName!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryContactLastName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  primaryContactEmail!: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'primaryContactPhone must be a valid phone number.' })
  @MaxLength(40)
  primaryContactPhone?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'contactPhone must be a valid phone number.' })
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  billingContactEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  financeContactName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  financeContactEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  companySize?: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  country!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  addressLine1?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  addressLine2?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedEmployeeCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualEmployeeCount?: number;

  @IsOptional()
  @IsUUID()
  selectedPlanId?: string;

  @IsOptional()
  @IsEnum(BillingCycle)
  preferredBillingCycle?: BillingCycle;

  @IsOptional()
  @IsBoolean()
  customPricingFlag?: boolean;

  @IsOptional()
  @IsBoolean()
  discountApproved?: boolean;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  accountManagerUserId?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsEnum(CustomerAccountStatus)
  status?: CustomerAccountStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;
}

export class UpdateCustomerDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  legalCompanyName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryContactFirstName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryContactLastName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  primaryContactEmail?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  contactEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'primaryContactPhone must be a valid phone number.' })
  @MaxLength(40)
  primaryContactPhone?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'contactPhone must be a valid phone number.' })
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  billingContactEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  financeContactName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  financeContactEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(80)
  companySize?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  country?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  addressLine1?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  addressLine2?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedEmployeeCount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualEmployeeCount?: number;

  @IsOptional()
  @IsUUID()
  selectedPlanId?: string;

  @IsOptional()
  @IsEnum(BillingCycle)
  preferredBillingCycle?: BillingCycle;

  @IsOptional()
  @IsBoolean()
  customPricingFlag?: boolean;

  @IsOptional()
  @IsBoolean()
  discountApproved?: boolean;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  accountManagerUserId?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsEnum(CustomerAccountStatus)
  status?: CustomerAccountStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;
}

export class BulkDeleteCustomersDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class CustomerOnboardingQueryDto {
  @IsOptional()
  @IsEnum(CustomerOnboardingStatus)
  status?: CustomerOnboardingStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  onboardingOwnerUserId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class CreateCustomerOnboardingRecordDto {
  @IsUUID()
  customerId!: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  onboardingOwnerUserId?: string;

  @IsOptional()
  @IsUUID()
  selectedPlanId?: string;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  agreedPrice?: number;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

  @IsOptional()
  featureSelectionSummary?: Record<string, unknown>;

  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryOwnerFirstName!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryOwnerLastName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  primaryOwnerWorkEmail!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'primaryOwnerPhone must be a valid phone number.' })
  @MaxLength(40)
  primaryOwnerPhone?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  serviceAccountEmail?: string;

  @IsOptional()
  @IsBoolean()
  createServiceAccount?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  serviceAccountDisplayName?: string;

  @IsOptional()
  @IsBoolean()
  serviceAccountAssignSystemAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  contractSigned?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  implementationKickoffDone?: boolean;

  @IsOptional()
  @IsBoolean()
  dataReceived?: boolean;

  @IsOptional()
  @IsBoolean()
  configurationReady?: boolean;

  @IsOptional()
  @IsBoolean()
  trainingPlanned?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1500)
  notes?: string;

  @IsOptional()
  @IsEnum(CustomerOnboardingStatus)
  status?: CustomerOnboardingStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;
}

export class UpdateCustomerOnboardingDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  leadId?: string;

  @IsOptional()
  @IsUUID()
  onboardingOwnerUserId?: string;

  @IsOptional()
  @IsUUID()
  selectedPlanId?: string;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  agreedPrice?: number;

  @IsOptional()
  @IsEnum(DiscountType)
  discountType?: DiscountType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  discountValue?: number;

  @IsOptional()
  featureSelectionSummary?: Record<string, unknown>;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryOwnerFirstName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  primaryOwnerLastName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  primaryOwnerWorkEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'primaryOwnerPhone must be a valid phone number.' })
  @MaxLength(40)
  primaryOwnerPhone?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  serviceAccountEmail?: string;

  @IsOptional()
  @IsBoolean()
  createServiceAccount?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  serviceAccountDisplayName?: string;

  @IsOptional()
  @IsBoolean()
  serviceAccountAssignSystemAdmin?: boolean;

  @IsOptional()
  @IsBoolean()
  contractSigned?: boolean;

  @IsOptional()
  @IsBoolean()
  paymentConfirmed?: boolean;

  @IsOptional()
  @IsBoolean()
  implementationKickoffDone?: boolean;

  @IsOptional()
  @IsBoolean()
  dataReceived?: boolean;

  @IsOptional()
  @IsBoolean()
  configurationReady?: boolean;

  @IsOptional()
  @IsBoolean()
  trainingPlanned?: boolean;

  @IsOptional()
  @IsBoolean()
  tenantCreated?: boolean;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1500)
  notes?: string;

  @IsOptional()
  @IsEnum(CustomerOnboardingStatus)
  status?: CustomerOnboardingStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;
}

export class BulkDeleteCustomerOnboardingsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class CreateTenantFromOnboardingDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  tenantName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsUUID()
  planId?: string;

  @IsOptional()
  @IsEnum(BillingCycle)
  billingCycle?: BillingCycle;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  manualFinalPrice?: number;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  serviceAccountName?: string;

  @IsOptional()
  @IsBoolean()
  createServiceAccount?: boolean;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  serviceAccountEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  serviceAccountDisplayName?: string;

  @IsOptional()
  @IsBoolean()
  assignServiceAccountSystemAdminRole?: boolean;
}
