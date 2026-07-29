import {
  ConfigurationStatus,
  PayComponentCalculationMethod,
  PayComponentType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreatePayComponentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  @Matches(/^[A-Za-z0-9_]+$/, {
    message: 'code may only contain letters, numbers, and underscores.',
  })
  code!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(140)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsOptional()
  @IsUUID()
  legalEntityId?: string | null;

  @IsOptional()
  @IsUUID()
  ownerUserId?: string | null;

  @IsOptional()
  @IsEnum(ConfigurationStatus)
  status?: ConfigurationStatus;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsEnum(PayComponentType)
  componentType!: PayComponentType;

  @IsEnum(PayComponentCalculationMethod)
  calculationMethod!: PayComponentCalculationMethod;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentage?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  componentCategory?: string;

  @IsOptional()
  @IsUUID()
  percentageBaseComponentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  formulaExpression?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  eligibilityAppliesTo?: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  prorationBasis?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minimumAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumAmount?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  roundingMethod?: string;

  @IsOptional()
  @IsUUID()
  defaultDebitAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  defaultCreditAccountId?: string | null;

  @IsOptional()
  @IsBoolean()
  isTaxable?: boolean;

  @IsOptional()
  @IsBoolean()
  affectsGrossPay?: boolean;

  @IsOptional()
  @IsBoolean()
  affectsNetPay?: boolean;

  @IsOptional()
  @IsBoolean()
  isRecurring?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresApproval?: boolean;

  @IsOptional()
  @IsBoolean()
  displayOnPayslip?: boolean;

  @IsOptional()
  @IsBoolean()
  employeeVisible?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PayComponentEligibilityRuleInputDto)
  eligibilityRules?: PayComponentEligibilityRuleInputDto[];
}

export class PayComponentEligibilityRuleInputDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(140)
  name?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  matchType?: string;

  @IsOptional()
  @IsObject()
  conditions?: Record<string, unknown> | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  priority?: number;

  @IsOptional()
  @IsEnum(PayComponentCalculationMethod)
  calculationMethodOverride?: PayComponentCalculationMethod | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentage?: number | null;

  @IsOptional()
  @IsUUID()
  percentageBaseComponentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  formulaExpression?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string | null;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
