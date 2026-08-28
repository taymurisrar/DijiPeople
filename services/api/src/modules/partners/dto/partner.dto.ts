import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsIn,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PartnerCommissionStatus,
  PartnerStatus,
  PartnerType,
} from '@prisma/client';
import { PLATFORM_CURRENCY_CODES } from '@repo/config';

export class PartnerQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(PartnerStatus) status?: PartnerStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(10) @Max(100) pageSize = 20;
  @IsOptional() @IsString() viewKey?: string;
  @IsOptional() @IsString() filters?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() fields?: string;
}
export class CreatePartnerDto {
  @IsEnum(PartnerType) type!: PartnerType;
  @IsString() @MaxLength(160) displayName!: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsOptional() @IsString() @MaxLength(100) contactFirstName?: string;
  @IsOptional() @IsString() @MaxLength(100) contactLastName?: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() taxId?: string;
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  defaultCommissionRate!: number;
  /*
   * A currency, not a three-character string (BUG-1425).
   *
   * `@MaxLength(3)` rejected `"NOT_A_CURRENCY"` for being fourteen
   * characters and accepted `"5"`, `"X"` and `"ZZZ"` for fitting. The
   * partner form offered a numeric input for this field, so `"5"` is not
   * hypothetical — partners in production carry it (BUG-1747).
   */
  @IsOptional()
  @IsIn(PLATFORM_CURRENCY_CODES as readonly string[], {
    message: 'currencyCode must be a supported currency code.',
  })
  currencyCode?: string;
  @IsOptional() @IsEnum(PartnerStatus) status?: PartnerStatus;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
export class UpdatePartnerDto extends CreatePartnerDto {}
export class CreatePartnerCommissionDto {
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @Type(() => Number) @IsNumber() @Min(0) baseAmount!: number;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) commissionRate!: number;
  /*
   * A currency, not a three-character string (BUG-1425).
   *
   * `@MaxLength(3)` rejected `"NOT_A_CURRENCY"` for being fourteen
   * characters and accepted `"5"`, `"X"` and `"ZZZ"` for fitting. The
   * partner form offered a numeric input for this field, so `"5"` is not
   * hypothetical — partners in production carry it (BUG-1747).
   */
  @IsOptional()
  @IsIn(PLATFORM_CURRENCY_CODES as readonly string[], {
    message: 'currencyCode must be a supported currency code.',
  })
  currencyCode?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsDateString() earnedAt?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}
export class UpdatePartnerCommissionDto {
  @IsEnum(PartnerCommissionStatus) status!: PartnerCommissionStatus;
}

export class CreatePartnerReferralLinkDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(160) campaignName?: string;
  @IsOptional() @IsString() @MaxLength(300) targetPath?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class PartnerReferralLinkActionDto {
  @IsIn(['enable', 'disable', 'expire', 'regenerate'])
  action!: 'enable' | 'disable' | 'expire' | 'regenerate';
}

export class PartnerLifecycleActionDto {
  @IsIn([
    'start-review',
    'approve',
    'reject',
    'request-information',
    'suspend',
    'reactivate',
    'deactivate',
  ])
  action!:
    | 'start-review'
    | 'approve'
    | 'reject'
    | 'request-information'
    | 'suspend'
    | 'reactivate'
    | 'deactivate';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}
