/* The DTOs carry class-validator decorators, which need the polyfill. */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UpdatePartnerDto, CreatePartnerDto } from './partner.dto';

/*
 * WP-08 finding 3. `UpdatePartnerDto extends CreatePartnerDto {}` inherited
 * every one of `CreatePartnerDto`'s required fields — `type`, `displayName`,
 * `email`, `defaultCommissionRate` — unchanged, so a `PATCH /partners/:id`
 * body that omitted any one of them (the entire point of a PATCH) failed
 * DTO validation before the request ever reached `PartnersService.update()`.
 * The admin console's edit form never surfaced this because it always
 * resubmits the whole record; a caller sending a genuinely partial body could
 * not.
 *
 * `UpdatePartnerDto` is now `PartialType(CreatePartnerDto)`. This pins the DTO
 * layer directly, independent of `partners-partial-update.spec.ts`'s
 * service-level coverage of what the merge-validated write actually does with
 * a partial body once it is accepted.
 */

async function errorsFor(payload: Record<string, unknown>) {
  const instance = plainToInstance(UpdatePartnerDto, payload);
  const failures = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return failures.map((failure) => failure.property);
}

describe('UpdatePartnerDto is a genuine partial patch', () => {
  it('accepts a body naming only one field', async () => {
    expect(await errorsFor({ notes: 'Follow up next week' })).toEqual([]);
  });

  it('accepts a body naming only the tax id', async () => {
    expect(await errorsFor({ taxId: 'TAX-999' })).toEqual([]);
  });

  it('accepts an empty body', async () => {
    expect(await errorsFor({})).toEqual([]);
  });

  it('still rejects a field that is present but invalid', async () => {
    // Partial does not mean unvalidated: a field that IS sent still has to be
    // well-formed.
    expect(await errorsFor({ email: 'not-an-email' })).toContain('email');
    expect(await errorsFor({ defaultCommissionRate: 250 })).toContain(
      'defaultCommissionRate',
    );
  });

  it('still rejects a field the DTO does not declare', async () => {
    expect(await errorsFor({ ghostField: 'x' })).toContain('ghostField');
  });

  /*
   * `CreatePartnerDto` itself is unaffected — this is the regression
   * `PartialType` guards against operating on the wrong class.
   */
  it('leaves CreatePartnerDto still requiring its base fields', async () => {
    const instance = plainToInstance(CreatePartnerDto, { notes: 'x' });
    const failures = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });
    const properties = failures.map((failure) => failure.property);
    expect(properties).toEqual(
      expect.arrayContaining(['type', 'displayName', 'email']),
    );
  });
});
