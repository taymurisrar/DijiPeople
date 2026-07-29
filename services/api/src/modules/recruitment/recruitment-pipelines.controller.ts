import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { UpsertRecruitmentPipelineDto } from './dto/upsert-recruitment-pipeline.dto';
import { RecruitmentService } from './recruitment.service';

@Controller('recruitment/pipelines')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RecruitmentPipelinesController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @Permissions('recruitment.read')
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.recruitmentService.findRecruitmentPipelines(user.tenantId);
  }

  @Get(':pipelineId')
  @Permissions('recruitment.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
  ) {
    return this.recruitmentService.findRecruitmentPipelineById(
      user.tenantId,
      pipelineId,
    );
  }

  @Post()
  @Permissions('recruitment.update')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertRecruitmentPipelineDto,
  ) {
    return this.recruitmentService.createRecruitmentPipeline(user, dto);
  }

  @Patch(':pipelineId')
  @Permissions('recruitment.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('pipelineId', new ParseUUIDPipe()) pipelineId: string,
    @Body() dto: UpsertRecruitmentPipelineDto,
  ) {
    return this.recruitmentService.updateRecruitmentPipeline(
      user,
      pipelineId,
      dto,
    );
  }
}
