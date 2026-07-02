import {
  BankAccountVerificationStatus,
  LoanRequestStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
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
  @IsNumber()
  @Min(0)
  interestRatePercent?: number;
  @IsOptional() @IsBoolean() allowEarlySettlement?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateLoanPolicyDto extends CreateLoanPolicyDto {}

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
  @IsUUID() employeeId!: string;
  @IsOptional() @IsUUID() bankId?: string;
  @IsString() @MaxLength(160) accountTitle!: string;
  @IsOptional() @IsString() @MaxLength(80) accountNumber?: string;
  @IsOptional() @IsString() @MaxLength(80) iban?: string;
  @IsOptional() @IsString() @MaxLength(80) swiftOrRoutingCode?: string;
  @IsString() @MaxLength(2) countryCode!: string;
  @IsString() @MaxLength(3) currencyCode!: string;
  @IsOptional() @IsBoolean() isPrimaryPayroll?: boolean;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
}

export class VerifyEmployeeBankAccountDto {
  @IsEnum(BankAccountVerificationStatus)
  verificationStatus!: BankAccountVerificationStatus;
}
