import { Transform } from 'class-transformer';
import {
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

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(120)
  website?: string;

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
}
