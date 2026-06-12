import type { ReactNode } from "react";
import { requireCustomizationAccess } from "../_lib/require-settings-permission";

export default async function CustomizationLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireCustomizationAccess(["customization.read"]);

  return children;
}
