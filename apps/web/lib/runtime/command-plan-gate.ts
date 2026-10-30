import type { CommandDefinition } from "./command-runtime.types";
import { FEATURE_KEYS, type FeatureKey } from "../security-keys";

/**
 * Commands whose destination belongs to a paid feature (DP-QA-004 follow-up).
 *
 * `system.import` opens Settings > Data Management, a Growth feature. On
 * Starter the button led to the plan-gate screen; it is simply not offered.
 * Presentation only: the data-management API refuses the plan regardless.
 */
export const COMMAND_FEATURE_KEYS: Readonly<Record<string, FeatureKey>> = {
  "system.import": FEATURE_KEYS.DATA_MANAGEMENT,
};

function isOffered(
  command: Pick<CommandDefinition, "key">,
  enabledKeys: readonly string[] | null,
) {
  // Unknown plan: leave the command; the destination gates itself.
  if (!enabledKeys) return true;
  const required = COMMAND_FEATURE_KEYS[command.key];
  return !required || enabledKeys.includes(required);
}

/** Works on a flat list or on any object whose values are command lists. */
export function commandsForPlan<T>(
  commands: T,
  enabledKeys: readonly string[] | null,
): T {
  if (!enabledKeys) return commands;

  if (Array.isArray(commands)) {
    return commands.filter((command) =>
      isOffered(command as CommandDefinition, enabledKeys),
    ) as T;
  }

  if (commands && typeof commands === "object") {
    return Object.fromEntries(
      Object.entries(commands).map(([name, value]) => [
        name,
        Array.isArray(value)
          ? value.filter((command) =>
              isOffered(command as CommandDefinition, enabledKeys),
            )
          : value,
      ]),
    ) as T;
  }

  return commands;
}
