import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AttendanceCorrectionActionDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
