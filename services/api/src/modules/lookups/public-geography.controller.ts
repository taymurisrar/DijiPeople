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
  ) {
    if (!countryId) return [];
    const states = await this.lookups.listStates(countryId, search);
    return states.map((state) => ({
      id: state.id,
      code: state.code,
      name: state.name,
    }));
  }
}
