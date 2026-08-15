import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  Matches,
  MinLength,
} from 'class-validator';

/**
 * A platform user changing their own password.
 *
 * The current password is required and re-verified server-side. A session is
 * not proof of intent — it is proof the browser was left open — and this is the
 * credential that protects every tenant in the product.
 */
export class ChangePlatformPasswordDto {
  @IsString()
  @MinLength(1, { message: 'Your current password is required.' })
  @MaxLength(200)
  currentPassword!: string;

  /*
   * 12 characters, mixed. Deliberately stricter than a tenant user's: these
   * accounts read across every tenant. The rules are stated in the message
   * because a rejection that only says "invalid" makes people try variations of
   * the same weak password.
   */
  @IsString()
  @MinLength(12, {
    message: 'Use at least 12 characters.',
  })
  @MaxLength(200)
  @Matches(/[a-z]/, {
    message: 'Include at least one lowercase letter.',
  })
  @Matches(/[A-Z]/, {
    message: 'Include at least one uppercase letter.',
  })
  @Matches(/[0-9]/, {
    message: 'Include at least one number.',
  })
  newPassword!: string;

  /**
   * Whether to end other sessions. Defaults to true: the usual reason to change
   * a password is that the old one may be known to someone else, and leaving
   * their session live defeats the change.
   */
  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => (value === undefined ? true : value))
  signOutOtherSessions?: boolean;
}
