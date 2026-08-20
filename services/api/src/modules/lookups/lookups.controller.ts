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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequireAnyPermission,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { LookupsService } from './lookups.service';

@Controller('lookups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LookupsController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Get('countries')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listCountries(@Query('search') search?: string) {
    return this.lookupsService.listCountries(search);
  }

  @Get('countries/:id')
  @Permissions('settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
  )
  getCountry(@Param('id') id: string) {
    return this.lookupsService.getCountry(id);
  }

  @Get('countries/:id/usage')
  @Permissions('settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
  )
  getCountryUsage(@Param('id') id: string) {
    return this.lookupsService.getCountryUsage(id);
  }

  @Get('states')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listStates(
    @Query('countryId') countryId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listStates(countryId, search);
  }

  @Post('states')
  @Permissions('settings.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
  )
  createState(@Body() body: Record<string, unknown>) {
    return this.lookupsService.createState(body);
  }

  @Get('states/:id')
  @Permissions('settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
  )
  getState(@Param('id') id: string) {
    return this.lookupsService.getState(id);
  }

  @Get('states/:id/usage')
  @Permissions('settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
  )
  getStateUsage(@Param('id') id: string) {
    return this.lookupsService.getStateUsage(id);
  }

  @Patch('states/:id')
  @Permissions('settings.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
  )
  updateState(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.lookupsService.updateState(id, body);
  }

  @Delete('states/:id')
  @Permissions('settings.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
  )
  deleteState(@Param('id') id: string) {
    return this.lookupsService.deleteState(id);
  }

  @Get('cities')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listCities(
    @Query('countryId') countryId?: string,
    @Query('stateProvinceId') stateProvinceId?: string,
    @Query('search') search?: string,
  ) {
    return this.lookupsService.listCities(countryId, stateProvinceId, search);
  }

  @Post('cities')
  @Permissions('settings.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
  )
  createCity(@Body() body: Record<string, unknown>) {
    return this.lookupsService.createCity(body);
  }

  @Get('cities/:id')
  @Permissions('settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
  )
  getCity(@Param('id') id: string) {
    return this.lookupsService.getCity(id);
  }

  @Get('cities/:id/usage')
  @Permissions('settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.BRANDING, action: 'read' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'read' },
  )
  getCityUsage(@Param('id') id: string) {
    return this.lookupsService.getCityUsage(id);
  }

  @Patch('cities/:id')
  @Permissions('settings.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
  )
  updateCity(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.lookupsService.updateCity(id, body);
  }

  @Delete('cities/:id')
  @Permissions('settings.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'configure' },
    { entityKey: ENTITY_KEYS.TENANT_ADMINISTRATION, action: 'write' },
  )
  deleteCity(@Param('id') id: string) {
    return this.lookupsService.deleteCity(id);
  }

  @Get('document-types')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listDocumentTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listDocumentTypes(user.tenantId);
  }

  @Get('document-categories')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listDocumentCategories(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listDocumentCategories(user.tenantId);
  }

  @Get('relation-types')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  listRelationTypes(@CurrentUser() user: AuthenticatedUser) {
    return this.lookupsService.listRelationTypes(user.tenantId);
  }
}
