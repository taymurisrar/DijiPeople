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
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
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
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
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
