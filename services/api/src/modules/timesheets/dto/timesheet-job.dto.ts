import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { TimesheetJobType } from '@prisma/client';

export class RunTimesheetJobDto {
  @IsEnum(TimesheetJobType)
  jobType!: TimesheetJobType;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  idempotencyKey?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(2000)
  @Max(2200)
  year?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month?: number;
}
