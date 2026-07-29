import {
  ConfigurationStatus,
  PayrollGlAccountType,
  PayrollRunLineItemCategory,
} from '@prisma/client';
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreatePayrollGlAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  code?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional() @IsUUID() organizationId?: string | null;
  @IsOptional() @IsUUID() legalEntityId?: string | null;

  @IsEnum(PayrollGlAccountType)
  accountType!: PayrollGlAccountType;

  @IsOptional() @IsString() @MaxLength(80) accountSubtype?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currencyCode?: string | null;

  @IsOptional()
  @IsUUID()
  parentAccountId?: string | null;

  @IsOptional()
  @IsBoolean()
  postingAllowed?: boolean;

  @IsOptional()
  @IsBoolean()
  isControlAccount?: boolean;

  @IsOptional() @IsBoolean() reconciliationRequired?: boolean;
  @IsOptional() @IsBoolean() requireBusinessUnitDimension?: boolean;
  @IsOptional() @IsBoolean() requireDepartmentDimension?: boolean;
  @IsOptional() @IsBoolean() requireCostCenterDimension?: boolean;
  @IsOptional() @IsBoolean() requireProjectDimension?: boolean;
  @IsOptional() @IsBoolean() requireEmployeeDimension?: boolean;
  @IsOptional() @IsBoolean() requireLocationDimension?: boolean;
  @IsOptional() @IsBoolean() requireLegalEntityDimension?: boolean;
  @IsOptional() @IsString() @MaxLength(120) externalSystem?: string | null;
  @IsOptional() @IsString() @MaxLength(120) externalAccountCode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) erpCompanyCode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) erpLedgerCode?: string | null;
  @IsOptional() @IsString() @MaxLength(120) erpAccountId?: string | null;
  @IsOptional() @IsDateString() effectiveFrom?: string | null;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
  @IsOptional() @IsUUID() ownerUserId?: string | null;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpdatePayrollGlAccountDto extends PartialType(
  CreatePayrollGlAccountDto,
) {}

export class CreatePayrollPostingRuleDto {
  @IsOptional() @IsString() @MaxLength(80) code?: string;

  @IsString()
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional() @IsUUID() organizationId?: string | null;
  @IsOptional() @IsUUID() legalEntityId?: string | null;
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
  @IsOptional() @IsUUID() ownerUserId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) priority?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() @MaxLength(80) postingEvent?: string;

  @IsEnum(PayrollRunLineItemCategory)
  sourceCategory!: PayrollRunLineItemCategory;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  lineCategory?: string;

  @IsOptional()
  @IsUUID()
  payComponentId?: string | null;

  @IsOptional()
  @IsUUID()
  taxRuleId?: string | null;

  @IsOptional()
  @IsUUID()
  debitAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  creditAccountId?: string | null;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  departmentId?: string | null;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional() @IsUUID() payrollRegionId?: string | null;
  @IsOptional() @IsUUID() costCenterId?: string | null;
  @IsOptional() @IsUUID() employmentTypeId?: string | null;
  @IsOptional() @IsString() @MaxLength(80) debitBusinessUnitSource?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(80) creditBusinessUnitSource?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(80) debitDepartmentSource?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(80) creditDepartmentSource?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(80) debitCostCenterSource?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(80) creditCostCenterSource?:
    | string
    | null;
  @IsOptional() @IsString() @MaxLength(80) debitProjectSource?: string | null;
  @IsOptional() @IsString() @MaxLength(80) creditProjectSource?: string | null;
  @IsOptional() @IsString() @MaxLength(80) debitEmployeeSource?: string | null;
  @IsOptional() @IsString() @MaxLength(80) creditEmployeeSource?: string | null;
  @IsOptional() @IsString() @MaxLength(80) consolidationMode?: string;
  @IsOptional() @IsString() @MaxLength(500) descriptionTemplate?: string | null;
  @IsOptional() @IsString() @MaxLength(200) journalReferenceTemplate?:
    | string
    | null;
  @IsOptional() @IsBoolean() allowZeroPosting?: boolean;
  @IsOptional() @IsString() @MaxLength(80) reversalRule?: string;
  @IsOptional() @IsBoolean() employeeLevelEntry?: boolean;
  @IsOptional() @IsBoolean() componentLevelEntry?: boolean;
  @IsOptional() @IsBoolean() departmentLevelEntry?: boolean;

  @IsOptional()
  @IsBoolean()
  allowSameAccount?: boolean;

  @IsDateString()
  effectiveFrom!: string;

  @IsOptional()
  @IsDateString()
  effectiveTo?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
}

export class UpdatePayrollPostingRuleDto extends PartialType(
  CreatePayrollPostingRuleDto,
) {}

export class PreviewPayrollPostingRuleDto {
  @IsEnum(PayrollRunLineItemCategory)
  sourceCategory!: PayrollRunLineItemCategory;

  @IsOptional() @IsString() @MaxLength(60) lineCategory?: string | null;
  @IsOptional() @IsUUID() payComponentId?: string | null;
  @IsOptional() @IsUUID() taxRuleId?: string | null;
  @IsOptional() @IsUUID() businessUnitId?: string | null;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsUUID() projectId?: string | null;
  @IsOptional() @IsUUID() payrollRegionId?: string | null;
  @IsOptional() @IsUUID() costCenterId?: string | null;
  @IsOptional() @IsUUID() employmentTypeId?: string | null;

  @IsDateString()
  effectiveDate!: string;
}
