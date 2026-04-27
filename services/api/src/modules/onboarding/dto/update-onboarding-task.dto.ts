import { OnboardingTaskStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

export class UpdateOnboardingTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(160)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsUUID()
  assignedUserId?: string | null;

  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @IsOptional()
  @IsEnum(OnboardingTaskStatus)
  status?: OnboardingTaskStatus;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
