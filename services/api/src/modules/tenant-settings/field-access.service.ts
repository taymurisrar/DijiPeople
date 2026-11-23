import { ForbiddenException, Injectable } from '@nestjs/common';

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
   * Applies the decision to a row whose keys are NOT the table's column names
   * (a CSV row, say). `aliases` maps a restricted column to the row keys that
   * carry it; a restricted column with no alias is matched by its own name.
   */
  applyAliased(
    row: Row,
    aliases: Record<string, readonly string[]> = {},
  ): void {
    for (const fieldKey of this.restrictedFields()) {
      const effect = this.effect(fieldKey);
      for (const key of aliases[fieldKey] ?? [fieldKey]) {
        if (!(key in row)) continue;
        row[key] =
          effect.kind === 'MASKED'
            ? maskFieldValue(row[key], effect.pattern, effect.customMask)
            : null;
      }
    }
  }

  /**
   * Fail-closed sweep: applies the decision to EVERY object in the response tree,
   * whatever the envelope or nesting. For hierarchical and composite responses
   * where listing nested paths would silently miss one.
   */
  applyDeep(value: unknown): void {
    if (Array.isArray(value)) {
      for (const item of value) this.applyDeep(item);
      return;
    }
    if (!isRow(value)) return;
    this.apply(value);
    for (const child of Object.values(value)) this.applyDeep(child);
  }

  /**
   * Write-back screen. For each named field present in `payload`:
   *  - equal to what this caller was shown (the mask, `null`/empty for hidden,
   *    the stored value for read-only) → an echo of the UI, dropped from the
   *    payload so the stored value survives;
   *  - anything else → a genuine change the caller may not make: the offending
   *    field names are returned and nothing is dropped silently.
   * `stored` is the persisted row; the payload is mutated in place.
   */
  screenWrite(
    payload: Row,
    stored: Row,
    fieldKeys: readonly string[],
  ): string[] {
    const forbidden: string[] = [];
    for (const fieldKey of fieldKeys) {
      if (!(fieldKey in payload) || payload[fieldKey] === undefined) continue;
      if (!this.isWriteRestricted(fieldKey)) continue;
      const effect = this.effect(fieldKey);
      const posted = payload[fieldKey];
      const storedValue = stored[fieldKey] ?? null;
      let shown: unknown;
      if (effect.kind === 'MASKED') {
        shown = maskFieldValue(storedValue, effect.pattern, effect.customMask);
      } else if (effect.kind === 'HIDDEN') {
        shown = null;
      } else {
        shown = storedValue;
      }
      const isEcho =
        posted === shown ||
        (effect.kind === 'HIDDEN' && (posted === null || posted === '')) ||
        (effect.kind === 'VISIBLE' && posted === storedValue);
      if (isEcho) {
        delete payload[fieldKey];
      } else {
        forbidden.push(fieldKey);
      }
    }
    return forbidden;
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
    // Most tenants configure nothing for most tables. One flat statement answers
    // that; the include below costs one statement per relation (no relationJoins).
    const anyPolicy = await this.prisma.fieldSecurityPolicy.findFirst({
      where: { tenantId: user.tenantId, entityKey: tableKey, isActive: true },
      select: { id: true },
    });
    if (!anyPolicy) return [];
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

  /**
   * Screens a write payload against the caller's field rules for `tableKey`
   * (see `FieldAccessDecision.screenWrite`). Throws FIELD_ACCESS_FORBIDDEN when
   * the payload carries a real change to a field the caller may not change.
   */
  async screenWrite(
    user: AuthenticatedUser,
    tableKey: string,
    payload: object,
    stored: object,
  ): Promise<void> {
    const decision = await this.forRequest(user, tableKey);
    const body = payload as Row;
    const forbidden = decision.screenWrite(
      body,
      stored as Row,
      Object.keys(body),
    );
    if (forbidden.length > 0) {
      throw new ForbiddenException({
        code: 'FIELD_ACCESS_FORBIDDEN',
        message: 'You do not have permission to change one or more fields.',
        fieldErrors: forbidden.map((field) => ({
          field,
          message: 'You do not have permission to change this field.',
        })),
      });
    }
  }

  /** Refuses a filter or sort that names a column the caller cannot read in clear. */
  async assertQueryable(
    user: AuthenticatedUser,
    tableKey: string,
    fieldKeys: readonly string[],
  ): Promise<void> {
    if (fieldKeys.length === 0) return;
    const decision = await this.forRequest(user, tableKey);
    const refused = [...new Set(fieldKeys)].filter(
      (fieldKey) => decision.effect(fieldKey).kind !== 'VISIBLE',
    );
    if (refused.length > 0) {
      throw new ForbiddenException({
        code: 'FIELD_ACCESS_FORBIDDEN',
        message:
          'You cannot filter or sort by a field you are not allowed to read.',
        fieldErrors: refused.map((field) => ({
          field,
          message: 'You cannot filter or sort by this field.',
        })),
      });
    }
  }

  /** Of `fieldKeys`, those the caller cannot read in clear. */
  async restrictedAmong(
    user: AuthenticatedUser,
    tableKey: string,
    fieldKeys: readonly string[],
  ): Promise<string[]> {
    const decision = await this.forRequest(user, tableKey);
    return fieldKeys.filter(
      (fieldKey) => decision.effect(fieldKey).kind !== 'VISIBLE',
    );
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
