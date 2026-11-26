import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
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
  BlockerSummaryDto,
  CloseBlockerDto,
  EscalateDto,
  ListBlockersDto,
  RaiseBlockerDto,
  SetCauseDto,
  UpdateBlockerDto,
} from './dto/work-blocker.dto';
import { WorkBlockersService } from './work-blockers.service';

/*
 * Blockers on work items (WP-38.S1). They reuse the work-items permissions: a
 * blocker is part of the work item, and who reaches which one is decided in the
 * service by the same scope rule. Nothing is deleted: a blocker is resolved or
 * cancelled and stays in history.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WorkBlockersController {
  constructor(private readonly service: WorkBlockersService) {}

  @Get('work-blockers')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListBlockersDto,
  ) {
    return this.service.list(user, query);
  }

  @Get('work-blockers/summary')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BlockerSummaryDto,
  ) {
    return this.service.summary(user, query);
  }

  @Get('work-items/:id/blockers')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  forItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.forItem(user, id);
  }

  @Post('work-items/:id/blockers')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  raise(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RaiseBlockerDto,
  ) {
    return this.service.raise(user, id, dto);
  }

  @Patch('work-blockers/:id')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBlockerDto,
  ) {
    return this.service.update(user, id, dto);
  }

  @Post('work-blockers/:id/cause')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  setCause(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SetCauseDto,
  ) {
    return this.service.setCause(user, id, dto.cause, dto.note);
  }

  @Post('work-blockers/:id/escalate')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  escalate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: EscalateDto,
  ) {
    return this.service.escalate(user, id, dto.note);
  }

  @Post('work-blockers/:id/resolve')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  resolve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseBlockerDto,
  ) {
    return this.service.resolve(user, id, dto.resolution);
  }

  @Post('work-blockers/:id/cancel')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CloseBlockerDto,
  ) {
    return this.service.cancel(user, id, dto.resolution);
  }
}
