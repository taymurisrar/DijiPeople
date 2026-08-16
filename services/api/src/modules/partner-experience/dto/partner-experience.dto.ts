import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartnerType, PartnershipModel } from '@prisma/client';

export class CreatePartnerInquiryDto {
  /** Contracting entity type. Not the partnership model — see below. */
  @IsEnum(PartnerType) type!: PartnerType;

  /**
   * The commercial relationship being proposed.
   *
   * `type` is INDIVIDUAL/COMPANY, which is the contracting entity and cannot
   * express whether someone wants to refer, resell, implement or integrate.
   * Before this existed every partnership inquiry arrived commercially
   * indistinguishable from every other (ITEM-0030).
   *
   * Optional so inquiries submitted before the form offered it stay valid.
   */
  @IsOptional() @IsEnum(PartnershipModel) partnershipModel?: PartnershipModel;

  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsString() @MaxLength(100) contactFirstName!: string;
  @IsString() @MaxLength(100) contactLastName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  /** Validated as a URL rather than free text — it is displayed as a link. */
  @IsOptional()
  @IsUrl({ require_protocol: false, require_tld: true })
  @MaxLength(240)
  website?: string;
  @IsOptional() @IsString() @MaxLength(3000) message?: string;

  /** Privacy notice acknowledgement. Required to submit. */
  @IsBoolean() consentAccepted!: boolean;

  /**
   * Marketing consent — optional, separate, and never a condition of
   * submitting. The notice *version* is not accepted from the client: the
   * server records which notice was in force when it accepted the submission.
   */
  @IsOptional() @IsBoolean() marketingConsent?: boolean;

  // Attribution, captured by the page rather than typed. Absent stays absent.
  @IsOptional() @IsString() @MaxLength(200) sourcePage?: string;
  @IsOptional() @IsString() @MaxLength(500) referrerUrl?: string;
  @IsOptional() @IsString() @MaxLength(120) utmSource?: string;
  @IsOptional() @IsString() @MaxLength(120) utmMedium?: string;
  @IsOptional() @IsString() @MaxLength(120) utmCampaign?: string;

  @IsOptional() @IsString() @MaxLength(120) source?: string;
}

export class ReviewPartnerInquiryDto {
  @IsString() @MaxLength(2000) notes!: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @Type(() => Number) @Min(0) defaultCommissionRate?: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
}

export class SubmitPartnerOnboardingDto {
  @IsObject() data!: Record<string, unknown>;
}

export class ReviewPartnerOnboardingDto {
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
}

export class ActivatePartnerUserDto {
  @IsString() token!: string;
  @IsString() @MinLength(12) @MaxLength(128) password!: string;
}

export class PartnerLoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

export class PartnerRefreshDto {
  @IsString() refreshToken!: string;
}

export class CreatePartnerPortalReferralLinkDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(160) campaignName?: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class PartnerLeadDto {
  @IsString() @MaxLength(100) contactFirstName!: string;
  @IsString() @MaxLength(100) contactLastName!: string;
  @IsString() @MaxLength(160) companyName!: string;
  @IsEmail() workEmail!: string;
  @IsOptional() @IsString() @MaxLength(40) phoneNumber?: string;
  @IsOptional() @IsString() @MaxLength(200) companyWebsite?: string;
  @IsString() @MaxLength(120) industry!: string;
  @IsString() @MaxLength(80) companySize!: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedEmployeeCount?: number;
  @IsOptional() @IsString() @MaxLength(120) expectedGoLiveDate?: string;
  @IsOptional() @IsString() @MaxLength(120) budgetExpectation?: string;
  @IsOptional() @IsString() @MaxLength(1500) requirementsSummary?: string;
  @IsOptional() @IsString() @MaxLength(1500) notes?: string;
}

export class ReviewPartnerLeadDto {
  @IsOptional() @IsString() @MaxLength(3000) notes?: string;
}
