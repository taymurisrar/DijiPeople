import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { LookupsService } from './lookups.service';

@Controller('lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Get('countries')
  @Permissions('employees.read')
  listCountries(@Query('search') search?: string) {
    return this.lookupsService.listCountries(search);
  }

  @Get('states')
  @Permissions('employees.read')
  listStates(
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listStates(countryId, search);
  }

  @Get('cities')
  @Permissions('employees.read')
  listCities(
    @Query('countryId') countryId?: string,
    @Query('stateProvinceId') stateProvinceId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listCities(countryId, stateProvinceId, search);
  }

  @Get('document-types')
  @Permissions('employees.documents.read')
  listDocumentTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listDocumentTypes(user.tenantId);
  }

  @Get('document-categories')
  @Permissions('employees.documents.read')
  listDocumentCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listDocumentCategories(user.tenantId);
  }

  @Get('relation-types')
  @Permissions('employees.read')
  listRelationTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listRelationTypes(user.tenantId);
  }
}
