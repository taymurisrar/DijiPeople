import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { LookupsService } from './lookups.service';

@Controller('lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Get('countries')
  listCountries(@Query('search') search?: string) {
    return this.lookupsService.listCountries(search);
  }

  @Get('states')
  listStates(
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listStates(countryId, search);
  }

  @Get('cities')
  listCities(
    @Query('countryId') countryId?: string,
    @Query('stateProvinceId') stateProvinceId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listCities(countryId, stateProvinceId, search);
  }

  @Get('document-types')
  listDocumentTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listDocumentTypes(user.tenantId);
  }

  @Get('document-categories')
  listDocumentCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listDocumentCategories(user.tenantId);
  }

  @Get('relation-types')
  listRelationTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listRelationTypes(user.tenantId);
  }
}
