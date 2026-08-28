/* The DTOs carry class-validator decorators, which need the polyfill. */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PartnerType } from '@prisma/client';
import {
  CreatePartnerDto,
  CreatePartnerCommissionDto,
  UpdatePartnerDto,
} from './partner.dto';

/*
 * BUG-1425 / BUG-1747.
 *
 * `currencyCode` was `@IsString() @MaxLength(3)`, which measures length and
 * calls the result a currency: `"5"`, `"X"` and `"ZZZ"` were all stored, and
 * `"NOT_A_CURRENCY"` was rejected only for being fourteen characters long. The
 * admin form made this reachable rather than theoretical — Currency was
 * rendered as `<input type="number">`, so a number was the only value an
 * operator could enter, and partners in production carry `currencyCode: "5"`.
 */

const VALID_PARTNER = {
  type: PartnerType.RESELLER,
  displayName: 'Acme Partners',
  email: 'partner@example.com',
  defaultCommissionRate: 10,
};

async function errorsFor(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  const instance = plainToInstance(Dto, payload);
  const failures = await validate(instance, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return failures.map((failure) => failure.property);
}

describe('partner currencyCode validation', () => {
  it.each(['5', 'X', 'ZZZ', 'qar', 'US', 'NOT_A_CURRENCY'])(
    'rejects %p on create',
    async (currencyCode) => {
      const failed = await errorsFor(CreatePartnerDto, {
        ...VALID_PARTNER,
        currencyCode,
      });
      expect(failed).toContain('currencyCode');
    },
  );

  it.each(['5', 'ZZZ'])('rejects %p on update', async (currencyCode) => {
    const failed = await errorsFor(UpdatePartnerDto, {
      ...VALID_PARTNER,
      currencyCode,
    });
    expect(failed).toContain('currencyCode');
  });

  it.each(['QAR', 'SAR', 'AED', 'USD', 'GBP', 'EUR', 'PKR'])(
    'accepts %p',
    async (currencyCode) => {
      const failed = await errorsFor(CreatePartnerDto, {
        ...VALID_PARTNER,
        currencyCode,
      });
      expect(failed).not.toContain('currencyCode');
    },
  );

  it('still treats the field as optional', async () => {
    const failed = await errorsFor(CreatePartnerDto, VALID_PARTNER);
    expect(failed).not.toContain('currencyCode');
  });

  it('applies the same rule to a commission', async () => {
    const failed = await errorsFor(CreatePartnerCommissionDto, {
      baseAmount: 100,
      commissionRate: 10,
      currencyCode: '5',
    });
    expect(failed).toContain('currencyCode');
  });
});
