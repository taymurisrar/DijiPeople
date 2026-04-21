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
import { CreateJobOpeningDto } from './dto/create-job-opening.dto';
import { JobOpeningQueryDto } from './dto/job-opening-query.dto';
import { UpdateJobOpeningDto } from './dto/update-job-opening.dto';
import { RecruitmentService } from './recruitment.service';

@Controller('job-openings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class JobOpeningsController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @Permissions('recruitment.read')
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: JobOpeningQueryDto,
  ) {
    return this.recruitmentService.findJobOpenings(user.tenantId, query);
  }

  @Get(':jobOpeningId')
  @Permissions('recruitment.read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobOpeningId', new ParseUUIDPipe()) jobOpeningId: string,
  ) {
    return this.recruitmentService.findJobOpeningById(
      user.tenantId,
      jobOpeningId,
    );
  }

  @Post()
  @Permissions('recruitment.create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJobOpeningDto,
  ) {
    return this.recruitmentService.createJobOpening(user, dto);
  }

  @Patch(':jobOpeningId')
  @Permissions('recruitment.update')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobOpeningId', new ParseUUIDPipe()) jobOpeningId: string,
    @Body() dto: UpdateJobOpeningDto,
  ) {
    return this.recruitmentService.updateJobOpening(user, jobOpeningId, dto);
  }
}
