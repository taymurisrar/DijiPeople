import type { RuntimeActionDefinition } from "./platform-runtime.types";
import { matchesVisibility } from "./visibility-condition";

/**
 * Whether a command's record conditions hold for `record`: its `states` list
 * (the record's `status` must be one of them) and its `visibleWhen` condition.
 *
 * Scope, role, permission and selection are decided by the action bar; this
 * is only the part that reads the record, kept pure so it can be specified.
 * A command with neither condition always passes, so list commands — which
 * have no record — are unaffected.
 */
export function commandMatchesRecord(
  action: Pick<RuntimeActionDefinition, "states" | "visibleWhen">,
  record: Record<string, unknown> | undefined,
): boolean {
  if (
    action.states?.length &&
    !action.states.includes(String(record?.status ?? ""))
  )
    return false;
  if (action.visibleWhen && !matchesVisibility(action.visibleWhen, record ?? {}))
    return false;
  return true;
}
