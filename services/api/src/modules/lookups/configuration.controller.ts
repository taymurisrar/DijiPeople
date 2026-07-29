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

@Controller('configuration')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConfigurationController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Get('timezones')
  listTimezones() {
    return this.lookupsService.listTimezones();
  }

  @Get('timezones/:id')
  @Permissions('settings.read')
  getTimezone(@Param('id') id: string) {
    return this.lookupsService.getTimezone(id);
  }

  @Get('currencies')
  @Permissions('settings.read')
  listCurrencies(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: Record<string, unknown>,
  ) {
    return this.lookupsService.listCurrencies(user.tenantId, query);
  }

  @Post('currencies')
  @Permissions('settings.update')
  createCurrency(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: Record<string, unknown>,
  ) {
    return this.lookupsService.createCurrency(user, body);
  }

  @Get('currencies/:id')
  @Permissions('settings.read')
  getCurrency(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.lookupsService.getCurrency(user.tenantId, id);
  }

  @Get('currencies/:id/rate-summary')
  @Permissions('settings.read')
  getCurrencyRateSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.lookupsService.getCurrencyRateSummary(user.tenantId, id);
  }

  @Get('currencies/:id/manual-override')
  @Permissions('settings.read')
  getCurrencyManualOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.lookupsService.getCurrencyManualOverride(user.tenantId, id);
  }

  @Patch('currencies/:id/manual-override')
  @Permissions('settings.update')
  updateCurrencyManualOverride(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.lookupsService.updateCurrencyManualOverride(user, id, body);
  }

  @Get('currencies/:id/usage')
  @Permissions('settings.read')
  getCurrencyUsage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.lookupsService.getCurrencyUsage(user.tenantId, id);
  }

  @Patch('currencies/:id')
  @Permissions('settings.update')
  updateCurrency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.lookupsService.updateCurrency(user, id, body);
  }

  @Delete('currencies/:id')
  @Permissions('settings.update')
  deleteCurrency(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    return this.lookupsService.deleteCurrency(user, id);
  }
}
