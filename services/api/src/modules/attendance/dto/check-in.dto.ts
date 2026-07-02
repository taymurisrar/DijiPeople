import { AttendanceMode } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class CheckInDto {
  @IsEnum(AttendanceMode)
  attendanceMode!: AttendanceMode;

  @ValidateIf(
    (value: CheckInDto) =>
      (value.attendanceMode ?? AttendanceMode.OFFICE) === AttendanceMode.OFFICE,
  )
  @IsUUID()
  officeLocationId?: string;

  @IsOptional()
  @IsNumber()
  remoteLatitude?: number;

  @IsOptional()
  @IsNumber()
  remoteLongitude?: number;

  @IsOptional()
  @IsNumber()
  locationAccuracy?: number;

  @IsOptional()
  @IsString()
  locationCapturedAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  remoteAddressText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  checkInAddressText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  workSummary?: string;
}
