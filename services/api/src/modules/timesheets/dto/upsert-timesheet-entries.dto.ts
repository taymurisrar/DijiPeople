import { TimesheetEntryType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class TimesheetDailyEntryDto {
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsEnum(TimesheetEntryType)
  entryType?: TimesheetEntryType;

  @IsOptional()
  @Matches(/^\d+(\.\d{1,2})?$/)
  hoursWorked?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  leaveRequestId?: string | null;
}

export class UpsertTimesheetEntriesDto {
  @IsArray()
  @ArrayMaxSize(31)
  @ValidateNested({ each: true })
  @Type(() => TimesheetDailyEntryDto)
  entries!: TimesheetDailyEntryDto[];
}
