import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  IsBoolean,
  IsIn,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  PartnerCommissionStatus,
  PartnerStatus,
  PartnerType,
  PartnershipModel,
} from '@prisma/client';
import { PLATFORM_CURRENCY_CODES } from '@repo/config';

export class PartnerQueryDto {
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(PartnerStatus) status?: PartnerStatus;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  /*
   * `Min(1)`, not `Min(10)` (BUG-1554).
   *
   * The admin console asks its own partners API for `pageSize=5` and got a 400
   * every time the screen loaded — the client and the server disagreeing about
   * a constraint entirely internal to the product. This bound was the outlier:
   * every other query DTO in the repository uses `Min(1)`.
   *
   * A *lower* bound on a page size protects nothing. The upper bound does, and
   * stays: an unbounded page size is a way to ask for the whole table.
   */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
  @IsOptional() @IsString() viewKey?: string;
  @IsOptional() @IsString() filters?: string;
  @IsOptional() @IsString() sort?: string;
  @IsOptional() @IsString() fields?: string;
}
export class CreatePartnerDto {
  @IsEnum(PartnerType) type!: PartnerType;
  @IsString() @MaxLength(160) displayName!: string;
  @IsOptional() @IsString() @MaxLength(160) legalName?: string;
  @IsOptional() @IsString() @MaxLength(160) companyName?: string;
  @IsOptional() @IsString() @MaxLength(100) contactFirstName?: string;
  @IsOptional() @IsString() @MaxLength(100) contactLastName?: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() website?: string;
  @IsOptional() @IsString() taxId?: string;
  /*
   * ADR-0026 D1. The admin form has always shown this field, and the DTO never
   * declared it, so it was dropped on every create and edit (BUG-1743 lineage).
   */
  @IsOptional() @IsEnum(PartnershipModel) partnershipModel?: PartnershipModel;
  /*
   * ADR-0026 D3: a percentage 0–100 with at most two decimals, matching the
   * Decimal(5,2) column, so 12.345 is refused rather than silently rounded.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  defaultCommissionRate!: number;
  /*
   * A currency, not a three-character string (BUG-1425).
   *
   * `@MaxLength(3)` rejected `"NOT_A_CURRENCY"` for being fourteen
   * characters and accepted `"5"`, `"X"` and `"ZZZ"` for fitting. The
   * partner form offered a numeric input for this field, so `"5"` is not
   * hypothetical — partners in production carry it (BUG-1747).
   */
  @IsOptional()
  @IsIn(PLATFORM_CURRENCY_CODES as readonly string[], {
    message: 'currencyCode must be a supported currency code.',
  })
  currencyCode?: string;
  /*
   * No `status`, `accountStatus`, `partnerNumber` or `code` (ADR-0026 D1,
   * ADR-0027). A partner is created at DRAFT and moves only through the
   * lifecycle actions the server validates; `status` here let an operator
   * create a partner directly as ACTIVE, past every agreement and onboarding
   * gate, and — through `PartialType` below — PATCH one between any two
   * non-ACTIVE states with no timeline entry. With `forbidNonWhitelisted`, a
   * body carrying any of them is now refused rather than honoured.
   */
  @IsOptional() @IsUUID() assignedToUserId?: string;
  @IsOptional() @IsString() @MaxLength(4000) notes?: string;
}
/*
 * WP-08 finding 3. `extends CreatePartnerDto {}` inherited every one of its
 * required fields (`type`, `displayName`, `email`, `defaultCommissionRate`)
 * unchanged, so `PATCH /partners/:id` was never actually a partial update —
 * omitting any one of them failed validation before the request reached the
 * service, regardless of what the caller was trying to change. The admin
 * console never noticed because its edit form always resubmits the whole
 * record; a caller sending a genuinely partial body could not.
 *
 * `PartialType` wraps every inherited field in `@IsOptional()` while keeping
 * its other validators, which is the standard fix elsewhere in this
 * repository (`update-employment-type.dto.ts` and others). The service's
 * `update()` now validates identity-field policy and duplicate detection
 * against the record as it *would* read after the patch — existing fields the
 * patch does not mention, merged with the fields it does — rather than
 * against the patch body alone, so this cannot be satisfied by omitting the
 * field that would fail it.
 */
export class UpdatePartnerDto extends PartialType(CreatePartnerDto) {}
export class CreatePartnerCommissionDto {
  @IsOptional() @IsUUID() leadId?: string;
  @IsOptional() @IsUUID() customerAccountId?: string;
  @IsOptional() @IsUUID() invoiceId?: string;
  /** The amount the commission is a percentage of, in `currencyCode`. */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseAmount!: number;
  /*
   * A percentage 0–100 with two decimals, like the partner default it falls
   * back to when omitted (ADR-0026 D3). There is no amount field: the server
   * computes it from these two, so a caller cannot record an amount that
   * disagrees with its own base and rate.
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  commissionRate?: number;
  /*
   * A currency, not a three-character string (BUG-1425).
   *
   * `@MaxLength(3)` rejected `"NOT_A_CURRENCY"` for being fourteen
   * characters and accepted `"5"`, `"X"` and `"ZZZ"` for fitting. The
   * partner form offered a numeric input for this field, so `"5"` is not
   * hypothetical — partners in production carry it (BUG-1747).
   */
  @IsOptional()
  @IsIn(PLATFORM_CURRENCY_CODES as readonly string[], {
    message: 'currencyCode must be a supported currency code.',
  })
  currencyCode?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  @IsOptional() @IsDateString() earnedAt?: string;
  @IsOptional() @IsDateString() dueAt?: string;
}
/*
 * The runtime create (`POST /platform-runtime/commissions`) has no partner in
 * its route, so the body names it. `POST /partners/:id/commissions` keeps the
 * base DTO and takes the partner from the path only.
 */
export class CreateRuntimePartnerCommissionDto extends CreatePartnerCommissionDto {
  @IsUUID() partnerId!: string;
}
/*
 * A status change only, held to the commission machine (Pending → Approved →
 * Payable → Paid, Void until paid). The money terms have no update path: a
 * wrong entry is voided and a correct one added.
 */
export class UpdatePartnerCommissionDto {
  @IsEnum(PartnerCommissionStatus) status!: PartnerCommissionStatus;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class CreatePartnerReferralLinkDto {
  @IsString() @MaxLength(160) name!: string;
  @IsOptional() @IsString() @MaxLength(160) campaignName?: string;
  @IsOptional() @IsString() @MaxLength(300) targetPath?: string;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class PartnerReferralLinkActionDto {
  @IsIn(['enable', 'disable', 'expire', 'regenerate'])
  action!: 'enable' | 'disable' | 'expire' | 'regenerate';
}

export class PartnerLifecycleActionDto {
  @IsIn([
    'start-review',
    'approve',
    'reject',
    'request-information',
    'suspend',
    'reactivate',
    'deactivate',
  ])
  action!:
    | 'start-review'
    | 'approve'
    | 'reject'
    | 'request-information'
    | 'suspend'
    | 'reactivate'
    | 'deactivate';
  @IsOptional() @IsString() @MaxLength(2000) reason?: string;
}
