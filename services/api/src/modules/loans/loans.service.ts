import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  ApprovalModuleKey,
  ApprovalRequestStatus,
  BankAccountVerificationStatus,
  LoanInstallmentStatus,
  LoanRequestStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalsService } from '../approvals/approvals.service';
import { ApprovalMatrixResolverService } from '../approvals/approval-matrix-resolver.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  ApproveLoanDto,
  CreateEmployeeBankAccountDto,
  CreateBankDto,
  CreateLoanPolicyDto,
  CreateLoanRequestDto,
  LoanQueryDto,
  RejectLoanDto,
  VerifyEmployeeBankAccountDto,
  UpdateBankDto,
  UpdateLoanPolicyDto,
} from './dto/loans.dto';

const loanInclude = {
  employee: {
    select: {
      id: true,
      employeeCode: true,
      firstName: true,
      lastName: true,
      userId: true,
    },
  },
  loanPolicy: true,
  installments: { orderBy: { installmentNumber: 'asc' } },
} satisfies Prisma.LoanRequestInclude;

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly approvalsService: ApprovalsService,
    private readonly approvalResolver: ApprovalMatrixResolverService,
    private readonly notificationsService: NotificationsService,
  ) {}

  listLoanPolicies(user: AuthenticatedUser) {
    return this.prisma.loanPolicy.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async loanPolicy(user: AuthenticatedUser, id: string) {
    const policy = await this.prisma.loanPolicy.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!policy) throw new NotFoundException('Loan policy was not found.');
    return policy;
  }

  async createLoanPolicy(user: AuthenticatedUser, dto: CreateLoanPolicyDto) {
    validateLoanPolicy(dto);
    const policy = await this.prisma.loanPolicy.create({
      data: {
        tenantId: user.tenantId,
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: clean(dto.description),
        currencyCode: clean(dto.currencyCode)?.toUpperCase(),
        minimumAmount: dto.minimumAmount,
        maximumAmount: dto.maximumAmount,
        maximumInstallments: dto.maximumInstallments,
        interestRatePercent: dto.interestRatePercent ?? 0,
        allowEarlySettlement: dto.allowEarlySettlement ?? true,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit(user, 'LOAN_POLICY_CREATED', policy.id, null, policy);
    return policy;
  }

  async updateLoanPolicy(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateLoanPolicyDto,
  ) {
    const existing = await this.loanPolicy(user, id);
    validateLoanPolicy(dto);
    const policy = await this.prisma.loanPolicy.update({
      where: { id },
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: clean(dto.description),
        currencyCode: clean(dto.currencyCode)?.toUpperCase(),
        minimumAmount: dto.minimumAmount,
        maximumAmount: dto.maximumAmount,
        maximumInstallments: dto.maximumInstallments,
        interestRatePercent: dto.interestRatePercent ?? 0,
        allowEarlySettlement: dto.allowEarlySettlement ?? true,
        isActive: dto.isActive ?? true,
      },
    });
    await this.audit(user, 'LOAN_POLICY_UPDATED', id, existing, policy);
    return policy;
  }

  listBanks(user: AuthenticatedUser) {
    return this.prisma.bank.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
    });
  }

  async bank(user: AuthenticatedUser, id: string) {
    const bank = await this.prisma.bank.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!bank) throw new NotFoundException('Bank was not found.');
    return bank;
  }

  async createBank(user: AuthenticatedUser, dto: CreateBankDto) {
    const bank = await this.prisma.bank.create({
      data: { tenantId: user.tenantId, ...bankData(dto) },
    });
    await this.audit(user, 'BANK_CREATED', bank.id, null, bank);
    return bank;
  }

  async updateBank(user: AuthenticatedUser, id: string, dto: UpdateBankDto) {
    const existing = await this.bank(user, id);
    const bank = await this.prisma.bank.update({
      where: { id },
      data: bankData(dto),
    });
    await this.audit(user, 'BANK_UPDATED', id, existing, bank);
    return bank;
  }

  async list(user: AuthenticatedUser, query: LoanQueryDto, own = false) {
    const employeeId = own
      ? await this.employeeIdForUser(user)
      : query.employeeId;
    const rows = await this.prisma.loanRequest.findMany({
      where: {
        tenantId: user.tenantId,
        ...(employeeId ? { employeeId } : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(!own &&
        user.accessContext &&
        !user.accessContext.canAccessAllBusinessUnits
          ? {
              employee: {
                businessUnitId: {
                  in: user.accessContext.accessibleBusinessUnitIds,
                },
              },
            }
          : {}),
      },
      include: loanInclude,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(mapLoan);
  }

  async detail(user: AuthenticatedUser, id: string, own = false) {
    const loan = await this.findLoan(user.tenantId, id);
    if (own && loan.employeeId !== (await this.employeeIdForUser(user)))
      throw new ForbiddenException('You can only access your own loans.');
    if (!own) await this.assertEmployeeScope(user, loan.employeeId);
    return mapLoan(loan);
  }

  async create(
    user: AuthenticatedUser,
    dto: CreateLoanRequestDto,
    own = false,
  ) {
    const employeeId = own
      ? await this.employeeIdForUser(user)
      : (dto.employeeId ?? (await this.employeeIdForUser(user)));
    await this.assertEmployee(user.tenantId, employeeId);
    if (!own) await this.assertEmployeeScope(user, employeeId);
    const policy = dto.loanPolicyId
      ? await this.prisma.loanPolicy.findFirst({
          where: {
            id: dto.loanPolicyId,
            tenantId: user.tenantId,
            isActive: true,
          },
        })
      : null;
    if (dto.loanPolicyId && !policy)
      throw new BadRequestException('Active loan policy was not found.');
    const amount = new Prisma.Decimal(dto.requestedAmount);
    if (policy?.minimumAmount && amount.lt(policy.minimumAmount))
      throw new BadRequestException(
        'Requested amount is below the policy minimum.',
      );
    if (policy?.maximumAmount && amount.gt(policy.maximumAmount))
      throw new BadRequestException(
        'Requested amount exceeds the policy maximum.',
      );
    if (
      policy?.maximumInstallments &&
      dto.installmentCount > policy.maximumInstallments
    )
      throw new BadRequestException(
        'Installment count exceeds the policy maximum.',
      );
    const created = await this.prisma.loanRequest.create({
      data: {
        tenantId: user.tenantId,
        employeeId,
        loanPolicyId: policy?.id ?? null,
        requestNumber: `LN-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${randomUUID().slice(0, 8).toUpperCase()}`,
        requestedAmount: amount,
        outstandingBalance: amount,
        currencyCode: dto.currencyCode.trim().toUpperCase(),
        installmentCount: dto.installmentCount,
        requestedStartDate: new Date(dto.requestedStartDate),
        reason: dto.reason?.trim() || null,
        createdByUserId: user.userId,
      },
      include: loanInclude,
    });
    await this.audit(user, 'LOAN_REQUEST_CREATED', created.id, null, created);
    return mapLoan(created);
  }

  async submit(user: AuthenticatedUser, id: string, own = false) {
    const loan = await this.findLoan(user.tenantId, id);
    if (own && loan.employeeId !== (await this.employeeIdForUser(user)))
      throw new ForbiddenException('You can only submit your own loans.');
    if (!own) await this.assertEmployeeScope(user, loan.employeeId);
    if (loan.status !== LoanRequestStatus.DRAFT)
      throw new ConflictException('Only draft loans can be submitted.');
    const employee = await this.prisma.employee.findFirstOrThrow({
      where: { tenantId: user.tenantId, id: loan.employeeId },
      select: {
        id: true,
        userId: true,
        managerEmployeeId: true,
        departmentId: true,
        businessUnitId: true,
        employeeLevelId: true,
        manager: { select: { id: true, userId: true } },
        businessUnit: { select: { organizationId: true } },
      },
    });
    const route = await this.approvalResolver.resolveApprovalRoute({
      tenantId: user.tenantId,
      moduleKey: ApprovalModuleKey.LOAN_REQUEST,
      recordType: 'loanRequest',
      requesterEmployee: employee,
      scopeContext: {
        organizationId: employee.businessUnit?.organizationId,
        businessUnitId: employee.businessUnitId,
        departmentId: employee.departmentId,
        employeeLevelId: employee.employeeLevelId,
        employeeId: employee.id,
      },
      conditionContext: {
        amount: loan.requestedAmount.toString(),
        loanPolicyId: loan.loanPolicyId,
      },
    });
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.approvalsService.createWorkflow(
        {
          user,
          moduleKey: 'loan',
          entityType: 'loanRequest',
          entityId: loan.id,
          requestNumber: loan.requestNumber,
          title: `Loan request ${loan.requestNumber}`,
          submittedForEmployeeId: loan.employeeId,
          steps: route,
          metadata: { source: 'loan', approvalModuleKey: 'LOAN_REQUEST' },
        },
        tx,
      );
      return tx.loanRequest.update({
        where: { id },
        data: { status: LoanRequestStatus.SUBMITTED },
        include: loanInclude,
      });
    });
    await this.audit(user, 'LOAN_REQUEST_SUBMITTED', id, loan, updated);
    await this.notificationsService.emit({
      tenantId: user.tenantId,
      eventKey: 'LOAN_APPROVAL_REQUESTED',
      moduleKey: 'loan',
      actorUserId: user.userId,
      relatedEntityType: 'loanRequest',
      relatedEntityId: updated.id,
      relatedRecordNumber: updated.requestNumber,
      metadata: {
        approvalAssigneeUserIds: route[0]?.candidateUserIds ?? [],
        targetUrl: `/loans/${updated.id}`,
      },
    });
    return mapLoan(updated);
  }

  async approve(user: AuthenticatedUser, id: string, dto: ApproveLoanDto) {
    const loan = await this.findLoan(user.tenantId, id);
    await this.assertEmployeeScope(user, loan.employeeId);
    if (loan.status !== LoanRequestStatus.SUBMITTED)
      throw new ConflictException('Only submitted loans can be approved.');
    const approved = new Prisma.Decimal(dto.approvedAmount);
    if (approved.gt(loan.requestedAmount))
      throw new BadRequestException(
        'Approved amount cannot exceed requested amount.',
      );
    const installmentCount = dto.installmentCount ?? loan.installmentCount;
    const monthly = approved.div(installmentCount).toDecimalPlaces(2);
    const approval = await this.findApprovalRequest(user.tenantId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      const approvalResult = await this.approvalsService.action(
        { user, approvalRequestId: approval.id, action: 'APPROVED' },
        tx,
      );
      if (approvalResult.status !== ApprovalRequestStatus.APPROVED) {
        return tx.loanRequest.findUniqueOrThrow({
          where: { id },
          include: loanInclude,
        });
      }
      await tx.loanInstallment.deleteMany({ where: { loanRequestId: id } });
      let allocated = new Prisma.Decimal(0);
      for (let index = 0; index < installmentCount; index += 1) {
        const amount =
          index === installmentCount - 1 ? approved.minus(allocated) : monthly;
        allocated = allocated.plus(amount);
        await tx.loanInstallment.create({
          data: {
            tenantId: user.tenantId,
            loanRequestId: id,
            employeeId: loan.employeeId,
            installmentNumber: index + 1,
            dueDate: addMonths(loan.requestedStartDate, index),
            amount,
            principalAmount: amount,
          },
        });
      }
      return tx.loanRequest.update({
        where: { id },
        data: {
          status: LoanRequestStatus.ACTIVE,
          approvedAmount: approved,
          installmentCount,
          monthlyDeduction: monthly,
          outstandingBalance: approved,
          approvedAt: new Date(),
          activatedAt: new Date(),
        },
        include: loanInclude,
      });
    });
    await this.audit(
      user,
      updated.status === LoanRequestStatus.ACTIVE
        ? 'LOAN_REQUEST_APPROVED'
        : 'LOAN_APPROVAL_STEP_APPROVED',
      id,
      loan,
      updated,
    );
    if (updated.status === LoanRequestStatus.ACTIVE) {
      await this.notificationsService.emit({
        tenantId: user.tenantId,
        eventKey: 'LOAN_APPROVED',
        moduleKey: 'loan',
        actorUserId: user.userId,
        relatedEntityType: 'loanRequest',
        relatedEntityId: updated.id,
        relatedRecordNumber: updated.requestNumber,
        metadata: {
          recipientUserIds: updated.employee.userId
            ? [updated.employee.userId]
            : [],
          targetUrl: `/loans/${updated.id}`,
        },
      });
    }
    return mapLoan(updated);
  }

  async reject(user: AuthenticatedUser, id: string, dto: RejectLoanDto) {
    const loan = await this.findLoan(user.tenantId, id);
    await this.assertEmployeeScope(user, loan.employeeId);
    if (loan.status !== LoanRequestStatus.SUBMITTED)
      throw new ConflictException('Only submitted loans can be rejected.');
    const approval = await this.findApprovalRequest(user.tenantId, id);
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.approvalsService.action(
        {
          user,
          approvalRequestId: approval.id,
          action: 'REJECTED',
          comment: dto.reason,
        },
        tx,
      );
      return tx.loanRequest.update({
        where: { id },
        data: {
          status: LoanRequestStatus.REJECTED,
          rejectionReason: dto.reason.trim(),
        },
        include: loanInclude,
      });
    });
    await this.audit(user, 'LOAN_REQUEST_REJECTED', id, loan, updated);
    await this.notificationsService.emit({
      tenantId: user.tenantId,
      eventKey: 'LOAN_REJECTED',
      moduleKey: 'loan',
      actorUserId: user.userId,
      relatedEntityType: 'loanRequest',
      relatedEntityId: updated.id,
      relatedRecordNumber: updated.requestNumber,
      metadata: {
        recipientUserIds: updated.employee.userId
          ? [updated.employee.userId]
          : [],
        targetUrl: `/loans/${updated.id}`,
      },
    });
    return mapLoan(updated);
  }

  async settle(user: AuthenticatedUser, id: string) {
    const loan = await this.findLoan(user.tenantId, id);
    await this.assertEmployeeScope(user, loan.employeeId);
    if (loan.status !== LoanRequestStatus.ACTIVE)
      throw new ConflictException('Only active loans can be settled.');
    if (loan.loanPolicy && !loan.loanPolicy.allowEarlySettlement)
      throw new ForbiddenException(
        'Early settlement is disabled by the loan policy.',
      );
    const mutablePayrollInstallment =
      await this.prisma.loanInstallment.findFirst({
        where: {
          tenantId: user.tenantId,
          loanRequestId: id,
          status: LoanInstallmentStatus.INCLUDED_IN_PAYROLL,
          payrollRunEmployee: {
            payrollRun: { status: { notIn: ['LOCKED', 'PAID'] } },
          },
        },
        select: { id: true },
      });
    if (mutablePayrollInstallment) {
      throw new ConflictException(
        'This loan is included in a mutable payroll run. Lock or recalculate that run before early settlement.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.loanInstallment.updateMany({
        where: { loanRequestId: id, status: LoanInstallmentStatus.SCHEDULED },
        data: { status: LoanInstallmentStatus.WAIVED },
      });
      return tx.loanRequest.update({
        where: { id },
        data: {
          status: LoanRequestStatus.SETTLED,
          outstandingBalance: 0,
          settledAt: new Date(),
        },
        include: loanInclude,
      });
    });
    await this.audit(user, 'LOAN_EARLY_SETTLED', id, loan, updated);
    return mapLoan(updated);
  }

  async listBankAccounts(
    user: AuthenticatedUser,
    employeeId: string,
    own = false,
  ) {
    const targetId = own ? await this.employeeIdForUser(user) : employeeId;
    if (!own) await this.assertEmployeeScope(user, targetId);
    const rows = await this.prisma.employeeBankAccount.findMany({
      where: { tenantId: user.tenantId, employeeId: targetId },
      include: { bank: true },
      orderBy: [{ isPrimaryPayroll: 'desc' }, { effectiveFrom: 'desc' }],
    });
    return rows.map(maskBankAccount);
  }

  async listAllBankAccounts(user: AuthenticatedUser) {
    const context = user.accessContext;
    const rows = await this.prisma.employeeBankAccount.findMany({
      where: {
        tenantId: user.tenantId,
        ...(!context || context.canAccessAllBusinessUnits
          ? {}
          : {
              employee: {
                businessUnitId: {
                  in: context.accessibleBusinessUnitIds,
                },
              },
            }),
      },
      include: {
        bank: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
      orderBy: [{ isPrimaryPayroll: 'desc' }, { effectiveFrom: 'desc' }],
    });
    return rows.map(maskBankAccount);
  }

  async bankAccountDetail(user: AuthenticatedUser, id: string) {
    const row = await this.prisma.employeeBankAccount.findFirst({
      where: { id, tenantId: user.tenantId },
      include: {
        bank: true,
        employee: {
          select: {
            id: true,
            employeeCode: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    if (!row)
      throw new NotFoundException('Employee bank account was not found.');
    await this.assertEmployeeScope(user, row.employeeId);
    return maskBankAccount(row);
  }

  async createBankAccount(
    user: AuthenticatedUser,
    dto: CreateEmployeeBankAccountDto,
  ) {
    await this.assertEmployee(user.tenantId, dto.employeeId);
    await this.assertEmployeeScope(user, dto.employeeId);
    if (!dto.accountNumber && !dto.iban)
      throw new BadRequestException('Account number or IBAN is required.');
    if (
      dto.effectiveTo &&
      new Date(dto.effectiveTo) < new Date(dto.effectiveFrom)
    ) {
      throw new BadRequestException(
        'effectiveTo cannot be before effectiveFrom.',
      );
    }
    if (
      dto.bankId &&
      !(await this.prisma.bank.findFirst({
        where: { id: dto.bankId, tenantId: user.tenantId, isActive: true },
      }))
    )
      throw new BadRequestException('Active bank was not found.');
    const created = await this.prisma.$transaction(async (tx) => {
      if (dto.isPrimaryPayroll)
        await tx.employeeBankAccount.updateMany({
          where: {
            tenantId: user.tenantId,
            employeeId: dto.employeeId,
            isPrimaryPayroll: true,
          },
          data: { isPrimaryPayroll: false },
        });
      return tx.employeeBankAccount.create({
        data: {
          tenantId: user.tenantId,
          employeeId: dto.employeeId,
          bankId: dto.bankId ?? null,
          accountTitle: dto.accountTitle.trim(),
          accountNumber: dto.accountNumber?.replace(/\s/g, '') || null,
          iban: dto.iban?.replace(/\s/g, '').toUpperCase() || null,
          swiftOrRoutingCode: dto.swiftOrRoutingCode?.trim() || null,
          countryCode: dto.countryCode.toUpperCase(),
          currencyCode: dto.currencyCode.toUpperCase(),
          isPrimaryPayroll: dto.isPrimaryPayroll ?? false,
          effectiveFrom: new Date(dto.effectiveFrom),
          effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
        },
        include: { bank: true },
      });
    });
    await this.audit(user, 'EMPLOYEE_BANK_ACCOUNT_CREATED', created.id, null, {
      ...created,
      accountNumber: mask(created.accountNumber),
      iban: mask(created.iban),
    });
    return maskBankAccount(created);
  }

  async verifyBankAccount(
    user: AuthenticatedUser,
    id: string,
    dto: VerifyEmployeeBankAccountDto,
  ) {
    const existing = await this.prisma.employeeBankAccount.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing)
      throw new NotFoundException('Employee bank account was not found.');
    await this.assertEmployeeScope(user, existing.employeeId);
    const updated = await this.prisma.employeeBankAccount.update({
      where: { id },
      data: {
        verificationStatus: dto.verificationStatus,
        verifiedAt:
          dto.verificationStatus === BankAccountVerificationStatus.VERIFIED
            ? new Date()
            : null,
        verifiedByUserId:
          dto.verificationStatus === BankAccountVerificationStatus.VERIFIED
            ? user.userId
            : null,
      },
      include: { bank: true },
    });
    await this.audit(
      user,
      'EMPLOYEE_BANK_ACCOUNT_VERIFICATION_UPDATED',
      id,
      { verificationStatus: existing.verificationStatus },
      { verificationStatus: updated.verificationStatus },
    );
    return maskBankAccount(updated);
  }

  private async findLoan(tenantId: string, id: string) {
    const loan = await this.prisma.loanRequest.findFirst({
      where: { tenantId, id },
      include: loanInclude,
    });
    if (!loan) throw new NotFoundException('Loan request was not found.');
    return loan;
  }
  private async findApprovalRequest(tenantId: string, loanRequestId: string) {
    const approval = await this.prisma.approvalRequest.findUnique({
      where: {
        tenantId_moduleKey_entityType_entityId: {
          tenantId,
          moduleKey: 'loan',
          entityType: 'loanRequest',
          entityId: loanRequestId,
        },
      },
      select: { id: true, status: true },
    });
    if (!approval) {
      throw new ConflictException(
        'The loan does not have an active generic approval workflow.',
      );
    }
    return approval;
  }
  private async employeeIdForUser(user: AuthenticatedUser) {
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, userId: user.userId },
      select: { id: true },
    });
    if (!employee)
      throw new BadRequestException(
        'No employee profile is linked to this user.',
      );
    return employee.id;
  }
  private async assertEmployee(tenantId: string, employeeId: string) {
    if (
      !(await this.prisma.employee.findFirst({
        where: { tenantId, id: employeeId },
        select: { id: true },
      }))
    )
      throw new BadRequestException('Employee was not found for this tenant.');
  }
  private async assertEmployeeScope(
    user: AuthenticatedUser,
    employeeId: string,
  ) {
    const context = user.accessContext;
    if (!context || context.canAccessAllBusinessUnits) return;
    const employee = await this.prisma.employee.findFirst({
      where: { tenantId: user.tenantId, id: employeeId },
      select: { businessUnitId: true },
    });
    if (
      !employee?.businessUnitId ||
      !context.accessibleBusinessUnitIds.includes(employee.businessUnitId)
    ) {
      throw new ForbiddenException(
        'You do not have access to this employee bank account.',
      );
    }
  }
  private audit(
    user: AuthenticatedUser,
    action: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType: action.startsWith('EMPLOYEE_BANK')
        ? 'EmployeeBankAccount'
        : action.startsWith('LOAN_POLICY')
          ? 'LoanPolicy'
          : action.startsWith('BANK_')
            ? 'Bank'
            : 'LoanRequest',
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

function clean(value?: string) {
  const normalized = value?.trim();
  return normalized || null;
}

function validateLoanPolicy(dto: CreateLoanPolicyDto) {
  if (
    dto.minimumAmount != null &&
    dto.maximumAmount != null &&
    dto.minimumAmount > dto.maximumAmount
  ) {
    throw new BadRequestException(
      'Minimum amount cannot exceed maximum amount.',
    );
  }
}

function bankData(dto: CreateBankDto) {
  return {
    code: dto.code.trim().toUpperCase(),
    name: dto.name.trim(),
    countryCode: dto.countryCode.trim().toUpperCase(),
    swiftCode: clean(dto.swiftCode)?.toUpperCase(),
    routingCode: clean(dto.routingCode),
    isActive: dto.isActive ?? true,
  };
}

function addMonths(value: Date, months: number) {
  const date = new Date(value);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date;
}
function mask(value: string | null) {
  if (!value) return null;
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}
function maskBankAccount<
  T extends { accountNumber: string | null; iban: string | null },
>(row: T) {
  return {
    ...row,
    accountNumber: mask(row.accountNumber),
    iban: mask(row.iban),
  };
}
function mapLoan<
  T extends {
    requestedAmount: Prisma.Decimal;
    approvedAmount: Prisma.Decimal | null;
    monthlyDeduction: Prisma.Decimal | null;
    outstandingBalance: Prisma.Decimal;
    installments: Array<{
      amount: Prisma.Decimal;
      principalAmount: Prisma.Decimal;
      interestAmount: Prisma.Decimal;
    }>;
  },
>(loan: T) {
  return {
    ...loan,
    requestedAmount: loan.requestedAmount.toString(),
    approvedAmount: loan.approvedAmount?.toString() ?? null,
    monthlyDeduction: loan.monthlyDeduction?.toString() ?? null,
    outstandingBalance: loan.outstandingBalance.toString(),
    installments: loan.installments.map((item) => ({
      ...item,
      amount: item.amount.toString(),
      principalAmount: item.principalAmount.toString(),
      interestAmount: item.interestAmount.toString(),
    })),
  };
}
