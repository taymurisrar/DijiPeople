import { Type } from 'class-transformer';
import { IsBoolean, IsInt, Max, Min } from 'class-validator';

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
}
