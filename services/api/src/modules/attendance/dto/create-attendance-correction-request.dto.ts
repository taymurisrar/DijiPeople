import { AttendanceCorrectionType } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class CreateAttendanceCorrectionRequestDto {
  @IsOptional()
  @IsUUID()
  attendanceEntryId?: string;

  @IsEnum(AttendanceCorrectionType)
  correctionType!: AttendanceCorrectionType;

  @IsOptional()
  @IsDateString()
  requestedCheckInAtUtc?: string;

  @IsOptional()
  @IsDateString()
  requestedCheckOutAtUtc?: string;

  @IsString()
  @MaxLength(1000)
  reason!: string;
}
