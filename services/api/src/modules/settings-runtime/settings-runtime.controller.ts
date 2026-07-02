import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreateConfigurationRecordDto,
  UpdateConfigurationRecordDto,
} from './dto/configuration-record.dto';
import { SettingsRuntimeService } from './settings-runtime.service';

@Controller('settings-runtime')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SettingsRuntimeController {
  constructor(private readonly service: SettingsRuntimeService) {}

  @Get(':settingKey') @Permissions('settings.read') list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settingKey') key: string,
  ) {
    return this.service.list(user, key);
  }
  @Get(':settingKey/:id') @Permissions('settings.read') detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settingKey') key: string,
    @Param('id') id: string,
  ) {
    return this.service.detail(user, key, id);
  }
  @Post(':settingKey') @Permissions('settings.update') create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settingKey') key: string,
    @Body() dto: CreateConfigurationRecordDto,
  ) {
    return this.service.create(user, key, dto);
  }
  @Patch(':settingKey/:id') @Permissions('settings.update') update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settingKey') key: string,
    @Param('id') id: string,
    @Body() dto: UpdateConfigurationRecordDto,
  ) {
    return this.service.update(user, key, id, dto);
  }
  @Delete(':settingKey/:id') @Permissions('settings.update') archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('settingKey') key: string,
    @Param('id') id: string,
  ) {
    return this.service.archive(user, key, id);
  }
}
