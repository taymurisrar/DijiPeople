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
} from '../../common/decorators/permissions.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { AgentService } from './agent.service';
import { AgentDeviceDto, AgentVersionQueryDto } from './dto/agent-device.dto';
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

@Controller('agent')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AgentController {
  constructor(private readonly agentService: AgentService) {}

  @Public()
  @Post('auth/login')
  login(@Body() dto: AgentLoginDto) {
    return this.agentService.login(dto);
  }

  @Public()
  @Post('auth/refresh')
  refresh(@Body() dto: AgentRefreshDto) {
    return this.agentService.refresh(dto);
  }

  @Public()
  @Post('auth/logout')
  logout(@Body() dto: AgentLogoutDto) {
    return this.agentService.logout(dto);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.me(user);
  }

  @Get('me/productivity')
  myProductivity(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.myProductivity(user);
  }

  @Get('employees/:employeeId/summary')
  @Permissions('employees.read', 'attendance.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  employeeSummary(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
  ) {
    return this.agentService.employeeAgentSummary(user, employeeId);
  }

  @Get('config')
  config(
    @CurrentUser() user: AuthenticatedUser,
    @Query() _query: AgentVersionQueryDto,
  ) {
    return this.agentService.getConfig(user.tenantId);
  }

  @Post('devices/register')
  registerDevice(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AgentDeviceDto,
  ) {
    return this.agentService.registerDevice(user, dto);
  }

  @Post('sessions/start')
  startSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: StartAgentSessionDto,
  ) {
    return this.agentService.startSession(user, dto);
  }

  @Post('sessions/heartbeat')
  heartbeat(@CurrentUser() user: AuthenticatedUser, @Body() dto: HeartbeatDto) {
    return this.agentService.heartbeat(user, dto);
  }

  @Post('sessions/end')
  endSession(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: EndAgentSessionDto,
  ) {
    return this.agentService.endSession(user, dto);
  }

  @Get('settings')
  @Permissions('agent.settings.read')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.agentService.getSettings(user);
  }

  @Patch('settings')
  @Permissions('agent.settings.manage')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAgentSettingsDto,
  ) {
    return this.agentService.updateSettings(user, dto);
  }
}
