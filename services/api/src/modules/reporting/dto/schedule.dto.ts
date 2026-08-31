import { ReportExportFormat, ReportScheduleFrequency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { PERIOD_PRESETS, type PeriodPreset } from '../engine/period.engine';
import { ReportFilterDto } from './analytics-query.dto';

export class CreateReportScheduleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(200)
  targetKey!: string;

  @IsOptional()
  @IsUUID('4')
  reportDefinitionId?: string;

  @IsEnum(ReportScheduleFrequency)
  frequency!: ReportScheduleFrequency;

  @IsInt()
  @Min(0)
  @Max(23)
  hour!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(59)
  minute?: number;

  /** 0 = Sunday. Required for WEEKLY, ignored otherwise. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number;

  /**
   * Required for MONTHLY. Capped at 28 rather than 31 so a schedule cannot be
   * created that silently means "the last day" in February — the service still
   * clamps, but refusing here makes the behaviour visible at creation instead
   * of eleven months later.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  /** An IANA zone. Validated against the runtime's own zone list in the service. */
  @IsString()
  @MaxLength(64)
  timezone!: string;

  @IsOptional()
  @IsEnum(ReportExportFormat)
  format?: ReportExportFormat;

  @IsIn(PERIOD_PRESETS as unknown as string[])
  periodPreset!: PeriodPreset;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto[];

  /**
   * User ids or work email addresses. Both are resolved to users **in this
   * tenant** at write time and again at execution time; anything that does not
   * resolve is refused rather than skipped.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(320, { each: true })
  recipients!: string[];

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

/**
 * Updating a schedule is a full replace, not a merge.
 *
 * ReportScheduleService.update writes every column from the input, so a
 * partial body would silently null out whatever it omitted — a schedule
 * quietly losing its recipients is exactly the failure this feature must not
 * have. Requiring the whole shape makes the semantics visible at the edge
 * rather than surprising at the database.
 */
export class UpdateReportScheduleDto extends CreateReportScheduleDto {}

export class CreateReportExportDto {
  @IsString()
  @MaxLength(200)
  targetKey!: string;

  @IsEnum(ReportExportFormat)
  format!: ReportExportFormat;

  @IsOptional()
  @IsIn(PERIOD_PRESETS as unknown as string[])
  preset?: PeriodPreset;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  to?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => ReportFilterDto)
  filters?: ReportFilterDto[];
}
