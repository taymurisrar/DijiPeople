/*
 * One thing a package references but does not carry.
 *
 * Mirrors the API's export readiness report. An `error` blocks the export —
 * the import would land incomplete. A `warning` names a system module the
 * target tenant is expected to already have enabled.
 */
export type ExportGap = {
  severity: "error" | "warning";
  componentKey: string;
  componentType: string;
  missingKey: string;
  message: string;
};
