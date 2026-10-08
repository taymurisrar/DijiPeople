import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';
import { LookupsService } from './lookups.service';

/**
 * Countries and states, for surfaces with no signed-in user.
 *
 * The subscribe wizard asks for a country and a state, and it asks before
 * anyone has an account — so it could not reach `/lookups/*`, which is behind
 * `JwtAuthGuard`. The consequence was a hardcoded list in `apps/landing`, a
 * second hardcoded list in `apps/admin`, and this database table: three answers
 * to "which countries exist", guaranteed to diverge, and the landing one was a
 * free-text input anyway.
 *
 * This is the read-only, public projection of the one that is real. It exposes
 * the ISO code and the name and nothing else — no usage counts, no tenant
 * references, nothing an anonymous caller could enumerate the platform with.
 *
 * Rate limited like every other public endpoint. A country list is cheap, but
 * it is also the sort of endpoint that gets scraped in a loop, and the guard
 * costs nothing to apply.
 */
@Public()
@UseGuards(PublicRateLimitGuard)
@Controller('public/geography')
export class PublicGeographyController {
  constructor(private readonly lookups: LookupsService) {}

  @Get('countries')
  async listCountries(@Query('search') search?: string) {
    const countries = await this.lookups.listCountries(search);
    return countries.map((country) => ({
      id: country.id,
      code: country.code,
      name: country.name,
    }));
  }

  /**
   * States within a country.
   *
   * `countryId` is required rather than optional. Without it this would return
   * every state on earth, which is not a list any form control can use and is
   * exactly the shape of request that makes a public endpoint expensive.
   */
  @Get('states')
  async listStates(
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
    @Query('country') country?: string,
  ) {
    /*
     * `country` takes an id, ISO code or name — the admin State picker is
     * scoped by the name its Country field stores. `countryId` stays for the
     * subscribe wizard, which already sends one.
     */
    const identifier = boundedParam(countryId) ?? boundedParam(country);
    if (!identifier) return [];
    const states = await this.lookups.listStates(
      identifier,
      boundedParam(search),
    );
    return states.map((state) => ({
      id: state.id,
      code: state.code,
      name: state.name,
    }));
  }

  /**
   * Cities within a country, and within a state when one is given.
   *
   * Like `states`, a country is required — an unscoped city list is neither
   * useful to a form nor cheap. At most `CITY_PAGE_SIZE` come back; the picker
   * narrows the rest with `search`.
   */
  @Get('cities')
  async listCities(
    @Query('country') country?: string,
    @Query('state') state?: string,
    @Query('search') search?: string,
  ) {
    const countryIdentifier = boundedParam(country);
    if (!countryIdentifier) return [];
    const cities = await this.lookups.listCitiesForPlace({
      country: countryIdentifier,
      state: boundedParam(state),
      search: boundedParam(search),
      take: CITY_PAGE_SIZE,
    });
    return cities.map((city) => ({ id: city.id, name: city.name }));
  }
}

const CITY_PAGE_SIZE = 200;

/** A trimmed, non-empty query value of sane length, or undefined. */
function boundedParam(value: unknown) {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= 120 ? trimmed : undefined;
}
