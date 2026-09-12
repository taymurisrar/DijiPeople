import { IsOptional, IsUUID } from 'class-validator';

/** EXECPLAN-0037 — quoted before a tenant confirms a plan change. */
export class PlanChangePreviewQueryDto {
  @IsUUID()
  toPlanId!: string;

  /**
   * Names a specific price on the target plan — needed to change billing
   * cycle on the same plan, since `toPlanId` alone cannot express "same plan,
   * different cycle". Optional: `PlanChangeService` resolves one from the
   * subscription's own currency/cycle/market when this is absent, same as it
   * always has.
   */
  @IsOptional()
  @IsUUID()
  toPlanPriceId?: string;
}
