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
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartnerType } from '@prisma/client';

export class CreatePartnerInquiryDto {
  @IsEnum(PartnerType) type!: PartnerType;
  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsString() @MaxLength(100) contactFirstName!: string;
  @IsString() @MaxLength(100) contactLastName!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsString() @MaxLength(120) country?: string;
  @IsOptional() @IsString() @MaxLength(240) website?: string;
  @IsOptional() @IsString() @MaxLength(3000) message?: string;
  @IsBoolean() consentAccepted!: boolean;
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
