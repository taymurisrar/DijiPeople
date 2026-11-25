import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  DailyUpdatePolicyDto,
  DraftDailyUpdateDto,
  ListDailyUpdatesDto,
  MissingDailyUpdatesDto,
  SaveDailyUpdateDto,
} from './dto/daily-update.dto';
import { DailyUpdatesService } from './daily-updates.service';

/*
 * Daily updates (WP-27). Reading needs `daily-updates.read`, writing one's own
 * needs `daily-updates.write`, acknowledging needs `daily-updates.acknowledge`
 * and the policy needs `daily-updates.manage`. Whose updates each reaches is
 * decided in the service from the caller's access level on the employee.
 */
@Controller('daily-updates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class DailyUpdatesController {
  constructor(private readonly service: DailyUpdatesService) {}

  @Get('policy')
  @Permissions('daily-updates.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  policy(@CurrentUser() user: AuthenticatedUser) {
    return this.service.getPolicy(user.tenantId);
  }

  @Put('policy')
  @Permissions('daily-updates.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'manage')
  setPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DailyUpdatePolicyDto,
  ) {
    return this.service.setPolicy(user, dto);
  }

  @Get('missing')
  @Permissions('daily-updates.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  missing(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: MissingDailyUpdatesDto,
  ) {
    return this.service.missing(user, query.date);
  }

  @Get()
  @Permissions('daily-updates.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDailyUpdatesDto,
  ) {
    return this.service.list(user, query);
  }

  @Post('draft')
  @Permissions('daily-updates.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  draft(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DraftDailyUpdateDto,
  ) {
    return this.service.draft(user, dto.date);
  }

  @Get(':id')
  @Permissions('daily-updates.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Put(':id')
  @Permissions('daily-updates.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  save(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SaveDailyUpdateDto,
  ) {
    return this.service.save(user, id, dto);
  }

  @Post(':id/submit')
  @Permissions('daily-updates.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.submit(user, id);
  }

  @Post(':id/acknowledge')
  @Permissions('daily-updates.acknowledge')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  acknowledge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.acknowledge(user, id);
  }
}
