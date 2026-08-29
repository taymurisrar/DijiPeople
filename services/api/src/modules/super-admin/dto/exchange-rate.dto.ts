import { IsNumber, IsPositive, IsString, Length, Max } from 'class-validator';

/**
 * An operator's correction to a rate.
 *
 * The reason is required rather than optional. A rate is what a revenue figure
 * is made of, and "why is last month's number different?" needs an answer that
 * outlives whoever typed it — the audit entry carries this text.
 */
export class SetExchangeRateDto {
  /**
   * 1 of the quoted currency, expressed in the reporting currency.
   *
   * Bounded above because the realistic range for any pair the platform trades
   * in is nowhere near it, and an unbounded numeric that multiplies every money
   * figure on the dashboard is worth a ceiling.
   */
  @IsNumber({ maxDecimalPlaces: 8 })
  @IsPositive()
  @Max(1_000_000)
  rate!: number;

  @IsString()
  @Length(3, 240)
  reason!: string;
}
