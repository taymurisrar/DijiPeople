import { RecruitmentStage } from '@prisma/client';
import {
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsHexColor,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class RecruitmentPipelineStageDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsEnum(RecruitmentStage)
  stageKey!: RecruitmentStage;

  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @IsHexColor()
  color?: string;

  @IsInt()
  sortOrder!: number;

  @IsOptional()
  @IsBoolean()
  isTerminal?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertRecruitmentPipelineDto {
  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsBoolean()
  allowBackwardMove?: boolean;

  @IsOptional()
  @IsBoolean()
  requireRejectReason?: boolean;

  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecruitmentPipelineStageDto)
  stages!: RecruitmentPipelineStageDto[];
}
