import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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
import { ChangePlatformPasswordDto } from './dto/platform-password.dto';
import { MfaCodeDto, MfaDisableDto } from '../auth/mfa/dto/mfa.dto';

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

  /*
   * `me` routes only. Neither takes a user id, so neither can be pointed at
   * another platform account.
   */
  @Get('me/security')
  getMySecurity(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.getSecurityOverview(user);
  }

  @Post('me/password')
  changeMyPassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePlatformPasswordDto,
  ) {
    return this.platformUsersService.changeOwnPassword(user, dto);
  }

  /*
   * ADR-0019 — the signed-in operator's own MFA. `me` only, like the password
   * route above: nothing here takes an id, so none of it can be pointed at
   * another platform account.
   */
  @Get('me/mfa')
  getMyMfa(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.getMyMfaStatus(user);
  }

  @Post('me/mfa/setup')
  @HttpCode(200)
  startMyMfaSetup(@CurrentUser() user: AuthenticatedUser) {
    return this.platformUsersService.startMyMfaSetup(user);
  }

  @Post('me/mfa/setup/confirm')
  @HttpCode(200)
  confirmMyMfaSetup(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
  ) {
    return this.platformUsersService.confirmMyMfaSetup(user, dto.code);
  }

  @Post('me/mfa/recovery-codes')
  @HttpCode(200)
  regenerateMyRecoveryCodes(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaCodeDto,
  ) {
    return this.platformUsersService.regenerateMyRecoveryCodes(user, dto.code);
  }

  @Post('me/mfa/disable')
  @HttpCode(200)
  disableMyMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: MfaDisableDto,
  ) {
    return this.platformUsersService.disableMyMfa(user, dto);
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

  /**
   * ADR-0019 — clear another operator's MFA. Authorised by the same
   * manage-platform-users check as every other `:userId` route here.
   */
  @Post(':userId/mfa/reset')
  @HttpCode(200)
  resetMfa(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.platformUsersService.resetUserMfa(user, userId);
  }

  @Delete(':userId')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.platformUsersService.disable(user, userId);
  }
}
