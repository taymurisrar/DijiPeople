import {
  AttendanceEntrySource,
  AttendanceEntryStatus,
  AttendanceMode,
} from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CreateManualAttendanceEntryDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  date!: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  checkInTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  checkOutTime?: string;

  @IsEnum(AttendanceMode)
  attendanceMode!: AttendanceMode;

  @ValidateIf(
    (value: CreateManualAttendanceEntryDto) =>
      value.attendanceMode === AttendanceMode.OFFICE,
  )
  @IsUUID()
  officeLocationId?: string;

  @IsOptional()
  @IsEnum(AttendanceEntryStatus)
  status?: AttendanceEntryStatus;

  @IsOptional()
  @IsEnum(AttendanceEntrySource)
  source?: AttendanceEntrySource;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkInNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  checkOutNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  workSummary?: string;

  @IsOptional()
  @IsNumber()
  remoteLatitude?: number;

  @IsOptional()
  @IsNumber()
  remoteLongitude?: number;

  @IsOptional()
  @IsString()
  @MaxLength(250)
  remoteAddressText?: string;

  @IsString()
  @MaxLength(1000)
  adjustmentReason!: string;
}
