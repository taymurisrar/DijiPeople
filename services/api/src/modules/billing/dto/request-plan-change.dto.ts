import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

/** EXECPLAN-0037 — BUG-3331: the plan-change path that does not 409. */
export class RequestPlanChangeDto {
  @IsUUID()
  toPlanId!: string;

  @IsOptional()
  @IsUUID()
  toPlanPriceId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
