import {
  CompensationPayFrequency,
  ConfigurationStatus,
  PayComponentCalculationMethod,
} from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateSalaryPackageRuleDto {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  code?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsString()
  @MaxLength(3)
  currencyCode!: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  departmentId?: string;

  @IsOptional()
  @IsUUID()
  employeeLevelId?: string;

  @IsOptional()
  @IsUUID()
  employmentTypeId?: string;

  @IsOptional()
  @IsEnum(CompensationPayFrequency)
  payFrequency?: CompensationPayFrequency;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsEnum(ConfigurationStatus)
  status?: ConfigurationStatus;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @IsOptional()
  @IsObject()
  eligibilityRules?: Record<string, unknown>;

  @IsOptional() @IsBoolean() autoAssign?: boolean;
  @IsOptional() @IsBoolean() allowEmployeeOverride?: boolean;
  @IsOptional() @IsBoolean() overrideRequiresApproval?: boolean;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

export class UpdateSalaryPackageRuleDto extends PartialType(
  CreateSalaryPackageRuleDto,
) {}

export class CreateSalaryPackageRuleComponentDto {
  @IsUUID()
  payComponentId!: string;

  @IsEnum(PayComponentCalculationMethod)
  calculationMethod!: PayComponentCalculationMethod;

  @IsOptional()
  @IsNumberString()
  fixedAmount?: string;

  @IsOptional()
  @IsNumberString()
  percentage?: string;

  @IsOptional()
  @IsUUID()
  percentageBaseComponentId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  formulaExpression?: string;

  @IsOptional()
  @IsNumberString()
  minimumAmount?: string;

  @IsOptional()
  @IsNumberString()
  maximumAmount?: string;

  @IsOptional()
  @IsBoolean()
  isRequired?: boolean;

  @IsOptional()
  @IsBoolean()
  isEmployeeEditable?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
}

export class UpdateSalaryPackageRuleComponentDto extends PartialType(
  CreateSalaryPackageRuleComponentDto,
) {}
