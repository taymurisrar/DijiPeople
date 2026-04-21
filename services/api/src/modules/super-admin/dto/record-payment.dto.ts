import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';
import { PaymentMethod, PaymentStatus } from '@prisma/client';

export class RecordPaymentDto {
  @IsUUID()
  tenantId!: string;

  @IsUUID()
  subscriptionId!: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;

  @IsString()
  @MaxLength(3)
  currency!: string;

  @IsEnum(PaymentMethod)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @IsOptional()
  @IsString()
  @MaxLength(190)
  stripePaymentIntentId?: string;

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
