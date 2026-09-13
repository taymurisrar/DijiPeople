import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  EMAIL_TEMPLATE_HTML_MAX_LENGTH,
  EMAIL_TEMPLATE_SUBJECT_MAX_LENGTH,
  EMAIL_TEMPLATE_TEXT_MAX_LENGTH,
} from './email-template.dto';

/*
 * ITEM-0181. Every field is optional. With no body the saved template renders
 * against the catalog's sample values, and the content fields let the editor
 * preview what is on screen before it is saved. Overrides are rendered, never
 * stored.
 */
export class PreviewEmailTemplateDto {
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_TEMPLATE_SUBJECT_MAX_LENGTH)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_TEMPLATE_HTML_MAX_LENGTH)
  htmlTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_TEMPLATE_TEXT_MAX_LENGTH)
  textTemplate?: string | null;
}

/* A template being created has no id yet, so its preview names the event. */
export class PreviewDraftEmailTemplateDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  eventCode!: string;

  @IsString()
  @MaxLength(EMAIL_TEMPLATE_SUBJECT_MAX_LENGTH)
  subjectTemplate!: string;

  @IsString()
  @MaxLength(EMAIL_TEMPLATE_HTML_MAX_LENGTH)
  htmlTemplate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_TEMPLATE_TEXT_MAX_LENGTH)
  textTemplate?: string | null;

  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;
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

  /* Optional since ITEM-0181: absent means the catalog's sample values. */
  @IsOptional()
  @IsObject()
  variables?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  dryRun?: boolean;
}
