import { RefundReasonCode } from '@prisma/client';
import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';

export class RefundProviderPaymentDto {
  @IsEnum(RefundReasonCode)
  reasonCode!: RefundReasonCode;

  /** Why, in words an auditor can read later. */
  @IsString()
  @MinLength(5)
  @MaxLength(500)
  reason!: string;
}
