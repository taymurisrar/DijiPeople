import { AttendanceCorrectionStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsOptional, IsString, Max, Min } from 'class-validator';

export class AttendanceCorrectionQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsIn(['mine', 'pending', 'team', 'approved', 'rejected', 'all'])
  view?: 'mine' | 'pending' | 'team' | 'approved' | 'rejected' | 'all';

  @IsOptional()
  @IsEnum(AttendanceCorrectionStatus)
  status?: AttendanceCorrectionStatus;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  pageSize = 20;
}
