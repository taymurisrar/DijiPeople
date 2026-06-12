import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateAttendancePolicyDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  lateCheckInGraceMinutes!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(180)
  lateCheckOutGraceMinutes!: number;

  @Type(() => Boolean)
  @IsBoolean()
  requireOfficeLocationForOfficeMode!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  requireRemoteLocationForRemoteMode!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  allowRemoteWithoutLocation!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  allowManualAdjustments!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  preventDuplicateAttendance!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  allowCheckInOnApprovedLeave!: boolean;

  @Type(() => Boolean)
  @IsBoolean()
  markMissingCheckout!: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowOffDayCheckIn?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowHolidayCheckIn?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  allowHrAdminOverride?: boolean;
}
