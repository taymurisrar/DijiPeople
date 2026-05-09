import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { LookupsService } from './lookups.service';

@Controller('configuration')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ConfigurationController {
  constructor(private readonly lookupsService: LookupsService) {}

  @Get('timezones')
  listTimezones() {
    return this.lookupsService.listTimezones();
  }

  @Get('currencies')
  listCurrencies() {
    return this.lookupsService.listCurrencies();
  }
}
