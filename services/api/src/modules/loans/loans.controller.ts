import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ENTITY_KEYS } from '../../common/constants/rbac-matrix';
import {
  Permissions,
  RequirePermission,
} from '../../common/decorators/permissions.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import {
  ApproveLoanDto,
  CreateEmployeeBankAccountDto,
  CreateBankDto,
  CreateLoanPolicyDto,
  CreateLoanRequestDto,
  LoanQueryDto,
  RejectLoanDto,
  RejectEmployeeBankAccountDto,
  UpdateEmployeeBankAccountDto,
  VerifyEmployeeBankAccountDto,
  UpdateBankDto,
  UpdateLoanPolicyDto,
} from './dto/loans.dto';
import { LoansService } from './loans.service';

@Controller()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LoansController {
  constructor(private readonly loans: LoansService) {}
  @Get('loan-policies')
  @Permissions('loans.read-all')
  @RequirePermission(ENTITY_KEYS.LOANS, 'read')
  listLoanPolicies(@CurrentUser() user: AuthenticatedUser) {
    return this.loans.listLoanPolicies(user);
  }
  @Get('loan-policies/:id')
  @Permissions('loans.read-all')
  @RequirePermission(ENTITY_KEYS.LOANS, 'read')
  loanPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.loanPolicy(user, id);
  }
  @Post('loan-policies')
  @Permissions('loans.update')
  @RequirePermission(ENTITY_KEYS.LOANS, 'write')
  createLoanPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLoanPolicyDto,
  ) {
    return this.loans.createLoanPolicy(user, dto);
  }
  @Patch('loan-policies/:id')
  @Permissions('loans.update')
  @RequirePermission(ENTITY_KEYS.LOANS, 'write')
  updateLoanPolicy(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateLoanPolicyDto,
  ) {
    return this.loans.updateLoanPolicy(user, id, dto);
  }
  @Get('banks')
  @Permissions('banks.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'read')
  listBanks(@CurrentUser() user: AuthenticatedUser) {
    return this.loans.listBanks(user);
  }
  @Get('banks/:id')
  @Permissions('banks.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'read')
  bank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.bank(user, id);
  }
  @Post('banks')
  @Permissions('banks.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'manage')
  createBank(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateBankDto,
  ) {
    return this.loans.createBank(user, dto);
  }
  @Patch('banks/:id')
  @Permissions('banks.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'manage')
  updateBank(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateBankDto,
  ) {
    return this.loans.updateBank(user, id, dto);
  }
  @Get('loans')
  @Permissions('loans.read-all')
  @RequirePermission(ENTITY_KEYS.LOANS, 'read')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: LoanQueryDto) {
    return this.loans.list(user, query);
  }
  @Post('loans')
  @Permissions('loans.create')
  @RequirePermission(ENTITY_KEYS.LOANS, 'create')
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLoanRequestDto,
  ) {
    return this.loans.create(user, dto);
  }
  @Get('loans/:id')
  @Permissions('loans.read-all')
  @RequirePermission(ENTITY_KEYS.LOANS, 'read')
  detail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.detail(user, id);
  }
  @Post('loans/:id/submit')
  @Permissions('loans.update')
  @RequirePermission(ENTITY_KEYS.LOANS, 'write')
  submit(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.submit(user, id);
  }
  @Post('loans/:id/approve')
  @Permissions('loans.approve')
  @RequirePermission(ENTITY_KEYS.LOANS, 'approve')
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: ApproveLoanDto,
  ) {
    return this.loans.approve(user, id, dto);
  }
  @Post('loans/:id/reject')
  @Permissions('loans.reject')
  @RequirePermission(ENTITY_KEYS.LOANS, 'reject')
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectLoanDto,
  ) {
    return this.loans.reject(user, id, dto);
  }
  @Post('loans/:id/settle')
  @Permissions('loans.settle')
  @RequirePermission(ENTITY_KEYS.LOANS, 'manage')
  settle(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.settle(user, id);
  }
  @Get('me/loans')
  @Permissions('loans.read-own')
  @RequirePermission(ENTITY_KEYS.LOANS, 'read')
  mine(@CurrentUser() user: AuthenticatedUser, @Query() query: LoanQueryDto) {
    return this.loans.list(user, query, true);
  }
  @Post('me/loans')
  @Permissions('loans.create')
  @RequirePermission(ENTITY_KEYS.LOANS, 'create')
  createMine(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateLoanRequestDto,
  ) {
    return this.loans.create(user, dto, true);
  }
  @Get('me/loans/:id')
  @Permissions('loans.read-own')
  @RequirePermission(ENTITY_KEYS.LOANS, 'read')
  myDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.detail(user, id, true);
  }
  @Post('me/loans/:id/submit')
  @Permissions('loans.create')
  @RequirePermission(ENTITY_KEYS.LOANS, 'create')
  submitMine(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.submit(user, id, true);
  }
  @Get('employees/:employeeId/bank-accounts')
  @Permissions('employee-bank-accounts.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'read')
  bankAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Query() query: { page?: number; pageSize?: number; search?: string },
  ) {
    return this.loans.listBankAccounts(user, employeeId, query);
  }
  @Get('employee-bank-accounts')
  @Permissions('employee-bank-accounts.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'read')
  allBankAccounts(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: { page?: number; pageSize?: number; search?: string },
  ) {
    return this.loans.listAllBankAccounts(user, query);
  }
  @Get('employee-bank-accounts/:id')
  @Permissions('employee-bank-accounts.read')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'read')
  bankAccountDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.bankAccountDetail(user, id);
  }
  @Post('employee-bank-accounts')
  @Permissions('employee-bank-accounts.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'create')
  createGlobalBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEmployeeBankAccountDto,
  ) {
    return this.loans.createBankAccount(user, dto);
  }
  @Post('employees/:employeeId/bank-accounts')
  @Permissions('employee-bank-accounts.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'create')
  createBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Body() dto: CreateEmployeeBankAccountDto,
  ) {
    return this.loans.createBankAccount(user, { ...dto, employeeId });
  }
  @Patch('employee-bank-accounts/:id')
  @Permissions('employee-bank-accounts.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'write')
  updateBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: UpdateEmployeeBankAccountDto,
  ) {
    return this.loans.updateBankAccount(user, id, dto);
  }
  @Post('employee-bank-accounts/:id/submit-verification')
  @Permissions('employee-bank-accounts.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'create')
  submitBankAccountVerification(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.submitBankAccountForVerification(user, id);
  }
  @Post('employee-bank-accounts/:id/reject')
  @Permissions('employee-bank-accounts.verify')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'approve')
  rejectBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: RejectEmployeeBankAccountDto,
  ) {
    return this.loans.rejectBankAccount(user, id, dto);
  }
  @Post('employee-bank-accounts/:id/deactivate')
  @Permissions('employee-bank-accounts.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'create')
  deactivateBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.deactivateBankAccount(user, id);
  }
  @Post('employee-bank-accounts/:id/set-payroll')
  @Permissions('employee-bank-accounts.manage')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'create')
  setPayrollBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.loans.setPayrollBankAccount(user, id);
  }
  @Post('employee-bank-accounts/:id/verify')
  @Permissions('employee-bank-accounts.verify')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'approve')
  verifyBankAccount(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: VerifyEmployeeBankAccountDto,
  ) {
    return this.loans.verifyBankAccount(user, id, dto);
  }
  @Get('me/bank-accounts')
  @Permissions('employee-bank-accounts.read-own')
  @RequirePermission(ENTITY_KEYS.EMPLOYEE_BANK_ACCOUNTS, 'read')
  myBankAccounts(@CurrentUser() user: AuthenticatedUser) {
    return this.loans.listBankAccounts(user, '', {}, true);
  }
}
