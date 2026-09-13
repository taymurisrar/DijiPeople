import pagePermissions from "./customization-page-permissions.json";
import {
  requireCustomizationAccess,
  type CustomizationAccessCheck,
} from "../../_lib/require-settings-permission";

export type CustomizationPageKey = keyof typeof pagePermissions.pages;

export type CustomizationComponentWriteType =
  keyof typeof pagePermissions.componentWriteKeys;

/*
 * The keys a Customization page requires, from the one map the API seam test
 * also reads (ADR-0013). A page gates on all of them because it loads from
 * every one of the routes they protect; gating on "any" let a user in who would
 * then meet a 403 from the page's own data load.
 */
export function customizationPageKeys(
  page: CustomizationPageKey,
): readonly string[] {
  return pagePermissions.pages[page].requires;
}

/* The key that authorizes writing a choice list, relationship or action bar. */
export function customizationComponentWriteKey(
  componentType: CustomizationComponentWriteType,
): string {
  return pagePermissions.componentWriteKeys[componentType];
}

export function requireCustomizationPage(
  page: CustomizationPageKey,
): Promise<CustomizationAccessCheck> {
  return requireCustomizationAccess(customizationPageKeys(page));
}

/*
 * True for a refusal from the API. A page renders the access-denied state for
 * it instead of letting the server component throw — a future disagreement
 * between this map and the API then fails closed and readably rather than as a
 * server error page (BUG-3491).
 */
export function isAccessDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: unknown; statusCode?: unknown }).status ??
    (error as { statusCode?: unknown }).statusCode;
  return status === 403;
}
