import { resolveRuntimeViewRule } from '@repo/config';

/*
 * Turns a shared view rule into a Prisma `where` fragment.
 *
 * Modules backed by a real query cannot reuse the in-memory filter that
 * paginateRuntimeRecords applies, but they must agree with it — otherwise the
 * same tab means one thing on the customers grid and another on invoices.
 * Both paths read the same rules, so the only thing written twice is how the
 * filter is expressed, not what it selects.
 *
 * Lives in its own file so the lifecycle services can use it without importing
 * PlatformRuntimeService, which imports them back.
 */
export function runtimeViewWhere(
  moduleKey: string,
  viewKey: string | undefined,
  platformUserId: string | undefined,
): Record<string, unknown> {
  const rule = resolveRuntimeViewRule(moduleKey, viewKey);
  if (!rule) return {};
  if (rule.values) {
    /*
     * Prisma has no `in` for a Boolean column, so a rule such as
     * `isActive: [true]` (plans, contract templates) is a plain equality.
     */
    if (rule.values.every((value) => typeof value === 'boolean')) {
      const distinct = [...new Set(rule.values)];
      return distinct.length === 1 ? { [rule.field]: distinct[0] } : {};
    }
    return { [rule.field]: { in: rule.values } };
  }
  /*
   * A personal view for someone with no platform identity must match nothing.
   * Returning {} here would quietly widen the tab to every record.
   */
  return { [rule.field]: platformUserId ?? '__no_platform_identity__' };
}
