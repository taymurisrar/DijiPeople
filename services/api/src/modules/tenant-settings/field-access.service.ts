import { Injectable } from '@nestjs/common';

import { maskFieldValue } from '../../common/security/field-mask';
import type { AuthenticatedUser } from '../../common/interfaces/authenticated-request.interface';
import { PrismaService } from '../../common/prisma/prisma.service';

/** What the caller may do with one field of one table. */
export type FieldEffect =
  | { kind: 'VISIBLE' }
  | { kind: 'HIDDEN' }
  | { kind: 'MASKED'; pattern: string; customMask: string | null };

type PolicyRule = {
  id: string;
  fieldKey: string;
  visibility: string;
  accessMode: string;
  maskingPattern: string | null;
  customMask: string | null;
};

export type ApplicablePolicy = {
  id: string;
  rules: PolicyRule[];
};

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * The decision for one caller on one table, computed from the tenant's active
 * field-security policies. Most restrictive wins: HIDDEN > MASKED > VISIBLE.
 */
export class FieldAccessDecision {
  private readonly effects = new Map<string, FieldEffect>();
  private readonly readOnlyFields = new Set<string>();

  constructor(policies: ApplicablePolicy[]) {
    for (const policy of policies) {
      for (const rule of policy.rules) {
        if (rule.accessMode === 'READ_ONLY') {
          this.readOnlyFields.add(rule.fieldKey);
        }
        const next: FieldEffect =
          rule.visibility === 'HIDDEN'
            ? { kind: 'HIDDEN' }
            : rule.visibility === 'MASKED'
              ? {
                  kind: 'MASKED',
                  pattern: rule.maskingPattern ?? 'FULL',
                  customMask: rule.customMask,
                }
              : { kind: 'VISIBLE' };
        const current = this.effects.get(rule.fieldKey);
        if (!current || rank(next) > rank(current)) {
          this.effects.set(rule.fieldKey, next);
        }
      }
    }
  }

  effect(fieldKey: string): FieldEffect {
    return this.effects.get(fieldKey) ?? { kind: 'VISIBLE' };
  }

  /** Fields the caller cannot read in clear (hidden or masked). */
  restrictedFields(): string[] {
    return [...this.effects.entries()]
      .filter(([, effect]) => effect.kind !== 'VISIBLE')
      .map(([fieldKey]) => fieldKey);
  }

  /** True when the caller may not change the field (read-only, or not readable in clear). */
  isWriteRestricted(fieldKey: string): boolean {
    return (
      this.readOnlyFields.has(fieldKey) ||
      this.effect(fieldKey).kind !== 'VISIBLE'
    );
  }

  /**
   * Applies the decision to a record, in place, at the record itself and at each
   * nested object path (for responses that group fields, such as `personalInfo`).
   * A hidden field keeps its key with a `null` value so the response shape does
   * not change; a masked one carries the server-computed mask.
   */
  apply(record: Row, nestedPaths: readonly string[] = []): void {
    const targets: Row[] = [record];
    for (const path of nestedPaths) {
      let cursor: unknown = record;
      for (const part of path.split('.')) {
        cursor = isRow(cursor) ? cursor[part] : undefined;
      }
      if (isRow(cursor)) targets.push(cursor);
    }
    for (const target of targets) {
      for (const fieldKey of this.restrictedFields()) {
        if (!(fieldKey in target)) continue;
        const effect = this.effect(fieldKey);
        target[fieldKey] =
          effect.kind === 'MASKED'
            ? maskFieldValue(
                target[fieldKey],
                effect.pattern,
                effect.customMask,
              )
            : null;
      }
    }
  }
}

const rank = (effect: FieldEffect) =>
  effect.kind === 'HIDDEN' ? 2 : effect.kind === 'MASKED' ? 1 : 0;

/**
 * The only compiler of a tenant's field-security policies on the server. The
 * settings controller's `runtime-rules` endpoint and the response interceptor
 * both call it, so what the UI is told and what the API enforces cannot drift.
 *
 * Tenant isolation: the policy query is always filtered on the caller's
 * `tenantId`.
 */
@Injectable()
export class FieldAccessService {
  /** One lookup per table per request: `request.user` is a stable object. */
  private readonly memo = new WeakMap<
    AuthenticatedUser,
    Map<string, Promise<FieldAccessDecision>>
  >();

  constructor(private readonly prisma: PrismaService) {}

  async applicablePolicies(
    user: AuthenticatedUser,
    tableKey: string,
  ): Promise<Array<ApplicablePolicy & { id: string }>> {
    const policies = await this.prisma.fieldSecurityPolicy.findMany({
      where: { tenantId: user.tenantId, entityKey: tableKey, isActive: true },
      include: {
        rules: true,
        roles: { include: { role: { select: { key: true } } } },
        teams: true,
      },
      orderBy: { updatedAt: 'desc' },
    });
    const teamIds = new Set(user.accessContext?.teamIds ?? []);
    const roleKeys = new Set(user.roleKeys ?? []);
    return policies
      .filter((policy) => {
        const roleScoped = policy.roles.length > 0;
        const teamScoped = policy.teams.length > 0;
        if (!roleScoped && !teamScoped) return true;
        return (
          policy.roles.some((assignment) =>
            roleKeys.has(assignment.role.key),
          ) || policy.teams.some((assignment) => teamIds.has(assignment.teamId))
        );
      })
      .map((policy) => ({ id: policy.id, rules: policy.rules }));
  }

  forRequest(
    user: AuthenticatedUser,
    tableKey: string,
  ): Promise<FieldAccessDecision> {
    let byTable = this.memo.get(user);
    if (!byTable) {
      byTable = new Map();
      this.memo.set(user, byTable);
    }
    let decision = byTable.get(tableKey);
    if (!decision) {
      decision = this.applicablePolicies(user, tableKey).then(
        (policies) => new FieldAccessDecision(policies),
      );
      byTable.set(tableKey, decision);
    }
    return decision;
  }
}
