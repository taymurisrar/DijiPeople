import { TaxCalculationMethod, TaxType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

const CODE_PATTERN = /^[A-Z0-9_ -]+$/i;

export class CreateTaxRuleDto {
  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN)
  code!: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  countryCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  regionCode?: string | null;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string | null;

  @IsEnum(TaxCalculationMethod)
  calculationMethod!: TaxCalculationMethod;

  @IsEnum(TaxType)
  taxType!: TaxType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedEmployeeAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedEmployerAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class UpdateTaxRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  countryCode?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  regionCode?: string | null;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string | null;

  @IsOptional()
  @IsEnum(TaxCalculationMethod)
  calculationMethod?: TaxCalculationMethod;

  @IsOptional()
  @IsEnum(TaxType)
  taxType?: TaxType;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedEmployeeAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedEmployerAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class CreateTaxRuleBracketDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerRate?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedEmployeeAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedEmployerAmount?: number | null;
}

export class UpdateTaxRuleBracketDto extends CreateTaxRuleBracketDto {}

export class AddTaxRulePayComponentDto {
  @IsUUID()
  payComponentId!: string;
}
