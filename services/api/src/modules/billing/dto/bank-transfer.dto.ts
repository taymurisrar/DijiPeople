import { Transform, Type } from 'class-transformer';
import {
  BankTransferClaimStatus,
  BillingPaymentMethodKey,
  PaymentMethodApprovalStatus,
  PaymentMethodEnvironment,
} from '@prisma/client';
import {
  IsBoolean,
  IsDate,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

const trim = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const MONEY = /^\d{1,10}(\.\d{1,2})?$/;

/** The buyer's untrusted claim. No tenant, status, price or order id is accepted. */
export class SubmitBankTransferClaimDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  transactionReference?: string;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  transferredAt?: Date;

  @IsOptional()
  @Transform(trim)
  @Matches(MONEY, {
    message: 'amount must be a decimal with at most 2 places.',
  })
  amount?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class ApproveBankTransferDto {
  /** The operator's own statement/credit reference for the deposit. */
  @Transform(trim)
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  bankStatementReference!: string;

  @Transform(trim)
  @Matches(MONEY, {
    message: 'receivedAmount must be a decimal with at most 2 places.',
  })
  receivedAmount!: string;

  @Transform(trim)
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class BankTransferDecisionDto {
  @Transform(trim)
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason!: string;
}

export class BankTransferClaimQueryDto {
  @IsOptional()
  @IsEnum(BankTransferClaimStatus)
  status?: BankTransferClaimStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 25;
}

export class CreatePaymentMethodDto {
  @IsUUID()
  marketId!: string;

  @Transform(trim)
  @Matches(/^[A-Za-z]{3}$/)
  currency!: string;

  @IsEnum(BillingPaymentMethodKey)
  methodKey!: BillingPaymentMethodKey;

  @IsOptional()
  @IsEnum(PaymentMethodEnvironment)
  environment?: PaymentMethodEnvironment;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  displayName!: string;
}

export class SetPaymentMethodApprovalDto {
  @IsEnum(PaymentMethodApprovalStatus)
  status!: PaymentMethodApprovalStatus;
}

export class SetPaymentMethodEnabledDto {
  @IsBoolean()
  enabled!: boolean;
}

export class CreateReceivingAccountDto {
  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  bankName!: string;

  @Transform(trim)
  @IsString()
  @MinLength(2)
  @MaxLength(140)
  accountTitle!: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Za-z0-9\- ]{6,34}$/)
  accountNumber?: string;

  @IsOptional()
  @Transform(trim)
  @Matches(/^[A-Za-z0-9 ]{15,42}$/)
  iban?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  raastId?: string;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  paymentInstructions?: string;

  /** Where payers send a receipt. Shown on the invoice page. */
  @IsOptional()
  @Transform(trim)
  @IsEmail()
  @MaxLength(120)
  receiptContactEmail?: string;

  /** Phone / WhatsApp number payers can send a receipt to. */
  @IsOptional()
  @Transform(trim)
  @Matches(/^\+?[0-9][0-9 -]{6,19}$/, {
    message: 'receiptContactPhone must be a phone number.',
  })
  receiptContactPhone?: string;
}

export class ReceivingAccountDecisionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(300)
  reason?: string;
}
