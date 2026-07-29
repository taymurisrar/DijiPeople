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
  RejectEmployeeBankAccountDto,
  UpdateEmployeeBankAccountDto,
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
    await this.validateLoanPolicyReferences(user.tenantId, dto);
    await this.assertDefaultLoanPolicy(user.tenantId, dto);
    const policy = await this.prisma.loanPolicy.create({
      data: {
        tenantId: user.tenantId,
        ...loanPolicyData(dto, user.userId),
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        createdById: user.userId,
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
    await this.validateLoanPolicyReferences(user.tenantId, dto);
    await this.assertDefaultLoanPolicy(user.tenantId, dto, id);
    const policy = await this.prisma.loanPolicy.update({
      where: { id },
      data: {
        ...loanPolicyData(dto, user.userId, true),
        version: { increment: 1 },
      },
    });
    await this.audit(user, 'LOAN_POLICY_UPDATED', id, existing, policy);
    return policy;
  }

  private async validateLoanPolicyReferences(
    tenantId: string,
    dto: CreateLoanPolicyDto | UpdateLoanPolicyDto,
  ) {
    const checks: Array<Promise<unknown>> = [];
    for (const id of [dto.organizationId, dto.legalEntityId].filter(
      Boolean,
    ) as string[]) {
      checks.push(
        this.prisma.organization.findFirst({
          where: { tenantId, id, isActive: true },
          select: { id: true },
        }),
      );
    }
    for (const id of [
      dto.deductionPayComponentId,
      dto.interestPayComponentId,
      dto.feePayComponentId,
    ].filter(Boolean) as string[]) {
      checks.push(
        this.prisma.payComponent.findFirst({
          where: { tenantId, id, isActive: true },
          select: { id: true },
        }),
      );
    }
    if (dto.approvalWorkflowId)
      checks.push(
        this.prisma.approvalMatrix.findFirst({
          where: { tenantId, id: dto.approvalWorkflowId, isActive: true },
          select: { id: true },
        }),
      );
    const results = await Promise.all(checks);
    if (results.some((result) => !result))
      throw new BadRequestException(
        'Loan plan scope or payroll mapping contains a missing or inactive tenant record.',
      );
  }

  private async assertDefaultLoanPolicy(
    tenantId: string,
    dto: CreateLoanPolicyDto | UpdateLoanPolicyDto,
    excludeId?: string,
  ) {
    if (!dto.isDefault) return;
    const existing = await this.prisma.loanPolicy.findFirst({
      where: {
        tenantId,
        isDefault: true,
        status: 'ACTIVE',
        loanType: choice(dto.loanType, 'PERSONAL_LOAN'),
        organizationId: dto.organizationId ?? null,
        legalEntityId: dto.legalEntityId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException(
        'Only one default loan plan is allowed per loan type and organization scope.',
      );
  }

  private async assertLoanEligibility(
    tenantId: string,
    employeeId: string,
    policy: Prisma.LoanPolicyGetPayload<object>,
    requestedAmount: Prisma.Decimal,
  ) {
    const [employee, compensation, activeLoans] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { tenantId, id: employeeId },
        select: {
          hireDate: true,
          employmentStatus: true,
          businessUnitId: true,
          departmentId: true,
          businessUnit: { select: { organizationId: true } },
        },
      }),
      this.prisma.employeeCompensationHistory.findFirst({
        where: { tenantId, employeeId, status: 'ACTIVE' },
        orderBy: { effectiveFrom: 'desc' },
        select: { baseAmount: true },
      }),
      this.prisma.loanRequest.count({
        where: { tenantId, employeeId, status: 'ACTIVE' },
      }),
    ]);
    if (!employee) throw new BadRequestException('Employee was not found.');
    if (
      policy.organizationId &&
      employee.businessUnit?.organizationId !== policy.organizationId
    )
      throw new BadRequestException(
        'Employee is outside the loan plan organization scope.',
      );
    if (policy.minimumServiceMonths) {
      const eligibleOn = new Date(employee.hireDate);
      eligibleOn.setUTCMonth(
        eligibleOn.getUTCMonth() + policy.minimumServiceMonths,
      );
      if (eligibleOn > new Date())
        throw new BadRequestException(
          'Employee has not completed the minimum service required by this loan plan.',
        );
    }
    if (policy.probationCompleted && employee.employmentStatus === 'PROBATION')
      throw new BadRequestException(
        'Employee must complete probation before requesting this loan.',
      );
    if (
      policy.maximumActiveLoans !== null &&
      activeLoans >= policy.maximumActiveLoans
    )
      throw new BadRequestException(
        'Employee has reached the maximum number of active loans.',
      );
    if (
      policy.minimumSalary &&
      (!compensation || compensation.baseAmount.lt(policy.minimumSalary))
    )
      throw new BadRequestException(
        'Employee salary is below the loan plan minimum.',
      );
    if (
      policy.maximumSalaryMultiple &&
      compensation &&
      requestedAmount.gt(
        compensation.baseAmount.mul(policy.maximumSalaryMultiple),
      )
    )
      throw new BadRequestException(
        'Requested amount exceeds the salary multiple allowed by the loan plan.',
      );
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
        ...(query.loanPolicyId ? { loanPolicyId: query.loanPolicyId } : {}),
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
    if (policy)
      await this.assertLoanEligibility(
        user.tenantId,
        employeeId,
        policy,
        amount,
      );
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
        currencyCode: loan.currencyCode,
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
    const schedule = buildLoanSchedule(
      approved,
      installmentCount,
      loan.loanPolicy,
      loan.requestedStartDate,
    );
    const totalRepayable = schedule.reduce(
      (sum, installment) => sum.plus(installment.amount),
      new Prisma.Decimal(0),
    );
    const monthly = schedule[0]?.amount ?? approved;
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
      for (let index = 0; index < schedule.length; index += 1) {
        const installment = schedule[index];
        await tx.loanInstallment.create({
          data: {
            tenantId: user.tenantId,
            loanRequestId: id,
            employeeId: loan.employeeId,
            installmentNumber: index + 1,
            dueDate: installment.dueDate,
            amount: installment.amount,
            principalAmount: installment.principal,
            interestAmount: installment.interest,
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
          outstandingBalance: totalRepayable,
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
    query: { page?: number; pageSize?: number; search?: string } = {},
    own = false,
  ) {
    const targetId = own ? await this.employeeIdForUser(user) : employeeId;
    if (!own) await this.assertEmployeeScope(user, targetId);
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const search = query.search?.trim();
    const where: Prisma.EmployeeBankAccountWhereInput = {
      tenantId: user.tenantId,
      employeeId: targetId,
      ...(search
        ? {
            OR: [
              { accountTitle: { contains: search, mode: 'insensitive' } },
              { currencyCode: { contains: search, mode: 'insensitive' } },
              { bank: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employeeBankAccount.findMany({
        where,
        include: { bank: true },
        orderBy: [{ isPrimaryPayroll: 'desc' }, { effectiveFrom: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employeeBankAccount.count({ where }),
    ]);
    return {
      items: rows.map(maskBankAccount),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async listAllBankAccounts(
    user: AuthenticatedUser,
    query: { page?: number; pageSize?: number; search?: string } = {},
  ) {
    const context = user.accessContext;
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const search = query.search?.trim();
    const where: Prisma.EmployeeBankAccountWhereInput = {
      tenantId: user.tenantId,
      ...(search
        ? {
            OR: [
              { accountTitle: { contains: search, mode: 'insensitive' } },
              { currencyCode: { contains: search, mode: 'insensitive' } },
              {
                employee: {
                  firstName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                employee: {
                  lastName: { contains: search, mode: 'insensitive' },
                },
              },
              {
                employee: {
                  employeeCode: { contains: search, mode: 'insensitive' },
                },
              },
              { bank: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(!context || context.canAccessAllBusinessUnits
        ? {}
        : {
            employee: {
              businessUnitId: {
                in: context.accessibleBusinessUnitIds,
              },
            },
          }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.employeeBankAccount.findMany({
        where,
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
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employeeBankAccount.count({ where }),
    ]);
    return {
      items: rows.map(maskBankAccount),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
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
    if (!dto.employeeId)
      throw new BadRequestException('employeeId is required.');
    const employeeId = dto.employeeId;
    await this.assertEmployee(user.tenantId, employeeId);
    await this.assertEmployeeScope(user, employeeId);
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
            employeeId,
            currencyCode: dto.currencyCode.toUpperCase(),
            isPrimaryPayroll: true,
            isActive: true,
          },
          data: { isPrimaryPayroll: false },
        });
      return tx.employeeBankAccount.create({
        data: {
          tenantId: user.tenantId,
          employeeId,
          bankId: dto.bankId ?? null,
          accountTitle: dto.accountTitle.trim(),
          accountNumber: dto.accountNumber?.replace(/\s/g, '') || null,
          iban: dto.iban?.replace(/\s/g, '').toUpperCase() || null,
          swiftOrRoutingCode: dto.swiftOrRoutingCode?.trim() || null,
          branchName: dto.branchName?.trim() || null,
          branchCode: dto.branchCode?.trim() || null,
          countryCode: dto.countryCode.toUpperCase(),
          currencyCode: dto.currencyCode.toUpperCase(),
          isPrimaryPayroll: dto.isPrimaryPayroll ?? false,
          supportingDocumentId: dto.supportingDocumentId ?? null,
          employeeNotes: dto.employeeNotes?.trim() || null,
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

  async updateBankAccount(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateEmployeeBankAccountDto,
  ) {
    const existing = await this.prisma.employeeBankAccount.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing)
      throw new NotFoundException('Employee bank account was not found.');
    await this.assertEmployeeScope(user, existing.employeeId);
    if (!existing.isActive) {
      throw new ConflictException('Inactive bank accounts cannot be edited.');
    }
    if (
      dto.effectiveTo &&
      new Date(dto.effectiveTo) <
        new Date(dto.effectiveFrom ?? existing.effectiveFrom)
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
    ) {
      throw new BadRequestException('Active bank was not found.');
    }

    const changesSensitivePayrollField = [
      dto.bankId,
      dto.accountTitle,
      dto.accountNumber,
      dto.iban,
      dto.swiftOrRoutingCode,
      dto.branchName,
      dto.branchCode,
      dto.countryCode,
      dto.currencyCode,
    ].some((value) => value !== undefined);
    const updated = await this.prisma.employeeBankAccount.update({
      where: { id },
      data: {
        ...bankAccountUpdateData(dto),
        ...(changesSensitivePayrollField
          ? {
              verificationStatus: BankAccountVerificationStatus.PENDING,
              verifiedAt: null,
              verifiedByUserId: null,
              verificationNotes: null,
            }
          : {}),
      },
      include: { bank: true },
    });
    await this.audit(user, 'EMPLOYEE_BANK_ACCOUNT_UPDATED', id, existing, {
      ...updated,
      accountNumber: mask(updated.accountNumber),
      iban: mask(updated.iban),
    });
    return maskBankAccount(updated);
  }

  async submitBankAccountForVerification(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.employeeBankAccount.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing)
      throw new NotFoundException('Employee bank account was not found.');
    await this.assertEmployeeScope(user, existing.employeeId);
    if (!existing.isActive)
      throw new ConflictException(
        'Inactive bank accounts cannot be submitted.',
      );
    if (existing.verificationStatus === BankAccountVerificationStatus.VERIFIED)
      throw new ConflictException('Verified accounts are already approved.');
    const updated = await this.prisma.employeeBankAccount.update({
      where: { id },
      data: {
        verificationStatus: BankAccountVerificationStatus.PENDING,
        verificationNotes: null,
        verifiedAt: null,
        verifiedByUserId: null,
      },
      include: { bank: true },
    });
    await this.audit(
      user,
      'EMPLOYEE_BANK_ACCOUNT_SUBMITTED_FOR_VERIFICATION',
      id,
      { verificationStatus: existing.verificationStatus },
      { verificationStatus: updated.verificationStatus },
    );
    return maskBankAccount(updated);
  }

  async rejectBankAccount(
    user: AuthenticatedUser,
    id: string,
    dto: RejectEmployeeBankAccountDto,
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
        verificationStatus: BankAccountVerificationStatus.REJECTED,
        verificationNotes: dto.reason.trim(),
        verifiedAt: null,
        verifiedByUserId: null,
        isPrimaryPayroll: false,
      },
      include: { bank: true },
    });
    await this.audit(
      user,
      'EMPLOYEE_BANK_ACCOUNT_REJECTED',
      id,
      { verificationStatus: existing.verificationStatus },
      { verificationStatus: updated.verificationStatus, reason: dto.reason },
    );
    return maskBankAccount(updated);
  }

  async deactivateBankAccount(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.employeeBankAccount.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing)
      throw new NotFoundException('Employee bank account was not found.');
    await this.assertEmployeeScope(user, existing.employeeId);
    const updated = await this.prisma.employeeBankAccount.update({
      where: { id },
      data: { isActive: false, isPrimaryPayroll: false },
      include: { bank: true },
    });
    await this.audit(user, 'EMPLOYEE_BANK_ACCOUNT_DEACTIVATED', id, existing, {
      id: updated.id,
      isActive: updated.isActive,
      isPrimaryPayroll: updated.isPrimaryPayroll,
    });
    return maskBankAccount(updated);
  }

  async setPayrollBankAccount(user: AuthenticatedUser, id: string) {
    const existing = await this.prisma.employeeBankAccount.findFirst({
      where: { id, tenantId: user.tenantId },
    });
    if (!existing)
      throw new NotFoundException('Employee bank account was not found.');
    await this.assertEmployeeScope(user, existing.employeeId);
    if (!existing.isActive)
      throw new ConflictException(
        'Only active bank accounts can be payroll accounts.',
      );
    if (existing.verificationStatus !== BankAccountVerificationStatus.VERIFIED)
      throw new ConflictException(
        'Only verified bank accounts can be set as payroll accounts.',
      );
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.employeeBankAccount.updateMany({
        where: {
          tenantId: user.tenantId,
          employeeId: existing.employeeId,
          currencyCode: existing.currencyCode,
          isPrimaryPayroll: true,
          isActive: true,
          id: { not: id },
        },
        data: { isPrimaryPayroll: false },
      });
      return tx.employeeBankAccount.update({
        where: { id },
        data: { isPrimaryPayroll: true },
        include: { bank: true },
      });
    });
    await this.audit(
      user,
      'EMPLOYEE_BANK_ACCOUNT_SET_AS_PAYROLL',
      id,
      { isPrimaryPayroll: existing.isPrimaryPayroll },
      { isPrimaryPayroll: updated.isPrimaryPayroll },
    );
    return maskBankAccount(updated);
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
    const updated = await this.prisma.$transaction(async (tx) => {
      if (
        dto.verificationStatus === BankAccountVerificationStatus.VERIFIED &&
        existing.isPrimaryPayroll
      ) {
        await tx.employeeBankAccount.updateMany({
          where: {
            tenantId: user.tenantId,
            employeeId: existing.employeeId,
            currencyCode: existing.currencyCode,
            isPrimaryPayroll: true,
            isActive: true,
            id: { not: id },
          },
          data: { isPrimaryPayroll: false },
        });
      }
      return tx.employeeBankAccount.update({
        where: { id },
        data: {
          verificationStatus: dto.verificationStatus,
          verificationNotes: null,
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

function choice(value?: string | null, fallback = '') {
  return value?.trim().toUpperCase() || fallback;
}

function loanPolicyData(
  dto: CreateLoanPolicyDto | UpdateLoanPolicyDto,
  userId: string,
  partial = false,
) {
  const value = <T>(key: keyof typeof dto, transform: (input: never) => T) =>
    dto[key] === undefined ? {} : { [key]: transform(dto[key] as never) };
  return {
    ...value('code', (input) => choice(input as string)),
    ...value('name', (input) => (input as string).trim()),
    ...value('description', (input) => clean(input as string)),
    ...value('loanType', (input) => choice(input as string, 'PERSONAL_LOAN')),
    ...value('organizationId', (input) => input || null),
    ...value('legalEntityId', (input) => input || null),
    ...value('ownerUserId', (input) => input || null),
    ...value('status', (input) => input),
    ...value('effectiveFrom', (input) =>
      input ? new Date(input as string) : null,
    ),
    ...value('effectiveTo', (input) =>
      input ? new Date(input as string) : null,
    ),
    ...value('isDefault', (input) => input),
    ...value('currencyCode', (input) => choice(input as string)),
    ...value('minimumAmount', (input) => input),
    ...value('maximumAmount', (input) => input),
    ...value('maximumInstallments', (input) => input),
    ...value('minimumServiceMonths', (input) => input),
    ...value('minimumSalary', (input) => input),
    ...value('maximumActiveLoans', (input) => input),
    ...value('probationCompleted', (input) => input),
    ...value('maximumSalaryMultiple', (input) => input),
    ...value('interestMethod', (input) =>
      choice(input as string, 'NO_INTEREST'),
    ),
    ...value('interestRatePercent', (input) => input),
    ...value('processingFee', (input) => input),
    ...value('insuranceFee', (input) => input),
    ...value('gracePeriodDays', (input) => input),
    ...value('repaymentFrequency', (input) =>
      choice(input as string, 'MONTHLY'),
    ),
    ...value('installmentMethod', (input) =>
      choice(input as string, 'EQUAL_INSTALLMENTS'),
    ),
    ...value('fixedInstallment', (input) => input),
    ...value('percentageOfSalary', (input) => input),
    ...value('maximumDeductionPercent', (input) => input),
    ...value('skipPayrollAllowed', (input) => input),
    ...value('allowEarlySettlement', (input) => input),
    ...value('settlementFee', (input) => input),
    ...value('arrearsHandling', (input) =>
      choice(input as string, 'CARRY_FORWARD'),
    ),
    ...value('finalSettlementHandling', (input) =>
      choice(input as string, 'DEDUCT_BALANCE'),
    ),
    ...value('deductionPayComponentId', (input) => input || null),
    ...value('interestPayComponentId', (input) => input || null),
    ...value('feePayComponentId', (input) => input || null),
    ...value('postingCategory', (input) => clean(input as string)),
    ...value('payslipVisible', (input) => input),
    ...value('negativeNetPayHandling', (input) =>
      choice(input as string, 'BLOCK'),
    ),
    ...value('approvalRequired', (input) => input),
    ...value('approvalWorkflowId', (input) => input || null),
    ...value('minimumApprovers', (input) => input),
    ...value('supportingDocumentRequired', (input) => input),
    ...value('eligibilityRules', (input) => input as Prisma.InputJsonValue),
    ...value('configuration', (input) => input as Prisma.InputJsonValue),
    ...value('isActive', (input) => input),
    ...(partial
      ? {}
      : {
          loanType: choice(dto.loanType, 'PERSONAL_LOAN'),
          ownerUserId: dto.ownerUserId ?? userId,
          status: dto.status ?? 'ACTIVE',
          interestMethod: choice(dto.interestMethod, 'NO_INTEREST'),
          interestRatePercent: dto.interestRatePercent ?? 0,
          allowEarlySettlement: dto.allowEarlySettlement ?? true,
          repaymentFrequency: choice(dto.repaymentFrequency, 'MONTHLY'),
          installmentMethod: choice(
            dto.installmentMethod,
            'EQUAL_INSTALLMENTS',
          ),
          gracePeriodDays: dto.gracePeriodDays ?? 0,
          payslipVisible: dto.payslipVisible ?? true,
          negativeNetPayHandling: choice(dto.negativeNetPayHandling, 'BLOCK'),
          approvalRequired: dto.approvalRequired ?? true,
          minimumApprovers: dto.minimumApprovers ?? 1,
          isActive:
            dto.isActive ??
            (dto.status === undefined || dto.status === 'ACTIVE'),
          updatedById: userId,
        }),
    ...(partial ? { updatedById: userId } : {}),
    ...(partial && dto.status !== undefined
      ? { isActive: dto.status === 'ACTIVE' }
      : {}),
  };
}

function validateLoanPolicy(
  dto: CreateLoanPolicyDto | UpdateLoanPolicyDto,
) {
  if (
    dto.minimumAmount != null &&
    dto.maximumAmount != null &&
    dto.minimumAmount > dto.maximumAmount
  ) {
    throw new BadRequestException(
      'Minimum amount cannot exceed maximum amount.',
    );
  }
  if (
    dto.effectiveFrom &&
    dto.effectiveTo &&
    new Date(dto.effectiveTo) < new Date(dto.effectiveFrom)
  )
    throw new BadRequestException(
      'Effective To cannot be before Effective From.',
    );
  if (
    dto.interestMethod === 'NO_INTEREST' &&
    (dto.interestRatePercent ?? 0) > 0
  )
    throw new BadRequestException(
      'No-interest loan plans cannot have an interest rate.',
    );
}

function buildLoanSchedule(
  principal: Prisma.Decimal,
  count: number,
  policy: Prisma.LoanPolicyGetPayload<object> | null,
  requestedStartDate: Date,
) {
  const method = policy?.interestMethod ?? 'NO_INTEREST';
  const rate = policy?.interestRatePercent ?? new Prisma.Decimal(0);
  const fees = (policy?.processingFee ?? new Prisma.Decimal(0)).plus(
    policy?.insuranceFee ?? new Prisma.Decimal(0),
  );
  const installments: Array<{
    amount: Prisma.Decimal;
    principal: Prisma.Decimal;
    interest: Prisma.Decimal;
    dueDate: Date;
  }> = [];
  let principalAllocated = new Prisma.Decimal(0);
  let interestAllocated = new Prisma.Decimal(0);
  const flatInterest =
    method === 'FLAT' ? principal.mul(rate).div(100) : new Prisma.Decimal(0);
  const monthlyRate = rate.div(100).div(12);
  const reducingPayment =
    method === 'REDUCING_BALANCE' && monthlyRate.gt(0)
      ? new Prisma.Decimal(
          (Number(principal) * Number(monthlyRate)) /
            (1 - Math.pow(1 + Number(monthlyRate), -count)),
        ).toDecimalPlaces(2)
      : null;
  let balance = principal;
  for (let index = 0; index < count; index += 1) {
    const final = index === count - 1;
    let installmentPrincipal: Prisma.Decimal;
    let interest: Prisma.Decimal;
    if (method === 'REDUCING_BALANCE' && reducingPayment) {
      interest = final
        ? Prisma.Decimal.max(
            new Prisma.Decimal(0),
            reducingPayment.minus(balance),
          )
        : balance.mul(monthlyRate).toDecimalPlaces(2);
      installmentPrincipal = final
        ? balance
        : Prisma.Decimal.min(balance, reducingPayment.minus(interest));
    } else {
      installmentPrincipal = final
        ? principal.minus(principalAllocated)
        : principal.div(count).toDecimalPlaces(2);
      interest = final
        ? flatInterest.minus(interestAllocated)
        : flatInterest.div(count).toDecimalPlaces(2);
    }
    principalAllocated = principalAllocated.plus(installmentPrincipal);
    interestAllocated = interestAllocated.plus(interest);
    balance = Prisma.Decimal.max(
      new Prisma.Decimal(0),
      balance.minus(installmentPrincipal),
    );
    const fee = index === 0 ? fees : new Prisma.Decimal(0);
    installments.push({
      amount: installmentPrincipal.plus(interest).plus(fee).toDecimalPlaces(2),
      principal: installmentPrincipal.plus(fee).toDecimalPlaces(2),
      interest: interest.toDecimalPlaces(2),
      dueDate: loanDueDate(
        requestedStartDate,
        index,
        policy?.repaymentFrequency ?? 'MONTHLY',
        policy?.gracePeriodDays ?? 0,
      ),
    });
  }
  return installments;
}

function loanDueDate(
  start: Date,
  index: number,
  frequency: string,
  gracePeriodDays: number,
) {
  const date = new Date(start);
  date.setUTCDate(date.getUTCDate() + gracePeriodDays);
  if (frequency === 'WEEKLY') date.setUTCDate(date.getUTCDate() + index * 7);
  else if (frequency === 'BI_WEEKLY')
    date.setUTCDate(date.getUTCDate() + index * 14);
  else date.setUTCMonth(date.getUTCMonth() + index);
  return date;
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

function bankAccountUpdateData(dto: UpdateEmployeeBankAccountDto) {
  return {
    ...(dto.bankId !== undefined ? { bankId: dto.bankId ?? null } : {}),
    ...(dto.accountTitle !== undefined
      ? { accountTitle: dto.accountTitle.trim() }
      : {}),
    ...(dto.accountNumber !== undefined
      ? { accountNumber: dto.accountNumber?.replace(/\s/g, '') || null }
      : {}),
    ...(dto.iban !== undefined
      ? { iban: dto.iban?.replace(/\s/g, '').toUpperCase() || null }
      : {}),
    ...(dto.swiftOrRoutingCode !== undefined
      ? { swiftOrRoutingCode: clean(dto.swiftOrRoutingCode) }
      : {}),
    ...(dto.branchName !== undefined
      ? { branchName: clean(dto.branchName) }
      : {}),
    ...(dto.branchCode !== undefined
      ? { branchCode: clean(dto.branchCode) }
      : {}),
    ...(dto.countryCode !== undefined
      ? { countryCode: dto.countryCode.trim().toUpperCase() }
      : {}),
    ...(dto.currencyCode !== undefined
      ? { currencyCode: dto.currencyCode.trim().toUpperCase() }
      : {}),
    ...(dto.supportingDocumentId !== undefined
      ? { supportingDocumentId: dto.supportingDocumentId ?? null }
      : {}),
    ...(dto.employeeNotes !== undefined
      ? { employeeNotes: clean(dto.employeeNotes) }
      : {}),
    ...(dto.effectiveFrom !== undefined
      ? { effectiveFrom: new Date(dto.effectiveFrom) }
      : {}),
    ...(dto.effectiveTo !== undefined
      ? { effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null }
      : {}),
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
