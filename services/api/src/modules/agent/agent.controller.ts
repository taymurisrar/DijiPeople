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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
  RequireAnyPermission,
} from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AgentService } from './agent.service';
import {
  AgentDeviceDto,
  AgentVersionQueryDto,
  CompleteAgentLocationRequestDto,
  CreateAgentLocationRequestDto,
  UpdateAgentDevicePermissionsDto,
} from './dto/agent-device.dto';
import {
  AgentLoginDto,
  AgentLogoutDto,
  AgentRefreshDto,
} from './dto/agent-auth.dto';
import {
  EndAgentSessionDto,
  HeartbeatDto,
  StartAgentSessionDto,
} from './dto/agent-session.dto';
import { UpdateAgentSettingsDto } from './dto/update-agent-settings.dto';
import { AgentHistoryQueryDto } from './dto/agent-history-query.dto';
import { PublicRateLimitGuard } from '../../common/guards/public-rate-limit.guard';

@Controller('agent')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('auth/login')
  login(@Body() dto: AgentLoginDto) {
    return this.agentService.login(dto);
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('auth/refresh')
  refresh(@Body() dto: AgentRefreshDto) {
    return this.agentService.refresh(dto);
  }

  @Public()
  @UseGuards(PublicRateLimitGuard)
  @Post('auth/logout')
  logout(@Body() dto: AgentLogoutDto) {
    return this.agentService.logout(dto);
  }

  @Get('me')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.me(user);
  }

  @Get('me/productivity')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  myProductivity(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.myProductivity(user);
  }

  @Get('employees/:employeeId/summary')
  @Permissions('employees.read', 'attendance.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  employeeSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Query() query: AgentHistoryQueryDto,
  ) {
    return this.agentService.employeeAgentSummary(user, employeeId, query);
  }

  @Post('employees/:employeeId/location-requests')
  @Permissions('employees.read', 'attendance.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  createEmployeeLocationRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateAgentLocationRequestDto,
  ) {
    return this.agentService.createEmployeeLocationRequest(
      user,
      employeeId,
      dto,
    );
  }

  @Get('location-requests/pending')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  pendingLocationRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Query('deviceId', new ParseUUIDPipe()) deviceId: string,
  ) {
    return this.agentService.getPendingLocationRequest(user, deviceId);
  }

  @Patch('location-requests/:requestId/result')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  completeLocationRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('requestId', new ParseUUIDPipe()) requestId: string,
    @Body() dto: CompleteAgentLocationRequestDto,
  ) {
    return this.agentService.completeLocationRequest(user, requestId, dto);
  }

  @Get('config')
  @Permissions('attendance.read')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'read')
  config(
    @CurrentUser() user: AuthenticatedUser,
    @Query() _query: AgentVersionQueryDto,
  ) {
    return this.agentService.getConfig(user.tenantId);
  }

  @Post('devices/register')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AgentDeviceDto,
  ) {
    return this.agentService.registerDevice(user, dto);
  }

  @Patch('devices/permissions')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  updateDevicePermissions(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAgentDevicePermissionsDto,
  ) {
    return this.agentService.updateDevicePermissions(user, dto);
  }

  @Post('sessions/start')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  startSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartAgentSessionDto,
  ) {
    return this.agentService.startSession(user, dto);
  }

  @Post('sessions/heartbeat')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  heartbeat(@CurrentUser() user: AuthenticatedUser, @Body() dto: HeartbeatDto) {
    return this.agentService.heartbeat(user, dto);
  }

  @Post('sessions/end')
  @Permissions('attendance.create')
  @RequirePermission(ENTITY_KEYS.ATTENDANCE, 'create')
  endSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EndAgentSessionDto,
  ) {
    return this.agentService.endSession(user, dto);
  }

  @Get('settings')
  @Permissions('agent.settings.read')
  @RequirePermission(ENTITY_KEYS.AGENT, 'read')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.getSettings(user);
  }

  @Patch('settings')
  @Permissions('agent.settings.manage')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.AGENT, action: 'configure' },
    { entityKey: ENTITY_KEYS.AGENT, action: 'manage' },
  )
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAgentSettingsDto,
  ) {
    return this.agentService.updateSettings(user, dto);
  }
}
