import {
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
}
