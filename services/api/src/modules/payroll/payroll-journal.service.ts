import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  PayrollExceptionSeverity,
  PayrollJournalEntryStatus,
  PayrollRunLineItemCategory,
  PayrollRunStatus,
  Prisma,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  CreatePayrollGlAccountDto,
  CreatePayrollPostingRuleDto,
  UpdatePayrollGlAccountDto,
  UpdatePayrollPostingRuleDto,
} from './dto/payroll-gl.dto';
import {
  PayrollPostingRulePayload,
  PayrollPostingRuleResolverService,
  payrollPostingRuleInclude,
} from './payroll-posting-rule-resolver.service';

const journalInclude = {
  lines: {
    include: {
      account: true,
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
      payComponent: { select: { id: true, code: true, name: true } },
      taxRule: { select: { id: true, code: true, name: true } },
      payrollRunLineItem: true,
    },
    orderBy: [{ createdAt: 'asc' }],
  },
  payrollRun: { include: { payrollPeriod: true } },
} satisfies Prisma.PayrollJournalEntryInclude;

const runForJournalInclude = {
  payrollPeriod: true,
  employees: {
    include: {
      employee: { select: { id: true, employeeCode: true, firstName: true, lastName: true } },
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

  async createGlAccount(user: AuthenticatedUser, dto: CreatePayrollGlAccountDto) {
    try {
      const created = await this.prisma.payrollGlAccount.create({
        data: {
          tenantId: user.tenantId,
          code: normalizeCode(dto.code),
          name: dto.name.trim(),
          description: emptyToNull(dto.description),
          accountType: dto.accountType,
          isActive: dto.isActive ?? true,
        },
      });
      await this.audit(user, 'PAYROLL_GL_ACCOUNT_CREATED', 'PayrollGlAccount', created.id, null, created);
      return created;
    } catch (error) {
      handleUnique(error, 'GL account code already exists.');
    }
  }

  async updateGlAccount(user: AuthenticatedUser, id: string, dto: UpdatePayrollGlAccountDto) {
    const existing = await this.findAccount(user.tenantId, id);
    try {
      const updated = await this.prisma.payrollGlAccount.update({
        where: { id },
        data: {
          ...(dto.code !== undefined ? { code: normalizeCode(dto.code) } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.description !== undefined ? { description: emptyToNull(dto.description) } : {}),
          ...(dto.accountType !== undefined ? { accountType: dto.accountType } : {}),
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      await this.audit(user, 'PAYROLL_GL_ACCOUNT_UPDATED', 'PayrollGlAccount', id, existing, updated);
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
    if (activeRule) throw new ConflictException('Cannot deactivate an account used by an active posting rule.');
    const updated = await this.prisma.payrollGlAccount.update({
      where: { id },
      data: { isActive: false },
    });
    await this.audit(user, 'PAYROLL_GL_ACCOUNT_DEACTIVATED', 'PayrollGlAccount', id, existing, updated);
    return updated;
  }

  listPostingRules(user: AuthenticatedUser) {
    return this.prisma.payrollPostingRule.findMany({
      where: { tenantId: user.tenantId },
      include: payrollPostingRuleInclude,
      orderBy: [{ isActive: 'desc' }, { sourceCategory: 'asc' }, { name: 'asc' }],
    });
  }

  async getPostingRule(user: AuthenticatedUser, id: string) {
    return this.findPostingRule(user.tenantId, id);
  }

  async createPostingRule(user: AuthenticatedUser, dto: CreatePayrollPostingRuleDto) {
    await this.assertPostingRuleReferences(user.tenantId, dto);
    const effectiveFrom = parseDate(dto.effectiveFrom);
    const effectiveTo = parseOptionalDate(dto.effectiveTo);
    assertEffectiveDates(effectiveFrom, effectiveTo);
    assertDistinctAccounts(dto.debitAccountId, dto.creditAccountId);
    const created = await this.prisma.payrollPostingRule.create({
      data: {
        tenantId: user.tenantId,
        name: dto.name.trim(),
        description: emptyToNull(dto.description),
        sourceCategory: dto.sourceCategory,
        payComponentId: dto.payComponentId ?? null,
        taxRuleId: dto.taxRuleId ?? null,
        debitAccountId: dto.debitAccountId ?? null,
        creditAccountId: dto.creditAccountId ?? null,
        effectiveFrom,
        effectiveTo,
        isActive: dto.isActive ?? true,
      },
      include: payrollPostingRuleInclude,
    });
    await this.audit(user, 'PAYROLL_POSTING_RULE_CREATED', 'PayrollPostingRule', created.id, null, created);
    return created;
  }

  async updatePostingRule(user: AuthenticatedUser, id: string, dto: UpdatePayrollPostingRuleDto) {
    const existing = await this.findPostingRule(user.tenantId, id);
    const nextDebit = dto.debitAccountId !== undefined ? dto.debitAccountId : existing.debitAccountId;
    const nextCredit = dto.creditAccountId !== undefined ? dto.creditAccountId : existing.creditAccountId;
    assertDistinctAccounts(nextDebit, nextCredit);
    const effectiveFrom = dto.effectiveFrom ? parseDate(dto.effectiveFrom) : existing.effectiveFrom;
    const effectiveTo = dto.effectiveTo !== undefined ? parseOptionalDate(dto.effectiveTo) : existing.effectiveTo;
    assertEffectiveDates(effectiveFrom, effectiveTo);
    await this.assertPostingRuleReferences(user.tenantId, {
      payComponentId: dto.payComponentId !== undefined ? dto.payComponentId : existing.payComponentId,
      taxRuleId: dto.taxRuleId !== undefined ? dto.taxRuleId : existing.taxRuleId,
      debitAccountId: nextDebit,
      creditAccountId: nextCredit,
    });
    const updated = await this.prisma.payrollPostingRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: emptyToNull(dto.description) } : {}),
        ...(dto.sourceCategory !== undefined ? { sourceCategory: dto.sourceCategory } : {}),
        ...(dto.payComponentId !== undefined ? { payComponentId: dto.payComponentId } : {}),
        ...(dto.taxRuleId !== undefined ? { taxRuleId: dto.taxRuleId } : {}),
        ...(dto.debitAccountId !== undefined ? { debitAccountId: dto.debitAccountId } : {}),
        ...(dto.creditAccountId !== undefined ? { creditAccountId: dto.creditAccountId } : {}),
        ...(dto.effectiveFrom !== undefined ? { effectiveFrom } : {}),
        ...(dto.effectiveTo !== undefined ? { effectiveTo } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: payrollPostingRuleInclude,
    });
    await this.audit(user, 'PAYROLL_POSTING_RULE_UPDATED', 'PayrollPostingRule', id, existing, updated);
    return updated;
  }

  async deactivatePostingRule(user: AuthenticatedUser, id: string) {
    const existing = await this.findPostingRule(user.tenantId, id);
    const updated = await this.prisma.payrollPostingRule.update({
      where: { id },
      data: { isActive: false },
      include: payrollPostingRuleInclude,
    });
    await this.audit(user, 'PAYROLL_POSTING_RULE_DEACTIVATED', 'PayrollPostingRule', id, existing, updated);
    return updated;
  }

  async generateJournalForPayrollRun(input: { tenantId: string; payrollRunId: string; userId?: string | null }) {
    const run = await this.findRun(input.tenantId, input.payrollRunId);
    if (
      run.status !== PayrollRunStatus.CALCULATED &&
      run.status !== PayrollRunStatus.APPROVED &&
      run.status !== PayrollRunStatus.PAID
    ) {
      throw new BadRequestException('Journal can only be generated for calculated, approved, or paid payroll runs.');
    }

    const existing = await this.prisma.payrollJournalEntry.findUnique({
      where: { tenantId_payrollRunId: { tenantId: input.tenantId, payrollRunId: input.payrollRunId } },
      include: { lines: true },
    });
    if (existing?.status === PayrollJournalEntryStatus.EXPORTED) {
      throw new ConflictException('Exported payroll journals cannot be regenerated.');
    }

    const journal =
      existing ??
      (await this.prisma.payrollJournalEntry.create({
        data: {
          tenantId: input.tenantId,
          payrollRunId: input.payrollRunId,
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
        const taxRuleId = lineItem.sourceType === 'TAX' ? lineItem.sourceId : null;
        const rule = await this.postingRuleResolver.resolveRule({
          tenantId: input.tenantId,
          sourceCategory: lineItem.category,
          payComponentId: lineItem.payComponentId,
          taxRuleId,
          effectiveStart: run.payrollPeriod.periodStart,
          effectiveEnd: run.payrollPeriod.periodEnd,
        });

        if (!rule || !rule.debitAccountId || !rule.creditAccountId) {
          validationErrors.push(`No complete posting rule found for ${lineItem.category} / ${lineItem.label}.`);
          await this.prisma.payrollException.create({
            data: {
              tenantId: input.tenantId,
              payrollRunId: run.id,
              employeeId: runEmployee.employeeId,
              severity: PayrollExceptionSeverity.ERROR,
              errorType: 'MISSING_PAYROLL_POSTING_RULE',
              message: `No complete posting rule found for ${lineItem.category} / ${lineItem.label}.`,
              details: { payrollRunLineItemId: lineItem.id, category: lineItem.category, payComponentId: lineItem.payComponentId, taxRuleId },
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
    if (!lines.length) throw new BadRequestException('No non-zero payroll line items were available for journal generation.');

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
      action: existing ? 'PAYROLL_JOURNAL_REGENERATED' : 'PAYROLL_JOURNAL_GENERATED',
      entityType: 'PayrollJournalEntry',
      entityId: updated.id,
      beforeSnapshot: existing,
      afterSnapshot: { lineCount: lines.length, journalNumber: updated.journalNumber },
    });
    return mapJournal(updated);
  }

  async getJournal(user: AuthenticatedUser, runId: string) {
    await this.findRun(user.tenantId, runId);
    const journal = await this.prisma.payrollJournalEntry.findUnique({
      where: { tenantId_payrollRunId: { tenantId: user.tenantId, payrollRunId: runId } },
      include: journalInclude,
    });
    if (!journal) throw new NotFoundException('Payroll journal was not found.');
    return mapJournal(journal);
  }

  async exportJournalCsv(user: AuthenticatedUser, runId: string) {
    const journal = await this.getJournalPayload(user.tenantId, runId);
    if (journal.status === PayrollJournalEntryStatus.DRAFT || journal.status === PayrollJournalEntryStatus.VOIDED) {
      throw new BadRequestException('Only generated or exported journals can be exported.');
    }
    await this.audit(user, 'PAYROLL_JOURNAL_EXPORTED', 'PayrollJournalEntry', journal.id, null, { runId });
    return toCsv(journal);
  }

  async markJournalExported(user: AuthenticatedUser, runId: string) {
    const journal = await this.getJournalPayload(user.tenantId, runId);
    if (journal.status !== PayrollJournalEntryStatus.GENERATED && journal.status !== PayrollJournalEntryStatus.EXPORTED) {
      throw new BadRequestException('Only generated journals can be marked exported.');
    }
    assertBalanced(journal.lines.map((line) => ({
      debitAmount: line.debitAmount,
      creditAmount: line.creditAmount,
    })));
    const updated = await this.prisma.payrollJournalEntry.update({
      where: { id: journal.id },
      data: { status: PayrollJournalEntryStatus.EXPORTED, exportedAt: new Date() },
      include: journalInclude,
    });
    await this.audit(user, 'PAYROLL_JOURNAL_MARKED_EXPORTED', 'PayrollJournalEntry', journal.id, journal, updated);
    return mapJournal(updated);
  }

  private async findAccount(tenantId: string, id: string) {
    const account = await this.prisma.payrollGlAccount.findFirst({ where: { tenantId, id } });
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
    const journal = await this.prisma.payrollJournalEntry.findUnique({
      where: { tenantId_payrollRunId: { tenantId, payrollRunId: runId } },
      include: journalInclude,
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
      const item = await this.prisma.payComponent.findFirst({ where: { tenantId, id: dto.payComponentId, isActive: true }, select: { id: true } });
      if (!item) throw new BadRequestException('Active pay component was not found for this tenant.');
    }
    if (dto.taxRuleId) {
      const item = await this.prisma.taxRule.findFirst({ where: { tenantId, id: dto.taxRuleId, isActive: true }, select: { id: true } });
      if (!item) throw new BadRequestException('Active tax rule was not found for this tenant.');
    }
    for (const accountId of [dto.debitAccountId, dto.creditAccountId].filter(Boolean) as string[]) {
      const account = await this.prisma.payrollGlAccount.findFirst({ where: { tenantId, id: accountId, isActive: true }, select: { id: true } });
      if (!account) throw new BadRequestException('Active GL account was not found for this tenant.');
    }
  }

  private audit(user: AuthenticatedUser, action: string, entityType: string, entityId: string, beforeSnapshot: unknown, afterSnapshot: unknown) {
    return this.auditService.log({ tenantId: user.tenantId, actorUserId: user.userId, action, entityType, entityId, beforeSnapshot, afterSnapshot });
  }
}

type JournalPayload = Prisma.PayrollJournalEntryGetPayload<{ include: typeof journalInclude }>;
type RunPayload = Prisma.PayrollRunGetPayload<{ include: typeof runForJournalInclude }>;
type RunEmployeePayload = RunPayload['employees'][number];
type LineItemPayload = RunEmployeePayload['lineItems'][number];

function buildJournalLines(input: {
  tenantId: string;
  journalEntryId: string;
  lineItem: LineItemPayload;
  runEmployee: RunEmployeePayload;
  rule: PayrollPostingRulePayload;
  taxRuleId: string | null;
}): Prisma.PayrollJournalEntryLineCreateManyInput[] {
  const amount = input.lineItem.amount.abs();
  const debitAccountId = input.lineItem.amount.lt(0) ? input.rule.creditAccountId : input.rule.debitAccountId;
  const creditAccountId = input.lineItem.amount.lt(0) ? input.rule.debitAccountId : input.rule.creditAccountId;
  if (!debitAccountId || !creditAccountId) return [];
  const base = {
    tenantId: input.tenantId,
    journalEntryId: input.journalEntryId,
    payrollRunLineItemId: input.lineItem.id,
    description: input.lineItem.label,
    employeeId: input.runEmployee.employeeId,
    payComponentId: input.lineItem.payComponentId,
    taxRuleId: input.taxRuleId,
  };
  return [
    { ...base, accountId: debitAccountId, debitAmount: amount, creditAmount: new Prisma.Decimal(0) },
    { ...base, accountId: creditAccountId, debitAmount: new Prisma.Decimal(0), creditAmount: amount },
  ];
}

function assertBalanced(lines: Array<{ debitAmount: Prisma.Decimal; creditAmount: Prisma.Decimal }>) {
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
  const periodEnd = run.payrollPeriod.periodEnd.toISOString().slice(0, 7).replace('-', '');
  return `GL-${periodEnd}-${run.runNumber}`;
}

function mapJournal(journal: JournalPayload) {
  return {
    ...journal,
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
      line.employee ? `${line.employee.firstName} ${line.employee.lastName}` : '',
      line.payComponent ? `${line.payComponent.code} / ${line.payComponent.name}` : '',
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

function assertEffectiveDates(from: Date, to: Date | null) {
  if (to && to < from) throw new BadRequestException('effectiveTo must be greater than or equal to effectiveFrom.');
}

function assertDistinctAccounts(debitAccountId?: string | null, creditAccountId?: string | null) {
  if (debitAccountId && creditAccountId && debitAccountId === creditAccountId) {
    throw new BadRequestException('Debit and credit accounts must be different.');
  }
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function emptyToNull(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function handleUnique(error: unknown, message: string): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException(message);
  }
  throw error;
}
