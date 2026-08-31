import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { ApprovalsService } from './approvals.service';
import {
  ApprovalDecisionDto,
  ListApprovalsQueryDto,
} from './dto/approval-decision.dto';

/*
 * Validated, but — unlike the global pipe — not `forbidNonWhitelisted`. The
 * approvals list page forwards every search param it was handed, so rejecting
 * unknown keys here would turn a stray param in a bookmarked URL into a 400 on
 * a screen that has always ignored it. Unknown keys are stripped; the ones the
 * endpoint understands are checked.
 */
const listQueryPipe = new ValidationPipe({
  whitelist: true,
  transform: true,
  forbidNonWhitelisted: false,
});

@Controller('approvals')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ApprovalsController {
  constructor(private readonly approvalsService: ApprovalsService) {}

  @Get()
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query(listQueryPipe) query: ListApprovalsQueryDto,
  ) {
    return this.approvalsService.list(user, query);
  }

  @Get(':id')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.approvalsService.detail(user, id);
  }

  /*
   * The three routes below carry the same permissive decorators as the reads
   * above, deliberately — and it is worth being explicit about why that is not
   * a hole.
   *
   * The permission that actually governs an approval is the owning module's:
   * `leave-requests.approve`, `attendance.correction.approve`, and so on. Which
   * one applies is not known until the request row has been read and its
   * `moduleKey` resolved, so a static decorator cannot express it. Naming any
   * single key would either lock out the approvers who hold only their module's
   * key, or admit callers holding none of them.
   *
   * `ApprovalsService.decide` evaluates the owning module's requirement itself,
   * through `satisfiesPermissionRequirement` — the same function
   * `PermissionsGuard` runs. The gate is not skipped; it is applied one layer
   * in, where the target is known.
   */
  @Post(':id/approve')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvalsService.decide(user, id, 'approve', dto.comment);
  }

  @Post(':id/reject')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvalsService.decide(user, id, 'reject', dto.comment);
  }

  @Post(':id/cancel')
  @Permissions('dashboard.view')
  @RequirePermission(ENTITY_KEYS.USER_PREFERENCES, 'read')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApprovalDecisionDto,
  ) {
    return this.approvalsService.decide(user, id, 'cancel', dto.comment);
  }
}
