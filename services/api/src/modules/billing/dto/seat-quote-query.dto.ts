import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/** BUG-3330 — the seat total the browser must not compute a second time. */
export class SeatQuoteQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seats!: number;
}
