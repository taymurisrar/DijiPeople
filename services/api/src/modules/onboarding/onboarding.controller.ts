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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateEmployeeOnboardingDto } from './dto/create-employee-onboarding.dto';
import { CreateOnboardingTemplateDto } from './dto/create-onboarding-template.dto';
import { OnboardingQueryDto } from './dto/onboarding-query.dto';
import { UpdateOnboardingTaskDto } from './dto/update-onboarding-task.dto';
import { UpdateOnboardingTemplateDto } from './dto/update-onboarding-template.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.ONBOARDING)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @Permissions('onboarding.read')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OnboardingQueryDto,
  ) {
    return this.onboardingService.findOnboardings(user.tenantId, query);
  }

  @Get('templates')
  @Permissions('onboarding.read')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'read')
  findTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.findTemplates(user.tenantId);
  }

  @Get(':onboardingId')
  @Permissions('onboarding.read')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
  ) {
    return this.onboardingService.findOnboardingById(
      user.tenantId,
      onboardingId,
    );
  }

  @Post('templates')
  @Permissions('onboarding.create')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'create')
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOnboardingTemplateDto,
  ) {
    return this.onboardingService.createTemplate(user, dto);
  }

  @Patch('templates/:templateId')
  @Permissions('onboarding.update')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'write')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() dto: UpdateOnboardingTemplateDto,
  ) {
    return this.onboardingService.updateTemplate(user, templateId, dto);
  }

  @Delete()
  @Permissions('onboarding.delete')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'delete')
  deleteMany(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: { recordIds?: string[]; ids?: string[] },
  ) {
    return this.onboardingService.hardDeleteOnboardings(
      user,
      body.recordIds ?? body.ids ?? [],
    );
  }

  @Delete(':onboardingId')
  @Permissions('onboarding.update')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'write')
  deleteOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
  ) {
    return this.onboardingService.hardDeleteOnboardings(user, [onboardingId]);
  }

  @Post('from-candidate')
  @Permissions('onboarding.create')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'create')
  createFromCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeOnboardingDto,
  ) {
    return this.onboardingService.createFromCandidate(user, dto);
  }

  @Patch(':onboardingId/tasks/:taskId')
  @Permissions('onboarding.update')
  @RequirePermission(ENTITY_KEYS.ONBOARDING, 'write')
  updateTask(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: UpdateOnboardingTaskDto,
  ) {
    return this.onboardingService.updateTask(user, onboardingId, taskId, dto);
  }

  @Post(':onboardingId/convert-to-employee')
  @Permissions('onboarding.update', 'employees.create')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'create')
  convertToEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
  ) {
    return this.onboardingService.convertToEmployee(user, onboardingId);
  }

  @Post(':onboardingId/draft-employee')
  @Permissions('onboarding.update', 'employees.create')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'create')
  ensureDraftEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
  ) {
    return this.onboardingService.ensureDraftEmployeeForOnboarding(
      user,
      onboardingId,
    );
  }
}
