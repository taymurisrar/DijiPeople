import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Delete,
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
import { EntitlementGuard } from '../../common/guards/entitlement.guard';
import { RequireEntitlement } from '../../common/decorators/require-entitlement.decorator';
import { TENANT_FEATURE_KEYS } from '../../common/constants/tenant-features';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreatePayrollGlAccountDto,
  CreatePayrollPostingRuleDto,
  PreviewPayrollPostingRuleDto,
  UpdatePayrollGlAccountDto,
  UpdatePayrollPostingRuleDto,
} from './dto/payroll-gl.dto';
import { PayrollJournalService } from './payroll-journal.service';

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard, EntitlementGuard)
@RequireEntitlement(TENANT_FEATURE_KEYS.PAYROLL)
export class PayrollGlController {
  constructor(private readonly payrollJournalService: PayrollJournalService) {}

  @Post('gl-accounts')
  @Permissions('payroll-gl.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'manage')
  createGlAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollGlAccountDto,
  ) {
    return this.payrollJournalService.createGlAccount(user, dto);
  }

  @Get('gl-accounts')
  @Permissions('payroll-gl.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'read')
  listGlAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollJournalService.listGlAccounts(user);
  }

  @Get('gl-accounts/:id')
  @Permissions('payroll-gl.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'read')
  getGlAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollJournalService.getGlAccount(user, id);
  }

  @Patch('gl-accounts/:id')
  @Permissions('payroll-gl.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'manage')
  updateGlAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollGlAccountDto,
  ) {
    return this.payrollJournalService.updateGlAccount(user, id, dto);
  }

  @Delete('gl-accounts/:id')
  @Permissions('payroll-gl.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'manage')
  deactivateGlAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollJournalService.deactivateGlAccount(user, id);
  }

  @Post('posting-rules')
  @Permissions('payroll-gl.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'manage')
  createPostingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreatePayrollPostingRuleDto,
  ) {
    return this.payrollJournalService.createPostingRule(user, dto);
  }

  @Get('posting-rules')
  @Permissions('payroll-gl.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'read')
  listPostingRules(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollJournalService.listPostingRules(user);
  }

  @Post('posting-rules/preview-resolution')
  @Permissions('payroll-gl.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'read')
  previewPostingRuleResolution(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: PreviewPayrollPostingRuleDto,
  ) {
    return this.payrollJournalService.previewPostingRuleResolution(user, dto);
  }

  @Get('policies')
  @Permissions('payroll.settings.read')
  @RequireAnyPermission(
    { entityKey: ENTITY_KEYS.SETTINGS, action: 'read' },
    { entityKey: ENTITY_KEYS.PAYROLL, action: 'read' },
  )
  listPayrollPolicies(
    @CurrentUser() user: AuthenticatedUser,
    @Query()
    query: {
      search?: string;
      policyType?: string;
      status?: string;
      organizationId?: string;
      countryCode?: string;
      ownerUserId?: string;
      effectiveDate?: string;
      isDefault?: string;
    },
  ) {
    return this.payrollJournalService.listPolicyRegister(user, query);
  }

  @Get('posting-rules/:id')
  @Permissions('payroll-gl.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'read')
  getPostingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollJournalService.getPostingRule(user, id);
  }

  @Patch('posting-rules/:id')
  @Permissions('payroll-gl.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'manage')
  updatePostingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollPostingRuleDto,
  ) {
    return this.payrollJournalService.updatePostingRule(user, id, dto);
  }

  @Delete('posting-rules/:id')
  @Permissions('payroll-gl.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_GL, 'manage')
  deactivatePostingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.payrollJournalService.deactivatePostingRule(user, id);
  }

  @Post('runs/:runId/journal/generate')
  @Permissions('payroll-journal.generate')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'create')
  generateJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.payrollJournalService.generateJournalForPayrollRun({
      tenantId: user.tenantId,
      payrollRunId: runId,
      userId: user.userId,
    });
  }

  @Get('runs/:runId/journal')
  @Permissions('payroll-journal.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'read')
  getJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.payrollJournalService.getJournal(user, runId);
  }

  @Get('runs/:runId/journals')
  @Permissions('payroll-journal.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'read')
  listJournals(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.payrollJournalService.listJournals(user, runId);
  }

  @Get('runs/:runId/journal/export')
  @Permissions('payroll-journal.export')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payroll-journal.csv"')
  exportJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.payrollJournalService.exportJournalCsv(user, runId);
  }

  @Post('runs/:runId/journal/mark-exported')
  @Permissions('payroll-journal.export')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'export')
  markJournalExported(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.payrollJournalService.markJournalExported(user, runId);
  }

  @Post('runs/:runId/journal/validate')
  @Permissions('payroll-journal.read')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'read')
  validateJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.payrollJournalService.validateJournal(user, runId);
  }

  @Post('runs/:runId/journal/mark-posted')
  @Permissions('payroll-journal.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'manage')
  markJournalPosted(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
  ) {
    return this.payrollJournalService.markJournalPosted(user, runId);
  }

  @Post('runs/:runId/journal/reverse')
  @Permissions('payroll-journal.manage')
  @RequirePermission(ENTITY_KEYS.PAYROLL_JOURNAL, 'manage')
  reverseJournal(
    @CurrentUser() user: AuthenticatedUser,
    @Param('runId', new ParseUUIDPipe()) runId: string,
    @Body() body: { reason?: string; reversalDate?: string },
  ) {
    return this.payrollJournalService.reverseJournal(user, runId, body);
  }
}
