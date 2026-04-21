import { IsDateString, IsOptional } from 'class-validator';

export class CreatePayrollCycleDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @IsDateString()
  runDate?: string;
}

