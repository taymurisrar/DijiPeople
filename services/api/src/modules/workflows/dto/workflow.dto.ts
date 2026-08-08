import { WorkflowActionType, WorkflowStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  TENANT_MODULE_KEYS,
  TenantModuleKey,
} from '../../../common/constants/tenant-modules';
import {
  EMAIL_TEMPLATE_SCOPE_LEVELS,
  EmailTemplateScopeLevel,
} from '../../notifications/notifications.constants';
import { WORKFLOW_CONDITION_OPERATORS } from '../workflow-conditions';
import { WORKFLOW_RECIPIENT_MODES } from '../workflow-runtime.service';

export class WorkflowConditionDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  field!: string;

  @IsIn(WORKFLOW_CONDITION_OPERATORS as unknown as string[])
  operator!: (typeof WORKFLOW_CONDITION_OPERATORS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  value?: string | null;
}

export class WorkflowActionDto {
  @IsOptional()
  @IsEnum(WorkflowActionType)
  type?: WorkflowActionType;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /* SEND_EMAIL: the template to render. One of the two is required. */
  @IsOptional()
  @IsUUID()
  templateId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  templateKey?: string | null;

  @IsOptional()
  @IsIn(WORKFLOW_RECIPIENT_MODES as unknown as string[])
  recipientMode?: (typeof WORKFLOW_RECIPIENT_MODES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(320)
  recipientAddress?: string | null;
}

class WorkflowPlacementDto {
  @IsOptional()
  @IsIn(EMAIL_TEMPLATE_SCOPE_LEVELS as unknown as string[])
  scopeLevel?: EmailTemplateScopeLevel;

  @IsOptional()
  @IsUUID()
  scopeId?: string | null;

  @IsOptional()
  @IsIn(TENANT_MODULE_KEYS as unknown as string[])
  moduleKey?: TenantModuleKey | null;
}

export class CreateWorkflowDto extends WorkflowPlacementDto {
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
  @MaxLength(120)
  eventCode!: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionDto)
  conditions?: WorkflowConditionDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions!: WorkflowActionDto[];
}

export class UpdateWorkflowDto extends WorkflowPlacementDto {
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
  @MaxLength(120)
  eventCode?: string;

  @IsOptional()
  @IsEnum(WorkflowStatus)
  status?: WorkflowStatus;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowConditionDto)
  conditions?: WorkflowConditionDto[];

  /* Omitting actions leaves the existing ones untouched. */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkflowActionDto)
  actions?: WorkflowActionDto[];
}
