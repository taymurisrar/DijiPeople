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
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequireAnyPermission,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ApplicationQueryDto } from './dto/application-query.dto';
import { MoveApplicationStageDto } from './dto/move-application-stage.dto';
import { SubmitApplicationDto } from './dto/submit-application.dto';
import { UpsertCandidateEvaluationDto } from './dto/upsert-candidate-evaluation.dto';
import { RecruitmentService } from './recruitment.service';

@Controller('applications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApplicationsController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @Permissions('recruitment.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'read' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'read' },
  )
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ApplicationQueryDto,
  ) {
    return this.recruitmentService.findApplications(user.tenantId, query);
  }

  @Post()
  @Permissions('recruitment.create')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'create' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'create' },
  )
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitApplicationDto,
  ) {
    return this.recruitmentService.submitApplication(user, dto);
  }

  @Get(':applicationId')
  @Permissions('recruitment.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'read' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'read' },
  )
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
  ) {
    return this.recruitmentService.findApplicationById(
      user.tenantId,
      applicationId,
    );
  }

  @Patch(':applicationId/stage')
  @Permissions('recruitment.advance')
  @RequirePermission(ENTITY_KEYS.CANDIDATES, 'write')
  moveStage(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: MoveApplicationStageDto,
  ) {
    return this.recruitmentService.moveApplicationStage(
      user,
      applicationId,
      dto,
    );
  }

  @Post(':applicationId/evaluations')
  @Permissions('recruitment.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'write' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'write' },
  )
  createEvaluation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('applicationId', new ParseUUIDPipe()) applicationId: string,
    @Body() dto: UpsertCandidateEvaluationDto,
  ) {
    return this.recruitmentService.createApplicationEvaluation(
      user,
      applicationId,
      dto,
    );
  }
}
