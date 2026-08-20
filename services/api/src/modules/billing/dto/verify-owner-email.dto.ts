import { Transform } from 'class-transformer';
import { IsString, Matches } from 'class-validator';

/**
 * The six digits the owner typed.
 *
 * Whitespace is stripped because people paste `123 456` out of a mail client,
 * and refusing that would be a validation error about the customer's clipboard
 * rather than about their code. Everything else must be exactly six digits —
 * the shape is fixed, so anything else is refused here rather than burning one
 * of the five attempts the service allows.
 */
function normalizeCode({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.replace(/\s+/g, '') : value;
}

export class VerifyOwnerEmailDto {
  @Transform(normalizeCode)
  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'code must be the six digits from the verification email.',
  })
  code!: string;
}
