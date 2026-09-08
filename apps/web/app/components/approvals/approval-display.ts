/**
 * `ApprovalRequest.moduleKey` is a lowercase machine key — "attendance",
 * "leave", "timesheet" — written by hand at each `createWorkflow` call site.
 * Both the list and the record page were rendering it raw into a column headed
 * "Module", so the screen read "attendance" where every other label on it was
 * title case.
 *
 * One home for the mapping: it was about to be a copy in each page.
 */
const MODULE_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  attendance: "Attendance",
  benefit: "Benefit",
  claim: "Claim",
  employee: "Employee",
  leave: "Leave",
  loan: "Loan",
  payroll: "Payroll",
  timesheet: "Timesheet",
};

export function moduleDisplayName(moduleKey: string) {
  if (!moduleKey) return "";
  return MODULE_DISPLAY_NAMES[moduleKey.toLowerCase()] ?? moduleKey;
}
