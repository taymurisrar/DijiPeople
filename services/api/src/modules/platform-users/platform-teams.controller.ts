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
  PlatformPermissionsGuard,
  RequirePlatformPermission,
} from '../platform-auth/platform-permissions';
import {
  AddPlatformTeamMemberDto,
  ArchivePlatformTeamDto,
  CreatePlatformTeamDto,
  PlatformTeamQueryDto,
  UpdatePlatformTeamDto,
  UpdatePlatformTeamMemberDto,
} from './dto/platform-team.dto';
import { PlatformTeamsService } from './platform-teams.service';

/*
 * Permissions are declared per handler rather than path-derived: teams are
 * support/assignment furniture, so reading them is `support.read` (every role
 * that works cases or assignment rules holds it, and the case picker needs it)
 * and changing them is `settings.manage` (PLATFORM_ADMIN and SUPER_ADMIN).
 * `platform-users.manage` was deliberately not used - it is SUPER_ADMIN-only
 * and teams hold no credentials or roles, so it would be tighter than the
 * data warrants.
 */
@UseGuards(JwtAuthGuard, PlatformPermissionsGuard)
@Controller('platform-teams')
export class PlatformTeamsController {
  constructor(private readonly teams: PlatformTeamsService) {}

  @Get()
  @RequirePlatformPermission('support.read')
  list(@Query() query: PlatformTeamQueryDto) {
    return this.teams.list(query);
  }

  @Get(':id')
  @RequirePlatformPermission('support.read')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.teams.get(id);
  }

  @Post()
  @RequirePlatformPermission('settings.manage')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePlatformTeamDto,
  ) {
    return this.teams.create(user, dto);
  }

  @Patch(':id')
  @RequirePlatformPermission('settings.manage')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePlatformTeamDto,
  ) {
    return this.teams.update(user, id, dto);
  }

  @Post(':id/archive')
  @HttpCode(200)
  @RequirePlatformPermission('settings.manage')
  archive(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ArchivePlatformTeamDto,
  ) {
    return this.teams.archive(user, id, dto);
  }

  @Post(':id/restore')
  @HttpCode(200)
  @RequirePlatformPermission('settings.manage')
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.teams.restore(user, id);
  }

  @Delete(':id')
  @RequirePlatformPermission('settings.manage')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.teams.remove(user, id);
  }

  @Post(':id/members')
  @RequirePlatformPermission('settings.manage')
  addMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddPlatformTeamMemberDto,
  ) {
    return this.teams.addMember(user, id, dto);
  }

  @Patch(':id/members/:memberId')
  @RequirePlatformPermission('settings.manage')
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
    @Body() dto: UpdatePlatformTeamMemberDto,
  ) {
    return this.teams.updateMember(user, id, memberId, dto);
  }

  @Delete(':id/members/:memberId')
  @RequirePlatformPermission('settings.manage')
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Param('memberId', new ParseUUIDPipe()) memberId: string,
  ) {
    return this.teams.removeMember(user, id, memberId);
  }
}
