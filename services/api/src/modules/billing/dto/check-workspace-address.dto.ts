import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

/**
 * The candidate workspace address, as typed.
 *
 * Case-folded and trimmed only. Nothing here tries to *repair* the value: the
 * availability answer must be about the address the buyer would actually get,
 * and quietly turning `Maseer Group` into `maseergroup` before checking would
 * report on an address they never asked for.
 */
function normalizeSlug({ value }: { value: unknown }) {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

export class CheckWorkspaceAddressDto {
  /*
   * Bounded on both ends before the value reaches a query. The upper bound
   * matches the slug rules in `slug.util.ts`; the lower one exists so a
   * one-character probe cannot be used to sweep the namespace cheaply.
   */
  @Transform(normalizeSlug)
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  value!: string;
}
