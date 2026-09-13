import {
  requireCustomizationAccess,
  type CustomizationAccessCheck,
} from "../../_lib/require-settings-permission";
import {
  customizationPageKeys,
  type CustomizationPageKey,
} from "./customization-keys";

export {
  customizationComponentWriteKey,
  customizationPageKeys,
  type CustomizationComponentWriteType,
  type CustomizationPageKey,
} from "./customization-keys";

/*
 * Server-side page gate for Customization (ADR-0013): every key the page's API
 * calls need, from the one map the API seam test also reads.
 */
export function requireCustomizationPage(
  page: CustomizationPageKey,
): Promise<CustomizationAccessCheck> {
  return requireCustomizationAccess(customizationPageKeys(page));
}

/*
 * True for a refusal from the API. A page renders the access-denied state for
 * it instead of letting the server component throw — a future disagreement
 * between the map and the API then fails closed and readably rather than as a
 * server error page (BUG-3491).
 */
export function isAccessDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const { status, statusCode } = error as {
    status?: unknown;
    statusCode?: unknown;
  };
  return (status ?? statusCode) === 403;
}
