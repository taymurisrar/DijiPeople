/* The DTOs carry class-validator decorators, which need the polyfill. */
import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  AssignWorkSiteDto,
  SetPrimaryWorkSiteDto,
} from './attendance-operations.controller';

/*
 * ITEM-0179 — the seam between the web Work Sites tab and these DTOs.
 *
 * The payloads below are the exact shapes `buildWorkSiteAssignPayload`
 * (`apps/web/lib/runtime/modules/employee-work-sites.ts`) produces, validated
 * with the global pipe's options: an unknown field is a 400 here, so a client
 * shape the DTO does not accept fails in production, not in a unit test of
 * either side alone.
 */

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';

async function failingProperties(
  Dto: new () => object,
  payload: Record<string, unknown>,
) {
  const failures = await validate(plainToInstance(Dto, payload), {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return failures.map((failure) => failure.property);
}

describe('AssignWorkSiteDto accepts what the Work Sites tab sends', () => {
  it('an assignment without dates', async () => {
    await expect(
      failingProperties(AssignWorkSiteDto, {
        locationId: LOCATION_ID,
        validFrom: null,
        validTo: null,
      }),
    ).resolves.toEqual([]);
  });

  it('a validity edit, which omits the primary flag', async () => {
    await expect(
      failingProperties(AssignWorkSiteDto, {
        locationId: LOCATION_ID,
        validFrom: '2026-02-01',
        validTo: '2026-12-31',
      }),
    ).resolves.toEqual([]);
  });

  it('a derived primary row being given dates', async () => {
    await expect(
      failingProperties(AssignWorkSiteDto, {
        locationId: LOCATION_ID,
        isPrimary: true,
        validFrom: '2026-02-01',
        validTo: null,
      }),
    ).resolves.toEqual([]);
  });

  it('rejects an empty-string date, which is why the client sends null', async () => {
    await expect(
      failingProperties(AssignWorkSiteDto, {
        locationId: LOCATION_ID,
        validFrom: '',
      }),
    ).resolves.toEqual(['validFrom']);
  });

  it('rejects a client-supplied tenant', async () => {
    await expect(
      failingProperties(AssignWorkSiteDto, {
        locationId: LOCATION_ID,
        tenantId: 'other-tenant',
      }),
    ).resolves.toEqual(['tenantId']);
  });
});

describe('SetPrimaryWorkSiteDto accepts the Make primary body', () => {
  it('takes only the location', async () => {
    await expect(
      failingProperties(SetPrimaryWorkSiteDto, { locationId: LOCATION_ID }),
    ).resolves.toEqual([]);
  });
});
