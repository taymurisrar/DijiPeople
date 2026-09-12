import type { ReactNode } from "react";
import { requireCustomizationAccess } from "../_lib/require-settings-permission";
import { AccessDeniedState } from "../../_components/access-denied-state";

export default async function CustomizationLayout({
  children,
}: {
  children: ReactNode;
}) {
  /*
   * BUG-3374 — this used to redirect a denied user to a hardcoded legacy
   * `/settings/access/roles` path (which `next.config.ts` then rewrote to
   * Roles' real URL, where Roles resolved its own default view and appended
   * `?viewId=`), so a permission failure here read as a broken link to an
   * unrelated screen rather than a refusal. It also disagreed with every page
   * beneath this layout about what "permitted" means. `requireCustomizationAccess`
   * now uses the same authorization model those pages already assume, and a
   * denial renders in place — no redirect, no dependence on the legacy
   * rewrite, and the URL the user asked for stays in the address bar.
   */
  const { allowed } = await requireCustomizationAccess([
    "customization.read",
  ]);

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background px-2 py-4 sm:px-4 lg:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <AccessDeniedState
            title="Access denied"
            description="You do not have access to Customization settings."
          />
        </div>
      </div>
    );
  }

  return children;
}
