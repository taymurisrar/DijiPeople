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
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateEmployeeOnboardingDto } from './dto/create-employee-onboarding.dto';
import { CreateOnboardingTemplateDto } from './dto/create-onboarding-template.dto';
import { OnboardingQueryDto } from './dto/onboarding-query.dto';
import { UpdateOnboardingTaskDto } from './dto/update-onboarding-task.dto';
import { UpdateOnboardingTemplateDto } from './dto/update-onboarding-template.dto';
import { OnboardingService } from './onboarding.service';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class OnboardingController {
  constructor(private readonly onboardingService: OnboardingService) {}

  @Get()
  @Permissions('onboarding.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: OnboardingQueryDto,
  ) {
    return this.onboardingService.findOnboardings(user.tenantId, query);
  }

  @Get('templates')
  @Permissions('onboarding.read')
  findTemplates(@CurrentUser() user: AuthenticatedUser) {
    return this.onboardingService.findTemplates(user.tenantId);
  }

  @Get(':onboardingId')
  @Permissions('onboarding.read')
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
  createTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateOnboardingTemplateDto,
  ) {
    return this.onboardingService.createTemplate(user, dto);
  }

  @Patch('templates/:templateId')
  @Permissions('onboarding.update')
  updateTemplate(
    @CurrentUser() user: AuthenticatedUser,
    @Param('templateId', new ParseUUIDPipe()) templateId: string,
    @Body() dto: UpdateOnboardingTemplateDto,
  ) {
    return this.onboardingService.updateTemplate(user, templateId, dto);
  }

  @Post('from-candidate')
  @Permissions('onboarding.create')
  createFromCandidate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeOnboardingDto,
  ) {
    return this.onboardingService.createFromCandidate(user, dto);
  }

  @Patch(':onboardingId/tasks/:taskId')
  @Permissions('onboarding.update')
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
  convertToEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param('onboardingId', new ParseUUIDPipe()) onboardingId: string,
  ) {
    return this.onboardingService.convertToEmployee(user, onboardingId);
  }
}
