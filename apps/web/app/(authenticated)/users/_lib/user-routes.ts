/*
 * BUG-2014 — `/users` had no `new/page.tsx` and no `import/page.tsx`, but the
 * command bar and the empty state linked to both. Next matched them against the
 * sibling `users/[userId]` route with "new" / "import" as the record id, so an
 * administrator following the product's own affordance was told they could not
 * view a user record that never existed.
 *
 * There is exactly one user-create screen in this product, and it is the
 * settings runtime's. Rather than build a second one here — the tenant `/users`
 * tree may not survive ITEM-0107 at all — this route points at it. There is no
 * users import screen anywhere, so the Import action was removed rather than
 * pointed somewhere that does not exist either.
 *
 * The route is a real page: `settings/[category]/[settingGroup]/[item]/new`
 * resolves it through the settings runtime, and `next.config.ts` redirects the
 * older `/settings/security-access/users/*` spelling onto it. Permissions are
 * enforced by the API on the create call, not by this constant.
 */
export const USER_CREATE_ROUTE =
  "/settings/security-access/identities/users/new";
