import { Type } from 'class-transformer';
import { LeadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Max, Min } from 'class-validator';

export class LeadQueryDto {
  @IsOptional()
  @IsEnum(LeadStatus)
  status?: LeadStatus;

  @IsOptional()
  @IsString()
  search?: string;

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
