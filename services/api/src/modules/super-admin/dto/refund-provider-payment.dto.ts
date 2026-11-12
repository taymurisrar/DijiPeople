import { RefundReasonCode } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RefundProviderPaymentDto {
  @IsEnum(RefundReasonCode)
  reasonCode!: RefundReasonCode;

  /** Why, in words an auditor can read later. */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;

  /**
   * Bank-transfer payments only: the bank's reference for the transfer that
   * returned the money. Ignored for gateway payments.
   */
  @IsOptional()
  @IsString()
  @MinLength(4)
  @MaxLength(64)
  bankRefundReference?: string;
}
