import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayrollExceptionSeverity,
  PayrollJournalEntryStatus,
  PayrollJournalEntryType,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePayrollGlAccountDto,
  CreatePayrollPostingRuleDto,
  PreviewPayrollPostingRuleDto,
  UpdatePayrollGlAccountDto,
  UpdatePayrollPostingRuleDto,
} from './dto/payroll-gl.dto';
import {
  PayrollPostingRulePayload,
  PayrollPostingRuleResolverService,
  payrollPostingRuleInclude,
} from './payroll-posting-rule-resolver.service';
import { PayrollNotificationService } from './payroll-notification.service';

const journalInclude = {
  lines: {
    include: {
      account: true,
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          businessUnitId: true,
          departmentId: true,
          employmentTypeId: true,
          locationId: true,
        },
      },
      payComponent: { select: { id: true, code: true, name: true } },
      taxRule: { select: { id: true, code: true, name: true } },
      payrollRunLineItem: true,
    },
    orderBy: [{ createdAt: 'asc' }],
  },
  payrollRun: { include: { payrollPeriod: true } },
} satisfies Prisma.PayrollJournalEntryInclude;

const runForJournalInclude = {
  payrollPeriod: {
    include: {
      payrollCycle: { select: { payrollRegionId: true } },
    },
  },
  employees: {
    include: {
      employee: {
        select: {
          id: true,
          employeeCode: true,
          firstName: true,
          lastName: true,
          businessUnitId: true,
          departmentId: true,
          employmentTypeId: true,
          locationId: true,
        },
      },
      lineItems: {
        include: { payComponent: true },
        orderBy: [{ displayOrder: 'asc' }, { createdAt: 'asc' }],
      },
    },
  },
} satisfies Prisma.PayrollRunInclude;

@Injectable()
export class PayrollJournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly postingRuleResolver: PayrollPostingRuleResolverService,
    private readonly payrollNotifications: PayrollNotificationService,
  ) {}

  listGlAccounts(user: AuthenticatedUser) {
    return this.prisma.payrollGlAccount.findMany({
      where: { tenantId: user.tenantId },
      orderBy: [{ isActive: 'desc' }, { code: 'asc' }],
    });
  }

  async getGlAccount(user: AuthenticatedUser, id: string) {
    return this.findAccount(user.tenantId, id);
  }

  async createGlAccount(
    user: AuthenticatedUser,
    dto: CreatePayrollGlAccountDto,
  ) {
    await this.assertGlAccountReferences(user.tenantId, dto);
    assertEffectiveDates(
      parseOptionalDate(dto.effectiveFrom),
      parseOptionalDate(dto.effectiveTo),
    );
    try {
      const created = await this.prisma.payrollGlAccount.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code, dto.name),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          organizationId: dto.organizationId ?? null,
          legalEntityId: dto.legalEntityId ?? null,
          accountType: dto.accountType,
          accountSubtype: emptyToNull(dto.accountSubtype),
          currencyCode: emptyToNull(dto.currencyCode),
          parentAccountId: dto.parentAccountId ?? null,
          postingAllowed: dto.postingAllowed ?? true,
          isControlAccount: dto.isControlAccount ?? false,
          reconciliationRequired: dto.reconciliationRequired ?? false,
          requireBusinessUnitDimension:
            dto.requireBusinessUnitDimension ?? false,
          requireDepartmentDimension: dto.requireDepartmentDimension ?? false,
          requireCostCenterDimension: dto.requireCostCenterDimension ?? false,
          requireProjectDimension: dto.requireProjectDimension ?? false,
          requireEmployeeDimension: dto.requireEmployeeDimension ?? false,
          requireLocationDimension: dto.requireLocationDimension ?? false,
          requireLegalEntityDimension: dto.requireLegalEntityDimension ?? false,
          externalSystem: emptyToNull(dto.externalSystem),
          externalAccountCode: emptyToNull(dto.externalAccountCode),
          erpCompanyCode: emptyToNull(dto.erpCompanyCode),
          erpLedgerCode: emptyToNull(dto.erpLedgerCode),
          erpAccountId: emptyToNull(dto.erpAccountId),
          effectiveFrom: parseOptionalDate(dto.effectiveFrom),
          effectiveTo: parseOptionalDate(dto.effectiveTo),
          status: dto.status ?? 'ACTIVE',
          ownerUserId: dto.ownerUserId ?? user.userId,
          configuration: jsonOrNull(dto.configuration),
          isActive:
            dto.isActive ??
            (dto.status === undefined || dto.status === 'ACTIVE'),
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      await this.audit(
        user,
        'PAYROLL_GL_ACCOUNT_CREATED',
        'PayrollGlAccount',
        created.id,
        null,
        created,
      );
      return created;
    } catch (error) {
      handleUnique(error, 'GL account code already exists.');
    }
  }

  async updateGlAccount(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePayrollGlAccountDto,
  ) {
    const existing = await this.findAccount(user.tenantId, id);
    await this.assertGlAccountReferences(user.tenantId, dto, id);
    const accountEffectiveFrom =
      dto.effectiveFrom !== undefined
        ? parseOptionalDate(dto.effectiveFrom)
        : existing.effectiveFrom;
    const accountEffectiveTo =
      dto.effectiveTo !== undefined
        ? parseOptionalDate(dto.effectiveTo)
        : existing.effectiveTo;
    assertEffectiveDates(accountEffectiveFrom, accountEffectiveTo);
    try {
      const updated = await this.prisma.payrollGlAccount.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined
            ? { description: emptyToNull(dto.description) }
            : {}),
          ...(dto.organizationId !== undefined
            ? { organizationId: dto.organizationId }
            : {}),
          ...(dto.legalEntityId !== undefined
            ? { legalEntityId: dto.legalEntityId }
            : {}),
          ...(dto.accountType !== undefined
            ? { accountType: dto.accountType }
            : {}),
          ...(dto.accountSubtype !== undefined
            ? { accountSubtype: emptyToNull(dto.accountSubtype) }
            : {}),
          ...(dto.currencyCode !== undefined
            ? { currencyCode: emptyToNull(dto.currencyCode) }
            : {}),
          ...(dto.parentAccountId !== undefined
            ? { parentAccountId: dto.parentAccountId }
            : {}),
          ...(dto.postingAllowed !== undefined
            ? { postingAllowed: dto.postingAllowed }
            : {}),
          ...(dto.isControlAccount !== undefined
            ? { isControlAccount: dto.isControlAccount }
            : {}),
          ...(dto.reconciliationRequired !== undefined
            ? { reconciliationRequired: dto.reconciliationRequired }
            : {}),
          ...(dto.requireBusinessUnitDimension !== undefined
            ? { requireBusinessUnitDimension: dto.requireBusinessUnitDimension }
            : {}),
          ...(dto.requireDepartmentDimension !== undefined
            ? { requireDepartmentDimension: dto.requireDepartmentDimension }
            : {}),
          ...(dto.requireCostCenterDimension !== undefined
            ? { requireCostCenterDimension: dto.requireCostCenterDimension }
            : {}),
          ...(dto.requireProjectDimension !== undefined
            ? { requireProjectDimension: dto.requireProjectDimension }
            : {}),
          ...(dto.requireEmployeeDimension !== undefined
            ? { requireEmployeeDimension: dto.requireEmployeeDimension }
            : {}),
          ...(dto.requireLocationDimension !== undefined
            ? { requireLocationDimension: dto.requireLocationDimension }
            : {}),
          ...(dto.requireLegalEntityDimension !== undefined
            ? { requireLegalEntityDimension: dto.requireLegalEntityDimension }
            : {}),
          ...(dto.externalSystem !== undefined
            ? { externalSystem: emptyToNull(dto.externalSystem) }
            : {}),
          ...(dto.externalAccountCode !== undefined
            ? { externalAccountCode: emptyToNull(dto.externalAccountCode) }
            : {}),
          ...(dto.erpCompanyCode !== undefined
            ? { erpCompanyCode: emptyToNull(dto.erpCompanyCode) }
            : {}),
          ...(dto.erpLedgerCode !== undefined
            ? { erpLedgerCode: emptyToNull(dto.erpLedgerCode) }
            : {}),
          ...(dto.erpAccountId !== undefined
            ? { erpAccountId: emptyToNull(dto.erpAccountId) }
            : {}),
          ...(dto.effectiveFrom !== undefined
            ? { effectiveFrom: accountEffectiveFrom }
            : {}),
          ...(dto.effectiveTo !== undefined
            ? { effectiveTo: accountEffectiveTo }
            : {}),
          ...(dto.status !== undefined
            ? { status: dto.status, isActive: dto.status === 'ACTIVE' }
            : {}),
          ...(dto.ownerUserId !== undefined
            ? { ownerUserId: dto.ownerUserId }
            : {}),
          ...(dto.configuration !== undefined
            ? { configuration: jsonOrNull(dto.configuration) }
            : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          updatedById: user.userId,
          version: { increment: 1 },
        },
      });
      await this.audit(
        user,
        'PAYROLL_GL_ACCOUNT_UPDATED',
        'PayrollGlAccount',
        id,
        existing,
        updated,
      );
      return updated;
    } catch (error) {
      handleUnique(error, 'GL account code already exists.');
    }
  }

  async deactivateGlAccount(user: AuthenticatedUser, id: string) {
    const existing = await this.findAccount(user.tenantId, id);
    const activeRule = await this.prisma.payrollPostingRule.findFirst({
      where: {
        tenantId: user.tenantId,
        isActive: true,
        OR: [{ debitAccountId: id }, { creditAccountId: id }],
      },
      select: { id: true },
    });
    if (activeRule)
      throw new ConflictException(
        'Cannot deactivate an account used by an active posting rule.',
      );
    const updated = await this.prisma.payrollGlAccount.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit(
      user,
      'PAYROLL_GL_ACCOUNT_DEACTIVATED',
      'PayrollGlAccount',
      id,
      existing,
      updated,
    );
    return updated;
  }

  listPostingRules(user: AuthenticatedUser) {
    return this.prisma.payrollPostingRule.findMany({
      where: { tenantId: user.tenantId },
      include: payrollPostingRuleInclude,
      orderBy: [
        { isActive: 'desc' },
        { priority: 'asc' },
        { sourceCategory: 'asc' },
        { name: 'asc' },
      ],
    });
  }

  async previewPostingRuleResolution(
    user: AuthenticatedUser,
    dto: PreviewPayrollPostingRuleDto,
  ) {
    const effectiveDate = parseDate(dto.effectiveDate);
    const resolution = await this.postingRuleResolver.previewResolution({
      tenantId: user.tenantId,
      sourceCategory: dto.sourceCategory,
      lineCategory: dto.lineCategory,
      payComponentId: dto.payComponentId,
      taxRuleId: dto.taxRuleId,
      businessUnitId: dto.businessUnitId,
      departmentId: dto.departmentId,
      projectId: dto.projectId,
      payrollRegionId: dto.payrollRegionId,
      costCenterId: dto.costCenterId,
      employmentTypeId: dto.employmentTypeId,
      effectiveStart: effectiveDate,
      effectiveEnd: effectiveDate,
    });
    return {
      selectedRule: resolution.selectedRule,
      selectedScore: resolution.selectedScore,
      conflictDetected: resolution.conflicts.length > 0,
      conflicts: resolution.conflicts.map(({ rule, score }) => ({
        rule,
        score,
      })),
      candidates: resolution.candidates.map(({ rule, score }) => ({
        rule,
        score,
      })),
    };
  }

  async getPostingRule(user: AuthenticatedUser, id: string) {
    return this.findPostingRule(user.tenantId, id);
  }

  async createPostingRule(
    user: AuthenticatedUser,
    dto: CreatePayrollPostingRuleDto,
  ) {
    await this.assertPostingRuleReferences(user.tenantId, dto);
    await this.assertPostingRuleScope(user.tenantId, dto);
    await this.assertDefaultPostingRule(user.tenantId, dto);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertEffectiveDates(effectiveFrom, effectiveTo);
    assertDistinctAccounts(
      dto.debitAccountId,
      dto.creditAccountId,
      dto.allowSameAccount,
    );
    const created = await this.prisma.payrollPostingRule.create({
      data: {
        tenantId: user.tenantId,
        code: normalizeCode(dto.code, dto.name),
        name: dto.name.trim(),
        description: emptyToNull(dto.description),
        organizationId: dto.organizationId ?? null,
        legalEntityId: dto.legalEntityId ?? null,
        ownerUserId: dto.ownerUserId ?? user.userId,
        status: dto.status ?? 'ACTIVE',
        priority: dto.priority ?? 100,
        isDefault: dto.isDefault ?? false,
        postingEvent: normalizeChoice(dto.postingEvent, 'PAYROLL_ACCRUAL'),
        lineCategory: normalizeChoice(dto.lineCategory, 'PAY_COMPONENT'),
        sourceCategory: dto.sourceCategory,
        payComponentId: dto.payComponentId ?? null,
        taxRuleId: dto.taxRuleId ?? null,
        debitAccountId: dto.debitAccountId ?? null,
        creditAccountId: dto.creditAccountId ?? null,
        businessUnitId: dto.businessUnitId ?? null,
        departmentId: dto.departmentId ?? null,
        projectId: dto.projectId ?? null,
        payrollRegionId: dto.payrollRegionId ?? null,
        costCenterId: dto.costCenterId ?? null,
        employmentTypeId: dto.employmentTypeId ?? null,
        debitBusinessUnitSource: emptyToNull(dto.debitBusinessUnitSource),
        creditBusinessUnitSource: emptyToNull(dto.creditBusinessUnitSource),
        debitDepartmentSource: emptyToNull(dto.debitDepartmentSource),
        creditDepartmentSource: emptyToNull(dto.creditDepartmentSource),
        debitCostCenterSource: emptyToNull(dto.debitCostCenterSource),
        creditCostCenterSource: emptyToNull(dto.creditCostCenterSource),
        debitProjectSource: emptyToNull(dto.debitProjectSource),
        creditProjectSource: emptyToNull(dto.creditProjectSource),
        debitEmployeeSource: emptyToNull(dto.debitEmployeeSource),
        creditEmployeeSource: emptyToNull(dto.creditEmployeeSource),
        consolidationMode: normalizeChoice(
          dto.consolidationMode,
          'BY_ACCOUNT_AND_DIMENSIONS',
        ),
        descriptionTemplate: emptyToNull(dto.descriptionTemplate),
        journalReferenceTemplate: emptyToNull(dto.journalReferenceTemplate),
        allowZeroPosting: dto.allowZeroPosting ?? false,
        reversalRule: normalizeChoice(dto.reversalRule, 'REVERSE_ORIGINAL'),
        employeeLevelEntry: dto.employeeLevelEntry ?? false,
        componentLevelEntry: dto.componentLevelEntry ?? true,
        departmentLevelEntry: dto.departmentLevelEntry ?? false,
        allowSameAccount: dto.allowSameAccount ?? false,
        effectiveFrom,
        effectiveTo,
        configuration: jsonOrNull(dto.configuration),
        isActive:
          dto.isActive ?? (dto.status === undefined || dto.status === 'ACTIVE'),
        createdById: user.userId,
        updatedById: user.userId,
      },
      include: payrollPostingRuleInclude,
    });
    await this.audit(
      user,
      'PAYROLL_POSTING_RULE_CREATED',
      'PayrollPostingRule',
      created.id,
      null,
      created,
    );
    return created;
  }

  async updatePostingRule(
    user: AuthenticatedUser,
    id: string,
    dto: UpdatePayrollPostingRuleDto,
  ) {
    const existing = await this.findPostingRule(user.tenantId, id);
    await this.assertPostingRuleScope(user.tenantId, dto);
    await this.assertDefaultPostingRule(user.tenantId, dto, id);
    const nextDebit =
      dto.debitAccountId !== undefined
        ? dto.debitAccountId
        : existing.debitAccountId;
    const nextCredit =
      dto.creditAccountId !== undefined
        ? dto.creditAccountId
        : existing.creditAccountId;
    assertDistinctAccounts(
      nextDebit,
      nextCredit,
      dto.allowSameAccount ?? existing.allowSameAccount,
    );
    const effectiveFrom = dto.effectiveFrom
      ? parseDate(dto.effectiveFrom)
      : existing.effectiveFrom;
    const effectiveTo =
      dto.effectiveTo !== undefined
        ? parseOptionalDate(dto.effectiveTo)
        : existing.effectiveTo;
    assertEffectiveDates(effectiveFrom, effectiveTo);
    await this.assertPostingRuleReferences(user.tenantId, {
      payComponentId:
        dto.payComponentId !== undefined
          ? dto.payComponentId
          : existing.payComponentId,
      taxRuleId:
        dto.taxRuleId !== undefined ? dto.taxRuleId : existing.taxRuleId,
      debitAccountId: nextDebit,
      creditAccountId: nextCredit,
    });
    const updated = await this.prisma.payrollPostingRule.update({
      where: { id },
      data: {
        ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: emptyToNull(dto.description) }
          : {}),
        ...(dto.organizationId !== undefined
          ? { organizationId: dto.organizationId }
          : {}),
        ...(dto.legalEntityId !== undefined
          ? { legalEntityId: dto.legalEntityId }
          : {}),
        ...(dto.ownerUserId !== undefined
          ? { ownerUserId: dto.ownerUserId }
          : {}),
        ...(dto.status !== undefined
          ? { status: dto.status, isActive: dto.status === 'ACTIVE' }
          : {}),
        ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
        ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        ...(dto.postingEvent !== undefined
          ? { postingEvent: normalizeChoice(dto.postingEvent) }
          : {}),
        ...(dto.sourceCategory !== undefined
          ? { sourceCategory: dto.sourceCategory }
          : {}),
        ...(dto.lineCategory !== undefined
          ? { lineCategory: normalizeChoice(dto.lineCategory, 'PAY_COMPONENT') }
          : {}),
        ...(dto.payComponentId !== undefined
          ? { payComponentId: dto.payComponentId }
          : {}),
        ...(dto.taxRuleId !== undefined ? { taxRuleId: dto.taxRuleId } : {}),
        ...(dto.debitAccountId !== undefined
          ? { debitAccountId: dto.debitAccountId }
          : {}),
        ...(dto.creditAccountId !== undefined
          ? { creditAccountId: dto.creditAccountId }
          : {}),
        ...(dto.businessUnitId !== undefined
          ? { businessUnitId: dto.businessUnitId }
          : {}),
        ...(dto.departmentId !== undefined
          ? { departmentId: dto.departmentId }
          : {}),
        ...(dto.projectId !== undefined ? { projectId: dto.projectId } : {}),
        ...(dto.payrollRegionId !== undefined
          ? { payrollRegionId: dto.payrollRegionId }
          : {}),
        ...(dto.costCenterId !== undefined
          ? { costCenterId: dto.costCenterId }
          : {}),
        ...(dto.employmentTypeId !== undefined
          ? { employmentTypeId: dto.employmentTypeId }
          : {}),
        ...postingBehaviorUpdateData(dto),
        ...(dto.allowSameAccount !== undefined
          ? { allowSameAccount: dto.allowSameAccount }
          : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.configuration !== undefined
          ? { configuration: jsonOrNull(dto.configuration) }
          : {}),
        updatedById: user.userId,
        version: { increment: 1 },
      },
      include: payrollPostingRuleInclude,
    });
    await this.audit(
      user,
      'PAYROLL_POSTING_RULE_UPDATED',
      'PayrollPostingRule',
      id,
      existing,
      updated,
    );
    return updated;
  }

  async deactivatePostingRule(user: AuthenticatedUser, id: string) {
    const existing = await this.findPostingRule(user.tenantId, id);
    const updated = await this.prisma.payrollPostingRule.update({
      where: { id },
      data: { isActive: false },
      include: payrollPostingRuleInclude,
    });
    await this.audit(
      user,
      'PAYROLL_POSTING_RULE_DEACTIVATED',
      'PayrollPostingRule',
      id,
      existing,
      updated,
    );
    return updated;
  }

  async generateJournalForPayrollRun(input: {
    tenantId: string;
    payrollRunId: string;
    userId?: string | null;
  }) {
    const run = await this.findRun(input.tenantId, input.payrollRunId);
    if (
      run.status !== PayrollRunStatus.CALCULATED &&
      run.status !== PayrollRunStatus.APPROVED &&
      run.status !== PayrollRunStatus.PAID
    ) {
      throw new BadRequestException(
        'Journal can only be generated for calculated, approved, or paid payroll runs.',
      );
    }

    const existing = await this.prisma.payrollJournalEntry.findFirst({
      where: {
        tenantId: input.tenantId,
        payrollRunId: input.payrollRunId,
        journalType: PayrollJournalEntryType.ORIGINAL,
        originalJournalId: null,
      },
      include: { lines: true },
      orderBy: { createdAt: 'desc' },
    });
    if (
      existing?.status === PayrollJournalEntryStatus.EXPORTED ||
      existing?.status === PayrollJournalEntryStatus.POSTED
    ) {
      throw new ConflictException(
        'Exported or posted payroll journals cannot be regenerated.',
      );
    }

    const journal =
      existing ??
      (await this.prisma.payrollJournalEntry.create({
        data: {
          tenantId: input.tenantId,
          payrollRunId: input.payrollRunId,
          journalType: PayrollJournalEntryType.ORIGINAL,
          status: PayrollJournalEntryStatus.DRAFT,
        },
      }));

    await this.prisma.payrollJournalEntryLine.deleteMany({
      where: { tenantId: input.tenantId, journalEntryId: journal.id },
    });

    const validationErrors: string[] = [];
    const lines: Prisma.PayrollJournalEntryLineCreateManyInput[] = [];
    for (const runEmployee of run.employees) {
      for (const lineItem of runEmployee.lineItems) {
        if (lineItem.amount.equals(0)) continue;
        const taxRuleId =
          lineItem.sourceType === 'TAX' ? lineItem.sourceId : null;
        const rule = await this.postingRuleResolver.resolveRule({
          tenantId: input.tenantId,
          sourceCategory: lineItem.category,
          lineCategory: postingLineCategory(lineItem.sourceType),
          payComponentId: lineItem.payComponentId,
          taxRuleId,
          businessUnitId: runEmployee.employee.businessUnitId,
          departmentId: runEmployee.employee.departmentId,
          employmentTypeId: runEmployee.employee.employmentTypeId,
          payrollRegionId:
            run.payrollPeriod.payrollCycle?.payrollRegionId ?? null,
          effectiveStart: run.payrollPeriod.periodStart,
          effectiveEnd: run.payrollPeriod.periodEnd,
        });

        if (!rule || !rule.debitAccountId || !rule.creditAccountId) {
          validationErrors.push(
            `No complete posting rule found for ${lineItem.category} / ${lineItem.label}.`,
          );
          await this.prisma.payrollException.create({
            data: {
              tenantId: input.tenantId,
              payrollRunId: run.id,
              employeeId: runEmployee.employeeId,
              severity: PayrollExceptionSeverity.ERROR,
              errorType: 'MISSING_PAYROLL_POSTING_RULE',
              message: `No complete posting rule found for ${lineItem.category} / ${lineItem.label}.`,
              details: {
                payrollRunLineItemId: lineItem.id,
                category: lineItem.category,
                payComponentId: lineItem.payComponentId,
                taxRuleId,
              },
            },
          });
          continue;
        }

        lines.push(
          ...buildJournalLines({
            journalEntryId: journal.id,
            tenantId: input.tenantId,
            lineItem,
            runEmployee,
            rule,
            taxRuleId,
          }),
        );
      }
    }

    if (validationErrors.length) {
      throw new BadRequestException(validationErrors[0]);
    }
    if (!lines.length)
      throw new BadRequestException(
        'No non-zero payroll line items were available for journal generation.',
      );

    assertBalanced(
      lines.map((line) => ({
        debitAmount: new Prisma.Decimal(String(line.debitAmount ?? 0)),
        creditAmount: new Prisma.Decimal(String(line.creditAmount ?? 0)),
      })),
    );
    await this.prisma.payrollJournalEntryLine.createMany({ data: lines });
    const updated = await this.prisma.payrollJournalEntry.update({
      where: { id: journal.id },
      data: {
        status: PayrollJournalEntryStatus.GENERATED,
        generatedAt: new Date(),
        journalNumber: journal.journalNumber ?? buildJournalNumber(run),
      },
      include: journalInclude,
    });
    await this.auditService.log({
      tenantId: input.tenantId,
      actorUserId: input.userId ?? null,
      action: existing
        ? 'PAYROLL_JOURNAL_REGENERATED'
        : 'PAYROLL_JOURNAL_GENERATED',
      entityType: 'PayrollJournalEntry',
      entityId: updated.id,
      beforeSnapshot: existing,
      afterSnapshot: {
        lineCount: lines.length,
        journalNumber: updated.journalNumber,
      },
    });
    return mapJournal(updated);
  }

  async getJournal(user: AuthenticatedUser, runId: string) {
    await this.findRun(user.tenantId, runId);
    const journal = await this.prisma.payrollJournalEntry.findFirst({
      where: {
        tenantId: user.tenantId,
        payrollRunId: runId,
        journalType: PayrollJournalEntryType.ORIGINAL,
        originalJournalId: null,
      },
      include: journalInclude,
      orderBy: { createdAt: 'desc' },
    });
    if (!journal) throw new NotFoundException('Payroll journal was not found.');
    return mapJournal(journal);
  }

  async listJournals(user: AuthenticatedUser, runId: string) {
    await this.findRun(user.tenantId, runId);
    const journals = await this.prisma.payrollJournalEntry.findMany({
      where: { tenantId: user.tenantId, payrollRunId: runId },
      include: journalInclude,
      orderBy: [{ journalType: 'asc' }, { createdAt: 'desc' }],
    });
    return journals.map(mapJournal);
  }

  async exportJournalCsv(user: AuthenticatedUser, runId: string) {
    const journal = await this.getJournalPayload(user.tenantId, runId);
    if (
      journal.status === PayrollJournalEntryStatus.DRAFT ||
      journal.status === PayrollJournalEntryStatus.VOIDED
    ) {
      throw new BadRequestException(
        'Only generated or exported journals can be exported.',
      );
    }
    await this.audit(
      user,
      'PAYROLL_JOURNAL_EXPORTED',
      'PayrollJournalEntry',
      journal.id,
      null,
      { runId },
    );
    return toCsv(journal);
  }

  async markJournalExported(user: AuthenticatedUser, runId: string) {
    const journal = await this.getJournalPayload(user.tenantId, runId);
    if (
      journal.status !== PayrollJournalEntryStatus.GENERATED &&
      journal.status !== PayrollJournalEntryStatus.EXPORTED
    ) {
      throw new BadRequestException(
        'Only generated journals can be marked exported.',
      );
    }
    assertBalanced(
      journal.lines.map((line) => ({
        debitAmount: line.debitAmount,
        creditAmount: line.creditAmount,
      })),
    );
    const updated = await this.prisma.payrollJournalEntry.update({
      where: { id: journal.id },
      data: {
        status: PayrollJournalEntryStatus.EXPORTED,
        exportedAt: new Date(),
      },
      include: journalInclude,
    });
    await this.audit(
      user,
      'PAYROLL_JOURNAL_MARKED_EXPORTED',
      'PayrollJournalEntry',
      journal.id,
      journal,
      updated,
    );
    return mapJournal(updated);
  }

  async validateJournal(user: AuthenticatedUser, runId: string) {
    const journal = await this.getJournalPayload(user.tenantId, runId);
    const totals = journal.lines.reduce(
      (sum, line) => ({
        debit: sum.debit.plus(line.debitAmount),
        credit: sum.credit.plus(line.creditAmount),
      }),
      { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
    );
    assertBalanced(journal.lines);
    return {
      balanced: true,
      lineCount: journal.lines.length,
      debitTotal: totals.debit.toString(),
      creditTotal: totals.credit.toString(),
      status: journal.status,
    };
  }

  async markJournalPosted(user: AuthenticatedUser, runId: string) {
    const journal = await this.getJournalPayload(user.tenantId, runId);
    if (
      journal.status !== PayrollJournalEntryStatus.EXPORTED &&
      journal.status !== PayrollJournalEntryStatus.POSTED
    ) {
      throw new BadRequestException(
        'Only exported journals can be marked posted.',
      );
    }
    assertBalanced(journal.lines);
    const updated = await this.prisma.payrollJournalEntry.update({
      where: { id: journal.id },
      data: {
        status: PayrollJournalEntryStatus.POSTED,
        postedAt: new Date(),
        postedBy: user.userId,
      },
      include: journalInclude,
    });
    await this.audit(
      user,
      'PAYROLL_JOURNAL_MARKED_POSTED',
      'PayrollJournalEntry',
      journal.id,
      journal,
      updated,
    );
    await this.payrollNotifications.dispatch({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      eventCode: 'JOURNAL_POSTED',
      entityType: 'PayrollJournalEntry',
      entityId: journal.id,
      title: 'Payroll journal posted',
      body: `Journal ${updated.journalNumber ?? updated.id} was marked posted.`,
      targetUrl: `/payroll/runs/${runId}?tab=journal`,
      permissionKeys: ['payroll-journal.read'],
    });
    return mapJournal(updated);
  }

  async reverseJournal(
    user: AuthenticatedUser,
    runId: string,
    input: { reason?: string; reversalDate?: string },
  ) {
    const journal = await this.getJournalPayload(user.tenantId, runId);
    if (journal.status !== PayrollJournalEntryStatus.POSTED) {
      throw new BadRequestException('Only posted journals can be reversed.');
    }
    const reason = input.reason?.trim();
    if (!reason) {
      throw new BadRequestException('Reversal reason is required.');
    }
    if (journal.reversalJournalId) {
      throw new ConflictException('This journal already has a reversal.');
    }
    const existingReversal = await this.prisma.payrollJournalEntry.findFirst({
      where: {
        tenantId: user.tenantId,
        originalJournalId: journal.id,
        journalType: PayrollJournalEntryType.REVERSAL,
      },
    });
    if (existingReversal) {
      throw new ConflictException('This journal already has a reversal.');
    }
    const reversalDate = parseOptionalDate(input.reversalDate) ?? new Date();
    const reversal = await this.prisma.$transaction(async (tx) => {
      const created = await tx.payrollJournalEntry.create({
        data: {
          tenantId: user.tenantId,
          payrollRunId: runId,
          journalType: PayrollJournalEntryType.REVERSAL,
          status: PayrollJournalEntryStatus.GENERATED,
          journalNumber: `${journal.journalNumber ?? journal.id}-REV`,
          originalJournalId: journal.id,
          generatedAt: reversalDate,
          reversalReason: reason,
        },
      });
      const reversalLines = journal.lines.map((line) => ({
        tenantId: user.tenantId,
        journalEntryId: created.id,
        payrollRunLineItemId: line.payrollRunLineItemId,
        accountId: line.accountId,
        debitAmount: line.creditAmount,
        creditAmount: line.debitAmount,
        description: `Reversal: ${line.description ?? journal.journalNumber ?? journal.id}`,
        employeeId: line.employeeId,
        payComponentId: line.payComponentId,
        taxRuleId: line.taxRuleId,
      }));
      assertBalanced(reversalLines);
      await tx.payrollJournalEntryLine.createMany({ data: reversalLines });
      await tx.payrollJournalEntry.update({
        where: { id: journal.id },
        data: {
          reversalJournalId: created.id,
          reversedAt: reversalDate,
          reversedBy: user.userId,
          reversalReason: reason,
        },
      });
      return tx.payrollJournalEntry.findUniqueOrThrow({
        where: { id: created.id },
        include: journalInclude,
      });
    });
    await this.audit(
      user,
      'PAYROLL_JOURNAL_REVERSED',
      'PayrollJournalEntry',
      journal.id,
      journal,
      reversal,
    );
    await this.payrollNotifications.dispatch({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      eventCode: 'JOURNAL_REVERSED',
      entityType: 'PayrollJournalEntry',
      entityId: reversal.id,
      title: 'Payroll journal reversed',
      body: `Journal ${journal.journalNumber ?? journal.id} was reversed.`,
      targetUrl: `/payroll/runs/${runId}?tab=journal`,
      permissionKeys: ['payroll-journal.read'],
      payload: {
        originalJournalId: journal.id,
        reversalJournalId: reversal.id,
      },
    });
    return mapJournal(reversal);
  }

  private async findAccount(tenantId: string, id: string) {
    const account = await this.prisma.payrollGlAccount.findFirst({
      where: { tenantId, id },
    });
    if (!account) throw new NotFoundException('GL account was not found.');
    return account;
  }

  private async findPostingRule(tenantId: string, id: string) {
    const rule = await this.prisma.payrollPostingRule.findFirst({
      where: { tenantId, id },
      include: payrollPostingRuleInclude,
    });
    if (!rule) throw new NotFoundException('Posting rule was not found.');
    return rule;
  }

  private async findRun(tenantId: string, id: string) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { tenantId, id },
      include: runForJournalInclude,
    });
    if (!run) throw new NotFoundException('Payroll run was not found.');
    return run;
  }

  private async getJournalPayload(tenantId: string, runId: string) {
    const journal = await this.prisma.payrollJournalEntry.findFirst({
      where: {
        tenantId,
        payrollRunId: runId,
        journalType: PayrollJournalEntryType.ORIGINAL,
        originalJournalId: null,
      },
      include: journalInclude,
      orderBy: { createdAt: 'desc' },
    });
    if (!journal) throw new NotFoundException('Payroll journal was not found.');
    return journal;
  }

  private async assertPostingRuleReferences(
    tenantId: string,
    dto: {
      payComponentId?: string | null;
      taxRuleId?: string | null;
      debitAccountId?: string | null;
      creditAccountId?: string | null;
    },
  ) {
    if (dto.payComponentId) {
      const item = await this.prisma.payComponent.findFirst({
        where: { tenantId, id: dto.payComponentId, isActive: true },
        select: { id: true },
      });
      if (!item)
        throw new BadRequestException(
          'Active pay component was not found for this tenant.',
        );
    }
    if (dto.taxRuleId) {
      const item = await this.prisma.taxRule.findFirst({
        where: { tenantId, id: dto.taxRuleId, isActive: true },
        select: { id: true },
      });
      if (!item)
        throw new BadRequestException(
          'Active tax rule was not found for this tenant.',
        );
    }
    for (const accountId of [dto.debitAccountId, dto.creditAccountId].filter(
      Boolean,
    ) as string[]) {
      const account = await this.prisma.payrollGlAccount.findFirst({
        where: { tenantId, id: accountId, isActive: true },
        select: { id: true },
      });
      if (!account)
        throw new BadRequestException(
          'Active GL account was not found for this tenant.',
        );
    }
  }

  async listPolicyRegister(
    user: AuthenticatedUser,
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
    const tenantId = user.tenantId;
    const [
      compensation,
      tax,
      time,
      overtime,
      travel,
      benefits,
      loans,
      claims,
      organizations,
      users,
    ] = await Promise.all([
      this.prisma.salaryPackageRule.findMany({ where: { tenantId } }),
      this.prisma.taxRule.findMany({ where: { tenantId } }),
      this.prisma.timePayrollPolicy.findMany({ where: { tenantId } }),
      this.prisma.overtimePolicy.findMany({ where: { tenantId } }),
      this.prisma.travelAllowancePolicy.findMany({ where: { tenantId } }),
      this.prisma.benefitPolicy.findMany({ where: { tenantId } }),
      this.prisma.loanPolicy.findMany({ where: { tenantId } }),
      this.prisma.claimType.findMany({ where: { tenantId } }),
      this.prisma.organization.findMany({
        where: { tenantId },
        select: { id: true, name: true },
      }),
      this.prisma.user.findMany({
        where: { tenantId },
        select: { id: true, firstName: true, lastName: true, email: true },
      }),
    ]);
    const organizationNames = new Map(
      organizations.map((item) => [item.id, item.name]),
    );
    const ownerNames = new Map(
      users.map((item) => [
        item.id,
        `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || item.email,
      ]),
    );
    const now = new Date();
    const legacyStatus = (active: boolean, effectiveTo?: Date | null) =>
      effectiveTo && effectiveTo < now
        ? 'EXPIRED'
        : active
          ? 'ACTIVE'
          : 'INACTIVE';
    const records: PayrollPolicyRegisterItem[] = [
      ...compensation.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        policyType: 'Compensation',
        organizationId: item.organizationId,
        organization: item.organizationId
          ? (organizationNames.get(item.organizationId) ?? null)
          : null,
        scope: compactScope(item.businessUnitId, item.departmentId),
        countryCode: null,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        status: item.status,
        isDefault: item.isDefault,
        ownerUserId: item.ownerUserId,
        owner: item.ownerUserId
          ? (ownerNames.get(item.ownerUserId) ?? null)
          : null,
        updatedAt: item.updatedAt,
        incomplete: !item.ownerUserId || !item.currencyCode,
        href: `/settings/payroll/configuration/salary-package-rules/${item.id}`,
      })),
      ...tax.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        policyType: item.taxType === 'INCOME_TAX' ? 'Tax' : 'Statutory',
        organizationId: item.organizationId,
        organization: item.organizationId
          ? (organizationNames.get(item.organizationId) ?? null)
          : null,
        scope: compactScope(item.businessUnitId, item.departmentId),
        countryCode: item.countryCode,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        status: item.status,
        isDefault: item.isDefault,
        ownerUserId: item.ownerUserId,
        owner: item.ownerUserId
          ? (ownerNames.get(item.ownerUserId) ?? null)
          : null,
        updatedAt: item.updatedAt,
        incomplete:
          !item.ownerUserId ||
          (item.calculationMethod === 'BRACKET' && !item.currencyCode),
        href: `/settings/payroll/configuration/tax-rules/${item.id}`,
      })),
      ...time.map((item) =>
        legacyPolicyItem(item, 'Time-Based Pay', organizationNames),
      ),
      ...overtime.map((item) =>
        legacyPolicyItem(item, 'Overtime', organizationNames),
      ),
      ...travel.map((item) => ({
        ...legacyPolicyItem(
          { ...item, organizationId: null },
          'Travel',
          organizationNames,
        ),
        countryCode: item.countryCode,
      })),
      ...benefits.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        policyType: 'Benefits',
        organizationId: item.organizationId,
        organization: item.organizationId
          ? (organizationNames.get(item.organizationId) ?? null)
          : null,
        scope: compactScope(item.businessUnitId, item.departmentId),
        countryCode: item.countryCode,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        status: item.status,
        isDefault: item.isDefault,
        ownerUserId: item.ownerUserId,
        owner: item.ownerUserId
          ? (ownerNames.get(item.ownerUserId) ?? null)
          : null,
        updatedAt: item.updatedAt,
        incomplete:
          !item.ownerUserId || (item.payrollVisible && !item.payrollCategory),
        href: `/settings/payroll/benefits/benefit-policies/${item.id}`,
      })),
      ...loans.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        policyType: 'Loans',
        organizationId: item.organizationId,
        organization: item.organizationId
          ? (organizationNames.get(item.organizationId) ?? null)
          : null,
        scope: 'Employee eligibility',
        countryCode: null,
        effectiveFrom: item.effectiveFrom,
        effectiveTo: item.effectiveTo,
        status: item.status,
        isDefault: item.isDefault,
        ownerUserId: item.ownerUserId,
        owner: item.ownerUserId
          ? (ownerNames.get(item.ownerUserId) ?? null)
          : null,
        updatedAt: item.updatedAt,
        incomplete: !item.ownerUserId || !item.deductionPayComponentId,
        href: `/settings/payroll/loans/loan-policies/${item.id}`,
      })),
      ...claims.map((item) => ({
        id: item.id,
        name: item.name,
        code: item.code,
        policyType: 'Claims',
        organizationId: null,
        organization: null,
        scope: 'Tenant',
        countryCode: null,
        effectiveFrom: null,
        effectiveTo: null,
        status: legacyStatus(item.isActive),
        isDefault: false,
        ownerUserId: null,
        owner: null,
        updatedAt: item.updatedAt,
        incomplete: item.payrollIncluded && !item.currencyCode,
        href: `/settings/payroll/configuration/claim-types/${item.id}`,
      })),
    ];
    const search = query.search?.trim().toLowerCase();
    const effectiveDate = query.effectiveDate
      ? new Date(query.effectiveDate)
      : null;
    const filtered = records.filter((item) => {
      if (
        search &&
        !`${item.name} ${item.code} ${item.policyType} ${item.organization ?? ''} ${item.owner ?? ''}`
          .toLowerCase()
          .includes(search)
      )
        return false;
      if (query.policyType && item.policyType !== query.policyType)
        return false;
      if (query.status && item.status !== query.status) return false;
      if (query.organizationId && item.organizationId !== query.organizationId)
        return false;
      if (query.countryCode && item.countryCode !== query.countryCode)
        return false;
      if (query.ownerUserId && item.ownerUserId !== query.ownerUserId)
        return false;
      if (
        query.isDefault !== undefined &&
        item.isDefault !== (query.isDefault === 'true')
      )
        return false;
      if (
        effectiveDate &&
        ((item.effectiveFrom && item.effectiveFrom > effectiveDate) ||
          (item.effectiveTo && item.effectiveTo < effectiveDate))
      )
        return false;
      return true;
    });
    const categoryNames = [
      'Compensation',
      'Tax',
      'Time-Based Pay',
      'Overtime',
      'Travel',
      'Benefits',
      'Loans',
      'Claims',
      'Statutory',
    ];
    return {
      categories: categoryNames.map((name) => {
        const items = records.filter((item) => item.policyType === name);
        const lastModified = items
          .map((item) => item.updatedAt)
          .sort((a, b) => b.getTime() - a.getTime())[0];
        const owners = [
          ...new Set(items.map((item) => item.owner).filter(Boolean)),
        ];
        return {
          name,
          activeCount: items.filter((item) => item.status === 'ACTIVE').length,
          draftCount: items.filter((item) => item.status === 'DRAFT').length,
          expiredCount: items.filter((item) => item.status === 'EXPIRED')
            .length,
          incompleteCount: items.filter((item) => item.incomplete).length,
          lastModified: lastModified ?? null,
          owner:
            owners.length === 1 ? owners[0] : owners.length ? 'Multiple' : null,
        };
      }),
      items: filtered.sort(
        (a, b) => b.updatedAt.getTime() - a.updatedAt.getTime(),
      ),
      meta: { total: filtered.length },
    };
  }

  private async assertGlAccountReferences(
    tenantId: string,
    dto: CreatePayrollGlAccountDto | UpdatePayrollGlAccountDto,
    accountId?: string,
  ) {
    if (dto.parentAccountId) {
      if (dto.parentAccountId === accountId)
        throw new BadRequestException('A GL account cannot be its own parent.');
      const parent = await this.prisma.payrollGlAccount.findFirst({
        where: { tenantId, id: dto.parentAccountId, isActive: true },
        select: { id: true, isControlAccount: true },
      });
      if (!parent)
        throw new BadRequestException(
          'Parent account must be an active GL account in the same tenant.',
        );
    }
    for (const id of [dto.organizationId, dto.legalEntityId].filter(
      Boolean,
    ) as string[]) {
      const organization = await this.prisma.organization.findFirst({
        where: { tenantId, id, isActive: true },
        select: { id: true },
      });
      if (!organization)
        throw new BadRequestException(
          'Organization or legal entity was not found for this tenant.',
        );
    }
    if (dto.isControlAccount && dto.postingAllowed) {
      throw new BadRequestException(
        'Control accounts cannot allow direct payroll posting.',
      );
    }
  }

  private async assertPostingRuleScope(
    tenantId: string,
    dto: CreatePayrollPostingRuleDto | UpdatePayrollPostingRuleDto,
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
    if (dto.payrollRegionId)
      checks.push(
        this.prisma.payrollRegion.findFirst({
          where: { tenantId, id: dto.payrollRegionId, status: 'ACTIVE' },
          select: { id: true },
        }),
      );
    if (dto.businessUnitId)
      checks.push(
        this.prisma.businessUnit.findFirst({
          where: { tenantId, id: dto.businessUnitId, isActive: true },
          select: { id: true },
        }),
      );
    if (dto.departmentId)
      checks.push(
        this.prisma.department.findFirst({
          where: { tenantId, id: dto.departmentId, isActive: true },
          select: { id: true },
        }),
      );
    if (dto.projectId)
      checks.push(
        this.prisma.project.findFirst({
          where: { tenantId, id: dto.projectId },
          select: { id: true },
        }),
      );
    if (dto.employmentTypeId)
      checks.push(
        this.prisma.employmentType.findFirst({
          where: { tenantId, id: dto.employmentTypeId, isActive: true },
          select: { id: true },
        }),
      );
    if (dto.costCenterId)
      checks.push(
        this.prisma.payrollGlAccount.findFirst({
          where: { tenantId, id: dto.costCenterId, isActive: true },
          select: { id: true },
        }),
      );
    const results = await Promise.all(checks);
    if (results.some((result) => !result))
      throw new BadRequestException(
        'Posting rule scope contains a missing or inactive tenant record.',
      );
  }

  private async assertDefaultPostingRule(
    tenantId: string,
    dto: CreatePayrollPostingRuleDto | UpdatePayrollPostingRuleDto,
    excludeId?: string,
  ) {
    if (!dto.isDefault) return;
    const existing = await this.prisma.payrollPostingRule.findFirst({
      where: {
        tenantId,
        isDefault: true,
        isActive: true,
        postingEvent: normalizeChoice(dto.postingEvent, 'PAYROLL_ACCRUAL'),
        sourceCategory: dto.sourceCategory,
        organizationId: dto.organizationId ?? null,
        legalEntityId: dto.legalEntityId ?? null,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: { id: true },
    });
    if (existing)
      throw new ConflictException(
        'Only one default posting rule is allowed for an event, line type, and organization scope.',
      );
  }

  private audit(
    user: AuthenticatedUser,
    action: string,
    entityType: string,
    entityId: string,
    beforeSnapshot: unknown,
    afterSnapshot: unknown,
  ) {
    return this.auditService.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action,
      entityType,
      entityId,
      beforeSnapshot,
      afterSnapshot,
    });
  }
}

type JournalPayload = Prisma.PayrollJournalEntryGetPayload<{
  include: typeof journalInclude;
}>;
type RunPayload = Prisma.PayrollRunGetPayload<{
  include: typeof runForJournalInclude;
}>;
type RunEmployeePayload = RunPayload['employees'][number];
type LineItemPayload = RunEmployeePayload['lineItems'][number];

type PayrollPolicyRegisterItem = {
  id: string;
  name: string;
  code: string;
  policyType: string;
  organizationId: string | null;
  organization: string | null;
  scope: string;
  countryCode: string | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  status: string;
  isDefault: boolean;
  ownerUserId: string | null;
  owner: string | null;
  updatedAt: Date;
  incomplete: boolean;
  href: string;
};

function compactScope(
  businessUnitId?: string | null,
  departmentId?: string | null,
) {
  if (departmentId) return 'Department';
  if (businessUnitId) return 'Business Unit';
  return 'Organization / Tenant';
}

function legacyPolicyItem(
  item: {
    id: string;
    name: string;
    code: string;
    organizationId: string | null;
    businessUnitId: string | null;
    departmentId: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
    isActive: boolean;
    updatedAt: Date;
  },
  policyType: string,
  organizationNames: Map<string, string>,
): PayrollPolicyRegisterItem {
  const routeKey =
    policyType === 'Time-Based Pay'
      ? 'time-payroll-policies'
      : policyType === 'Overtime'
        ? 'overtime-policies'
        : 'travel-allowance-policies';
  return {
    id: item.id,
    name: item.name,
    code: item.code,
    policyType,
    organizationId: item.organizationId,
    organization: item.organizationId
      ? (organizationNames.get(item.organizationId) ?? null)
      : null,
    scope: compactScope(item.businessUnitId, item.departmentId),
    countryCode: null,
    effectiveFrom: item.effectiveFrom,
    effectiveTo: item.effectiveTo,
    status:
      item.effectiveTo && item.effectiveTo < new Date()
        ? 'EXPIRED'
        : item.isActive
          ? 'ACTIVE'
          : 'INACTIVE',
    isDefault: false,
    ownerUserId: null,
    owner: null,
    updatedAt: item.updatedAt,
    incomplete: false,
    href: `/settings/payroll/configuration/${routeKey}/${item.id}`,
  };
}

function buildJournalLines(input: {
  tenantId: string;
  journalEntryId: string;
  lineItem: LineItemPayload;
  runEmployee: RunEmployeePayload;
  rule: PayrollPostingRulePayload;
  taxRuleId: string | null;
}): Prisma.PayrollJournalEntryLineCreateManyInput[] {
  const amount = input.lineItem.amount.abs();
  const debitAccountId = input.lineItem.amount.lt(0)
    ? input.rule.creditAccountId
    : input.rule.debitAccountId;
  const creditAccountId = input.lineItem.amount.lt(0)
    ? input.rule.debitAccountId
    : input.rule.creditAccountId;
  if (!debitAccountId || !creditAccountId) return [];
  const base = {
    tenantId: input.tenantId,
    journalEntryId: input.journalEntryId,
    payrollRunLineItemId: input.lineItem.id,
    description: renderPostingDescription(
      input.rule.descriptionTemplate,
      input.lineItem.label,
      input.runEmployee.employee.employeeCode,
    ),
    employeeId: input.runEmployee.employeeId,
    payComponentId: input.lineItem.payComponentId,
    taxRuleId: input.taxRuleId,
  };
  const debitDimensions = resolvePostingDimensions(
    input.rule,
    input.runEmployee,
    'debit',
  );
  const creditDimensions = resolvePostingDimensions(
    input.rule,
    input.runEmployee,
    'credit',
  );
  assertRequiredDimensions(input.rule.debitAccount, debitDimensions);
  assertRequiredDimensions(input.rule.creditAccount, creditDimensions);
  return [
    {
      ...base,
      accountId: debitAccountId,
      debitAmount: amount,
      creditAmount: new Prisma.Decimal(0),
      dimensions: debitDimensions,
    },
    {
      ...base,
      accountId: creditAccountId,
      debitAmount: new Prisma.Decimal(0),
      creditAmount: amount,
      dimensions: creditDimensions,
    },
  ];
}

function resolvePostingDimensions(
  rule: PayrollPostingRulePayload,
  runEmployee: RunEmployeePayload,
  side: 'debit' | 'credit',
) {
  const employee = runEmployee.employee;
  const businessUnitSource =
    side === 'debit'
      ? rule.debitBusinessUnitSource
      : rule.creditBusinessUnitSource;
  const departmentSource =
    side === 'debit' ? rule.debitDepartmentSource : rule.creditDepartmentSource;
  const costCenterSource =
    side === 'debit' ? rule.debitCostCenterSource : rule.creditCostCenterSource;
  const projectSource =
    side === 'debit' ? rule.debitProjectSource : rule.creditProjectSource;
  const employeeSource =
    side === 'debit' ? rule.debitEmployeeSource : rule.creditEmployeeSource;
  return {
    businessUnitId:
      businessUnitSource === 'EMPLOYEE_BUSINESS_UNIT'
        ? employee.businessUnitId
        : businessUnitSource === 'FIXED_VALUE'
          ? rule.businessUnitId
          : null,
    departmentId:
      departmentSource === 'EMPLOYEE_DEPARTMENT'
        ? employee.departmentId
        : departmentSource === 'FIXED_VALUE'
          ? rule.departmentId
          : null,
    costCenterId: costCenterSource === 'FIXED_VALUE' ? rule.costCenterId : null,
    projectId: projectSource === 'FIXED_VALUE' ? rule.projectId : null,
    employeeId: employeeSource === 'EMPLOYEE' ? employee.id : null,
    locationId: employee.locationId,
    legalEntityId: rule.legalEntityId,
  };
}

function assertRequiredDimensions(
  account: PayrollPostingRulePayload['debitAccount'],
  dimensions: Record<string, string | null>,
) {
  if (!account) return;
  const requirements = [
    [
      'Business unit',
      account.requireBusinessUnitDimension,
      dimensions.businessUnitId,
    ],
    ['Department', account.requireDepartmentDimension, dimensions.departmentId],
    [
      'Cost center',
      account.requireCostCenterDimension,
      dimensions.costCenterId,
    ],
    ['Project', account.requireProjectDimension, dimensions.projectId],
    ['Employee', account.requireEmployeeDimension, dimensions.employeeId],
    ['Location', account.requireLocationDimension, dimensions.locationId],
    [
      'Legal entity',
      account.requireLegalEntityDimension,
      dimensions.legalEntityId,
    ],
  ] as const;
  const missing = requirements.find(
    ([, required, value]) => required && !value,
  );
  if (missing)
    throw new BadRequestException(
      `${missing[0]} is required by GL account ${account.code}.`,
    );
}

function renderPostingDescription(
  template: string | null,
  component: string,
  employeeCode: string,
) {
  return (template || '{component} - {employeeCode}')
    .replaceAll('{component}', component)
    .replaceAll('{employeeCode}', employeeCode);
}

function assertBalanced(
  lines: Array<{ debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }>,
) {
  const totals = lines.reduce(
    (sum, line) => ({
      debit: sum.debit.plus(line.debitAmount),
      credit: sum.credit.plus(line.creditAmount),
    }),
    { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
  );
  if (!totals.debit.equals(totals.credit)) {
    throw new BadRequestException('Payroll journal is not balanced.');
  }
}

function buildJournalNumber(run: RunPayload) {
  const periodEnd = run.payrollPeriod.periodEnd
    .toISOString()
    .slice(0, 7)
    .replace('-', '');
  return `GL-${periodEnd}-${run.runNumber}`;
}

function mapJournal(journal: JournalPayload) {
  const totals = journal.lines.reduce(
    (sum, line) => ({
      debit: sum.debit.plus(line.debitAmount),
      credit: sum.credit.plus(line.creditAmount),
    }),
    { debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(0) },
  );
  return {
    ...journal,
    debitTotal: totals.debit.toString(),
    creditTotal: totals.credit.toString(),
    balanced: totals.debit.equals(totals.credit),
    lines: journal.lines.map((line) => ({
      ...line,
      debitAmount: line.debitAmount.toString(),
      creditAmount: line.creditAmount.toString(),
    })),
  };
}

function toCsv(journal: JournalPayload) {
  const rows = [
    [
      'journalNumber',
      'payrollRunId',
      'accountCode',
      'accountName',
      'debitAmount',
      'creditAmount',
      'employeeCode',
      'employeeName',
      'payComponent',
      'taxRule',
      'description',
    ],
    ...journal.lines.map((line) => [
      journal.journalNumber ?? '',
      journal.payrollRunId,
      line.account.code,
      line.account.name,
      line.debitAmount.toString(),
      line.creditAmount.toString(),
      line.employee?.employeeCode ?? '',
      line.employee
        ? `${line.employee.firstName} ${line.employee.lastName}`
        : '',
      line.payComponent
        ? `${line.payComponent.code} / ${line.payComponent.name}`
        : '',
      line.taxRule ? `${line.taxRule.code} / ${line.taxRule.name}` : '',
      line.description ?? '',
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(',')).join('\n');
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function parseDate(value: string) {
  return new Date(value);
}

function parseOptionalDate(value?: string | null) {
  return value ? new Date(value) : null;
}

function assertEffectiveDates(from: Date | null, to: Date | null) {
  if (from && to && to < from)
    throw new BadRequestException(
      'effectiveTo must be greater than or equal to effectiveFrom.',
    );
}

function assertDistinctAccounts(
  debitAccountId?: string | null,
  creditAccountId?: string | null,
  allowSameAccount = false,
) {
  if (
    !allowSameAccount &&
    debitAccountId &&
    creditAccountId &&
    debitAccountId === creditAccountId
  ) {
    throw new BadRequestException(
      'Debit and credit accounts must be different.',
    );
  }
}

function normalizeChoice(value: string | null | undefined, fallback = '') {
  return (value?.trim() || fallback).toUpperCase();
}

function jsonOrNull(value?: Record<string, unknown>) {
  return value === undefined ? Prisma.DbNull : (value as Prisma.InputJsonValue);
}

function postingLineCategory(sourceType: string | null) {
  if (sourceType === 'TAX') return 'TAX_RULE';
  if (sourceType === 'BENEFIT') return 'BENEFIT';
  if (sourceType === 'LOAN') return 'LOAN';
  if (sourceType === 'CLAIM') return 'CLAIM';
  if (sourceType === 'ADJUSTMENT') return 'ADJUSTMENT';
  if (sourceType === 'REIMBURSEMENT') return 'REIMBURSEMENT';
  return 'PAY_COMPONENT';
}

function postingBehaviorUpdateData(dto: UpdatePayrollPostingRuleDto) {
  return {
    ...(dto.debitBusinessUnitSource !== undefined
      ? { debitBusinessUnitSource: emptyToNull(dto.debitBusinessUnitSource) }
      : {}),
    ...(dto.creditBusinessUnitSource !== undefined
      ? { creditBusinessUnitSource: emptyToNull(dto.creditBusinessUnitSource) }
      : {}),
    ...(dto.debitDepartmentSource !== undefined
      ? { debitDepartmentSource: emptyToNull(dto.debitDepartmentSource) }
      : {}),
    ...(dto.creditDepartmentSource !== undefined
      ? { creditDepartmentSource: emptyToNull(dto.creditDepartmentSource) }
      : {}),
    ...(dto.debitCostCenterSource !== undefined
      ? { debitCostCenterSource: emptyToNull(dto.debitCostCenterSource) }
      : {}),
    ...(dto.creditCostCenterSource !== undefined
      ? { creditCostCenterSource: emptyToNull(dto.creditCostCenterSource) }
      : {}),
    ...(dto.debitProjectSource !== undefined
      ? { debitProjectSource: emptyToNull(dto.debitProjectSource) }
      : {}),
    ...(dto.creditProjectSource !== undefined
      ? { creditProjectSource: emptyToNull(dto.creditProjectSource) }
      : {}),
    ...(dto.debitEmployeeSource !== undefined
      ? { debitEmployeeSource: emptyToNull(dto.debitEmployeeSource) }
      : {}),
    ...(dto.creditEmployeeSource !== undefined
      ? { creditEmployeeSource: emptyToNull(dto.creditEmployeeSource) }
      : {}),
    ...(dto.consolidationMode !== undefined
      ? { consolidationMode: normalizeChoice(dto.consolidationMode) }
      : {}),
    ...(dto.descriptionTemplate !== undefined
      ? { descriptionTemplate: emptyToNull(dto.descriptionTemplate) }
      : {}),
    ...(dto.journalReferenceTemplate !== undefined
      ? { journalReferenceTemplate: emptyToNull(dto.journalReferenceTemplate) }
      : {}),
    ...(dto.allowZeroPosting !== undefined
      ? { allowZeroPosting: dto.allowZeroPosting }
      : {}),
    ...(dto.reversalRule !== undefined
      ? { reversalRule: normalizeChoice(dto.reversalRule) }
      : {}),
    ...(dto.employeeLevelEntry !== undefined
      ? { employeeLevelEntry: dto.employeeLevelEntry }
      : {}),
    ...(dto.componentLevelEntry !== undefined
      ? { componentLevelEntry: dto.componentLevelEntry }
      : {}),
    ...(dto.departmentLevelEntry !== undefined
      ? { departmentLevelEntry: dto.departmentLevelEntry }
      : {}),
  };
}

function normalizeCode(value: string | undefined, fallbackName?: string) {
  const source = value?.trim() || `${fallbackName || 'GL'}_${shortSuffix()}`;
  return source
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_ -]+/g, '_')
    .replace(/^[_ -]+|[_ -]+$/g, '')
    .slice(0, 50);
}

function shortSuffix() {
  return Date.now().toString(36).toUpperCase().slice(-6);
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function handleUnique(error: unknown, message: string): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(message);
  }
  throw error;
}
