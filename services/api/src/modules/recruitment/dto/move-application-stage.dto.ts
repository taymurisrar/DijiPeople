import { RecruitmentStage } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class MoveApplicationStageDto {
  @IsEnum(RecruitmentStage)
  stage!: RecruitmentStage;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  rejectionReason?: string;
}
