import {
  ProjectApprovalMode,
  ProjectBillingStatus,
  ProjectBillingType,
  ProjectDeliveryStatus,
  ProjectHealth,
  ProjectPriority,
  ProjectRiskLevel,
  ProjectStatus,
  ProjectType,
} from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumberString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Matches,
} from 'class-validator';

export class CreateProjectDto {
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
  @IsUUID()
  organizationId?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;

  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsUUID()
  projectManagerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  accountManagerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  deliveryManagerEmployeeId?: string;

  @IsOptional()
  @IsUUID()
  approvalManagerEmployeeId?: string;

  @IsOptional()
  @IsEnum(ProjectType)
  projectType?: ProjectType;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  timezone?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  currencyCode?: string;

  @IsOptional()
  @IsEnum(ProjectBillingType)
  billingType?: ProjectBillingType;

  @IsOptional()
  @IsNumberString()
  budgetHours?: string;

  @IsOptional()
  @IsNumberString()
  budgetAmount?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/)
  budgetCurrencyCode?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  requiredResourceCount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  requiredSkills?: string;

  @IsOptional()
  @IsNumberString()
  billableHours?: string;

  @IsOptional()
  @IsNumberString()
  nonBillableHours?: string;

  @IsOptional()
  @IsNumberString()
  billingRateAmount?: string;

  @IsOptional()
  @IsNumberString()
  costBudgetAmount?: string;

  @IsOptional()
  @IsNumberString()
  consumedAmount?: string;

  @IsOptional()
  @IsNumberString()
  burnRate?: string;

  @IsOptional()
  @IsNumberString()
  plannedHours?: string;

  @IsOptional()
  @IsNumberString()
  actualHours?: string;

  @IsOptional()
  @IsNumberString()
  remainingHours?: string;

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
  holidayCalendarId?: string;

  @IsOptional()
  @IsUUID()
  workScheduleId?: string;

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
