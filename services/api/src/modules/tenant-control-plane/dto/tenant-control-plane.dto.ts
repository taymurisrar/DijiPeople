import { Transform, Type } from 'class-transformer';
import {
  ApplicationReleaseChannel,
  TenantAppUpdatePolicy,
  TenantStatus,
} from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

function trimmed({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim() : value;
}

export class ChangeTenantStatusDto {
  @IsEnum(TenantStatus)
  status!: TenantStatus;

  /**
   * Required for every lifecycle move. Suspension and decommissioning are
   * customer-visible; an unexplained one is not defensible after the fact.
   */
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

/**
 * Tenant Owners and Service Accounts are the only identities Platform Admin may
 * create. Employees, HR managers and ordinary application users belong to the
 * tenant product and are deliberately not expressible here.
 */
export class CreateTenantIdentityDto {
  @IsIn(['TENANT_OWNER', 'SERVICE_ACCOUNT'])
  identityType!: 'TENANT_OWNER' | 'SERVICE_ACCOUNT';

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  firstName!: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsEmail()
  @MaxLength(320)
  email!: string;

  /** Machine identities describe what they are for; humans do not need to. */
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  purpose?: string;

  @IsOptional()
  @IsUUID()
  businessUnitId?: string;
}

export class UpdateTenantIdentityDto {
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  firstName?: string;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(60)
  lastName?: string;

  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;
}

export class TransferTenantOwnershipDto {
  @IsUUID()
  toUserId!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class DeleteTenantIdentityDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;
}

export class TenantModuleOverrideDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key!: string;

  /**
   * `null` clears the override so the module falls back to the plan
   * entitlement. `true`/`false` set an explicit tenant decision.
   */
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean | null;
}

export class UpdateTenantModulesDto {
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => TenantModuleOverrideDto)
  overrides!: TenantModuleOverrideDto[];

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class UpdateTenantAppDto {
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @IsOptional()
  @IsEnum(ApplicationReleaseChannel)
  channel?: ApplicationReleaseChannel;

  @IsOptional()
  @IsEnum(TenantAppUpdatePolicy)
  updatePolicy?: TenantAppUpdatePolicy;

  /** Required when updatePolicy is PINNED; ignored otherwise. */
  @IsOptional()
  @IsUUID()
  assignedReleaseId?: string | null;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  minimumVersion?: string | null;

  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string | null;
}

/**
 * Cancelling a tenant subscription.
 *
 * Deliberately its own operation rather than a status field on the general
 * subscription editor: cancellation ends billing, is a precondition for
 * decommissioning and erasure, and needs a reason on the record. Reaching it
 * through a form that also requires a plan and a price is how it ended up
 * effectively unavailable.
 */
export class CancelTenantSubscriptionDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason!: string;

  /**
   * A Stripe-backed subscription keeps billing in Stripe until it is cancelled
   * there too. The caller has to acknowledge that rather than be told the
   * customer stopped being charged when they did not.
   */
  @IsOptional()
  @IsBoolean()
  acknowledgeStripeSubscription?: boolean;

  /** Defaults to now. Set it to end the term on a future date instead. */
  @IsOptional()
  @IsDateString()
  effectiveAt?: string;
}

export class RetryTenantProvisioningDto {
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

/**
 * Erase is deliberately awkward to express.
 *
 * The typed tenant name and the literal confirmation phrase are both required
 * server-side: the dialog asks for them so the operator has to stop and read,
 * and the API re-checks them so a scripted call cannot skip the stop.
 */
export class EraseTenantDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(1000)
  reason!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  confirmTenantName!: string;

  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  confirmPhrase!: string;

  @IsBoolean()
  acknowledged!: boolean;

  /**
   * Erasure destroys tenant-scoped invoices and payments along with everything
   * else. When outstanding billing exists the caller has to say so explicitly
   * rather than discover it afterwards.
   */
  @IsOptional()
  @IsBoolean()
  acknowledgeOutstandingBilling?: boolean;
}

export class AddTenantCustomDomainDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(253)
  hostname!: string;
}

export class TenantDomainActionDto {
  @Transform(trimmed)
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ValidateWorkspaceSlugDto {
  @Transform(trimmed)
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  slug!: string;
}

export const ERASE_TENANT_CONFIRMATION_PHRASE = 'ERASE TENANT';
