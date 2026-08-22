import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { toDisplayString } from '../../common/utils/display-string';
import {
  CreateEmployerBankAccountDto,
  UpdateEmployerBankAccountDto,
} from './dto/employer-bank-account.dto';

@Injectable()
export class EmployerBankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(
    user: AuthenticatedUser,
    query: { page?: number; pageSize?: number; search?: string },
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const search = query.search?.trim();
    const where: Prisma.EmployerBankAccountWhereInput = {
      tenantId: user.tenantId,
      ...(search
        ? {
            OR: [
              { accountName: { contains: search, mode: 'insensitive' } },
              { accountTitle: { contains: search, mode: 'insensitive' } },
              { iban: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employerBankAccount.findMany({
        where,
        include: { bank: true },
        orderBy: [{ isActive: 'desc' }, { accountName: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.employerBankAccount.count({ where }),
    ]);
    return {
      items: items.map(maskEmployerBankAccount),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async detail(user: AuthenticatedUser, id: string) {
    return maskEmployerBankAccount(await this.find(user.tenantId, id));
  }

  async create(user: AuthenticatedUser, dto: CreateEmployerBankAccountDto) {
    await this.validateReferences(user.tenantId, dto);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefaultPayrollAccount) {
          await unsetDefaultPayroll(tx, user.tenantId, dto.currencyCode);
        }
        return tx.employerBankAccount.create({
          data: {
            tenantId: user.tenantId,
            accountName: dto.accountName.trim(),
            accountTitle: dto.accountTitle.trim(),
            currencyCode: dto.currencyCode.toUpperCase(),
            ...data(dto),
            createdById: user.userId,
            updatedById: user.userId,
          },
          include: { bank: true },
        });
      });
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'EMPLOYER_BANK_ACCOUNT_CREATED',
        entityType: 'EmployerBankAccount',
        entityId: created.id,
        afterSnapshot: maskEmployerBankAccount(created),
      });
      return maskEmployerBankAccount(created);
    } catch (error) {
      handleWriteError(error);
    }
  }

  async update(
    user: AuthenticatedUser,
    id: string,
    dto: UpdateEmployerBankAccountDto,
  ) {
    const existing = await this.find(user.tenantId, id);
    await this.validateReferences(user.tenantId, dto);
    try {
      const updated = await this.prisma.$transaction(async (tx) => {
        if (dto.isDefaultPayrollAccount) {
          await unsetDefaultPayroll(tx, user.tenantId, dto.currencyCode, id);
        }
        return tx.employerBankAccount.update({
          where: { id },
          data: { ...data(dto), updatedById: user.userId },
          include: { bank: true },
        });
      });
      await this.audit.log({
        tenantId: user.tenantId,
        actorUserId: user.userId,
        action: 'EMPLOYER_BANK_ACCOUNT_UPDATED',
        entityType: 'EmployerBankAccount',
        entityId: id,
        beforeSnapshot: maskEmployerBankAccount(existing),
        afterSnapshot: maskEmployerBankAccount(updated),
      });
      return maskEmployerBankAccount(updated);
    } catch (error) {
      handleWriteError(error);
    }
  }

  async deactivate(user: AuthenticatedUser, id: string) {
    const existing = await this.find(user.tenantId, id);
    const updated = await this.prisma.employerBankAccount.update({
      where: { id },
      data: {
        isActive: false,
        isDefaultPayrollAccount: false,
        updatedById: user.userId,
      },
      include: { bank: true },
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'EMPLOYER_BANK_ACCOUNT_DEACTIVATED',
      entityType: 'EmployerBankAccount',
      entityId: id,
      beforeSnapshot: maskEmployerBankAccount(existing),
      afterSnapshot: maskEmployerBankAccount(updated),
    });
    return maskEmployerBankAccount(updated);
  }

  async setDefaultPayrollAccount(user: AuthenticatedUser, id: string) {
    const existing = await this.find(user.tenantId, id);
    if (!existing.isActive) {
      throw new ConflictException(
        'Only active accounts can be default payroll accounts.',
      );
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      await unsetDefaultPayroll(tx, user.tenantId, existing.currencyCode, id);
      return tx.employerBankAccount.update({
        where: { id },
        data: {
          accountPurpose: 'PAYROLL',
          isDefaultPayrollAccount: true,
          updatedById: user.userId,
        },
        include: { bank: true },
      });
    });
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'EMPLOYER_BANK_ACCOUNT_SET_DEFAULT_PAYROLL',
      entityType: 'EmployerBankAccount',
      entityId: id,
      beforeSnapshot: maskEmployerBankAccount(existing),
      afterSnapshot: maskEmployerBankAccount(updated),
    });
    return maskEmployerBankAccount(updated);
  }

  async exportCsv(user: AuthenticatedUser) {
    const rows = await this.prisma.employerBankAccount.findMany({
      where: { tenantId: user.tenantId },
      include: { bank: true },
      orderBy: [{ currencyCode: 'asc' }, { accountName: 'asc' }],
    });
    const columns = [
      'accountName',
      'bankCode',
      'accountTitle',
      'accountNumber',
      'iban',
      'branch',
      'currencyCode',
      'accountPurpose',
      'isDefaultPayrollAccount',
      'paymentFileFormat',
      'isActive',
    ] as const;
    const csv = [
      columns.join(','),
      ...rows.map((row) =>
        [
          row.accountName,
          row.bank?.code ?? '',
          row.accountTitle,
          row.accountNumber ?? '',
          row.iban ?? '',
          row.branch ?? '',
          row.currencyCode,
          row.accountPurpose,
          row.isDefaultPayrollAccount,
          row.paymentFileFormat ?? '',
          row.isActive,
        ]
          .map(csvCell)
          .join(','),
      ),
    ].join('\n');
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'EMPLOYER_BANK_ACCOUNTS_EXPORTED',
      entityType: 'EmployerBankAccount',
      entityId: 'bulk-export',
      afterSnapshot: { count: rows.length },
    });
    return {
      buffer: Buffer.from(csv),
      contentType: 'text/csv; charset=utf-8',
      fileName: 'employer-bank-accounts.csv',
    };
  }

  exportTemplate() {
    return {
      buffer: Buffer.from(
        [
          'accountName,bankCode,accountTitle,accountNumber,iban,branch,currencyCode,accountPurpose,isDefaultPayrollAccount,paymentFileFormat,isActive',
          'Main Payroll Account,ABC,Company Payroll,123456789,SA0000000000000000000000,Main,USD,PAYROLL,true,CSV,true',
        ].join('\n'),
      ),
      contentType: 'text/csv; charset=utf-8',
      fileName: 'employer-bank-accounts-template.csv',
    };
  }

  async importRows(
    user: AuthenticatedUser,
    rows: Array<CreateEmployerBankAccountDto & { bankCode?: string }>,
  ) {
    if (!Array.isArray(rows)) {
      throw new BadRequestException('Import payload must be an array of rows.');
    }
    const created: unknown[] = [];
    for (const row of rows) {
      const bankId =
        row.bankId ??
        (row.bankCode
          ? (
              await this.prisma.bank.findFirst({
                where: {
                  tenantId: user.tenantId,
                  code: row.bankCode.trim().toUpperCase(),
                  isActive: true,
                },
                select: { id: true },
              })
            )?.id
          : undefined);
      created.push(await this.create(user, { ...row, bankId }));
    }
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'EMPLOYER_BANK_ACCOUNTS_IMPORTED',
      entityType: 'EmployerBankAccount',
      entityId: 'bulk-import',
      afterSnapshot: { count: created.length },
    });
    return { imported: created.length, items: created };
  }

  private async find(tenantId: string, id: string) {
    const account = await this.prisma.employerBankAccount.findFirst({
      where: { tenantId, id },
      include: { bank: true },
    });
    if (!account)
      throw new NotFoundException('Employer bank account was not found.');
    return account;
  }

  private async validateReferences(
    tenantId: string,
    dto: Partial<CreateEmployerBankAccountDto>,
  ) {
    if (dto.bankId) {
      const bank = await this.prisma.bank.findFirst({
        where: { tenantId, id: dto.bankId, isActive: true },
        select: { id: true },
      });
      if (!bank) throw new BadRequestException('Active bank was not found.');
    }
    if (dto.currencyCode) {
      const currency = await this.prisma.currency.findFirst({
        where: {
          tenantId,
          code: dto.currencyCode.toUpperCase(),
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      if (!currency)
        throw new BadRequestException('Active currency was not found.');
    }
  }
}

function data(dto: Partial<CreateEmployerBankAccountDto>) {
  return {
    ...(dto.accountName !== undefined
      ? { accountName: dto.accountName.trim() }
      : {}),
    ...(dto.bankId !== undefined ? { bankId: clean(dto.bankId) } : {}),
    ...(dto.accountTitle !== undefined
      ? { accountTitle: dto.accountTitle.trim() }
      : {}),
    ...(dto.accountNumber !== undefined
      ? { accountNumber: clean(dto.accountNumber?.replace(/\s/g, '')) }
      : {}),
    ...(dto.iban !== undefined
      ? { iban: clean(dto.iban?.replace(/\s/g, '').toUpperCase()) }
      : {}),
    ...(dto.branch !== undefined ? { branch: clean(dto.branch) } : {}),
    ...(dto.currencyCode !== undefined
      ? { currencyCode: dto.currencyCode.toUpperCase() }
      : {}),
    ...(dto.accountPurpose !== undefined
      ? { accountPurpose: dto.accountPurpose }
      : {}),
    ...(dto.isDefaultPayrollAccount !== undefined
      ? { isDefaultPayrollAccount: dto.isDefaultPayrollAccount }
      : {}),
    ...(dto.paymentFileFormat !== undefined
      ? { paymentFileFormat: clean(dto.paymentFileFormat) }
      : {}),
    ...(dto.description !== undefined
      ? { description: clean(dto.description) }
      : {}),
    ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
  };
}

async function unsetDefaultPayroll(
  tx: Prisma.TransactionClient,
  tenantId: string,
  currencyCode: string,
  excludeId?: string,
) {
  await tx.employerBankAccount.updateMany({
    where: {
      tenantId,
      currencyCode: currencyCode.toUpperCase(),
      accountPurpose: 'PAYROLL',
      isDefaultPayrollAccount: true,
      isActive: true,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    data: { isDefaultPayrollAccount: false },
  });
}

function mask(value?: string | null) {
  if (!value) return null;
  return `${'*'.repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

function maskEmployerBankAccount<
  T extends {
    accountName: string;
    accountNumber: string | null;
    iban: string | null;
  },
>(row: T) {
  return {
    ...row,
    name: row.accountName,
    accountNumber: mask(row.accountNumber),
    iban: mask(row.iban),
  };
}

function clean(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed || null;
}

function handleWriteError(error: unknown): never {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException(
      'Employer bank account name is already in use.',
    );
  }
  throw error;
}

function csvCell(value: unknown) {
  return `"${toDisplayString(value ?? '').replaceAll('"', '""')}"`;
}
