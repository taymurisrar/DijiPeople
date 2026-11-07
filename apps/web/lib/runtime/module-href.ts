import { DATA_MANAGEMENT_ROUTE } from "./module-adapter-command-handlers";

/**
 * Whether a module command may navigate to `href`.
 *
 * Commands stay inside their module's route base, with one named exception:
 * Import opens Settings > Data Management. The check used to be a bare
 * `startsWith(routeBase)`, so the Employees "Import" command navigated to a
 * route outside `/employees` and was dropped without a sound (DP-QA-035).
 * The exception is the exact route, not a prefix, so it cannot be widened by
 * appending a path or query.
 */
export function isSafeModuleHref(href: string, routeBase: string) {
  if (href === DATA_MANAGEMENT_ROUTE) return true;
  if (!href.startsWith(routeBase)) return false;
  if (href.includes("..")) return false;
  if (
    href.includes("/auth") ||
    href.includes("logout") ||
    href.includes("sign-out")
  ) {
    return false;
  }

  return true;
}
