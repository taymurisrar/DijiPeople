import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class PreviewEmailTemplateDto {
  @IsObject()
  variables!: Record<string, unknown>;
}

export class TestSendEmailTemplateDto {
  @IsEmail()
  @MaxLength(320)
  recipient!: string;

  @IsOptional()
  @IsString()
  cc?: string | null;

  @IsOptional()
  @IsString()
  bcc?: string | null;

  @IsObject()
  variables!: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean;
}
