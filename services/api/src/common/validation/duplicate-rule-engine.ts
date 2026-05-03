import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type DuplicateRuleSeverity = 'BLOCK' | 'WARN';

export type DuplicateRuleConfig<TPayload> = {
  key: string;
  label: string;
  enabled: boolean;
  severity: DuplicateRuleSeverity;
  value: (payload: TPayload) => string | null | undefined;
  buildWhere: (value: string) => Prisma.EmployeeWhereInput;
};

export type DuplicateConflict = {
  ruleKey: string;
  label: string;
  severity: DuplicateRuleSeverity;
  value: string;
  existingRecordId: string;
};

@Injectable()
export class DuplicateRuleEngine {
  constructor(private readonly prisma: PrismaService) {}

  async checkEmployeeDuplicates<TPayload>(params: {
    tenantId: string;
    payload: TPayload;
    rules: DuplicateRuleConfig<TPayload>[];
    excludeEmployeeId?: string;
  }) {
    const conflicts: DuplicateConflict[] = [];

    for (const rule of params.rules) {
      if (!rule.enabled) continue;

      const rawValue = rule.value(params.payload);
      const value = rawValue?.trim();

      if (!value) continue;

      const existing = await this.prisma.employee.findFirst({
        where: {
          tenantId: params.tenantId,
          ...(params.excludeEmployeeId
            ? { id: { not: params.excludeEmployeeId } }
            : {}),
          ...rule.buildWhere(value),
        },
        select: { id: true },
      });

      if (!existing) continue;

      conflicts.push({
        ruleKey: rule.key,
        label: rule.label,
        severity: rule.severity,
        value,
        existingRecordId: existing.id,
      });
    }

    const blockingConflict = conflicts.find(
      (conflict) => conflict.severity === 'BLOCK',
    );

    if (blockingConflict) {
      throw new ConflictException(
        `${blockingConflict.label} already exists on another employee.`,
      );
    }

    return conflicts;
  }
}
