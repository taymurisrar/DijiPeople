import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateCheckoutSessionDto {
  @IsUUID()
  planPriceId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  promotionCode?: string;
}
