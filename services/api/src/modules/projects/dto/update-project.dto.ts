import {
  ProjectApprovalMode,
  ProjectBillingStatus,
  ProjectBillingType,
  ProjectDeliveryStatus,
  ProjectHealth,
  ProjectPriority,
  ProjectRiskLevel,
  ProjectStatus,
} from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsUUID()
  organizationId?: string | null;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string | null;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string | null;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string | null;

  @IsOptional()
  @IsEnum(ProjectBillingType)
  billingType?: ProjectBillingType;

  @IsOptional()
  @IsNumberString()
  budgetHours?: string | null;

  @IsOptional()
  @IsNumberString()
  budgetAmount?: string | null;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  budgetCurrencyCode?: string | null;

  @IsOptional()
  @IsNumberString()
  consumedAmount?: string | null;

  @IsOptional()
  @IsNumberString()
  burnRate?: string | null;

  @IsOptional()
  @IsNumberString()
  plannedHours?: string | null;

  @IsOptional()
  @IsNumberString()
  actualHours?: string | null;

  @IsOptional()
  @IsNumberString()
  remainingHours?: string | null;

  @IsOptional()
  @IsEnum(ProjectHealth)
  projectHealth?: ProjectHealth;

  @IsOptional()
  @IsEnum(ProjectRiskLevel)
  riskLevel?: ProjectRiskLevel;

  @IsOptional()
  @IsEnum(ProjectPriority)
  priority?: ProjectPriority;

  @IsOptional()
  @IsEnum(ProjectDeliveryStatus)
  deliveryStatus?: ProjectDeliveryStatus;

  @IsOptional()
  @IsEnum(ProjectBillingStatus)
  billingStatus?: ProjectBillingStatus;

  @IsOptional()
  @IsBoolean()
  allowTimesheets?: boolean;

  @IsOptional()
  @IsBoolean()
  requireApproval?: boolean;

  @IsOptional()
  @IsEnum(ProjectApprovalMode)
  approvalMode?: ProjectApprovalMode;

  @IsOptional()
  @IsUUID()
  holidayCalendarId?: string | null;

  @IsOptional()
  @IsUUID()
  workScheduleId?: string | null;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsEnum(ProjectStatus)
  status?: ProjectStatus;
}
