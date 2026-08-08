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
