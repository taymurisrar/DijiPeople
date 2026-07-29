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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreateTimesheetPolicyDto,
  TimesheetPolicyPreviewQueryDto,
  UpdateTimesheetPolicyDto,
} from './dto/timesheet-policy.dto';
import { TimesheetPolicyResolverService } from './timesheet-policy-resolver.service';

@Controller('timesheet-policies')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class TimesheetPoliciesController {
  constructor(
    private readonly policyResolver: TimesheetPolicyResolverService,
  ) {}

  @Get()
  @Permissions('timesheets.settings.read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('enabled') enabled?: string,
  ) {
    return this.policyResolver.list(
      user.tenantId,
      enabled === undefined ? undefined : enabled === 'true',
    );
  }

  @Get('preview')
  @Permissions('timesheets.policy.resolution.read')
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: TimesheetPolicyPreviewQueryDto,
  ) {
    return this.policyResolver.resolveForEmployee(
      user.tenantId,
      query.employeeId,
      query.effectiveAt ? new Date(query.effectiveAt) : new Date(),
    );
  }

  @Get(':policyId')
  @Permissions('timesheets.settings.read')
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
  ) {
    return this.policyResolver.get(user.tenantId, policyId);
  }

  @Post()
  @Permissions('timesheets.policy.configure')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateTimesheetPolicyDto,
  ) {
    return this.policyResolver.create(user, dto);
  }

  @Patch(':policyId')
  @Permissions('timesheets.policy.configure')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
    @Body() dto: UpdateTimesheetPolicyDto,
  ) {
    return this.policyResolver.update(user, policyId, dto);
  }

  @Delete(':policyId')
  @Permissions('timesheets.policy.configure')
  disable(
    @CurrentUser() user: AuthenticatedUser,
    @Param('policyId', new ParseUUIDPipe()) policyId: string,
  ) {
    return this.policyResolver.disable(user, policyId);
  }
}
