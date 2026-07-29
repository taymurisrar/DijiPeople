import {
  BenefitPolicyStatus,
  BenefitRenewalPeriod,
  BenefitType,
  BenefitValueType,
  EmployeeBenefitAssignmentSource,
  EmployeeBenefitStatus,
  EmployeeType,
  PayrollRunLineItemCategory,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { PartialType } from '@nestjs/mapped-types';

export class CreateBenefitPolicyDto {
  @IsString() @MinLength(1) @MaxLength(50) code!: string;
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(160) provider?: string;
  @IsOptional() @IsUUID() legalEntityId?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsEnum(BenefitType) benefitType!: BenefitType;
  @IsEnum(BenefitValueType) valueType!: BenefitValueType;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) fixedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) percentage?: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsOptional()
  @IsEnum(PayrollRunLineItemCategory)
  payrollCategory?: PayrollRunLineItemCategory;
  @IsOptional() @IsUUID() employeePayComponentId?: string;
  @IsOptional() @IsUUID() employerPayComponentId?: string;
  @IsOptional() @IsString() @MaxLength(80) postingCategory?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumServiceMonths?: number;
  @IsOptional() @IsString() @MaxLength(80) employeeContributionMethod?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeContributionAmount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employeeContributionPercent?: number;
  @IsOptional() @IsString() @MaxLength(80) employerContributionMethod?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerContributionAmount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  employerContributionPercent?: number;
  @IsOptional() @IsUUID() basePayComponentId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contributionMinimum?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  contributionMaximum?: number;
  @IsOptional() @IsString() @MaxLength(40) contributionFrequency?: string;
  @IsOptional() @IsString() @MaxLength(40) taxTreatment?: string;
  @IsOptional() @IsBoolean() includeInEmployerCost?: boolean;
  @IsOptional() @IsString() @MaxLength(40) prorationMethod?: string;
  @IsOptional() @IsString() @MaxLength(40) arrearsHandling?: string;
  @IsOptional() @IsString() @MaxLength(40) enrollmentMethod?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) waitingPeriodDays?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  enrollmentWindowDays?: number;
  @IsOptional() @IsBoolean() dependentCoverage?: boolean;
  @IsOptional() @IsBoolean() payrollVisible?: boolean;
  @IsOptional() @IsBoolean() affectsGrossPay?: boolean;
  @IsOptional() @IsBoolean() affectsNetPay?: boolean;
  @IsOptional() @IsBoolean() taxable?: boolean;
  @IsOptional() @IsBoolean() payslipVisible?: boolean;
  @IsOptional() @IsBoolean() employeeVisible?: boolean;
  @IsOptional() @IsBoolean() sensitive?: boolean;
  @IsOptional() @IsBoolean() requiredForPayroll?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) defaultBalance?: number;
  @IsOptional()
  @IsEnum(BenefitRenewalPeriod)
  renewalPeriod?: BenefitRenewalPeriod;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  renewalIntervalMonths?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  expiresAfterMonths?: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;
  @IsOptional() @IsUUID() businessUnitId?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsUUID() locationId?: string;
  @IsOptional() @IsUUID() employeeLevelId?: string;
  @IsOptional() @IsEnum(EmployeeType) employeeType?: EmployeeType;
  @IsOptional() @IsBoolean() requiresProbationCompletion?: boolean;
  @IsOptional() @IsBoolean() autoAssignOnHire?: boolean;
  @IsOptional() @IsBoolean() autoAssignOnPromotion?: boolean;
  @IsOptional() @IsBoolean() requiresAssignmentApproval?: boolean;
  @IsOptional() @IsBoolean() requiresChangeApproval?: boolean;
  @IsOptional() @IsObject() eligibilityRules?: Record<string, unknown>;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
  @IsOptional() @IsEnum(BenefitPolicyStatus) status?: BenefitPolicyStatus;
}

export class UpdateBenefitPolicyDto extends PartialType(
  CreateBenefitPolicyDto,
) {}

export class AssignBenefitDto {
  @IsUUID() employeeId!: string;
  @IsUUID() benefitPolicyId!: string;
  @IsOptional()
  @IsEnum(EmployeeBenefitAssignmentSource)
  assignmentSource?: EmployeeBenefitAssignmentSource;
  @IsOptional() @IsBoolean() isManualOverride?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmountOverride?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentageOverride?: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCodeOverride?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  allocatedBalance?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class AssignDefaultBenefitsDto {
  @IsOptional()
  @IsEnum(EmployeeBenefitAssignmentSource)
  source?: EmployeeBenefitAssignmentSource;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class ChangeBenefitAssignmentDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmountOverride?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  percentageOverride?: number;
  @IsOptional() @IsString() @MaxLength(3) currencyCodeOverride?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class BenefitApprovalActionDto {
  @IsEnum(['APPROVED', 'REJECTED'] as const) action!: 'APPROVED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(1000) comment?: string;
}

export class ConsumeBenefitDto {
  @Type(() => Number) @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsDateString() consumedAt?: string;
  @IsOptional() @IsString() @MaxLength(80) sourceType?: string;
  @IsOptional() @IsString() @MaxLength(120) sourceId?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class BenefitAssignmentQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() benefitPolicyId?: string;
  @IsOptional() @IsEnum(EmployeeBenefitStatus) status?: EmployeeBenefitStatus;
  @IsOptional() @IsDateString() effectiveDate?: string;
}
