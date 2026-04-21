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

export class UpdateManualAttendanceEntryDto {
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  checkInTime?: string;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  checkOutTime?: string;

  @IsOptional()
  @IsEnum(AttendanceMode)
  attendanceMode?: AttendanceMode;

  @ValidateIf(
    (value: UpdateManualAttendanceEntryDto) =>
      value.attendanceMode === AttendanceMode.OFFICE,
  )
  @IsOptional()
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

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  adjustmentReason?: string;
}
