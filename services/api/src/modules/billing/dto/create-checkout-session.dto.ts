import { PaymentProvider } from '@prisma/client';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsUUID()
  planPriceId!: string;

  @IsInt()
  @Min(1)
  seatQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promotionCode?: string;

  /**
   * Which of the price's offered `paymentProviders` the tenant picked. Absent
   * means "route by currency", exactly as before this field existed. The
   * service re-checks it against what it offers for this price.
   */
  @IsOptional()
  @IsIn(Object.values(PaymentProvider))
  provider?: PaymentProvider;
}
