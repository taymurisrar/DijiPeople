import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreatePlatformUserDto,
  UpdatePlatformUserDto,
} from './dto/platform-user.dto';
import { PlatformUsersService } from './platform-users.service';
import { UpdatePlatformPreferencesDto } from './dto/platform-preferences.dto';
import {
  PlatformModulePreferenceQueryDto,
  UpdatePlatformModulePreferenceDto,
} from './dto/platform-module-preference.dto';

@UseGuards(JwtAuthGuard)
@Controller('platform-users')
export class PlatformUsersController {
  constructor(private readonly platformUsersService: PlatformUsersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.list(user);
  }

  @Get('owner-candidates')
  listOwnerCandidates(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.listOwnerCandidates(user);
  }

  @Get('me/preferences')
  getMyPreferences(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.getPreferences(user);
  }

  @Patch('me/preferences')
  updateMyPreferences(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlatformPreferencesDto,
  ) {
    return this.platformUsersService.updatePreferences(user, dto);
  }

  @Get('me/module-preferences')
  getMyModulePreference(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: PlatformModulePreferenceQueryDto,
  ) {
    return this.platformUsersService.getModulePreference(user, query.moduleKey);
  }

  @Patch('me/module-preferences')
  updateMyModulePreference(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdatePlatformModulePreferenceDto,
  ) {
    return this.platformUsersService.updateModulePreference(user, dto);
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlatformUserDto,
  ) {
    return this.platformUsersService.create(user, dto);
  }

  @Patch(':userId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
    @Body() dto: UpdatePlatformUserDto,
  ) {
    return this.platformUsersService.update(user, userId, dto);
  }

  @Delete(':userId')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.platformUsersService.disable(user, userId);
  }
}
