import { RecruitmentStage } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ApplicationQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(RecruitmentStage)
  stage?: RecruitmentStage;

  @IsOptional()
  @IsUUID()
  candidateId?: string;

  @IsOptional()
  @IsUUID()
  jobOpeningId?: string;

  @IsOptional()
  @IsString()
  rejectionReason?: string;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @Min(1)
  @Max(100)
  pageSize = 50;
}
