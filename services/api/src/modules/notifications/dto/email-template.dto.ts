import { EmailTemplateStatus } from '@prisma/client';
import {
  IsEnum,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  TENANT_MODULE_KEYS,
  TenantModuleKey,
} from '../../../common/constants/tenant-modules';
import {
  EMAIL_TEMPLATE_SCOPE_LEVELS,
  EmailTemplateScopeLevel,
} from '../notifications.constants';

/*
 * Bounds on authored content. The global JSON body limit is 1 MB; these keep a
 * single template well inside it and stop an editor bug from storing megabytes
 * of markup that every send would then render.
 */
export const EMAIL_TEMPLATE_HTML_MAX_LENGTH = 100_000;
export const EMAIL_TEMPLATE_TEXT_MAX_LENGTH = 50_000;
export const EMAIL_TEMPLATE_SUBJECT_MAX_LENGTH = 300;

/*
 * Placement and module reach are authored the same way on create and update, so
 * both DTOs share these. `scopeId` is required for every level except TENANT,
 * which is checked in the service where the tenant is known.
 */
class EmailTemplatePlacementDto {
  @IsOptional()
  @IsIn(EMAIL_TEMPLATE_SCOPE_LEVELS as unknown as string[])
  scopeLevel?: EmailTemplateScopeLevel;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  /* Null or absent means the template applies to every module. */
  @IsOptional()
  @IsIn(TENANT_MODULE_KEYS as unknown as string[])
  moduleKey?: TenantModuleKey | null;
}

export class CreateEmailTemplateDto extends EmailTemplatePlacementDto {
  /*
   * ITEM-0181. Optional: the key is what emitters match on, so it is derived
   * from the event on the server rather than typed. Still accepted for API
   * callers that place a second template under an explicit key.
   */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Matches(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/)
  templateKey?: string;

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
  @MaxLength(EMAIL_TEMPLATE_SUBJECT_MAX_LENGTH)
  subjectTemplate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(EMAIL_TEMPLATE_HTML_MAX_LENGTH)
  htmlTemplate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_TEMPLATE_TEXT_MAX_LENGTH)
  textTemplate?: string | null;

  /*
   * ITEM-0181. Optional and ignored for catalog events: what an event supplies
   * is a fact about its emitters, so it comes from the catalog, not from JSON a
   * user typed. Only a template for an event the catalog has no copy for keeps
   * what the caller sends.
   */
  @IsOptional()
  @IsObject()
  availableVariables?: Record<string, unknown>;

  @IsOptional()
  @IsEnum(EmailTemplateStatus)
  status?: EmailTemplateStatus;
}

export class UpdateEmailTemplateDto extends EmailTemplatePlacementDto {
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
  @MaxLength(EMAIL_TEMPLATE_SUBJECT_MAX_LENGTH)
  subjectTemplate?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(EMAIL_TEMPLATE_HTML_MAX_LENGTH)
  htmlTemplate?: string;

  @IsOptional()
  @IsString()
  @MaxLength(EMAIL_TEMPLATE_TEXT_MAX_LENGTH)
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
