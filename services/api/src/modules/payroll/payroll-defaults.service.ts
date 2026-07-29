import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ConfigurationStatus,
  PayComponentCalculationMethod,
  PayComponentType,
  PayrollCalendarFrequency,
  PayrollGlAccountType,
  PayrollRunLineItemCategory,
  TaxCalculationMethod,
  TaxType,
} from '@prisma/client';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantSettingsResolverService } from '../tenant-settings/tenant-settings-resolver.service';
import { TenantSettingsService } from '../tenant-settings/tenant-settings.service';

type InitializationResult = {
  created: string[];
  skipped: string[];
};

const COMPONENTS = [
  ['BASIC', 'Default Basic Salary', PayComponentType.EARNING, true],
  [
    'FIXED-ALLOWANCE',
    'Default Fixed Allowance',
    PayComponentType.ALLOWANCE,
    true,
  ],
  [
    'VARIABLE-ALLOWANCE',
    'Default Variable Allowance',
    PayComponentType.ALLOWANCE,
    true,
  ],
  ['OVERTIME', 'Default Overtime', PayComponentType.EARNING, true],
  ['BONUS', 'Default Bonus', PayComponentType.EARNING, true],
  ['EMP-TAX', 'Default Employee Income Tax', PayComponentType.TAX, false],
  [
    'EMP-DEDUCTION',
    'Default Employee Deduction',
    PayComponentType.DEDUCTION,
    false,
  ],
  [
    'ER-CONTRIBUTION',
    'Default Employer Contribution',
    PayComponentType.EMPLOYER_CONTRIBUTION,
    false,
  ],
  [
    'REIMBURSEMENT',
    'Default Reimbursement',
    PayComponentType.REIMBURSEMENT,
    false,
  ],
  ['NET-PAY', 'Default Net Pay', PayComponentType.ADJUSTMENT, false],
  [
    'ROUNDING',
    'Default Rounding Adjustment',
    PayComponentType.ADJUSTMENT,
    false,
  ],
] as const;

const ACCOUNTS = [
  ['PAYROLL-EXPENSE', 'Default Payroll Expense', PayrollGlAccountType.EXPENSE],
  [
    'ALLOWANCE-EXPENSE',
    'Default Allowance Expense',
    PayrollGlAccountType.EXPENSE,
  ],
  [
    'ER-CONTRIBUTION-EXPENSE',
    'Default Employer Contribution Expense',
    PayrollGlAccountType.EXPENSE,
  ],
  [
    'PAYROLL-PAYABLE',
    'Default Payroll Payable',
    PayrollGlAccountType.LIABILITY,
  ],
  [
    'EMP-TAX-PAYABLE',
    'Default Employee Tax Payable',
    PayrollGlAccountType.LIABILITY,
  ],
  [
    'DEDUCTION-PAYABLE',
    'Default Deduction Payable',
    PayrollGlAccountType.LIABILITY,
  ],
  [
    'STATUTORY-PAYABLE',
    'Default Statutory Contribution Payable',
    PayrollGlAccountType.LIABILITY,
  ],
  ['BANK-CLEARING', 'Default Bank Clearing', PayrollGlAccountType.ASSET],
] as const;

@Injectable()
export class PayrollDefaultsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: TenantSettingsResolverService,
    private readonly tenantSettings: TenantSettingsService,
    private readonly audit: AuditService,
  ) {}

  async initialize(user: AuthenticatedUser) {
    const result: InitializationResult = { created: [], skipped: [] };
    const payrollSettings = await this.settings.getPayrollSettings(
      user.tenantId,
    );
    const organizationSettings = await this.settings.getOrganizationSettings(
      user.tenantId,
    );
    const currencyCode = payrollSettings.defaultCurrency.trim().toUpperCase();
    const effectiveFrom = startOfUtcYear(new Date());

    await this.ensureCurrency(user.tenantId, currencyCode);
    const components = await this.ensureComponents(user, effectiveFrom, result);
    const compensationPackage = await this.ensureCompensationPackage(
      user,
      currencyCode,
      components,
      result,
    );
    const taxPolicies = await this.ensureTaxPolicies(
      user,
      currencyCode,
      effectiveFrom,
      components,
      result,
    );
    const accounts = await this.ensureAccounts(user, currencyCode, result);
    const postingRules = await this.ensurePostingRules(
      user,
      effectiveFrom,
      components,
      accounts,
      result,
    );
    const foundation = await this.ensureFoundation(
      user,
      currencyCode,
      organizationSettings.timezone,
      result,
    );
    const templates = await this.ensureDocumentTemplates(user, result);
    await this.wireMissingDefaults(user, {
      payrollRegionId: foundation.regionId,
      payrollCalendarId: foundation.calendarId,
      compensationPackageId: compensationPackage.id,
      taxPolicyId: taxPolicies.get('DEFAULT-ZERO-TAX')!.id,
      postingProfileId: postingRules[0]?.id ?? null,
      benchCostCenterId: accounts.get('PAYROLL-EXPENSE')!.id,
      paymentAccountId: accounts.get('BANK-CLEARING')!.id,
      roundingComponentId: components.get('ROUNDING')!.id,
      payslipTemplateId: templates.payslipTemplateId,
      taxStatementTemplateId: templates.taxStatementTemplateId,
    });

    const health = await this.health(user.tenantId);
    await this.audit.log({
      tenantId: user.tenantId,
      actorUserId: user.userId,
      action: 'PAYROLL_DEFAULTS_INITIALIZED',
      entityType: 'Tenant',
      entityId: user.tenantId,
      afterSnapshot: { ...result, health },
    });
    return { ...result, health };
  }

  async health(tenantId: string) {
    const requiredComponentCodes = COMPONENTS.map(([code]) => code);
    const requiredAccountCodes = ACCOUNTS.map(([code]) => code);
    const [
      components,
      packageCount,
      taxPolicyCount,
      accountCount,
      postingRuleCount,
      calendarCount,
      cycleCount,
      periodCount,
    ] = await Promise.all([
      this.prisma.payComponent.findMany({
        where: {
          tenantId,
          isActive: true,
        },
        select: { code: true, name: true, componentType: true },
      }),
      this.prisma.salaryPackageRule.count({
        where: {
          tenantId,
          name: 'Default Compensation Package',
          isActive: true,
        },
      }),
      this.prisma.taxRule.count({
        where: {
          tenantId,
          code: { in: ['DEFAULT-PROGRESSIVE-TAX', 'DEFAULT-ZERO-TAX'] },
          isActive: true,
        },
      }),
      this.prisma.payrollGlAccount.count({
        where: { tenantId, code: { in: requiredAccountCodes }, isActive: true },
      }),
      this.prisma.payrollPostingRule.count({
        where: { tenantId, isActive: true },
      }),
      this.prisma.payrollCalendar.count({
        where: { tenantId, isDefault: true, isActive: true },
      }),
      this.prisma.payrollCycle.count({
        where: {
          tenantId,
          name: 'Default Monthly Payroll Cycle',
          payrollCalendarId: { not: null },
        },
      }),
      this.prisma.payrollPeriod.count({ where: { tenantId } }),
    ]);
    const checks = [
      [
        'Pay components',
        requiredComponentCodes.every((code) =>
          components.some(
            (component) =>
              component.code === code ||
              (code === 'BASIC' &&
                component.componentType === 'EARNING' &&
                component.name.toLowerCase().includes('basic')),
          ),
        ),
      ],
      ['Compensation package', packageCount > 0],
      ['Tax policies', taxPolicyCount === 2],
      ['GL accounts', accountCount === requiredAccountCodes.length],
      ['Posting rules', postingRuleCount >= 8],
      ['Payroll calendar', calendarCount > 0],
      ['Payroll cycle', cycleCount > 0],
      ['Payroll periods', periodCount > 0],
    ] as const;
    const complete = checks.filter(([, ready]) => ready).length;
    return {
      completenessPercentage: Math.round((complete / checks.length) * 100),
      ready: complete === checks.length,
      checks: checks.map(([label, ready]) => ({ label, ready })),
      missing: checks.filter(([, ready]) => !ready).map(([label]) => label),
    };
  }

  private async ensureCurrency(tenantId: string, currencyCode: string) {
    const currency = await this.prisma.currency.findFirst({
      where: { tenantId, code: currencyCode, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!currency) {
      throw new BadRequestException(
        `The default payroll currency ${currencyCode} must be configured and active before payroll defaults can be initialized.`,
      );
    }
  }

  private async ensureComponents(
    user: AuthenticatedUser,
    effectiveFrom: Date,
    result: InitializationResult,
  ) {
    const rows = new Map<string, { id: string }>();
    for (const [code, name, componentType, isTaxable] of COMPONENTS) {
      const existing = await this.prisma.payComponent.findUnique({
        where: { tenantId_code: { tenantId: user.tenantId, code } },
        select: { id: true, isActive: true },
      });
      if (existing) {
        if (!existing.isActive && code === 'BASIC') {
          const replacement = await this.prisma.payComponent.findFirst({
            where: {
              tenantId: user.tenantId,
              isActive: true,
              componentType: PayComponentType.EARNING,
              OR: [
                { componentCategory: 'BASIC' },
                { name: { contains: 'basic', mode: 'insensitive' } },
              ],
            },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          });
          rows.set(code, replacement ?? existing);
        } else {
          rows.set(code, existing);
        }
        result.skipped.push(`Pay component: ${code}`);
        continue;
      }
      const created = await this.prisma.payComponent.create({
        data: {
          tenantId: user.tenantId,
          code,
          name,
          description: 'Editable generic payroll default.',
          ownerUserId: user.userId,
          status: ConfigurationStatus.ACTIVE,
          createdById: user.userId,
          updatedById: user.userId,
          componentCategory: componentType,
          componentType,
          calculationMethod:
            code === 'BASIC' || code === 'FIXED-ALLOWANCE'
              ? PayComponentCalculationMethod.FIXED
              : code === 'VARIABLE-ALLOWANCE' ||
                  code === 'BONUS' ||
                  code === 'EMP-DEDUCTION'
                ? PayComponentCalculationMethod.MANUAL
                : PayComponentCalculationMethod.SYSTEM_CALCULATED,
          fixedAmount:
            code === 'BASIC' || code === 'FIXED-ALLOWANCE' ? 0 : null,
          effectiveFrom,
          isTaxable,
          affectsGrossPay:
            componentType === PayComponentType.EARNING ||
            componentType === PayComponentType.ALLOWANCE,
          affectsNetPay:
            componentType !== PayComponentType.EMPLOYER_CONTRIBUTION,
          isRecurring: ['BASIC', 'FIXED-ALLOWANCE'].includes(code),
          displayOnPayslip: code !== 'ROUNDING',
          displayOrder:
            COMPONENTS.findIndex(([itemCode]) => itemCode === code) * 10,
        },
        select: { id: true },
      });
      rows.set(code, created);
      result.created.push(`Pay component: ${code}`);
    }
    return rows;
  }

  private async ensureCompensationPackage(
    user: AuthenticatedUser,
    currencyCode: string,
    components: Map<string, { id: string }>,
    result: InitializationResult,
  ) {
    const existing = await this.prisma.salaryPackageRule.findFirst({
      where: {
        tenantId: user.tenantId,
        OR: [
          { code: 'DEFAULT-COMPENSATION' },
          { name: 'Default Compensation Package' },
        ],
      },
      select: {
        id: true,
        currencyCode: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        version: true,
        components: {
          select: {
            id: true,
            payComponentId: true,
            payComponent: {
              select: { code: true, isActive: true },
            },
          },
        },
      },
    });
    if (existing) {
      if (
        existing.currencyCode !== currencyCode &&
        existing.description ===
          'Editable generic default compensation package.' &&
        isPristineDefault(existing)
      ) {
        await this.prisma.salaryPackageRule.update({
          where: { id: existing.id },
          data: { currencyCode, updatedById: user.userId },
        });
      }
      if (
        existing.description ===
        'Editable generic default compensation package.'
      ) {
        for (const componentCode of [
          'BASIC',
          'FIXED-ALLOWANCE',
          'EMP-DEDUCTION',
        ] as const) {
          const expectedComponentId = components.get(componentCode)?.id;
          if (
            !expectedComponentId ||
            existing.components.some(
              (component) => component.payComponentId === expectedComponentId,
            )
          ) {
            continue;
          }

          const staleGeneratedComponent = existing.components.find(
            (component) =>
              component.payComponent.code === componentCode &&
              !component.payComponent.isActive,
          );
          if (!staleGeneratedComponent) continue;

          await this.prisma.salaryPackageRuleComponent.update({
            where: { id: staleGeneratedComponent.id },
            data: {
              payComponentId: expectedComponentId,
              updatedById: user.userId,
            },
          });
          result.created.push(
            `Compensation package component repaired: ${componentCode}`,
          );
        }
      }
      result.skipped.push('Compensation package: DEFAULT-COMPENSATION');
      return existing;
    }
    const created = await this.prisma.salaryPackageRule.create({
      data: {
        tenantId: user.tenantId,
        code: 'DEFAULT-COMPENSATION',
        name: 'Default Compensation Package',
        description: 'Editable generic default compensation package.',
        currencyCode,
        effectiveFrom: startOfUtcYear(new Date()),
        priority: 0,
        isDefault: true,
        status: 'ACTIVE',
        ownerUserId: user.userId,
        isActive: true,
        createdById: user.userId,
        updatedById: user.userId,
      },
    });
    const packageCodes = ['BASIC', 'FIXED-ALLOWANCE', 'EMP-DEDUCTION'] as const;
    await this.prisma.salaryPackageRuleComponent.createMany({
      data: packageCodes.map((code, index) => ({
        tenantId: user.tenantId,
        salaryPackageRuleId: created.id,
        payComponentId: components.get(code)!.id,
        calculationMethod: PayComponentCalculationMethod.FIXED,
        fixedAmount: 0,
        isRequired: code === 'BASIC',
        displayOrder: (index + 1) * 10,
        createdById: user.userId,
        updatedById: user.userId,
      })),
    });
    result.created.push('Compensation package: DEFAULT-COMPENSATION');
    return { id: created.id };
  }

  private async ensureTaxPolicies(
    user: AuthenticatedUser,
    currencyCode: string,
    effectiveFrom: Date,
    components: Map<string, { id: string }>,
    result: InitializationResult,
  ) {
    const rows = new Map<string, { id: string }>();
    for (const config of [
      {
        code: 'DEFAULT-ZERO-TAX',
        name: 'Default Zero Tax Policy',
        method: TaxCalculationMethod.ZERO,
        description:
          'Generic zero-tax policy for employees outside a taxable scope.',
      },
      {
        code: 'DEFAULT-PROGRESSIVE-TAX',
        name: 'Default Progressive Tax Policy',
        method: TaxCalculationMethod.BRACKET,
        description: 'Demo configuration — not for statutory filing.',
      },
    ]) {
      const existing = await this.prisma.taxRule.findUnique({
        where: {
          tenantId_code: { tenantId: user.tenantId, code: config.code },
        },
        select: {
          id: true,
          currencyCode: true,
          createdAt: true,
          updatedAt: true,
          version: true,
        },
      });
      if (existing) {
        if (
          existing.currencyCode !== currencyCode &&
          isPristineDefault(existing)
        ) {
          await this.prisma.taxRule.update({
            where: { id: existing.id },
            data: {
              currencyCode,
              ownerUserId: user.userId,
              updatedById: user.userId,
            },
          });
        }
        rows.set(config.code, existing);
        result.skipped.push(`Tax policy: ${config.code}`);
        continue;
      }
      const created = await this.prisma.taxRule.create({
        data: {
          tenantId: user.tenantId,
          code: config.code,
          name: config.name,
          description: config.description,
          calculationStrategy: 'PERIODIC',
          calculationMethod: config.method,
          taxType: TaxType.INCOME_TAX,
          employeeRate: config.method === TaxCalculationMethod.ZERO ? 0 : null,
          currencyCode,
          status: 'ACTIVE',
          ownerUserId: user.userId,
          isDefault: config.code === 'DEFAULT-ZERO-TAX',
          priority: config.code === 'DEFAULT-ZERO-TAX' ? 999 : 100,
          employeeTaxComponentId: components.get('EMP-TAX')!.id,
          postingCategory: 'TAX_LIABILITY',
          effectiveFrom,
          isActive: true,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      if (config.method === TaxCalculationMethod.BRACKET) {
        await this.prisma.taxRuleBracket.createMany({
          data: [
            {
              minAmount: 0,
              maxAmount: 1000,
              employeeRate: 0,
              fixedEmployeeAmount: 0,
            },
            {
              minAmount: 1000,
              maxAmount: 3000,
              employeeRate: 5,
              fixedEmployeeAmount: 0,
            },
            {
              minAmount: 3000,
              maxAmount: null,
              employeeRate: 10,
              fixedEmployeeAmount: 100,
            },
          ].map(
            ({ minAmount, maxAmount, employeeRate, fixedEmployeeAmount }) => ({
              tenantId: user.tenantId,
              taxRuleId: created.id,
              minAmount,
              maxAmount,
              employeeRate,
              fixedEmployeeAmount,
            }),
          ),
        });
      }
      rows.set(config.code, { id: created.id });
      result.created.push(`Tax policy: ${config.code}`);
    }
    return rows;
  }

  private async ensureAccounts(
    user: AuthenticatedUser,
    currencyCode: string,
    result: InitializationResult,
  ) {
    const rows = new Map<string, { id: string }>();
    for (const [code, name, accountType] of ACCOUNTS) {
      const existing = await this.prisma.payrollGlAccount.findUnique({
        where: { tenantId_code: { tenantId: user.tenantId, code } },
        select: {
          id: true,
          currencyCode: true,
          createdAt: true,
          updatedAt: true,
          version: true,
        },
      });
      if (existing) {
        if (
          existing.currencyCode !== currencyCode &&
          isPristineDefault(existing)
        ) {
          await this.prisma.payrollGlAccount.update({
            where: { id: existing.id },
            data: {
              currencyCode,
              ownerUserId: user.userId,
              updatedById: user.userId,
            },
          });
        }
        rows.set(code, existing);
        result.skipped.push(`GL account: ${code}`);
        continue;
      }
      const created = await this.prisma.payrollGlAccount.create({
        data: {
          tenantId: user.tenantId,
          code,
          name,
          accountType,
          currencyCode,
          postingAllowed: true,
          status: 'ACTIVE',
          ownerUserId: user.userId,
          effectiveFrom: startOfUtcYear(new Date()),
          isActive: true,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: { id: true },
      });
      rows.set(code, created);
      result.created.push(`GL account: ${code}`);
    }
    return rows;
  }

  private async ensurePostingRules(
    user: AuthenticatedUser,
    effectiveFrom: Date,
    components: Map<string, { id: string }>,
    accounts: Map<string, { id: string }>,
    result: InitializationResult,
  ) {
    const rows: Array<{ id: string }> = [];
    const rules = [
      [
        'Default Basic Salary Posting',
        'BASIC',
        PayrollRunLineItemCategory.EARNING,
        'PAYROLL-EXPENSE',
        'PAYROLL-PAYABLE',
      ],
      [
        'Default Allowance Posting',
        'FIXED-ALLOWANCE',
        PayrollRunLineItemCategory.ALLOWANCE,
        'ALLOWANCE-EXPENSE',
        'PAYROLL-PAYABLE',
      ],
      [
        'Default Employee Tax Posting',
        'EMP-TAX',
        PayrollRunLineItemCategory.TAX,
        'PAYROLL-PAYABLE',
        'EMP-TAX-PAYABLE',
      ],
      [
        'Default Employee Deduction Posting',
        'EMP-DEDUCTION',
        PayrollRunLineItemCategory.DEDUCTION,
        'PAYROLL-PAYABLE',
        'DEDUCTION-PAYABLE',
      ],
      [
        'Default Employer Contribution Posting',
        'ER-CONTRIBUTION',
        PayrollRunLineItemCategory.EMPLOYER_CONTRIBUTION,
        'ER-CONTRIBUTION-EXPENSE',
        'STATUTORY-PAYABLE',
      ],
      [
        'Default Net Pay Posting',
        'NET-PAY',
        PayrollRunLineItemCategory.ADJUSTMENT,
        'PAYROLL-PAYABLE',
        'BANK-CLEARING',
      ],
      [
        'Default Payroll Payment Posting',
        'NET-PAY',
        PayrollRunLineItemCategory.ADJUSTMENT,
        'PAYROLL-PAYABLE',
        'BANK-CLEARING',
      ],
      [
        'Default Reversal Posting',
        'ROUNDING',
        PayrollRunLineItemCategory.ADJUSTMENT,
        'BANK-CLEARING',
        'PAYROLL-PAYABLE',
      ],
    ] as const;
    for (const [
      name,
      componentCode,
      sourceCategory,
      debitCode,
      creditCode,
    ] of rules) {
      const exists = await this.prisma.payrollPostingRule.findFirst({
        where: { tenantId: user.tenantId, name },
        select: {
          id: true,
          payComponentId: true,
          createdAt: true,
          updatedAt: true,
          version: true,
        },
      });
      if (exists) {
        const expectedPayComponentId = components.get(componentCode)!.id;
        if (
          exists.payComponentId !== expectedPayComponentId &&
          isPristineDefault(exists)
        ) {
          const repaired = await this.prisma.payrollPostingRule.update({
            where: { id: exists.id },
            data: {
              payComponentId: expectedPayComponentId,
              ownerUserId: user.userId,
              updatedById: user.userId,
            },
            select: { id: true },
          });
          rows.push(repaired);
          result.created.push(`Posting rule repaired: ${name}`);
        } else {
          rows.push(exists);
        }
        result.skipped.push(`Posting rule: ${name}`);
        continue;
      }
      const created = await this.prisma.payrollPostingRule.create({
        data: {
          tenantId: user.tenantId,
          code: name
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, '-')
            .slice(0, 80),
          name,
          description: 'Editable generic payroll posting default.',
          lineCategory:
            name === 'Default Payroll Payment Posting'
              ? 'PAYROLL_PAYMENT'
              : name === 'Default Reversal Posting'
                ? 'REVERSAL'
                : 'PAY_COMPONENT',
          sourceCategory,
          postingEvent:
            name === 'Default Payroll Payment Posting'
              ? 'PAYROLL_PAYMENT'
              : name === 'Default Reversal Posting'
                ? 'REVERSAL'
                : 'PAYROLL_ACCRUAL',
          status: 'ACTIVE',
          ownerUserId: user.userId,
          priority: 100,
          payComponentId: components.get(componentCode)!.id,
          debitAccountId: accounts.get(debitCode)!.id,
          creditAccountId: accounts.get(creditCode)!.id,
          effectiveFrom,
          isActive: true,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: { id: true },
      });
      rows.push(created);
      result.created.push(`Posting rule: ${name}`);
    }
    return rows;
  }

  private async ensureFoundation(
    user: AuthenticatedUser,
    currencyCode: string,
    timezone: string,
    result: InitializationResult,
  ) {
    let region = await this.prisma.payrollRegion.findFirst({
      where: { tenantId: user.tenantId, isDefault: true, status: 'ACTIVE' },
    });
    if (!region) {
      const organization = await this.prisma.organization.findFirst({
        where: { tenantId: user.tenantId, isActive: true },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      region = await this.prisma.payrollRegion.create({
        data: {
          tenantId: user.tenantId,
          organizationId: organization?.id ?? null,
          code: 'DEFAULT-PAYROLL-REGION',
          name: 'Default Payroll Region',
          currencyCode,
          reportingCurrencyCode: currencyCode,
          timezone,
          isDefault: true,
          status: 'ACTIVE',
          subStatus: 'OPEN',
          ownerUserId: user.userId,
          effectiveStartDate: startOfUtcYear(new Date()),
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      result.created.push('Payroll region: DEFAULT-PAYROLL-REGION');
    } else {
      if (region.currencyCode !== currencyCode && isPristineDefault(region)) {
        region = await this.prisma.payrollRegion.update({
          where: { id: region.id },
          data: {
            currencyCode,
            reportingCurrencyCode: currencyCode,
            timezone,
            updatedById: user.userId,
          },
        });
      }
      result.skipped.push('Payroll region: DEFAULT-PAYROLL-REGION');
    }
    let calendar = await this.prisma.payrollCalendar.findFirst({
      where: {
        tenantId: user.tenantId,
        name: 'Default Monthly Payroll Calendar',
      },
    });
    if (!calendar) {
      calendar = await this.prisma.payrollCalendar.create({
        data: {
          tenantId: user.tenantId,
          name: 'Default Monthly Payroll Calendar',
          frequency: PayrollCalendarFrequency.MONTHLY,
          timezone,
          currencyCode,
          isDefault: true,
          isActive: true,
        },
      });
      result.created.push('Payroll calendar: DEFAULT-MONTHLY');
    } else {
      if (
        calendar.currencyCode !== currencyCode &&
        isPristineDefault(calendar)
      ) {
        calendar = await this.prisma.payrollCalendar.update({
          where: { id: calendar.id },
          data: { currencyCode, timezone },
        });
      }
      result.skipped.push('Payroll calendar: DEFAULT-MONTHLY');
    }

    const month = startOfUtcMonth(new Date());
    const horizonEnd = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 12, 0),
    );
    let cycle = await this.prisma.payrollCycle.findFirst({
      where: {
        tenantId: user.tenantId,
        name: 'Default Monthly Payroll Cycle',
      },
    });
    if (!cycle) {
      cycle = await this.prisma.payrollCycle.create({
        data: {
          tenantId: user.tenantId,
          code: 'DEFAULT_MONTHLY',
          name: 'Default Monthly Payroll Cycle',
          description: 'Editable generic default monthly payroll cycle.',
          payFrequency: PayrollCalendarFrequency.MONTHLY,
          currencyCode,
          periodStartRule: 'CALENDAR_MONTH_START',
          periodEndRule: 'CALENDAR_MONTH_END',
          cutoffDay: 25,
          paymentDay: 28,
          adjustDatesForWeekend: true,
          dateAdjustmentDirection: 'PREVIOUS_BUSINESS_DAY',
          defaultGenerationSource: 'HYBRID',
          payrollCalendarId: calendar.id,
          payrollRegionId: region.id,
          periodStart: month,
          periodEnd: horizonEnd,
          status: 'DRAFT',
          isDefault: true,
          createdById: user.userId,
          updatedById: user.userId,
        },
      });
      result.created.push('Payroll cycle: DEFAULT-MONTHLY');
    } else {
      if (
        cycle.currencyCode !== currencyCode &&
        isPristineDefault(cycle)
      ) {
        cycle = await this.prisma.payrollCycle.update({
          where: { id: cycle.id },
          data: {
            currencyCode,
            payrollCalendarId: calendar.id,
            payrollRegionId: region.id,
            updatedById: user.userId,
          },
        });
      }
      if (!cycle.payrollCalendarId) {
        cycle = await this.prisma.payrollCycle.update({
          where: { id: cycle.id },
          data: {
            payrollCalendarId: calendar.id,
            payrollRegionId: cycle.payrollRegionId ?? region.id,
            updatedById: user.userId,
          },
        });
      }
      result.skipped.push('Payroll cycle: DEFAULT-MONTHLY');
    }

    for (let index = 0; index < 12; index += 1) {
      const periodStart = addUtcMonths(month, index);
      const periodEnd = new Date(
        Date.UTC(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth() + 1,
          0,
        ),
      );
      const existing = await this.prisma.payrollPeriod.findFirst({
        where: {
          tenantId: user.tenantId,
          payrollCalendarId: calendar.id,
          periodStart,
          periodEnd,
        },
        select: { id: true, payrollCycleId: true },
      });
      const label = `${periodStart.getUTCFullYear()}-${String(periodStart.getUTCMonth() + 1).padStart(2, '0')}`;
      if (existing) {
        if (
          !existing.payrollCycleId &&
          periodStart >= cycle.periodStart &&
          periodEnd <= cycle.periodEnd
        ) {
          await this.prisma.payrollPeriod.update({
            where: { id: existing.id },
            data: { payrollCycleId: cycle.id },
          });
        }
        result.skipped.push(`Payroll period: ${label}`);
        continue;
      }
      await this.prisma.payrollPeriod.create({
        data: {
          tenantId: user.tenantId,
          payrollCalendarId: calendar.id,
          payrollCycleId:
            periodStart >= cycle.periodStart && periodEnd <= cycle.periodEnd
              ? cycle.id
              : null,
          name: periodStart.toLocaleString('en', {
            month: 'long',
            year: 'numeric',
            timeZone: 'UTC',
          }),
          periodStart,
          periodEnd,
          cutoffDate: previousUtcWeekday(
            new Date(
              Date.UTC(
                periodStart.getUTCFullYear(),
                periodStart.getUTCMonth(),
                Math.min(25, periodEnd.getUTCDate()),
              ),
            ),
          ),
          paymentDate: previousUtcWeekday(
            new Date(
              Date.UTC(
                periodStart.getUTCFullYear(),
                periodStart.getUTCMonth(),
                Math.min(28, periodEnd.getUTCDate()),
              ),
            ),
          ),
        },
      });
      result.created.push(`Payroll period: ${label}`);
    }
    return { regionId: region.id, calendarId: calendar.id, cycleId: cycle.id };
  }

  private async ensureDocumentTemplates(
    user: AuthenticatedUser,
    result: InitializationResult,
  ) {
    const ensure = async (code: string, name: string, templateType: string) => {
      const existing = await this.prisma.tenantConfigurationRecord.findUnique({
        where: {
          tenantId_settingKey_code: {
            tenantId: user.tenantId,
            settingKey: 'document-templates',
            code,
          },
        },
        select: { id: true },
      });
      if (existing) {
        result.skipped.push(`Payroll document template: ${code}`);
        return existing;
      }
      const created = await this.prisma.tenantConfigurationRecord.create({
        data: {
          tenantId: user.tenantId,
          settingKey: 'document-templates',
          code,
          name,
          description: 'Editable generic payroll document template.',
          configuration: {
            templateType,
            format: 'PDF',
            locale: 'en',
          },
          effectiveFrom: startOfUtcYear(new Date()),
          isActive: true,
          createdById: user.userId,
          updatedById: user.userId,
        },
        select: { id: true },
      });
      result.created.push(`Payroll document template: ${code}`);
      return created;
    };
    const [payslip, taxStatement] = await Promise.all([
      ensure('DEFAULT-PAYSLIP', 'Default Payslip Template', 'PAYSLIP'),
      ensure(
        'DEFAULT-TAX-STATEMENT',
        'Default Tax Statement Template',
        'TAX_STATEMENT',
      ),
    ]);
    return {
      payslipTemplateId: payslip.id,
      taxStatementTemplateId: taxStatement.id,
    };
  }

  private async wireMissingDefaults(
    user: AuthenticatedUser,
    defaults: {
      payrollRegionId: string;
      payrollCalendarId: string;
      compensationPackageId: string;
      taxPolicyId: string;
      postingProfileId: string | null;
      benchCostCenterId: string;
      paymentAccountId: string;
      roundingComponentId: string;
      payslipTemplateId: string;
      taxStatementTemplateId: string;
    },
  ) {
    const employerBankAccount = await this.prisma.employerBankAccount.findFirst(
      {
        where: {
          tenantId: user.tenantId,
          isActive: true,
          accountPurpose: 'PAYROLL',
        },
        orderBy: [{ isDefaultPayrollAccount: 'desc' }, { createdAt: 'asc' }],
        select: { id: true },
      },
    );
    const candidates: Record<string, string | null> = {
      defaultPayrollRegionId: defaults.payrollRegionId,
      defaultPayrollCalendarId: defaults.payrollCalendarId,
      defaultCompensationPackageId: defaults.compensationPackageId,
      defaultTaxPolicyId: defaults.taxPolicyId,
      defaultPostingProfileId: defaults.postingProfileId,
      defaultBenchCostCenterId: defaults.benchCostCenterId,
      defaultEmployerBankAccountId: employerBankAccount?.id ?? null,
      defaultPaymentAccountId: defaults.paymentAccountId,
      roundingDifferenceComponentId: defaults.roundingComponentId,
      payslipTemplateId: defaults.payslipTemplateId,
      taxStatementTemplateId: defaults.taxStatementTemplateId,
    };
    const persisted = await this.prisma.tenantSetting.findMany({
      where: {
        tenantId: user.tenantId,
        category: 'payroll',
        key: { in: Object.keys(candidates) },
      },
      select: { key: true, value: true },
    });
    const current = new Map(persisted.map((item) => [item.key, item.value]));
    const updates = Object.entries(candidates)
      .filter(([, value]) => Boolean(value))
      .filter(([key]) => {
        const value = current.get(key);
        return value === undefined || value === null || value === '';
      })
      .map(([key, value]) => ({ category: 'payroll', key, value }));
    if (updates.length)
      await this.tenantSettings.updateTenantSettings(user, { updates });
  }
}

function startOfUtcYear(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
}

function startOfUtcMonth(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), 1));
}

function addUtcMonths(value: Date, months: number) {
  return new Date(
    Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1),
  );
}

function previousUtcWeekday(value: Date) {
  const adjusted = new Date(value);
  if (adjusted.getUTCDay() === 6)
    adjusted.setUTCDate(adjusted.getUTCDate() - 1);
  if (adjusted.getUTCDay() === 0)
    adjusted.setUTCDate(adjusted.getUTCDate() - 2);
  return adjusted;
}

function isPristineDefault(record: {
  createdAt: Date;
  updatedAt: Date;
  version?: number;
}) {
  return (
    record.createdAt.getTime() === record.updatedAt.getTime() &&
    (record.version === undefined || record.version === 1)
  );
}
