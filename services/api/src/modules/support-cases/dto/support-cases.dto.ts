import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  SupportCaseChannel,
  SupportCasePriority,
  SupportCaseRelationType,
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
  /*
   * The owning PlatformTeam. When set, `assignedTeam` is overwritten with the
   * team's current name as a display snapshot; the free-text field is kept
   * only for callers and rows that predate teams.
   */
  @IsOptional() @IsUUID() assignedTeamId?: string;
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
  /*
   * The owning PlatformTeam. When set, `assignedTeam` is overwritten with the
   * team's current name as a display snapshot; the free-text field is kept
   * only for callers and rows that predate teams.
   */
  @IsOptional() @IsUUID() assignedTeamId?: string;
  @IsOptional() @IsString() @MaxLength(10000) resolutionSummary?: string;
  @IsOptional() @IsString() @MaxLength(160) resolutionCategory?: string;
  @IsOptional() @IsString() @MaxLength(10000) rootCause?: string;
  @IsOptional() @IsString() @MaxLength(10000) customerUpdate?: string;
}

export class MergeSupportCaseDto {
  @IsUUID() targetCaseId!: string;
  /*
   * Required since WS11: a merge closes the source case for good, and the
   * reason is the only explanation a customer-facing agent will find later.
   */
  @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
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

/** POST :id/transition — every status change, validated by the lifecycle. */
export class TransitionSupportCaseDto {
  @IsEnum(SupportCaseStatus) toStatus!: SupportCaseStatus;
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
  @IsOptional() @IsString() @MaxLength(10000) resolutionSummary?: string;
  @IsOptional() @IsString() @MaxLength(160) resolutionCategory?: string;
  @IsOptional() @IsString() @MaxLength(10000) rootCause?: string;
  @IsOptional() @IsString() @MaxLength(10000) customerMessage?: string;
  @IsOptional() @IsUUID() assignedTeamId?: string;
  @IsOptional() @IsBoolean() confirmClosure?: boolean;
}

export class EscalateSupportCaseDto {
  @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
  @IsOptional() @IsUUID() assignedTeamId?: string;
  @IsOptional() @IsUUID() assignedToUserId?: string;
}

export class RequestSupportCaseInfoDto {
  @IsString() @MinLength(3) @MaxLength(10000) customerMessage!: string;
  @IsOptional() @IsString() @MaxLength(240) subject?: string;
}

export class ResolveSupportCaseDto {
  @IsString() @MinLength(3) @MaxLength(10000) resolutionSummary!: string;
  @IsString() @MinLength(2) @MaxLength(160) resolutionCategory!: string;
  @IsOptional() @IsString() @MaxLength(10000) rootCause?: string;
  /** Optional note to the customer, recorded and sent like a customer update. */
  @IsOptional() @IsString() @MaxLength(10000) customerMessage?: string;
}

export class ReopenSupportCaseDto {
  @IsString() @MinLength(3) @MaxLength(2000) reason!: string;
}

/**
 * Either or both owners. `null` clears that owner; an omitted key leaves it
 * as it is. At least one key must be present — checked by the service, since
 * "neither" is a shape class-validator cannot express on optional fields.
 */
export class AssignSupportCaseDto {
  @IsOptional() @IsUUID() assignedToUserId?: string | null;
  @IsOptional() @IsUUID() assignedTeamId?: string | null;
}

export class CreateSupportCaseRelationDto {
  @IsUUID() targetCaseId!: string;
  @IsOptional()
  @IsEnum(SupportCaseRelationType)
  relationType?: SupportCaseRelationType;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
}
