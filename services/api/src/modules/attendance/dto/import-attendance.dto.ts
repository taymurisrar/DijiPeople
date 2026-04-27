import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ImportAttendanceDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  sourceLabel?: string;
}
