import { ConfigurationStatus } from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  Length,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class EmployeeTaxProfileQueryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class CreateEmployeeTaxProfileDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  taxIdentificationNumber?: string | null;

  @IsOptional()
  @IsString()
  @Length(2, 2)
  taxResidencyCountryCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  workTaxJurisdiction?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxStatus?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taxCategory?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  filingStatus?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(1000)
  dependentAllowances?: number;

  @IsOptional()
  @IsUUID()
  taxRuleId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  additionalTaxAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxExemptionAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxCreditAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  previousEmployerTaxableIncome?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  previousEmployerTaxDeducted?: number;

  @IsOptional()
  @IsObject()
  jurisdictionExtensions?: Record<string, unknown> | null;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  overrideReason?: string | null;

  @IsOptional()
  @IsEnum(ConfigurationStatus)
  status?: ConfigurationStatus;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;
}

export class UpdateEmployeeTaxProfileDto extends PartialType(
  CreateEmployeeTaxProfileDto,
) {}
