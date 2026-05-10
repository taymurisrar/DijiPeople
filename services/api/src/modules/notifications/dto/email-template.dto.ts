import { EmailTemplateStatus } from '@prisma/client';
import {
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateEmailTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
  templateKey!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  eventCode!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subjectTemplate!: string;

  @IsString()
  @MinLength(1)
  htmlTemplate!: string;

  @IsOptional()
  @IsString()
  textTemplate?: string | null;

  @IsObject()
  availableVariables!: Record<string, unknown>;

  @IsOptional()
  @IsEnum(EmailTemplateStatus)
  status?: EmailTemplateStatus;
}

export class UpdateEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string | null;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  htmlTemplate?: string;

  @IsOptional()
  @IsString()
  textTemplate?: string | null;

  @IsOptional()
  @IsObject()
  availableVariables?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(EmailTemplateStatus)
  status?: EmailTemplateStatus;
}

export class CloneEmailTemplateDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
  templateKey?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name?: string;
}
