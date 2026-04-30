import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  CreatePayrollGlAccountDto,
  CreatePayrollPostingRuleDto,
  UpdatePayrollGlAccountDto,
  UpdatePayrollPostingRuleDto,
} from './dto/payroll-gl.dto';
import { PayrollJournalService } from './payroll-journal.service';

@Controller('payroll')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollGlController {
  constructor(private readonly payrollJournalService: PayrollJournalService) {}

  @Post('gl-accounts')
  @Permissions('payroll-gl.manage')
  createGlAccount(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollGlAccountDto) {
    return this.payrollJournalService.createGlAccount(user, dto);
  }

  @Get('gl-accounts')
  @Permissions('payroll-gl.read')
  listGlAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollJournalService.listGlAccounts(user);
  }

  @Get('gl-accounts/:id')
  @Permissions('payroll-gl.read')
  getGlAccount(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payrollJournalService.getGlAccount(user, id);
  }

  @Patch('gl-accounts/:id')
  @Permissions('payroll-gl.manage')
  updateGlAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollGlAccountDto,
  ) {
    return this.payrollJournalService.updateGlAccount(user, id, dto);
  }

  @Delete('gl-accounts/:id')
  @Permissions('payroll-gl.manage')
  deactivateGlAccount(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payrollJournalService.deactivateGlAccount(user, id);
  }

  @Post('posting-rules')
  @Permissions('payroll-gl.manage')
  createPostingRule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreatePayrollPostingRuleDto) {
    return this.payrollJournalService.createPostingRule(user, dto);
  }

  @Get('posting-rules')
  @Permissions('payroll-gl.read')
  listPostingRules(@CurrentUser() user: AuthenticatedUser) {
    return this.payrollJournalService.listPostingRules(user);
  }

  @Get('posting-rules/:id')
  @Permissions('payroll-gl.read')
  getPostingRule(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payrollJournalService.getPostingRule(user, id);
  }

  @Patch('posting-rules/:id')
  @Permissions('payroll-gl.manage')
  updatePostingRule(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdatePayrollPostingRuleDto,
  ) {
    return this.payrollJournalService.updatePostingRule(user, id, dto);
  }

  @Delete('posting-rules/:id')
  @Permissions('payroll-gl.manage')
  deactivatePostingRule(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.payrollJournalService.deactivatePostingRule(user, id);
  }

  @Post('runs/:runId/journal/generate')
  @Permissions('payroll-journal.generate')
  generateJournal(@CurrentUser() user: AuthenticatedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.payrollJournalService.generateJournalForPayrollRun({
      tenantId: user.tenantId,
      payrollRunId: runId,
      userId: user.userId,
    });
  }

  @Get('runs/:runId/journal')
  @Permissions('payroll-journal.read')
  getJournal(@CurrentUser() user: AuthenticatedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.payrollJournalService.getJournal(user, runId);
  }

  @Get('runs/:runId/journal/export')
  @Permissions('payroll-journal.export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="payroll-journal.csv"')
  exportJournal(@CurrentUser() user: AuthenticatedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.payrollJournalService.exportJournalCsv(user, runId);
  }

  @Post('runs/:runId/journal/mark-exported')
  @Permissions('payroll-journal.export')
  markJournalExported(@CurrentUser() user: AuthenticatedUser, @Param('runId', new ParseUUIDPipe()) runId: string) {
    return this.payrollJournalService.markJournalExported(user, runId);
  }
}
