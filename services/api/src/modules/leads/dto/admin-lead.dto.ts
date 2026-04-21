import { Transform, Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BillingCycle, CustomerAccountStatus, LeadStatus } from '@prisma/client';

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

export class LeadQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

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
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  search?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(40)
  sortField?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(4)
  sortDirection?: string;

  @IsOptional()
  @IsDateString()
  createdFrom?: string;

  @IsOptional()
  @IsDateString()
  createdTo?: string;

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

export class CreateAdminLeadDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  contactFirstName!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  contactLastName!: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  companyName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  workEmail!: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'phoneNumber must be a valid phone number.' })
  @MaxLength(40)
  phoneNumber?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  companyWebsite?: string;

  @Transform(trimString)
  @IsString()
  industry!: string;

  @Transform(trimString)
  @IsString()
  companySize!: string;

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
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  interestedPlan?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedEmployeeCount?: number;

  @IsOptional()
  @IsDateString()
  expectedGoLiveDate?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  budgetExpectation?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1500)
  requirementsSummary?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1500)
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;

  @IsOptional()
  @IsBoolean()
  isQualified?: boolean;
}

export class UpdateAdminLeadDto {
  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  contactFirstName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  contactLastName?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  companyName?: string;

  @IsOptional()
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  workEmail?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'phoneNumber must be a valid phone number.' })
  @MaxLength(40)
  phoneNumber?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(200)
  companyWebsite?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  industry?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
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
  @MaxLength(120)
  source?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  interestedPlan?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedEmployeeCount?: number;

  @IsOptional()
  @IsDateString()
  expectedGoLiveDate?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  budgetExpectation?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1500)
  requirementsSummary?: string;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(1500)
  notes?: string;

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;

  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @Transform(trimString)
  @IsString()
  @MaxLength(120)
  subStatus?: string;

  @IsOptional()
  @IsBoolean()
  isQualified?: boolean;
}

export class BulkDeleteLeadsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class BulkAssignLeadsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  ids!: string[];

  @IsOptional()
  @IsUUID()
  assignedToUserId?: string;
}

export class ConvertLeadToCustomerDto {
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
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  primaryContactEmail?: string;

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
  @Transform(trimString)
  @IsString()
  @Matches(phoneRegex, { message: 'primaryContactPhone must be a valid phone number.' })
  @MaxLength(40)
  primaryContactPhone?: string;

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
  assignedToUserId?: string;

  @IsOptional()
  @IsUUID()
  accountManagerUserId?: string;

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
  leadSubStatus?: string;

  @IsOptional()
  @IsUUID()
  selectedPlanId?: string;
}
