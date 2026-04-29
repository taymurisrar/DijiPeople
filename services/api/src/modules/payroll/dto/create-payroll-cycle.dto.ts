import { ProcessingCycleType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreatePayrollCycleDto {
  @IsDateString()
  periodStart!: string;

  @IsDateString()
  periodEnd!: string;

  @IsOptional()
  @IsDateString()
  runDate?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  processingCycleId?: string;

  @IsOptional()
  @IsEnum(ProcessingCycleType)
  cycleType?: ProcessingCycleType;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  cycleName?: string;
}
