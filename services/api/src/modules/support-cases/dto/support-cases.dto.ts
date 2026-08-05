import { Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  SupportCaseChannel,
  SupportCasePriority,
  SupportCaseSeverity,
  SupportCaseStatus,
} from '@prisma/client';

export class SupportCaseQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(SupportCaseStatus) status?: SupportCaseStatus;
  @IsOptional() @IsEnum(SupportCasePriority) priority?: SupportCasePriority;
  @IsOptional() @IsEnum(SupportCaseSeverity) severity?: SupportCaseSeverity;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() customerOnboardingId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() parentCaseId?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MaxLength(120) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(120) productArea?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 25;
  @IsOptional() @IsString() viewKey?: string;
  @IsOptional() @IsString() filters?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() fields?: string;
}

export class CreateSupportCaseDto {
  @IsString() @MaxLength(240) title!: string;
  @IsString() @MaxLength(10000) description!: string;
  @IsOptional() @IsEnum(SupportCasePriority) priority?: SupportCasePriority;
  @IsOptional() @IsEnum(SupportCaseSeverity) severity?: SupportCaseSeverity;
  @IsOptional() @IsEnum(SupportCaseChannel) channel?: SupportCaseChannel;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() customerOnboardingId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() parentCaseId?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MaxLength(120) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(120) productArea?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  escalationLevel?: number;
  @IsOptional() @IsString() @MaxLength(160) requesterName?: string;
  @IsOptional() @IsEmail() requesterEmail?: string;
  @IsOptional() @IsString() requesterUserId?: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsString() @MaxLength(120) assignedTeam?: string;
  @IsOptional() @IsString() errorLogId?: string;
}

export class UpdateSupportCaseDto {
  @IsOptional() @IsString() @MaxLength(240) title?: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsEnum(SupportCaseStatus) status?: SupportCaseStatus;
  @IsOptional() @IsEnum(SupportCasePriority) priority?: SupportCasePriority;
  @IsOptional() @IsEnum(SupportCaseSeverity) severity?: SupportCaseSeverity;
  @IsOptional() @IsEnum(SupportCaseChannel) channel?: SupportCaseChannel;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() tenantId?: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsUUID() subscriptionId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  @IsOptional() @IsUUID() customerOnboardingId?: string;
  @IsOptional() @IsUUID() contractId?: string;
  @IsOptional() @IsUUID() parentCaseId?: string;
  @IsOptional() @IsString() @MaxLength(120) category?: string;
  @IsOptional() @IsString() @MaxLength(120) subcategory?: string;
  @IsOptional() @IsString() @MaxLength(120) productArea?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10)
  escalationLevel?: number;
  @IsOptional() @IsString() @MaxLength(160) requesterName?: string;
  @IsOptional() @IsEmail() requesterEmail?: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsString() @MaxLength(120) assignedTeam?: string;
  @IsOptional() @IsString() @MaxLength(10000) resolutionSummary?: string;
  @IsOptional() @IsString() @MaxLength(160) resolutionCategory?: string;
  @IsOptional() @IsString() @MaxLength(10000) rootCause?: string;
  @IsOptional() @IsString() @MaxLength(10000) customerUpdate?: string;
}

export class MergeSupportCaseDto {
  @IsUUID() targetCaseId!: string;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}

export class LinkSupportIncidentDto {
  @IsString() errorLogId!: string;
}

export class AddSupportCaseActivityDto {
  @IsString() @MaxLength(80) eventType!: string;
  @IsString() @MaxLength(10000) message!: string;
}

export class SendCustomerUpdateDto {
  @IsOptional() @IsEmail() recipientEmail?: string;
  @IsString() @MaxLength(240) subject!: string;
  @IsString() @MaxLength(10000) body!: string;
}
