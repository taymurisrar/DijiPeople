import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class AttendanceSummaryQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  view: 'day' | 'week' | 'month' = 'week';
}
