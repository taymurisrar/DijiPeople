import {
  ConfigurationStatus,
  TaxCalculationMethod,
  TaxType,
} from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const CODE_PATTERN = /^[A-Z0-9_ -]+$/i;

export class CreateTaxRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(CODE_PATTERN)
  code?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional() @IsUUID() organizationId?: string | null;
  @IsOptional() @IsUUID() legalEntityId?: string | null;
  @IsOptional() @IsUUID() payrollRegionId?: string | null;
  @IsOptional() @IsString() @MaxLength(160) taxAuthority?: string | null;
  @IsOptional() @IsString() @MaxLength(40) calculationStrategy?: string;
  @IsOptional() @IsDateString() taxYearStart?: string | null;
  @IsOptional() @IsDateString() taxYearEnd?: string | null;
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
  @IsOptional() @IsUUID() ownerUserId?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priority?: number;

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
  @IsUUID()
  businessUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string | null;

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

  @IsOptional() @IsString() @MaxLength(2000) formulaExpression?: string | null;
  @IsOptional() @IsUUID() employeeTaxComponentId?: string | null;
  @IsOptional() @IsUUID() employerTaxComponentId?: string | null;
  @IsOptional() @IsString() @MaxLength(80) postingCategory?: string | null;
  @IsOptional() @IsUUID() taxStatementTemplateId?: string | null;
  @IsOptional() @IsObject() applicabilityRules?: Record<string, unknown>;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;
}

export class UpdateTaxRuleDto extends PartialType(CreateTaxRuleDto) {}

export class CreateTaxRuleBracketDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sequence?: number;
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

  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) excessOver?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumTax?:
    | number
    | null;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maximumTax?:
    | number
    | null;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
}

export class UpdateTaxRuleBracketDto extends CreateTaxRuleBracketDto {}

export class AddTaxRulePayComponentDto {
  @IsUUID()
  payComponentId!: string;
}

export class PreviewTaxRuleDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  taxableIncome!: number;
}

export class TaxRuleBracketOrderItemDto {
  @IsUUID()
  id!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  sequence!: number;
}

export class ReorderTaxRuleBracketsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaxRuleBracketOrderItemDto)
  items!: TaxRuleBracketOrderItemDto[];
}
