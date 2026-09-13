import { AccessDeniedState } from "../../../_components/access-denied-state";

/*
 * The in-place refusal every Customization route renders — from the layout, a
 * page's own key check, or a 403 from the page's data load. One component so the
 * three cannot drift into three different answers (BUG-3374, BUG-3491).
 */
export function CustomizationAccessDenied() {
  return (
    <div className="min-h-screen bg-background px-2 py-4 sm:px-4 lg:px-6">
      <div className="mx-auto w-full max-w-7xl">
        <AccessDeniedState
          title="Access denied"
          description="You do not have access to this part of Customization."
        />
      </div>
    </div>
  );
}
