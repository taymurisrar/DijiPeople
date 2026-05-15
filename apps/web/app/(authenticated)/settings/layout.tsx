import { ReactNode } from "react";
import { requireSettingsPermissions } from "./_lib/require-settings-permission";

export default async function SettingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireSettingsPermissions(["settings.read"], "/me");

  return children;
}
