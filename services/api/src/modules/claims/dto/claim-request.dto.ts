import { ClaimRequestStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ClaimQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsEnum(ClaimRequestStatus)
  status?: ClaimRequestStatus;
}

export class CreateClaimRequestDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsString()
  @MaxLength(180)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;
}

export class UpdateClaimRequestDto {
  @IsOptional()
  @IsString()
  @MaxLength(180)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;
}

export class CreateClaimLineItemDto {
  @IsUUID()
  claimTypeId!: string;

  @IsOptional()
  @IsUUID()
  claimSubTypeId?: string;

  @IsDateString()
  transactionDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  amount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999999)
  approvedAmount?: number;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;

  @IsOptional()
  @IsUUID()
  receiptDocumentId?: string;
}

export class UpdateClaimLineItemDto {
  @IsOptional()
  @IsUUID()
  claimTypeId?: string;

  @IsOptional()
  @IsUUID()
  claimSubTypeId?: string | null;

  @IsOptional()
  @IsDateString()
  transactionDate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  vendor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  amount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(999999999)
  approvedAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string;

  @IsOptional()
  @IsUUID()
  receiptDocumentId?: string | null;
}

export class ClaimActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comments?: string;
}

export class RejectClaimDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}
