import type { PlatformModuleDefinition } from "./platform-runtime.types";

/**
 * Client-side permission matching for the platform runtime.
 *
 * This is a **usability affordance only** — every action it allows is checked
 * again by the API, and `apps/admin/AGENTS.md` is explicit that platform role
 * gating in the UI is never the control. It lives in its own module because
 * the command bar and the record header status group both decide whether to
 * offer the same operation, and when the two disagreed the header offered an
 * Assign that the command bar had already hidden.
 */

/**
 * Roles that reach every platform module regardless of the granted key set.
 *
 * Kept as one list rather than an inline literal in each caller — the same
 * three-role comparison written twice is how `PLATFORM_OWNER` was locked out
 * of five call sites before `lib/platform-rbac.ts` existed.
 */
export const RUNTIME_ELEVATED_ROLES = [
  "PLATFORM_OWNER",
  "PLATFORM_ADMIN",
  "SUPER_ADMIN",
];

export function runtimePermissionMatches(granted: string, requested: string) {
  if (granted === "platform.*" || granted === requested) return true;
  return granted.endsWith(".*") && requested.startsWith(granted.slice(0, -1));
}

export function hasRuntimePermission(
  requested: string | undefined,
  context: { roleKeys?: string[]; permissionKeys?: string[] },
) {
  if (!requested) return true;
  if (
    context.permissionKeys?.some((granted) =>
      runtimePermissionMatches(granted, requested),
    )
  )
    return true;
  return Boolean(
    context.roleKeys?.some((role) => RUNTIME_ELEVATED_ROLES.includes(role)),
  );
}

/**
 * The permission a header slot's write route is governed by.
 *
 * Assignment is its own permission on modules that separate it; where a module
 * does not declare one, changing the owner is an update like any other.
 */
export function recordHeaderWritePermission(
  definition: PlatformModuleDefinition,
  write: "assign" | "change-status",
) {
  return write === "assign"
    ? (definition.permissions.assign ?? definition.permissions.update)
    : definition.permissions.update;
}
