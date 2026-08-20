import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { EmployeeBenefitAssignmentSource } from '@prisma/client';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { BenefitsService } from './benefits.service';
import {
  AssignBenefitDto,
  AssignDefaultBenefitsDto,
  BenefitApprovalActionDto,
  BenefitAssignmentQueryDto,
  ChangeBenefitAssignmentDto,
  ConsumeBenefitDto,
  CreateBenefitPolicyDto,
  UpdateBenefitPolicyDto,
} from './dto/benefit.dto';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BenefitsController {
  constructor(private readonly benefits: BenefitsService) {}

  @Get('benefits/policies')
  @Permissions('benefits.read')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'read')
  policies(@CurrentUser() user: AuthenticatedUser) {
    return this.benefits.listPolicies(user);
  }

  @Get('benefits/policies/:id')
  @Permissions('benefits.read')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'read')
  policy(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.benefits.getPolicy(user.tenantId, id);
  }

  @Post('benefits/policies')
  @Permissions('benefits.manage')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'manage')
  createPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBenefitPolicyDto,
  ) {
    return this.benefits.createPolicy(user, dto);
  }

  @Patch('benefits/policies/:id')
  @Permissions('benefits.manage')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'manage')
  updatePolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateBenefitPolicyDto,
  ) {
    return this.benefits.updatePolicy(user, id, dto);
  }

  @Get('benefits/assignments')
  @Permissions('benefits.read')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'read')
  assignments(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BenefitAssignmentQueryDto,
  ) {
    return this.benefits.listAssignments(user, query);
  }

  @Get('benefits/assignments/:id')
  @Permissions('benefits.read')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'read')
  assignment(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.benefits.getAssignment(user, id);
  }

  @Post('benefits/assignments')
  @Permissions('benefits.assign')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'create')
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignBenefitDto,
  ) {
    return this.benefits.assign(user, dto);
  }

  @Post('benefits/employees/:employeeId/assign-defaults')
  @Permissions('benefits.assign')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'create')
  assignDefaults(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId') employeeId: string,
    @Body() dto: AssignDefaultBenefitsDto,
  ) {
    return this.benefits.assignDefaults(
      user,
      employeeId,
      dto.source ?? EmployeeBenefitAssignmentSource.POLICY,
      dto.effectiveDate ? new Date(dto.effectiveDate) : new Date(),
    );
  }

  @Post('benefits/assignments/:id/suspend')
  @Permissions('benefits.assign')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'create')
  suspend(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeBenefitAssignmentDto,
  ) {
    return this.benefits.suspend(user, id, dto);
  }

  @Post('benefits/assignments/:id/cancel')
  @Permissions('benefits.assign')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'create')
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeBenefitAssignmentDto,
  ) {
    return this.benefits.cancel(user, id, dto);
  }

  @Post('benefits/assignments/:id/override')
  @Permissions('benefits.assign')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'create')
  override(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ChangeBenefitAssignmentDto,
  ) {
    return this.benefits.override(user, id, dto);
  }

  @Post('benefits/assignments/:id/approval-action')
  @Permissions('approvals.readAssigned')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'approve')
  approvalAction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: BenefitApprovalActionDto,
  ) {
    return this.benefits.actionApproval(user, id, dto.action, dto.comment);
  }

  @Post('benefits/assignments/:id/consume')
  @Permissions('benefits.consume')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'approve')
  consume(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConsumeBenefitDto,
  ) {
    return this.benefits.consume(user, id, dto);
  }

  @Post('benefits/renew')
  @Permissions('benefits.manage')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'manage')
  renew(@CurrentUser() user: AuthenticatedUser) {
    return this.benefits.renewDueAssignments(user, new Date());
  }

  @Get('me/benefits')
  @Permissions('benefits.read-own')
  @RequirePermission(ENTITY_KEYS.BENEFITS, 'read')
  myBenefits(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: BenefitAssignmentQueryDto,
  ) {
    return this.benefits.listAssignments(user, query, true);
  }
}
