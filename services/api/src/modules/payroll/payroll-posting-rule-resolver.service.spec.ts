import { PayrollRunLineItemCategory } from '@prisma/client';
import { PayrollPostingRuleResolverService } from './payroll-posting-rule-resolver.service';

describe('PayrollPostingRuleResolverService', () => {
  it('prioritizes pay component, then tax rule, then category default', async () => {
    const prisma = {
      payrollPostingRule: {
        findMany: jest.fn().mockResolvedValue([
          rule({ id: 'default-rule' }),
          rule({ id: 'tax-rule', taxRuleId: 'tax-1' }),
          rule({ id: 'component-rule', payComponentId: 'pc-1' }),
        ]),
      },
    };
    const service = new PayrollPostingRuleResolverService(prisma as never);

    const resolved = await service.resolveRule({
      tenantId: 'tenant-1',
      sourceCategory: PayrollRunLineItemCategory.EARNING,
      payComponentId: 'pc-1',
      taxRuleId: 'tax-1',
      effectiveStart: new Date('2026-04-01'),
      effectiveEnd: new Date('2026-04-30'),
    });

    expect(resolved?.id).toBe('component-rule');
  });
});

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: 'rule-1',
    tenantId: 'tenant-1',
    name: 'Rule',
    description: null,
    sourceCategory: PayrollRunLineItemCategory.EARNING,
    payComponentId: null,
    taxRuleId: null,
    debitAccountId: 'expense',
    creditAccountId: 'payable',
    isActive: true,
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    debitAccount: null,
    creditAccount: null,
    payComponent: null,
    taxRule: null,
    ...overrides,
  };
}
