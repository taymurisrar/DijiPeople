import type { ReactNode } from "react";
import { requireCustomizationPage } from "./_lib/customization-access";
import { CustomizationAccessDenied } from "./_components/customization-access-denied";

export default async function CustomizationLayout({
  children,
}: {
  children: ReactNode;
}) {
  /*
   * ADR-0013 — the section gate is the `customization.read` key and nothing
   * else: no role, no redirect. BUG-3374 removed the redirect to Roles; BUG-3491
   * removed the role bypass that let this layout admit users the API then
   * refused. Each page beneath adds the keys its own API calls need, from the
   * same map (`_lib/customization-page-permissions.json`).
   */
  const { allowed } = await requireCustomizationPage("section");

  if (!allowed) {
    return <CustomizationAccessDenied />;
  }

  return children;
}
