import type { FormMetadata } from "../metadata-runtime.types";
import { FEATURE_KEYS, type FeatureKey } from "../../security-keys";

/**
 * The plan feature each employee-record tab belongs to (DP-QA-015).
 *
 * A Starter tenant was shown Compensation, Pay setup, Payslips, Timesheets and
 * Project Allocations tabs whose data the API refuses, leaving empty or failing
 * panes. Tabs with no entry here belong to a feature every plan includes.
 *
 * Presentation only: the API's EntitlementGuard is the boundary.
 */
export const EMPLOYEE_TAB_FEATURE_KEYS: Readonly<Record<string, FeatureKey>> = {
  "payroll-compensation": FEATURE_KEYS.PAYROLL,
  "pay-setup": FEATURE_KEYS.PAYROLL,
  "banking-details": FEATURE_KEYS.PAYROLL,
  payslips: FEATURE_KEYS.PAYROLL,
  timesheets: FEATURE_KEYS.TIMESHEETS,
  "project-allocations": FEATURE_KEYS.PROJECTS,
  agent: FEATURE_KEYS.DESKTOP_AGENT,
};

/**
 * Removes the tabs of features the plan does not include. `enabledKeys` of
 * `null` (the plan could not be read) leaves the form untouched, as the module
 * route gate does: the API still refuses, and a transient error must not strip
 * a paid tenant's tabs.
 */
export function filterEmployeeFormTabsByPlan<T extends FormMetadata | null>(
  form: T,
  enabledKeys: readonly string[] | null | undefined,
): T {
  if (!form || !form.tabs || !enabledKeys) return form;

  const tabs = form.tabs.filter((tab) => {
    const required = EMPLOYEE_TAB_FEATURE_KEYS[tab.tabKey];
    return !required || enabledKeys.includes(required);
  });

  return tabs.length === form.tabs.length ? form : { ...form, tabs };
}
