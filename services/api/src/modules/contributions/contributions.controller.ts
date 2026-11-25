import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CorrectContributionDto,
  CreateContributionDto,
  ListContributionsDto,
  ReasonDto,
  ReviewContributionDto,
  SummaryContributionsDto,
} from './dto/contribution.dto';
import { ContributionsService } from './contributions.service';

/*
 * The contribution/evidence ledger (WP-30.S1). Reading needs
 * `contributions.read`, recording and correcting need `contributions.write`,
 * and a reviewer's decision needs `contributions.verify`. Whose entries each
 * reaches is decided in the service from the caller's access level on the
 * employee, never from the route. Nothing here deletes.
 */
@Controller('contributions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ContributionsController {
  constructor(private readonly service: ContributionsService) {}

  @Get()
  @Permissions('contributions.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListContributionsDto,
  ) {
    return this.service.list(user, query);
  }

  @Get('summary')
  @Permissions('contributions.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: SummaryContributionsDto,
  ) {
    return this.service.summary(user, query);
  }

  @Get(':id')
  @Permissions('contributions.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.service.findOne(user, id);
  }

  @Post()
  @Permissions('contributions.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateContributionDto,
  ) {
    return this.service.create(user, dto);
  }

  @Post(':id/correct')
  @Permissions('contributions.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  correct(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: CorrectContributionDto,
  ) {
    return this.service.correct(user, id, dto);
  }

  @Post(':id/withdraw')
  @Permissions('contributions.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  withdraw(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.withdraw(user, id, dto.reason);
  }

  @Post(':id/dispute')
  @Permissions('contributions.write')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'write')
  dispute(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReasonDto,
  ) {
    return this.service.dispute(user, id, dto.reason);
  }

  @Post(':id/review')
  @Permissions('contributions.verify')
  @RequirePermission(ENTITY_KEYS.EMPLOYEES, 'read')
  review(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ReviewContributionDto,
  ) {
    return this.service.review(user, id, dto);
  }
}
