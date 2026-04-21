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
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ApplicationQueryDto,
  ) {
    return this.recruitmentService.findApplications(user.tenantId, query);
  }

  @Post()
  @Permissions('recruitment.create')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SubmitApplicationDto,
  ) {
    return this.recruitmentService.submitApplication(user, dto);
  }

  @Get(':applicationId')
  @Permissions('recruitment.read')
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
