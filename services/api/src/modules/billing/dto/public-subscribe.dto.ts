import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

function trimToUndefined({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeEmail({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}

/**
 * Case-fold and trim, and nothing else.
 *
 * Deliberately not a sanitiser: it does not strip the characters that make a
 * slug invalid. A buyer who typed `Maseer Group` should be told their address
 * cannot contain a space, not silently given `maseergroup` and discover later
 * that their workspace is at an address they never chose. Rejecting is the
 * honest behaviour for a value this permanent.
 */
function normalizeSlug({ value }: { value: unknown }) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim().toLowerCase();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class PublicSubscribeDto {
  /**
   * The partner referral code the buyer arrived with, if any.
   *
   * A code, never a partner id. This value is resolved server-side against
   * the referral links; a caller that could name a partner directly would
   * be assigning itself a commission. An unrecognised, expired or disabled
   * code does not refuse the purchase — it is recorded as what it is.
   * BUG-0281.
   */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'referralCode must be a valid referral code.',
  })
  referralCode?: string;

  @IsUUID()
  planPriceId!: string;

  @IsInt()
  @Min(1)
  seatQuantity!: number;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(160)
  companyName!: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  contactName!: string;

  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(40)
  @Matches(/^[+()\-.\s0-9]{7,40}$/, {
    message: 'phone must be a valid business phone number.',
  })
  phone?: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  country!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(1500)
  message?: string;

  /**
   * Honeypot. A real visitor never fills this in, so anything here is a bot and
   * the request is dropped without creating an order.
   *
   * Named `website` because that is what an autofilling bot looks for — which
   * is also why the organization's actual website is `companyWebsite` below.
   * The two are easy to confuse and one of them is discarded, so nothing should
   * ever read this expecting a URL.
   */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  website?: string;

  /** The organization's real website, which is kept. See the honeypot above. */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(200)
  companyWebsite?: string;

  /**
   * The workspace address the buyer chose, without the domain — `maseer` for
   * `maseer.dijipeople.com`.
   *
   * Optional, so the existing single-step form keeps working while the wizard
   * is built. When it is absent, provisioning derives a slug from the company
   * name exactly as it does today.
   *
   * Only length is asserted here. The format and reserved-word rules live in
   * `slug.util.ts` and are enforced by the service, because the reserved list is
   * derived from the platform's host labels — restating any part of it in a DTO
   * is how the two lists drift and somebody ends up owning `api`.
   */
  @IsOptional()
  @Transform(normalizeSlug)
  @IsString()
  @MaxLength(50)
  requestedSlug?: string;

  /*
   * The organization profile.
   *
   * Every one of these maps to a column that already exists on
   * `CustomerAccount` and has simply never been written by the public path.
   * Nothing here is a new source of truth — the wizard's whole job on this step
   * is to stop `resolveCustomer` having to leave them null.
   *
   * All optional at the API boundary even though the wizard marks several
   * required. Requiredness is a product rule about a form; making the API refuse
   * an order for a missing tax number would also break the sales-assisted path,
   * which legitimately has less information at this point.
   */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(200)
  legalCompanyName?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  registrationNumber?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  taxId?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  industry?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(60)
  companySize?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  estimatedEmployeeCount?: number;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(200)
  addressLine1?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(200)
  addressLine2?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  city?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  stateProvince?: string;

  /*
   * The owner's name in two fields.
   *
   * `contactName` is still accepted and still split on whitespace when these are
   * absent, because the single-field form and the sales-assisted path both send
   * it. Splitting a name on a space is a guess — "Saud Al Thani" becomes
   * "Saud" / "Al Thani" by luck — so when the wizard asks properly, the guess is
   * skipped rather than corrected afterwards.
   */
  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  ownerFirstName?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  ownerLastName?: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  ownerJobTitle?: string;

  /**
   * Published legal versions the buyer accepted, by id.
   *
   * Version ids rather than a boolean: the brief is explicit that storing
   * `accepted = true` with no document relationship is not evidence. Each id
   * becomes a `LegalDocumentAcknowledgement` naming the exact text shown, so
   * "what did this person agree to" stays answerable after the next publish.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsUUID('4', { each: true })
  acceptedLegalVersionIds?: string[];
}
