import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class WeekTimeEntryDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsUUID()
  projectId?: string | null;

  @IsOptional()
  @IsUUID()
  projectAssignmentId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  taskId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  activityTypeId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  workLocationId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  costCenterId?: string | null;

  @IsOptional()
  @IsDateString()
  startTime?: string | null;

  @IsOptional()
  @IsDateString()
  endTime?: string | null;

  @Matches(/^\d+(\.\d{1,2})?$/)
  hours!: string;

  @IsOptional()
  @IsBoolean()
  billable = false;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  activityCode?: string | null;
}

class WeekDayEntriesDto {
  @IsUUID()
  dayId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;

  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => WeekTimeEntryDto)
  entries!: WeekTimeEntryDto[];
}

export class UpdateTimesheetWeekEntriesDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekVersion!: number;

  @IsArray()
  @ArrayMaxSize(7)
  @ValidateNested({ each: true })
  @Type(() => WeekDayEntriesDto)
  days!: WeekDayEntriesDto[];
}

export class SubmitTimesheetWeekDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekVersion!: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  lateReason?: string;
}

export class TimesheetLateSubmissionOverrideDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekVersion!: number;

  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class CopyPreviousTimesheetWeekDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  weekVersion!: number;
}

export class RequestTimesheetCorrectionDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class TimesheetWeekDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class TimesheetWeekRejectionDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class TimesheetReopeningRequestDto {
  @IsString()
  @MaxLength(1000)
  reason!: string;
}

export class TimesheetReopeningDecisionDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}
