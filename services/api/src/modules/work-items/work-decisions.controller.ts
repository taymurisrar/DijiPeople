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
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  AddDecisionActionDto,
  CancelMeetingDto,
  CreateDecisionDto,
  CreateMeetingDto,
  HoldMeetingDto,
  ListDecisionsDto,
  ListMeetingsDto,
  RecordAttendanceDto,
  ReverseDecisionDto,
  SupersedeDecisionDto,
  UpdateMeetingDto,
} from './dto/work-decision.dto';
import { WorkDecisionsService } from './work-decisions.service';

/*
 * Meetings and the decision register (WP-28.S1). They reuse the work-items
 * permissions; who reaches which meeting or decision is decided in the service by
 * the caller's EMPLOYEES access level. There is deliberately no update or delete
 * route for a decision: it is superseded or reversed, and stays in the register.
 */
@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.WORK_MANAGEMENT)
export class WorkDecisionsController {
  constructor(private readonly service: WorkDecisionsService) {}

  // ------------------------------------------------------------- meetings

  @Get('work-meetings')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  listMeetings(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListMeetingsDto,
  ) {
    return this.service.listMeetings(user, query);
  }

  @Post('work-meetings')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  createMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateMeetingDto,
  ) {
    return this.service.createMeeting(user, dto);
  }

  @Get('work-meetings/:id')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getMeeting(user, id);
  }

  @Patch('work-meetings/:id')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  updateMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateMeetingDto,
  ) {
    return this.service.updateMeeting(user, id, dto);
  }

  @Post('work-meetings/:id/hold')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  holdMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: HoldMeetingDto,
  ) {
    return this.service.holdMeeting(user, id, dto);
  }

  @Post('work-meetings/:id/cancel')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  cancelMeeting(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CancelMeetingDto,
  ) {
    return this.service.cancelMeeting(user, id, dto);
  }

  @Post('work-meetings/:id/attendance')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  recordAttendance(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RecordAttendanceDto,
  ) {
    return this.service.recordAttendance(user, id, dto);
  }

  // ------------------------------------------------------------ decisions

  @Get('work-decisions')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  listDecisions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDecisionsDto,
  ) {
    return this.service.listDecisions(user, query);
  }

  @Post('work-decisions')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  createDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateDecisionDto,
  ) {
    return this.service.createDecision(user, dto);
  }

  // Declared before ':id' so the literal path is not read as an id.
  @Get('work-decisions/open-actions')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  openActions(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListDecisionsDto,
  ) {
    return this.service.openActions(user, query);
  }

  @Get('work-decisions/:id')
  @Permissions('work-items.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  getDecision(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.getDecision(user, id);
  }

  @Post('work-decisions/:id/decide')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  decide(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.decide(user, id);
  }

  @Post('work-decisions/:id/supersede')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  supersede(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: SupersedeDecisionDto,
  ) {
    return this.service.supersede(user, id, dto);
  }

  @Post('work-decisions/:id/reverse')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  reverse(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReverseDecisionDto,
  ) {
    return this.service.reverse(user, id, dto);
  }

  @Post('work-decisions/:id/actions')
  @Permissions('work-items.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  addAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AddDecisionActionDto,
  ) {
    return this.service.addAction(user, id, dto);
  }
}
