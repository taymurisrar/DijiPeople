import {
  BankAccountVerificationStatus,
  ConfigurationStatus,
  LoanRequestStatus,
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
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateLoanPolicyDto {
  @IsString() @MaxLength(50) code!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsString() @MaxLength(80) loanType?: string;
  @IsOptional() @IsUUID() organizationId?: string;
  @IsOptional() @IsUUID() legalEntityId?: string;
  @IsOptional() @IsUUID() ownerUserId?: string;
  @IsOptional() @IsEnum(ConfigurationStatus) status?: ConfigurationStatus;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) maximumAmount?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  maximumInstallments?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumServiceMonths?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) minimumSalary?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maximumActiveLoans?: number;
  @IsOptional() @IsBoolean() probationCompleted?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maximumSalaryMultiple?: number;
  @IsOptional() @IsString() @MaxLength(80) interestMethod?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  interestRatePercent?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) processingFee?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) insuranceFee?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) gracePeriodDays?: number;
  @IsOptional() @IsString() @MaxLength(80) repaymentFrequency?: string;
  @IsOptional() @IsString() @MaxLength(80) installmentMethod?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedInstallment?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentageOfSalary?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  maximumDeductionPercent?: number;
  @IsOptional() @IsBoolean() skipPayrollAllowed?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) settlementFee?: number;
  @IsOptional() @IsString() @MaxLength(80) arrearsHandling?: string;
  @IsOptional() @IsString() @MaxLength(80) finalSettlementHandling?: string;
  @IsOptional() @IsUUID() deductionPayComponentId?: string;
  @IsOptional() @IsUUID() interestPayComponentId?: string;
  @IsOptional() @IsUUID() feePayComponentId?: string;
  @IsOptional() @IsString() @MaxLength(80) postingCategory?: string;
  @IsOptional() @IsBoolean() payslipVisible?: boolean;
  @IsOptional() @IsString() @MaxLength(80) negativeNetPayHandling?: string;
  @IsOptional() @IsBoolean() approvalRequired?: boolean;
  @IsOptional() @IsUUID() approvalWorkflowId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minimumApprovers?: number;
  @IsOptional() @IsBoolean() supportingDocumentRequired?: boolean;
  @IsOptional() @IsObject() eligibilityRules?: Record<string, unknown>;
  @IsOptional() @IsObject() configuration?: Record<string, unknown>;
  @IsOptional() @IsBoolean() allowEarlySettlement?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLoanPolicyDto extends PartialType(CreateLoanPolicyDto) {}

export class CreateBankDto {
  @IsString() @MaxLength(50) code!: string;
  @IsString() @MaxLength(160) name!: string;
  @IsString() @MaxLength(2) countryCode!: string;
  @IsOptional() @IsString() @MaxLength(40) swiftCode?: string;
  @IsOptional() @IsString() @MaxLength(40) routingCode?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateBankDto extends CreateBankDto {}

export class LoanQueryDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() loanPolicyId?: string;
  @IsOptional() @IsEnum(LoanRequestStatus) status?: LoanRequestStatus;
}

export class CreateLoanRequestDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() loanPolicyId?: string;
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  requestedAmount!: number;
  @IsString() @MaxLength(3) currencyCode!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(600) installmentCount!: number;
  @IsDateString() requestedStartDate!: string;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class ApproveLoanDto {
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(999999999)
  approvedAmount!: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  installmentCount?: number;
}

export class RejectLoanDto {
  @IsString() @MaxLength(1000) reason!: string;
}

export class CreateEmployeeBankAccountDto {
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() bankId?: string;
  @IsString() @MaxLength(160) accountTitle!: string;
  @IsOptional() @IsString() @MaxLength(80) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) iban?: string;
  @IsOptional() @IsString() @MaxLength(80) swiftOrRoutingCode?: string;
  @IsOptional() @IsString() @MaxLength(120) branchName?: string;
  @IsOptional() @IsString() @MaxLength(40) branchCode?: string;
  @IsString() @MaxLength(2) countryCode!: string;
  @IsString() @MaxLength(3) currencyCode!: string;
  @IsOptional() @IsBoolean() isPrimaryPayroll?: boolean;
  @IsOptional() @IsUUID() supportingDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(2000) employeeNotes?: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class UpdateEmployeeBankAccountDto {
  @IsOptional() @IsUUID() bankId?: string;
  @IsOptional() @IsString() @MaxLength(160) accountTitle?: string;
  @IsOptional() @IsString() @MaxLength(80) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) iban?: string;
  @IsOptional() @IsString() @MaxLength(80) swiftOrRoutingCode?: string;
  @IsOptional() @IsString() @MaxLength(120) branchName?: string;
  @IsOptional() @IsString() @MaxLength(40) branchCode?: string;
  @IsOptional() @IsString() @MaxLength(2) countryCode?: string;
  @IsOptional() @IsString() @MaxLength(3) currencyCode?: string;
  @IsOptional() @IsUUID() supportingDocumentId?: string;
  @IsOptional() @IsString() @MaxLength(2000) employeeNotes?: string;
  @IsOptional() @IsDateString() effectiveFrom?: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class RejectEmployeeBankAccountDto {
  @IsString() @MaxLength(1000) reason!: string;
}

export class VerifyEmployeeBankAccountDto {
  @IsEnum(BankAccountVerificationStatus)
  verificationStatus!: BankAccountVerificationStatus;
}
