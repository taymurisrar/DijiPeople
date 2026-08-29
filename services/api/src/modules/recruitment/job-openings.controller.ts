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
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { CreateJobOpeningDto } from './dto/create-job-opening.dto';
import { JobOpeningQueryDto } from './dto/job-opening-query.dto';
import { UpdateJobOpeningDto } from './dto/update-job-opening.dto';
import { RecruitmentService } from './recruitment.service';

@Controller('job-openings')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.RECRUITMENT)
export class JobOpeningsController {
  constructor(private readonly recruitmentService: RecruitmentService) {}

  @Get()
  @Permissions('recruitment.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'read' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'read' },
  )
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: JobOpeningQueryDto,
  ) {
    return this.recruitmentService.findJobOpenings(user.tenantId, query);
  }

  @Get(':jobOpeningId')
  @Permissions('recruitment.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'read' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'read' },
  )
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
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'create' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'create' },
  )
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateJobOpeningDto,
  ) {
    return this.recruitmentService.createJobOpening(user, dto);
  }

  @Patch(':jobOpeningId')
  @Permissions('recruitment.update')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.JOBS, action: 'write' },
    { entityKey: ENTITY_KEYS.CANDIDATES, action: 'write' },
  )
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobOpeningId', new ParseUUIDPipe()) jobOpeningId: string,
    @Body() dto: UpdateJobOpeningDto,
  ) {
    return this.recruitmentService.updateJobOpening(user, jobOpeningId, dto);
  }
}
