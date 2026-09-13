import pagePermissions from "./customization-page-permissions.json";

/*
 * The customization permission map, readable from client components.
 *
 * Split from `customization-access.ts` because that module imports the session
 * helper, which is server-only. Pages gate with the server half; dialogs gate
 * their buttons with this half; both read the same JSON the API seam test reads
 * (ADR-0013).
 */

export type CustomizationPageKey = keyof typeof pagePermissions.pages;

export type CustomizationComponentWriteType =
  keyof typeof pagePermissions.componentWriteKeys;

/*
 * The keys a Customization page requires. A page gates on all of them because
 * it loads from every route they protect; gating on "any" let a user in who then
 * met a 403 from the page's own data load.
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
