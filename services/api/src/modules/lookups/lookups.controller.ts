import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
  listCountries(@Query('search') search?: string) {
    return this.lookupsService.listCountries(search);
  }

  @Get('countries/:id')
  @Permissions('settings.read')
  getCountry(@Param('id') id: string) {
    return this.lookupsService.getCountry(id);
  }

  @Get('countries/:id/usage')
  @Permissions('settings.read')
  getCountryUsage(@Param('id') id: string) {
    return this.lookupsService.getCountryUsage(id);
  }

  @Get('states')
  listStates(
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listStates(countryId, search);
  }

  @Post('states')
  @Permissions('settings.update')
  createState(@Body() body: Record<string, unknown>) {
    return this.lookupsService.createState(body);
  }

  @Get('states/:id')
  @Permissions('settings.read')
  getState(@Param('id') id: string) {
    return this.lookupsService.getState(id);
  }

  @Get('states/:id/usage')
  @Permissions('settings.read')
  getStateUsage(@Param('id') id: string) {
    return this.lookupsService.getStateUsage(id);
  }

  @Patch('states/:id')
  @Permissions('settings.update')
  updateState(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.lookupsService.updateState(id, body);
  }

  @Delete('states/:id')
  @Permissions('settings.update')
  deleteState(@Param('id') id: string) {
    return this.lookupsService.deleteState(id);
  }

  @Get('cities')
  listCities(
    @Query('countryId') countryId?: string,
    @Query('stateProvinceId') stateProvinceId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listCities(countryId, stateProvinceId, search);
  }

  @Post('cities')
  @Permissions('settings.update')
  createCity(@Body() body: Record<string, unknown>) {
    return this.lookupsService.createCity(body);
  }

  @Get('cities/:id')
  @Permissions('settings.read')
  getCity(@Param('id') id: string) {
    return this.lookupsService.getCity(id);
  }

  @Get('cities/:id/usage')
  @Permissions('settings.read')
  getCityUsage(@Param('id') id: string) {
    return this.lookupsService.getCityUsage(id);
  }

  @Patch('cities/:id')
  @Permissions('settings.update')
  updateCity(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.lookupsService.updateCity(id, body);
  }

  @Delete('cities/:id')
  @Permissions('settings.update')
  deleteCity(@Param('id') id: string) {
    return this.lookupsService.deleteCity(id);
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
