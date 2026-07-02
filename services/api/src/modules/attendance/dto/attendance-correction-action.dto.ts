import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class AttendanceCorrectionActionDto {
  @IsOptional()
  @IsDateString()
  requestedCheckInAtUtc?: string;

  @IsOptional()
  @IsDateString()
  requestedCheckOutAtUtc?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
