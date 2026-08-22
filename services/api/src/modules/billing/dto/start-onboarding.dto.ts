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

/**
 * The least the wizard can say and still open a real order.
 *
 * Only what pricing and customer resolution need. Everything else the brief
 * asks for — the organization profile, the owner's name, the workspace address,
 * the agreements — arrives with the final submission, because collecting it here
 * would mean two endpoints that both know how to write a customer.
 */
export class StartOnboardingDto {
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

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(160)
  email!: string;

  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(80)
  country!: string;

  @IsOptional()
  @Transform(trimToUndefined)
  @IsString()
  @MaxLength(40)
  phone?: string;

  /**
   * Carried from the first step so a buyer who abandons at checkout and returns
   * is still attributed. A code, never a partner id — see PublicSubscribeDto.
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
}
