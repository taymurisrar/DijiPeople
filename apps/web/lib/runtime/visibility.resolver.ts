import type { CommandVisibilityRule } from "./command-runtime.types";
import type { RuntimePrincipal } from "./security-runtime.types";
import { evaluateVisibilityRule } from "./command-runtime.resolver";

/*
 * One place to ask "should this person see this".
 *
 * The rule engine was built for command buttons and stayed there, so hiding a
 * tab or a settings menu item meant hand-rolling a role check at each call
 * site. Anything with a `visibilityRules` array now goes through the same
 * evaluator, which means a rule written for a button behaves identically on a
 * tab, a form section, or a navigation entry.
 *
 * Usage in a module spec:
 *
 *   visibilityRules: [
 *     { operator: "has-any-role", roleKeys: ["hr", "global-admin"] },
 *   ]
 *
 * or to hide something from a role:
 *
 *   visibilityRules: [
 *     { operator: "not-has-role", roleKeys: ["employee"] },
 *   ]
 */

export type VisibilityRule = CommandVisibilityRule;

export type VisibilityGated = {
  readonly visibilityRules?: readonly VisibilityRule[];
};

export type VisibilityPrincipal = Pick<
  RuntimePrincipal,
  "roleKeys" | "permissionKeys"
> & {
  readonly userId?: string;
  readonly tenantId?: string;
  /* Placement, for the in-team / in-department / in-business-unit operators. */
  readonly teamIds?: readonly string[];
  readonly departmentIds?: readonly string[];
  readonly businessUnitIds?: readonly string[];
  readonly organizationIds?: readonly string[];
  readonly designationIds?: readonly string[];
};

export type VisibilityEvaluationContext = {
  readonly principal: VisibilityPrincipal;
  readonly record?: Readonly<Record<string, unknown>> | null;
  readonly metadataState?: string;
};

/**
 * True when every rule passes. An item with no rules is always visible, so
 * adding this to an existing surface changes nothing until a rule is written.
 */
export function isVisibleByRules(
  item: VisibilityGated,
  context: VisibilityEvaluationContext,
): boolean {
  const rules = item.visibilityRules;
  if (!rules?.length) return true;

  return rules.every((rule) =>
    evaluateVisibilityRule(rule, {
      principal: {
        userId: context.principal.userId ?? "",
        tenantId: context.principal.tenantId ?? "",
        roleKeys: context.principal.roleKeys,
        permissionKeys: context.principal.permissionKeys,
        teamIds: context.principal.teamIds,
        departmentIds: context.principal.departmentIds,
        businessUnitIds: context.principal.businessUnitIds,
        organizationIds: context.principal.organizationIds,
        designationIds: context.principal.designationIds,
      },
      record: context.record,
      metadataState: context.metadataState,
    }),
  );
}

/** Filters any list of rule-carrying items. */
export function resolveVisibleByRules<TItem extends VisibilityGated>(
  items: readonly TItem[],
  context: VisibilityEvaluationContext,
): TItem[] {
  return items.filter((item) => isVisibleByRules(item, context));
}
